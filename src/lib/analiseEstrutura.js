// Analisador de estrutura e contexto da prova.
//
// Duas camadas, como o resto do produto:
//   - resumoEstruturaDeterministico(): grátis, sem IA, a partir do que a
//     segmentação já entregou (área, dificuldade, dependência visual, apoio).
//   - analisarEstruturaProva(): manda só o resumo + textos de apoio + uma
//     amostra de enunciados ao microserviço `analisar-estrutura`, que devolve a
//     interpretação (tema central, contexto, resumo dos apoios). O PDF nunca sai.

import { supabase } from '../supabaseClient';

const MAX_APOIOS = 20;
const MAX_ENUNCIADOS_AMOSTRA = 40;
const MAX_CHARS_APOIO = 1_500;
const MAX_CHARS_ENUNCIADO = 400;
const MAX_TENTATIVAS = 3;
const ESPERA_MAXIMA_MS = 60_000;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizarDificuldade(valor) {
  const v = String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (v === 'facil') return 'facil';
  if (v === 'dificil') return 'dificil';
  return 'media';
}

function areaDaQuestao(questao) {
  const nome = questao?.classificacao?.materia_nome;
  if (!nome || nome === 'Não classificada') return null;
  return nome;
}

/**
 * Panorama determinístico da prova, calculado a partir das questões já
 * segmentadas e (quando houver) classificadas. Não gasta token.
 */
export function resumoEstruturaDeterministico(documentos = []) {
  const questoes = (documentos || []).flatMap((doc) => doc?.questoes || []);
  const total = questoes.length;

  const porArea = new Map();
  const porDificuldade = { facil: 0, media: 0, dificil: 0 };
  const gruposApoio = new Set();
  let visuais = 0;
  let comArea = 0;
  let areasPorCabecalho = 0;

  for (const questao of questoes) {
    const area = areaDaQuestao(questao);
    if (area) {
      comArea += 1;
      porArea.set(area, (porArea.get(area) || 0) + 1);
      if (questao.classificacao?.origem === 'cabecalho_de_area') areasPorCabecalho += 1;
    }
    porDificuldade[normalizarDificuldade(questao.classificacao?.dificuldade)] += 1;
    if (questao.dependeDeVisual) visuais += 1;
    for (const apoio of questao.apoio || []) {
      const chave = Array.isArray(apoio.alvos) && apoio.alvos.length
        ? apoio.alvos.join('-')
        : String(apoio.rotulo || '');
      if (chave) gruposApoio.add(chave);
    }
  }

  // Sem nenhuma classificação não dá para afirmar o tipo do caderno; a IA ainda
  // detecta o tema pelos enunciados, então marcamos "indefinido" em vez de
  // chutar "temática" só porque faltou matéria.
  let tipoProva = 'indefinido';
  if (comArea > 0) {
    const areasDistintas = porArea.size;
    if (areasPorCabecalho / total >= 0.5 && areasDistintas >= 3) tipoProva = 'por_disciplina';
    else if (areasDistintas <= 2) tipoProva = 'tematica';
    else tipoProva = 'mista';
  }

  const perfil = (documentos || []).find((doc) => doc?.perfil)?.perfil || 'generico';

  return {
    total_questoes: total,
    perfil_banca: perfil,
    tipo_prova: tipoProva,
    por_area: [...porArea.entries()]
      .map(([area, questoesArea]) => ({
        area,
        questoes: questoesArea,
        percentual: total ? questoesArea / total : 0,
      }))
      .sort((a, b) => b.questoes - a.questoes),
    por_dificuldade: porDificuldade,
    percentual_visual: total ? visuais / total : 0,
    grupos_texto_apoio: gruposApoio.size,
  };
}

/** Monta o payload enviado ao microserviço: só texto, com limites de tamanho. */
export function montarEntradaIAEstrutura(documentos, deterministico) {
  const apoios = [];
  const vistos = new Set();
  for (const doc of documentos || []) {
    for (const questao of doc?.questoes || []) {
      for (const apoio of questao.apoio || []) {
        const alvos = Array.isArray(apoio.alvos) ? apoio.alvos : [];
        const chave = alvos.length ? alvos.join('-') : String(apoio.rotulo || '');
        if (!chave || vistos.has(chave)) continue;
        vistos.add(chave);
        const texto = String(apoio.texto || '').slice(0, MAX_CHARS_APOIO).trim();
        if (texto) apoios.push({ alvos, texto });
        if (apoios.length >= MAX_APOIOS) break;
      }
      if (apoios.length >= MAX_APOIOS) break;
    }
    if (apoios.length >= MAX_APOIOS) break;
  }

  const enunciados = [];
  for (const doc of documentos || []) {
    for (const questao of doc?.questoes || []) {
      const texto = String(questao.enunciado || '').replace(/\s+/g, ' ').slice(0, MAX_CHARS_ENUNCIADO).trim();
      if (texto) enunciados.push({ numero: questao.numero ?? null, texto });
      if (enunciados.length >= MAX_ENUNCIADOS_AMOSTRA) break;
    }
    if (enunciados.length >= MAX_ENUNCIADOS_AMOSTRA) break;
  }

  return {
    resumo: {
      total_questoes: deterministico.total_questoes,
      perfil: deterministico.perfil_banca,
      tipo_prova_sugerido: deterministico.tipo_prova,
      por_area: deterministico.por_area.slice(0, 12),
      percentual_visual: deterministico.percentual_visual,
    },
    textos_apoio: apoios,
    amostra_enunciados: enunciados,
  };
}

async function invocar(body, { tentativa = 0, onEspera } = {}) {
  const { data, error } = await supabase.functions.invoke('analisar-estrutura', { body });

  if (error || data?.erro) {
    const mensagem = data?.erro || error?.message || 'Falha ao analisar a estrutura da prova.';
    const status = error?.context?.status || null;
    const retryAfter = Number(data?.retryAfter) || null;
    const limite = status === 429 || /limite|429|rate/i.test(mensagem);
    if (limite && tentativa < MAX_TENTATIVAS) {
      const base = retryAfter ? retryAfter * 1_000 : 6_000 * 2 ** tentativa;
      const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(2_000, base));
      onEspera?.(Math.ceil(espera / 1_000));
      await esperar(espera);
      return invocar(body, { tentativa: tentativa + 1, onEspera });
    }
    throw new Error(limite
      ? 'O limite de uso da IA continua ativo depois de várias tentativas.'
      : mensagem);
  }

  if (!data?.resultado) throw new Error('A análise de estrutura não retornou um resultado válido.');
  return data.resultado;
}

/**
 * Roda o panorama determinístico e, em seguida, a interpretação por IA.
 * Devolve { deterministico, interpretacao_ia }.
 */
export async function analisarEstruturaProva(documentos, { onEspera } = {}) {
  const deterministico = resumoEstruturaDeterministico(documentos);
  if (!deterministico.total_questoes) {
    throw new Error('Selecione ao menos uma prova com questões para analisar a estrutura.');
  }
  const entrada = montarEntradaIAEstrutura(documentos, deterministico);
  const interpretacao = await invocar(entrada, { onEspera });
  return { deterministico, interpretacao_ia: interpretacao };
}
