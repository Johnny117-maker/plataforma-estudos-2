import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const FLASH_LITE_MODEL = Deno.env.get('GEMINI_FLASH_LITE_MODEL') || 'gemini-3.5-flash-lite';
const MAX_MENSAGENS_EXECUCAO = 6;
const TEMPO_MAXIMO_EXECUCAO_MS = 105_000;
const CONFIANCA_REFINO = 0.62;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type QueueMessage = {
  msg_id: number;
  read_ct: number;
  message: {
    tipo: 'classificar_lote' | 'enviar_batch' | 'consultar_batch';
    job_id: string;
    lote_id?: string;
    refinar_ids?: string[];
  };
};

type QuestaoEntrada = {
  id: string;
  texto: string;
  topico?: string | null;
  materiaConhecida?: string | null;
  dependeDeVisual?: boolean;
};

type Classificacao = {
  id: string;
  materia_nome: string;
  assunto_nome: string;
  dificuldade: 'facil' | 'media' | 'dificil';
  confianca: number;
  [key: string]: unknown;
};

class FalhaHttp extends Error {
  status: number;
  retryAfter: number;

  constructor(message: string, status = 502, retryAfter = 30) {
    super(message);
    this.status = status;
    this.retryAfter = Math.max(2, Math.min(900, retryAfter));
  }
}

function agoraIso() {
  return new Date().toISOString();
}

function extrairJson(texto: string) {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const inicios = [limpo.indexOf('{'), limpo.indexOf('[')].filter((item) => item >= 0);
    const inicio = Math.min(...inicios);
    const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
    if (Number.isFinite(inicio) && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1));
    throw new FalhaHttp('A IA não retornou JSON válido.', 502);
  }
}

function textoRespostaGemini(resposta: Record<string, unknown>) {
  if (typeof resposta.text === 'string') return resposta.text;
  const candidatos = Array.isArray(resposta.candidates) ? resposta.candidates : [];
  const primeiro = candidatos[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined;
  return (primeiro?.content?.parts || []).map((parte) => parte.text || '').join('\n').trim();
}

function schemaClassificacao() {
  return {
    type: 'object',
    properties: {
      classificacoes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            materia_nome: { type: 'string' },
            assunto_nome: { type: 'string' },
            dificuldade: { type: 'string', enum: ['facil', 'media', 'dificil'] },
            confianca: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['id', 'materia_nome', 'assunto_nome', 'dificuldade', 'confianca'],
        },
      },
    },
    required: ['classificacoes'],
  };
}

function promptClassificacao(taxonomia: string, payload: Record<string, unknown>, questoes: QuestaoEntrada[]) {
  const contexto = typeof payload.contextoProva === 'string' ? payload.contextoProva.slice(0, 400) : '';
  const system = [
    'Você classifica questões de vestibular pelo conhecimento necessário para resolvê-las.',
    'Use exatamente os pares de matéria e assunto da taxonomia recebida.',
    'Responda somente JSON válido, sem markdown.',
  ].join(' ');
  const blocos = questoes.map((questao) => {
    const partes = [`### id: ${questao.id}`];
    if (questao.materiaConhecida) partes.push(`matéria confirmada, não altere: ${questao.materiaConhecida}`);
    if (questao.topico) partes.push(`tópico indicado: ${questao.topico}`);
    if (questao.dependeDeVisual) partes.push('Considere a descrição do elemento visual presente no texto.');
    partes.push(String(questao.texto).slice(0, 1_500));
    return partes.join('\n');
  }).join('\n\n');

  const prompt = `Classifique cada questão abaixo.
${contexto ? `CONTEXTO DA PROVA: ${contexto}\nO contexto não determina a matéria.\n` : ''}
TAXONOMIA — copie os nomes exatamente:
${taxonomia.slice(0, 20_000)}

REGRAS
1. Classifique pelo conhecimento exigido, não pelo tema superficial.
2. Escolha a habilidade dominante quando houver mais de uma.
3. Se nenhum par servir, use matéria "Não classificada" e assunto em até 4 palavras.
4. Confiança deve ficar entre 0 e 1; abaixo de 0,6 exige revisão.
5. Dificuldade: "facil", "media" ou "dificil".

QUESTÕES
${blocos}

Formato: {"classificacoes":[{"id":"...","materia_nome":"...","assunto_nome":"...","dificuldade":"media","confianca":0.85}]}`;
  return { system, prompt };
}

function validarClassificacoes(resultado: Record<string, unknown>, questoes: QuestaoEntrada[]) {
  const lista = Array.isArray(resultado?.classificacoes) ? resultado.classificacoes as Classificacao[] : [];
  const esperados = new Set(questoes.map((questao) => String(questao.id)));
  const validas = lista.filter((item) => esperados.has(String(item.id)));
  if (validas.length !== esperados.size || new Set(validas.map((item) => String(item.id))).size !== esperados.size) {
    throw new FalhaHttp(`A IA devolveu ${validas.length} de ${esperados.size} classificações.`, 502);
  }
  return validas.map((item) => ({
    ...item,
    id: String(item.id),
    confianca: Math.max(0, Math.min(1, Number(item.confianca) || 0)),
  }));
}

async function rpc<T>(nome: string, parametros: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(nome, parametros);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data as T;
}

async function atualizarLote(loteId: string, valores: Record<string, unknown>) {
  const { error } = await admin.from('analise_lotes').update(valores).eq('id', loteId);
  if (error) throw new Error(`Falha ao atualizar lote: ${error.message}`);
}

async function atualizarJob(jobId: string, valores: Record<string, unknown>) {
  const { error } = await admin.from('analise_jobs').update(valores).eq('id', jobId);
  if (error) throw new Error(`Falha ao atualizar job: ${error.message}`);
}

async function publicarMensagem(message: QueueMessage['message'], atraso = 0) {
  return rpc<number>('worker_publicar_mensagem', {
    p_mensagem: message,
    p_atraso_segundos: atraso,
  });
}

async function registrarUso(jobId: string, uso: Record<string, number>) {
  for (const [chave, quantidade] of Object.entries(uso)) {
    if (quantidade <= 0) continue;
    await rpc('worker_incrementar_provedor', {
      p_job_id: jobId,
      p_chave: chave,
      p_quantidade: quantidade,
    });
  }
}

async function chamarIA(body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ia`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.erro) {
    const header = Number(response.headers.get('retry-after'));
    const retryAfter = Number.isFinite(header) && header > 0 ? header : Number(payload?.retryAfter) || 30;
    throw new FalhaHttp(payload?.erro || 'O serviço de IA não respondeu.', response.status, retryAfter);
  }
  return payload as { resultado: { classificacoes: Classificacao[] }; ia?: Record<string, unknown> };
}

async function classificarComModelo(
  job: Record<string, unknown>,
  lote: Record<string, unknown>,
  questoes: QuestaoEntrada[],
  rota: 'groq' | 'lite' | 'flash',
) {
  const payload = lote.payload as Record<string, unknown>;
  const body: Record<string, unknown> = {
    acao: 'classificar_questoes',
    taxonomia: job.taxonomia,
    contextoProva: payload.contextoProva || null,
    questoes,
    provedorPreferido: rota === 'groq' ? 'groq' : 'gemini',
    modeloGemini: rota === 'flash' ? 'flash' : 'flash-lite',
  };
  const resposta = await chamarIA(body);
  return {
    classificacoes: validarClassificacoes(resposta.resultado, questoes),
    ia: resposta.ia || {},
  };
}

function substituirClassificacoes(base: Classificacao[], novas: Classificacao[]) {
  const porId = new Map(base.map((item) => [String(item.id), item]));
  for (const item of novas) porId.set(String(item.id), item);
  return [...porId.values()];
}

async function carregarLoteEJob(loteId: string, jobId: string) {
  const [loteResposta, jobResposta] = await Promise.all([
    admin.from('analise_lotes').select('*').eq('id', loteId).eq('job_id', jobId).maybeSingle(),
    admin.from('analise_jobs').select('*').eq('id', jobId).maybeSingle(),
  ]);
  if (loteResposta.error) throw new Error(loteResposta.error.message);
  if (jobResposta.error) throw new Error(jobResposta.error.message);
  return { lote: loteResposta.data, job: jobResposta.data };
}

type AcaoMensagem =
  | { tipo: 'concluir' }
  | { tipo: 'descartar' }
  | { tipo: 'reagendar'; atraso: number; message: QueueMessage['message'] };

async function processarClassificacao(message: QueueMessage['message']): Promise<AcaoMensagem> {
  if (!message.lote_id) return { tipo: 'descartar' };
  const { lote, job } = await carregarLoteEJob(message.lote_id, message.job_id);
  if (!lote || !job) return { tipo: 'descartar' };
  if (job.status === 'cancelado' || ['concluido', 'falhou', 'cancelado'].includes(lote.status)) {
    return { tipo: 'concluir' };
  }

  const tentativa = Number(lote.tentativas || 0) + 1;
  await atualizarLote(lote.id, {
    status: 'processando', tentativas: tentativa, started_at: lote.started_at || agoraIso(),
    proxima_tentativa: null, erro: null,
  });

  const payload = lote.payload as { requerFlash?: boolean; questoes?: QuestaoEntrada[] };
  const todas = Array.isArray(payload.questoes) ? payload.questoes : [];
  const refinarIds = new Set((message.refinar_ids || []).map(String));
  const somenteRefino = refinarIds.size > 0;
  const alvo = somenteRefino ? todas.filter((questao) => refinarIds.has(String(questao.id))) : todas;
  if (!alvo.length) throw new FalhaHttp('Lote sem questões válidas.', 400);

  try {
    let classificacoes: Classificacao[];
    let uso = { gemini_flash_lite: 0, gemini_flash: 0, groq: 0 };
    let modeloFinal = '';
    let provedorFinal = '';

    if (somenteRefino) {
      const refinado = await classificarComModelo(job, lote, alvo, 'flash');
      const preliminares = Array.isArray(lote.resultado?.classificacoes)
        ? lote.resultado.classificacoes as Classificacao[] : [];
      classificacoes = substituirClassificacoes(preliminares, refinado.classificacoes);
      uso.gemini_flash = alvo.length;
      modeloFinal = 'flash+flash-lite';
      provedorFinal = 'gemini';
    } else {
      const usarFlash = Boolean(payload.requerFlash) || alvo.some((questao) => questao.dependeDeVisual);
      const usarGroq = Boolean(job.usar_groq) && !usarFlash && Number(lote.ordem) % 4 === 0 && tentativa === 1;
      let inicial;
      if (usarFlash) {
        inicial = await classificarComModelo(job, lote, alvo, 'flash');
        uso.gemini_flash = alvo.length;
        modeloFinal = String(inicial.ia?.modelo || 'gemini-flash');
        provedorFinal = 'gemini';
      } else if (usarGroq) {
        try {
          inicial = await classificarComModelo(job, lote, alvo, 'groq');
          uso.groq = alvo.length;
          modeloFinal = String(inicial.ia?.modelo || 'groq');
          provedorFinal = 'groq';
        } catch {
          inicial = await classificarComModelo(job, lote, alvo, 'lite');
          uso.gemini_flash_lite = alvo.length;
          modeloFinal = String(inicial.ia?.modelo || 'gemini-flash-lite');
          provedorFinal = 'gemini';
        }
      } else {
        inicial = await classificarComModelo(job, lote, alvo, 'lite');
        uso.gemini_flash_lite = alvo.length;
        modeloFinal = String(inicial.ia?.modelo || 'gemini-flash-lite');
        provedorFinal = 'gemini';
      }
      classificacoes = inicial.classificacoes;

      const ambiguas = (uso.gemini_flash_lite || uso.groq)
        ? classificacoes.filter((item) => Number(item.confianca) < CONFIANCA_REFINO)
        : [];
      if (ambiguas.length) {
        const ids = new Set(ambiguas.map((item) => String(item.id)));
        const questoesRefino = todas.filter((questao) => ids.has(String(questao.id)));
        try {
          const refinado = await classificarComModelo(job, lote, questoesRefino, 'flash');
          classificacoes = substituirClassificacoes(classificacoes, refinado.classificacoes);
          if (uso.gemini_flash_lite) uso.gemini_flash_lite -= questoesRefino.length;
          if (uso.groq) uso.groq -= questoesRefino.length;
          uso.gemini_flash += questoesRefino.length;
          modeloFinal = 'flash+flash-lite';
        } catch (error) {
          if (error instanceof FalhaHttp && [429, 500, 502, 503, 504].includes(error.status)) {
            await atualizarLote(lote.id, {
              status: 'aguardando_refino',
              resultado: { classificacoes, preliminar: true },
              provedor: provedorFinal,
              modelo: modeloFinal,
              proxima_tentativa: new Date(Date.now() + error.retryAfter * 1000).toISOString(),
              erro: `Refino aguardando: ${error.message}`,
            });
            return {
              tipo: 'reagendar', atraso: error.retryAfter,
              message: { ...message, refinar_ids: questoesRefino.map((questao) => String(questao.id)) },
            };
          }
          throw error;
        }
      }
    }

    await atualizarLote(lote.id, {
      status: 'concluido', resultado: { classificacoes }, provedor: provedorFinal,
      modelo: modeloFinal, finished_at: agoraIso(), erro: null, proxima_tentativa: null,
    });
    await registrarUso(job.id, uso);
    return { tipo: 'concluir' };
  } catch (error) {
    const falha = error instanceof FalhaHttp ? error : new FalhaHttp(
      error instanceof Error ? error.message : 'Falha inesperada no lote.', 500, 30,
    );
    const recuperavel = [429, 500, 502, 503, 504].includes(falha.status);
    if (recuperavel && tentativa < Number(lote.max_tentativas || 8)) {
      const atraso = Math.min(900, Math.max(falha.retryAfter, 8 * 2 ** Math.min(tentativa, 6)));
      await atualizarLote(lote.id, {
        status: falha.status === 429 ? 'aguardando_limite' : 'pendente',
        proxima_tentativa: new Date(Date.now() + atraso * 1000).toISOString(),
        erro: falha.message,
      });
      return { tipo: 'reagendar', atraso, message };
    }
    await atualizarLote(lote.id, {
      status: 'falhou', erro: falha.message, finished_at: agoraIso(), proxima_tentativa: null,
    });
    return { tipo: 'descartar' };
  }
}

async function chamarGeminiBatch(job: Record<string, unknown>, lotes: Array<Record<string, unknown>>) {
  if (!GEMINI_API_KEY) throw new FalhaHttp('GEMINI_API_KEY não configurada.', 503, 60);
  const requests = lotes.map((lote) => {
    const payload = lote.payload as { questoes: QuestaoEntrada[] };
    const { system, prompt } = promptClassificacao(String(job.taxonomia), payload, payload.questoes);
    return {
      request: {
        contents: [{ role: 'user', parts: [{ text: `INSTRUÇÕES DO SISTEMA\n${system}\n\nSOLICITAÇÃO\n${prompt}` }] }],
        generation_config: {
          temperature: 0.1,
          response_mime_type: 'application/json',
          response_json_schema: schemaClassificacao(),
        },
      },
      metadata: { key: lote.id },
    };
  });
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${FLASH_LITE_MODEL}:batchGenerateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch: {
          display_name: `analise-${String(job.id).slice(0, 18)}`,
          input_config: { requests: { requests } },
        },
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after')) || 60;
    throw new FalhaHttp(payload?.error?.message || 'Falha ao criar Gemini Batch.', response.status, retryAfter);
  }
  if (!payload?.name) throw new FalhaHttp('O Gemini Batch não devolveu o identificador do job.', 502);
  return payload;
}

async function consultarGeminiBatch(nome: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${nome}`, {
    headers: { 'x-goog-api-key': GEMINI_API_KEY },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new FalhaHttp(payload?.error?.message || 'Falha ao consultar Gemini Batch.', response.status,
      Number(response.headers.get('retry-after')) || 60);
  }
  return payload;
}

async function fallbackBatchParaFila(job: Record<string, unknown>, motivo: string) {
  const { data: lotes, error } = await admin.from('analise_lotes')
    .select('id,status').eq('job_id', job.id).order('ordem');
  if (error) throw new Error(error.message);
  await atualizarJob(String(job.id), {
    modo_efetivo: 'fila_fallback', status: 'processando', batch_state: 'FALLBACK_PARA_FILA', erro: motivo,
  });
  for (const lote of lotes || []) {
    if (['concluido', 'cancelado'].includes(lote.status)) continue;
    await atualizarLote(lote.id, { status: 'pendente', erro: null, proxima_tentativa: null });
    await publicarMensagem({ tipo: 'classificar_lote', job_id: String(job.id), lote_id: lote.id });
  }
}

async function processarEnvioBatch(message: QueueMessage['message']): Promise<AcaoMensagem> {
  const { data: job, error: jobError } = await admin.from('analise_jobs').select('*')
    .eq('id', message.job_id).maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job || job.status === 'cancelado') return { tipo: 'concluir' };
  if (job.batch_job_name) {
    return { tipo: 'reagendar', atraso: 30, message: { tipo: 'consultar_batch', job_id: job.id } };
  }
  const { data: lotes, error } = await admin.from('analise_lotes').select('*')
    .eq('job_id', job.id).order('ordem');
  if (error) throw new Error(error.message);

  try {
    const batch = await chamarGeminiBatch(job, lotes || []);
    await atualizarJob(job.id, {
      status: 'aguardando_batch', batch_job_name: batch.name,
      batch_state: batch.state || batch.metadata?.state || 'JOB_STATE_PENDING',
      started_at: job.started_at || agoraIso(), erro: null,
    });
    return { tipo: 'reagendar', atraso: 45, message: { tipo: 'consultar_batch', job_id: job.id } };
  } catch (error) {
    const falha = error instanceof FalhaHttp ? error : new FalhaHttp(String(error), 500, 60);
    if ([429, 500, 502, 503, 504].includes(falha.status) && Number(job.lotes_falhos || 0) < 3) {
      await atualizarJob(job.id, { erro: falha.message, batch_state: 'AGUARDANDO_NOVA_TENTATIVA' });
      return { tipo: 'reagendar', atraso: falha.retryAfter, message };
    }
    await fallbackBatchParaFila(job, `Gemini Batch indisponível: ${falha.message}`);
    return { tipo: 'concluir' };
  }
}

async function processarResultadoBatch(
  job: Record<string, unknown>,
  lotes: Array<Record<string, unknown>>,
  respostas: Array<Record<string, unknown>>,
) {
  let refinos = 0;
  const porChave = new Map(respostas.map((item, indice) => [
    String((item.metadata as { key?: string } | undefined)?.key || lotes[indice]?.id || ''), item,
  ]));

  for (let indice = 0; indice < lotes.length; indice += 1) {
    const lote = lotes[indice];
    const resposta = porChave.get(String(lote.id)) || respostas[indice];
    const payload = lote.payload as { questoes: QuestaoEntrada[]; requerFlash?: boolean };
    try {
      if (!resposta || resposta.error) throw new FalhaHttp('Item do Batch falhou.', 502);
      const bruto = resposta.response as Record<string, unknown>;
      const texto = textoRespostaGemini(bruto || {});
      const classificacoes = validarClassificacoes(extrairJson(texto), payload.questoes);
      const ambiguas = classificacoes.filter((item) => Number(item.confianca) < CONFIANCA_REFINO);
      const precisaRefino = Boolean(payload.requerFlash) || ambiguas.length > 0;
      if (precisaRefino) {
        refinos += 1;
        const ids = payload.requerFlash
          ? payload.questoes.map((questao) => String(questao.id))
          : ambiguas.map((item) => String(item.id));
        await atualizarLote(String(lote.id), {
          status: 'aguardando_refino', resultado: { classificacoes, preliminar: true },
          provedor: 'gemini', modelo: FLASH_LITE_MODEL,
        });
        await publicarMensagem({
          tipo: 'classificar_lote', job_id: String(job.id), lote_id: String(lote.id), refinar_ids: ids,
        });
      } else {
        await atualizarLote(String(lote.id), {
          status: 'concluido', resultado: { classificacoes }, provedor: 'gemini',
          modelo: FLASH_LITE_MODEL, finished_at: agoraIso(), erro: null,
        });
        await registrarUso(String(job.id), { gemini_flash_lite: classificacoes.length });
      }
    } catch (error) {
      await atualizarLote(String(lote.id), { status: 'pendente', erro: error instanceof Error ? error.message : String(error) });
      await publicarMensagem({ tipo: 'classificar_lote', job_id: String(job.id), lote_id: String(lote.id) });
    }
  }
  return refinos;
}

async function processarConsultaBatch(message: QueueMessage['message']): Promise<AcaoMensagem> {
  const { data: job, error: jobError } = await admin.from('analise_jobs').select('*')
    .eq('id', message.job_id).maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job || job.status === 'cancelado') return { tipo: 'concluir' };
  if (!job.batch_job_name) return { tipo: 'reagendar', atraso: 30, message: { tipo: 'enviar_batch', job_id: job.id } };

  try {
    const batch = await consultarGeminiBatch(job.batch_job_name);
    const state = batch.state || batch.metadata?.state || 'JOB_STATE_PENDING';
    await atualizarJob(job.id, { batch_state: state, erro: null });
    const finais = new Set(['JOB_STATE_SUCCEEDED', 'JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED']);
    if (!finais.has(state)) return { tipo: 'reagendar', atraso: 60, message };
    if (state !== 'JOB_STATE_SUCCEEDED') {
      await fallbackBatchParaFila(job, `Gemini Batch terminou em ${state}.`);
      return { tipo: 'concluir' };
    }

    const respostas = batch.dest?.inlinedResponses || batch.response?.inlinedResponses || [];
    const { data: lotes, error } = await admin.from('analise_lotes').select('*')
      .eq('job_id', job.id).order('ordem');
    if (error) throw new Error(error.message);
    if (!Array.isArray(respostas) || respostas.length !== (lotes || []).length) {
      await fallbackBatchParaFila(job, 'O Gemini Batch devolveu uma quantidade incompleta de lotes.');
      return { tipo: 'concluir' };
    }
    const refinos = await processarResultadoBatch(job, lotes || [], respostas);
    await atualizarJob(job.id, refinos > 0
      ? { batch_state: state, status: 'processando' }
      : { batch_state: state });
    return { tipo: 'concluir' };
  } catch (error) {
    const falha = error instanceof FalhaHttp ? error : new FalhaHttp(String(error), 500, 60);
    if ([429, 500, 502, 503, 504].includes(falha.status)) {
      await atualizarJob(job.id, { erro: falha.message });
      return { tipo: 'reagendar', atraso: falha.retryAfter, message };
    }
    await fallbackBatchParaFila(job, falha.message);
    return { tipo: 'concluir' };
  }
}

async function executarAcaoMensagem(fila: QueueMessage, acao: AcaoMensagem) {
  if (acao.tipo === 'concluir') {
    await rpc('worker_concluir_mensagem', { p_msg_id: fila.msg_id });
  } else if (acao.tipo === 'descartar') {
    await rpc('worker_descartar_mensagem', { p_msg_id: fila.msg_id });
  } else {
    await rpc('worker_reagendar_mensagem', {
      p_msg_id: fila.msg_id,
      p_mensagem: acao.message,
      p_atraso_segundos: acao.atraso,
    });
  }
}

async function processarMensagem(fila: QueueMessage) {
  let acao: AcaoMensagem;
  if (fila.message.tipo === 'classificar_lote') acao = await processarClassificacao(fila.message);
  else if (fila.message.tipo === 'enviar_batch') acao = await processarEnvioBatch(fila.message);
  else if (fila.message.tipo === 'consultar_batch') acao = await processarConsultaBatch(fila.message);
  else acao = { tipo: 'descartar' };
  await executarAcaoMensagem(fila, acao);
}

async function autoInvocar() {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/analise-worker`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ acao: 'continuar_fila' }),
    });
  } catch (error) {
    console.error('Não foi possível auto-invocar o próximo worker:', error);
  }
}

async function processarFila() {
  const inicio = Date.now();
  let processadas = 0;
  let interrompidaPorTempo = false;

  while (processadas < MAX_MENSAGENS_EXECUCAO) {
    if (Date.now() - inicio > TEMPO_MAXIMO_EXECUCAO_MS) {
      interrompidaPorTempo = true;
      break;
    }
    const mensagens = await rpc<QueueMessage[]>('worker_ler_fila', { p_quantidade: 1 });
    if (!mensagens?.length) break;
    const fila = mensagens[0];
    try {
      await processarMensagem(fila);
    } catch (error) {
      console.error(`Falha inesperada na mensagem ${fila.msg_id}:`, error);
      const tentativas = Number(fila.read_ct || 0);
      if (tentativas >= 8) {
        await rpc('worker_descartar_mensagem', { p_msg_id: fila.msg_id });
      } else {
        await rpc('worker_reagendar_mensagem', {
          p_msg_id: fila.msg_id,
          p_mensagem: fila.message,
          p_atraso_segundos: Math.min(600, 30 * Math.max(1, tentativas)),
        });
      }
    }
    processadas += 1;
  }

  if (processadas >= MAX_MENSAGENS_EXECUCAO || interrompidaPorTempo) await autoInvocar();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ erro: 'Método não permitido.' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ erro: 'Worker sem configuração do Supabase.' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  EdgeRuntime.waitUntil(processarFila());
  return new Response(JSON.stringify({ aceito: true, mensagem: 'Fila em processamento.' }), {
    status: 202,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
