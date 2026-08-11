import { supabase } from '../supabaseClient';

const MAX_TENTATIVAS = 2;
const ESPERA_PADRAO_MS = 15_000;
const ESPERA_MAXIMA_MS = 65_000;
const TAMANHO_LOTE = 2;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function detalharErro(error) {
  const contexto = error?.context;
  let corpo;

  if (contexto?.clone) {
    try {
      corpo = await contexto.clone().json();
    } catch {
      corpo = undefined;
    }
  }

  const retryAfterHeader = Number(contexto?.headers?.get?.('retry-after'));
  const retryAfterBody = Number(corpo?.retryAfter);
  const retryAfter = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
    ? retryAfterHeader
    : retryAfterBody;

  return {
    mensagem: corpo?.erro || error?.message || 'Falha ao chamar o serviço de IA.',
    status: contexto?.status || error?.status,
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : null,
  };
}

async function invocarIA(body, tentativa = 0) {
  const { data, error } = await supabase.functions.invoke('ia', { body });
  if (error || data?.erro) {
    const detalhe = error
      ? await detalharErro(error)
      : { mensagem: data.erro, status: null, retryAfterMs: Number(data.retryAfter) * 1_000 };
    const limite = detalhe.status === 429 || /limite|429|rate/i.test(detalhe.mensagem);
    if (limite && tentativa < MAX_TENTATIVAS) {
      const espera = Math.min(
        ESPERA_MAXIMA_MS,
        Math.max(1_000, detalhe.retryAfterMs || (tentativa + 1) * ESPERA_PADRAO_MS),
      );
      await esperar(espera);
      return invocarIA(body, tentativa + 1);
    }
    throw new Error(limite
      ? 'O limite da IA continua ativo. Aguarde um minuto e tente novamente.'
      : detalhe.mensagem);
  }
  if (data?.resultado === undefined) throw new Error('A IA não retornou um resultado válido.');
  return data.resultado;
}

export function perguntarIAJson(prompt, system, maxTokens) {
  return invocarIA({ acao: 'gerar_json', prompt, system, maxTokens });
}

export async function classificarQuestoesIA(questoes, materias = [], onProgress) {
  const lotes = [];
  for (let i = 0; i < questoes.length; i += TAMANHO_LOTE) {
    lotes.push(questoes.slice(i, i + TAMANHO_LOTE));
  }
  const resultado = [];
  const catalogo = materias.map((m) => ({
    id: m.id,
    nome: m.nome,
    assuntos: (m.subgeneros || []).map((s) => ({ id: s.id, nome: s.nome })),
  }));
  for (let i = 0; i < lotes.length; i += 1) {
    onProgress?.(i + 1, lotes.length);
    const resposta = await invocarIA({
      acao: 'classificar_questoes',
      materias: catalogo,
      questoes: lotes[i].map((q) => ({ id: q.id, texto: q.paraClassificar, topico: q.topico })),
    });
    if (!Array.isArray(resposta?.classificacoes)) throw new Error('Formato de classificação inválido.');
    resultado.push(...resposta.classificacoes);
    if (i < lotes.length - 1) await esperar(1_000);
  }
  return resultado;
}
