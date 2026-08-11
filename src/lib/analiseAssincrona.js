import { supabase } from '../supabaseClient';
import { normalizarPar, taxonomiaParaPrompt } from './taxonomiaFatec';

export const LIMITE_BATCH_AUTOMATICO = 800;
export const STATUS_JOB_ATIVOS = ['pendente', 'processando', 'aguardando_batch'];
export const STATUS_JOB_FINAIS = ['concluido', 'concluido_com_falhas', 'falhou', 'cancelado'];

const MAX_ITENS_TEXTO = 24;
const MAX_ITENS_VISUAL = 12;
const MAX_CHARS_TEXTO = 30_000;
const MAX_CHARS_VISUAL = 18_000;
const MAX_CHARS_ITEM = 1_600;

function textoQuestao(questao) {
  return String(questao.paraClassificar || questao.enunciado || '').trim();
}

function entradaQuestao(questao) {
  return {
    id: String(questao.id),
    texto: textoQuestao(questao).slice(0, MAX_CHARS_ITEM),
    topico: questao.topico || null,
    materiaConhecida: questao.materiaConhecida || null,
    dependeDeVisual: Boolean(questao.dependeDeVisual),
  };
}

/**
 * Agrupa por documento e por necessidade visual. Isso impede que uma única
 * figura force 23 questões textuais a usar o modelo Flash mais caro.
 */
export function montarLotesClassificacao(documentos) {
  const lotes = [];

  for (const documento of documentos || []) {
    const grupos = [false, true].map((visual) => (documento.questoes || [])
      .filter((questao) => !questao.classificacao
        && textoQuestao(questao)
        && Boolean(questao.dependeDeVisual) === visual));

    for (const questoes of grupos) {
      if (!questoes.length) continue;
      const visual = Boolean(questoes[0].dependeDeVisual);
      const maxItens = visual ? MAX_ITENS_VISUAL : MAX_ITENS_TEXTO;
      const maxChars = visual ? MAX_CHARS_VISUAL : MAX_CHARS_TEXTO;
      let atuais = [];
      let caracteres = 0;

      const concluir = () => {
        if (!atuais.length) return;
        lotes.push({
          documento_nome: documento.nome,
          documento_hash: documento.hash,
          contextoProva: documento.contexto || null,
          requerFlash: visual,
          questoes: atuais,
        });
        atuais = [];
        caracteres = 0;
      };

      for (const questao of questoes) {
        const entrada = entradaQuestao(questao);
        const custo = entrada.texto.length + 200;
        if (atuais.length && (atuais.length >= maxItens || caracteres + custo > maxChars)) concluir();
        atuais.push(entrada);
        caracteres += custo;
      }
      concluir();
    }
  }

  return lotes;
}

/** Snapshot suficiente para reconstruir a seleção depois de recarregar a página. */
export function criarSnapshotDocumentos(documentos) {
  return (documentos || []).map((doc) => ({
    nome: doc.nome,
    tipo: doc.tipo,
    tamanho: doc.tamanho,
    totalPaginas: doc.totalPaginas,
    hash: doc.hash,
    perfil: doc.perfil,
    contexto: doc.contexto || null,
    selecionado: doc.selecionado !== false,
    avisos: doc.avisos || [],
    modeloVisual: doc.modeloVisual || null,
    questoes: (doc.questoes || []).map((questao) => ({
      ...questao,
      selecionada: questao.selecionada !== false,
    })),
  }));
}

function normalizarClassificacao(item) {
  const par = normalizarPar(item.materia_nome, item.assunto_nome);
  return {
    ...item,
    materia_nome: par.materia,
    assunto_nome: par.assunto,
    canonico: par.canonico,
    origem: item.origem || 'ia_assincrona',
    confianca: par.canonico
      ? (Number(item.confianca) || 0.7)
      : Math.min(Number(item.confianca) || 0.5, 0.4),
  };
}

export function aplicarResultadosAoSnapshot(snapshot, lotes) {
  const porId = new Map();
  for (const lote of lotes || []) {
    const classificacoes = lote?.resultado?.classificacoes;
    if (!Array.isArray(classificacoes)) continue;
    for (const item of classificacoes) porId.set(String(item.id), normalizarClassificacao(item));
  }

  return (snapshot || []).map((doc) => ({
    ...doc,
    selecionado: doc.selecionado !== false,
    questoes: (doc.questoes || []).map((questao) => ({
      ...questao,
      selecionada: questao.selecionada !== false,
      classificacao: porId.get(String(questao.id)) || questao.classificacao || null,
    })),
  }));
}

export function percentualJob(job) {
  const total = Number(job?.total_itens || 0);
  const processados = Number(job?.itens_concluidos || 0) + Number(job?.itens_falhos || 0);
  return total ? Math.min(100, Math.round((processados / total) * 100)) : 0;
}

export function rotuloStatusJob(status) {
  return ({
    pendente: 'Na fila',
    processando: 'Processando',
    aguardando_batch: 'Aguardando Gemini Batch',
    concluido: 'Concluído',
    concluido_com_falhas: 'Concluído com pendências',
    falhou: 'Falhou',
    cancelado: 'Cancelado',
  })[status] || status;
}

export async function criarJobClassificacao({ nome, documentos, modo = 'auto', usarGroq = false }) {
  const lotes = montarLotesClassificacao(documentos);
  if (!lotes.length) throw new Error('Não existem conteúdos pendentes para classificar.');
  const { data, error } = await supabase.rpc('criar_job_classificacao', {
    p_nome: nome,
    p_lotes: lotes,
    p_taxonomia: taxonomiaParaPrompt(),
    p_documentos_snapshot: criarSnapshotDocumentos(documentos),
    p_modo: modo,
    p_usar_groq: Boolean(usarGroq),
  });
  if (error) throw new Error(`Não foi possível criar o processamento em segundo plano: ${error.message}`);
  return data;
}

export async function listarJobsClassificacao(limite = 6) {
  const { data, error } = await supabase
    .from('analise_jobs')
    .select('id,nome,status,modo_solicitado,modo_efetivo,usar_groq,total_itens,itens_concluidos,itens_falhos,total_lotes,lotes_concluidos,lotes_falhos,provedores,batch_state,erro,created_at,updated_at,finished_at')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function obterJobClassificacao(jobId) {
  const [jobResposta, lotesResposta] = await Promise.all([
    supabase.from('analise_jobs').select('*').eq('id', jobId).single(),
    supabase.from('analise_lotes')
      .select('id,ordem,status,resultado,itens_quantidade,provedor,modelo,tentativas,erro')
      .eq('job_id', jobId)
      .order('ordem'),
  ]);
  if (jobResposta.error) throw new Error(jobResposta.error.message);
  if (lotesResposta.error) throw new Error(lotesResposta.error.message);
  return { job: jobResposta.data, lotes: lotesResposta.data || [] };
}

export async function acordarWorkerAnalise() {
  const { error } = await supabase.functions.invoke('analise-worker', {
    body: { acao: 'processar_fila' },
  });
  if (error) throw new Error(error.message);
}

export async function cancelarJobClassificacao(jobId) {
  const { data, error } = await supabase.rpc('cancelar_job_classificacao', { p_job_id: jobId });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
