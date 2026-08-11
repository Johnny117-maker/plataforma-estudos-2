import { supabase } from '../supabaseClient';
import { taxonomiaParaPrompt, normalizarPar } from './taxonomiaFatec';

// Os limites gratuitos da Groq são separados por modelo. Alternar os lotes
// permite usar a capacidade dos dois modelos sem disparar chamadas paralelas
// nem transformar um 429 em uma cascata de novas tentativas.
const MODELOS = {
  llama: { preferencia: 'llama', tetoLocalTpm: 5_200 },
  'gpt-oss': { preferencia: 'gpt-oss', tetoLocalTpm: 7_000 },
};
const TOKENS_POR_LOTE = 1_800;
const MAX_ITENS_LOTE = 8;
const MAX_CHARS_QUESTAO = 1_400;
const MAX_TENTATIVAS = 2;
const ESPERA_MAXIMA_MS = 70_000;
const FIM_LLAMA_31 = Date.parse('2026-08-17T00:00:00Z');
let proximoModelo = 0;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Português rende ~3,5 caracteres por token nos tokenizers da família Llama.
function estimarTokens(texto) {
  return Math.ceil(String(texto || '').length / 3.5);
}

// Cada modelo tem sua própria janela móvel de 60s.
const janelas = new Map(Object.keys(MODELOS).map((modelo) => [modelo, []]));

function tokensNaJanela(modelo) {
  const janela = janelas.get(modelo);
  const corte = Date.now() - 60_000;
  while (janela.length && janela[0].em < corte) janela.shift();
  return janela.reduce((soma, registro) => soma + registro.tokens, 0);
}

async function reservarTokens(modelo, tokens, onEspera) {
  const janela = janelas.get(modelo);
  const teto = MODELOS[modelo].tetoLocalTpm;
  const reserva = Math.min(teto, Math.max(1, Math.ceil(tokens)));

  for (;;) {
    if (tokensNaJanela(modelo) + reserva <= teto) {
      janela.push({ em: Date.now(), tokens: reserva });
      return;
    }
    const maisAntigo = janela[0];
    const faltam = Math.max(1_000, 60_000 - (Date.now() - maisAntigo.em) + 250);
    onEspera?.(Math.ceil(faltam / 1_000));
    await esperar(Math.min(faltam, 61_000));
  }
}

async function detalharErro(error) {
  const contexto = error?.context;
  let corpo;
  if (contexto?.clone) {
    try { corpo = await contexto.clone().json(); } catch { corpo = undefined; }
  }
  const doHeader = Number(contexto?.headers?.get?.('retry-after'));
  const doCorpo = Number(corpo?.retryAfter);
  const retryAfter = Number.isFinite(doHeader) && doHeader > 0 ? doHeader : doCorpo;
  return {
    mensagem: corpo?.erro || error?.message || 'Falha ao chamar o serviço de IA.',
    status: contexto?.status || error?.status,
    retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : null,
  };
}

async function invocarIA(body, { tentativa = 0, onEspera } = {}) {
  const { data, error } = await supabase.functions.invoke('ia', { body });

  if (error || data?.erro) {
    const detalhe = error
      ? await detalharErro(error)
      : { mensagem: data.erro, status: null, retryAfterMs: Number(data.retryAfter) * 1_000 };
    const limite = detalhe.status === 429 || /limite|429|rate/i.test(detalhe.mensagem);

    if (limite && tentativa < MAX_TENTATIVAS) {
      const base = detalhe.retryAfterMs || 8_000 * 2 ** tentativa;
      const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(2_000, base));
      onEspera?.(Math.ceil(espera / 1_000));
      // O 429 prova que a janela local estava otimista: zera e recomeça a
      // contagem a partir de agora.
      janelas.forEach((registros) => { registros.length = 0; });
      await esperar(espera);
      return invocarIA(body, { tentativa: tentativa + 1, onEspera });
    }

    const erro = new Error(limite
      ? 'O limite de uso da IA continua ativo depois de várias tentativas. Aguarde um minuto e clique de novo para continuar de onde parou.'
      : detalhe.mensagem);
    erro.limite = limite;
    throw erro;
  }

  if (data?.resultado === undefined) throw new Error('A IA não retornou um resultado válido.');
  return data.resultado;
}

export function perguntarIAJson(prompt, system, maxTokens) {
  return invocarIA({ acao: 'gerar_json', prompt, system, maxTokens, modeloPreferido: 'gpt-oss' });
}

async function invocarGeminiComArquivo(arquivo, acao, campos = {}) {
  const body = new FormData();
  body.append('acao', acao);
  body.append('arquivo', arquivo, arquivo.name);
  Object.entries(campos).forEach(([chave, valor]) => {
    body.append(chave, typeof valor === 'string' ? valor : JSON.stringify(valor));
  });

  const { data, error } = await supabase.functions.invoke('ia', { body });
  if (error || data?.erro) {
    const detalhe = error
      ? await detalharErro(error)
      : { mensagem: data.erro, status: null };
    throw new Error(detalhe.mensagem || 'O Gemini não conseguiu analisar o documento.');
  }
  if (data?.resultado === undefined) throw new Error('O Gemini não retornou um resultado válido.');
  return data.resultado;
}

export async function extrairDocumentoVisualGemini(arquivo) {
  const resultado = await invocarGeminiComArquivo(arquivo, 'ocr_documento');
  const texto = String(resultado?.texto || '').trim();
  if (texto.length < 40) throw new Error('O OCR retornou pouco texto. Verifique a nitidez e a orientação do arquivo.');
  return { texto, modelo: resultado.modelo || 'gemini-3.5-flash-lite' };
}

export async function descreverQuestoesVisuaisGemini(arquivo, numeros) {
  const unicos = [...new Set(numeros.map(Number).filter((numero) => Number.isInteger(numero) && numero > 0))];
  if (!unicos.length) return [];
  const resultado = await invocarGeminiComArquivo(arquivo, 'descrever_visuais', { questoes: unicos });
  return Array.isArray(resultado?.questoes) ? resultado.questoes : [];
}

// Lotes por orçamento de tokens: uma questão longa viaja sozinha, várias curtas
// viajam juntas.
function montarLotes(questoes) {
  const lotes = [];
  let atual = [];
  let tokens = 0;
  for (const questao of questoes) {
    const texto = String(questao.paraClassificar || questao.enunciado || '').slice(0, MAX_CHARS_QUESTAO);
    const custo = estimarTokens(texto) + 40;
    if (atual.length && (tokens + custo > TOKENS_POR_LOTE || atual.length >= MAX_ITENS_LOTE)) {
      lotes.push(atual);
      atual = [];
      tokens = 0;
    }
    atual.push({ ...questao, _texto: texto, _tokens: custo });
    tokens += custo;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

/**
 * Encaixa o que a IA devolveu na taxonomia canônica.
 *
 * Sem isso, "Estequiometria" e "Estequiometria e mol" viram dois assuntos
 * distintos e a recorrência entre provas — que é o produto inteiro — se dilui
 * exatamente onde deveria acumular.
 */
function normalizarClassificacoes(classificacoes) {
  return classificacoes.map((item) => {
    const par = normalizarPar(item.materia_nome, item.assunto_nome);
    return {
      ...item,
      materia_nome: par.materia,
      assunto_nome: par.assunto,
      canonico: par.canonico,
      origem: 'ia',
      // Par que não encaixou na taxonomia não merece a confiança declarada: ou
      // o conteúdo é novo, ou o modelo inventou um nome.
      confianca: par.canonico
        ? (Number(item.confianca) || 0.7)
        : Math.min(Number(item.confianca) || 0.5, 0.4),
    };
  });
}

/**
 * Classifica em lotes, respeitando o orçamento de tokens.
 *
 * Um lote que falha NÃO derruba os anteriores: o que já foi classificado é
 * entregue via onParcial e devolvido no retorno, então dá para salvar o que
 * deu certo e reprocessar só o resto. Como classificar() só envia o que ainda
 * não tem classificação, clicar de novo continua de onde parou.
 *
 * onProgresso(atual, total, mensagem)
 * onParcial(classificacoesAteAgora)
 *
 * Devolve { classificacoes, falhas, interrompido, erro }.
 */
export async function classificarQuestoesIA(questoes, _materias = [], onProgresso, onParcial, opcoes = {}) {
  const { contextoProva = null, modeloPreferido = null } = opcoes;
  const lotes = montarLotes(questoes);
  const taxonomia = taxonomiaParaPrompt();
  const custoFixo = estimarTokens(taxonomia);

  const classificacoes = [];
  const falhas = [];
  let interrompido = false;
  let erroFinal = null;

  for (let i = 0; i < lotes.length; i += 1) {
    const lote = lotes[i];
    const previsto = custoFixo
      + lote.reduce((soma, q) => soma + q._tokens, 0)
      + 300 + lote.length * 160;
    let chaveModelo = modeloPreferido;
    if (!MODELOS[chaveModelo]) {
      chaveModelo = Date.now() < FIM_LLAMA_31 && proximoModelo % 2 === 0
        ? 'llama'
        : 'gpt-oss';
      proximoModelo += 1;
    }

    await reservarTokens(chaveModelo, previsto, (segundos) => {
      onProgresso?.(i + 1, lotes.length,
        `Aguardando ${segundos}s pelo limite do modelo ${chaveModelo}…`);
    });

    onProgresso?.(i + 1, lotes.length,
      `Classificando lote ${i + 1} de ${lotes.length} com ${chaveModelo}`);

    try {
      const resposta = await invocarIA({
        acao: 'classificar_questoes',
        taxonomia,
        contextoProva,
        modeloPreferido: MODELOS[chaveModelo].preferencia,
        questoes: lote.map((questao) => ({
          id: questao.id,
          texto: questao._texto,
          topico: questao.topico || null,
          materiaConhecida: questao.materiaConhecida || null,
          dependeDeVisual: Boolean(questao.dependeDeVisual),
        })),
      }, {
        onEspera: (segundos) => onProgresso?.(i + 1, lotes.length,
          `Limite da IA atingido. Nova tentativa em ${segundos}s…`),
      });

      if (!Array.isArray(resposta?.classificacoes)) throw new Error('Formato de classificação inválido.');
      classificacoes.push(...normalizarClassificacoes(resposta.classificacoes));
      onParcial?.(classificacoes.slice());
    } catch (error) {
      falhas.push(...lote.map((questao) => questao.id));
      // Rate limit persistente derruba tudo que vier depois: para e entrega o
      // que já foi feito, em vez de queimar as tentativas restantes à toa.
      if (error.limite) {
        interrompido = true;
        erroFinal = error.message;
        break;
      }
      erroFinal = error.message;
    }
  }

  return { classificacoes, falhas, interrompido, erro: erroFinal };
}
