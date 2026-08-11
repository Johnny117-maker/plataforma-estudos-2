import { supabase } from '../supabaseClient';

// O limite que derruba a classificação não é requisições por minuto, é TOKENS
// por minuto. No free tier do Groq o teto costuma ser ~6.000 TPM: um único
// lote de 5 questões com 2.500 caracteres cada já passa disso sozinho.
//
// Então aqui o lote é montado por ORÇAMENTO DE TOKENS, não por contagem de
// itens, e existe um acelerador de janela móvel que segura a chamada antes de
// estourar em vez de esperar o 429 chegar.

const TETO_TPM = 5000;            // margem sob os 6.000 do free tier
const TOKENS_POR_LOTE = 1400;     // texto das questões por requisição
const MAX_ITENS_LOTE = 6;         // teto da Edge Function é 8
const MAX_CHARS_QUESTAO = 1100;   // classificar não precisa do enunciado inteiro
const MAX_TENTATIVAS = 5;
const ESPERA_MAXIMA_MS = 70_000;

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Português rende ~3,5 caracteres por token nos tokenizers da família Llama.
function estimarTokens(texto) {
  return Math.ceil(String(texto || '').length / 3.5);
}

// Janela móvel de 60s. Antes de cada chamada, se o previsto estourar o teto,
// dorme até a janela liberar espaço.
const janela = [];

function tokensNaJanela() {
  const corte = Date.now() - 60_000;
  while (janela.length && janela[0].em < corte) janela.shift();
  return janela.reduce((s, r) => s + r.tokens, 0);
}

async function reservarTokens(tokens, onEspera) {
  for (;;) {
    const usados = tokensNaJanela();
    if (usados + tokens <= TETO_TPM) {
      janela.push({ em: Date.now(), tokens });
      return;
    }
    const maisAntigo = janela[0];
    const faltam = Math.max(1_000, 60_000 - (Date.now() - maisAntigo.em) + 250);
    onEspera?.(Math.ceil(faltam / 1000));
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
      // Backoff exponencial com o Retry-After do provedor como piso.
      const base = detalhe.retryAfterMs || 8_000 * 2 ** tentativa;
      const espera = Math.min(ESPERA_MAXIMA_MS, Math.max(2_000, base));
      onEspera?.(Math.ceil(espera / 1000));
      // O 429 significa que a janela local estava otimista: zera para recomeçar
      // a contagem a partir de agora.
      janela.length = 0;
      await esperar(espera);
      return invocarIA(body, { tentativa: tentativa + 1, onEspera });
    }

    const erro = new Error(limite
      ? 'O limite de uso da IA continua ativo depois de várias tentativas. Aguarde um minuto e continue de onde parou.'
      : detalhe.mensagem);
    erro.limite = limite;
    throw erro;
  }

  if (data?.resultado === undefined) throw new Error('A IA não retornou um resultado válido.');
  return data.resultado;
}

export function perguntarIAJson(prompt, system, maxTokens) {
  return invocarIA({ acao: 'gerar_json', prompt, system, maxTokens });
}

// Monta lotes por orçamento de tokens. Uma questão gigante vai sozinha; várias
// curtas viajam juntas.
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

// O catálogo viaja em toda requisição. Enviar 9 matérias com 50 assuntos cada
// custa mais tokens que as próprias questões — aqui ele é enxugado.
function enxugarCatalogo(materias, limiteAssuntos = 40) {
  return materias.slice(0, 20).map((m) => ({
    id: m.id,
    nome: m.nome,
    assuntos: (m.subgeneros || []).slice(0, limiteAssuntos).map((s) => ({ id: s.id, nome: s.nome })),
  }));
}

/**
 * Classifica em lotes, respeitando o orçamento de tokens.
 *
 * Diferença central em relação à versão anterior: um lote que falha NÃO derruba
 * os anteriores. O que já foi classificado é entregue via onParcial e devolvido
 * no retorno, então dá para salvar o que deu certo e reprocessar só o resto.
 *
 * onProgresso(atual, total, mensagem)
 * onParcial(classificacoesAteAgora)
 *
 * Devolve { classificacoes, falhas, interrompido, erro }.
 */
export async function classificarQuestoesIA(questoes, materias = [], onProgresso, onParcial) {
  const lotes = montarLotes(questoes);
  const catalogo = enxugarCatalogo(materias);
  const custoCatalogo = estimarTokens(JSON.stringify(catalogo));

  const classificacoes = [];
  const falhas = [];
  let interrompido = false;
  let erroFinal = null;

  for (let i = 0; i < lotes.length; i += 1) {
    const lote = lotes[i];
    const previsto = custoCatalogo + lote.reduce((s, q) => s + q._tokens, 0) + 500 + lote.length * 220;

    await reservarTokens(previsto, (segundos) => {
      onProgresso?.(i + 1, lotes.length, `Aguardando ${segundos}s para não estourar o limite da IA…`);
    });

    onProgresso?.(i + 1, lotes.length, `Classificando lote ${i + 1} de ${lotes.length}`);

    try {
      const resposta = await invocarIA({
        acao: 'classificar_questoes',
        materias: catalogo,
        questoes: lote.map((q) => ({ id: q.id, texto: q._texto, topico: q.topico })),
      }, {
        onEspera: (segundos) => onProgresso?.(i + 1, lotes.length,
          `Limite da IA atingido. Nova tentativa em ${segundos}s…`),
      });

      if (!Array.isArray(resposta?.classificacoes)) throw new Error('Formato de classificação inválido.');
      classificacoes.push(...resposta.classificacoes);
      onParcial?.(classificacoes.slice());
    } catch (error) {
      falhas.push(...lote.map((q) => q.id));
      // Rate limit persistente derruba tudo que vier depois: para e entrega o
      // que já foi feito, em vez de queimar o resto das tentativas à toa.
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