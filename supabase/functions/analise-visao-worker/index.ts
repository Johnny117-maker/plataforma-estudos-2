// Worker do pipeline de análise por visão.
//
// Reivindica um analysis_job, baixa o PDF e os PNGs das páginas (renderizados
// pelo navegador na etapa 1), extrai o texto nativo com unpdf (edge-friendly,
// sem canvas nativo), envia texto + imagem ao Gemini Flash, recebe as questões
// em JSON estruturado, recorta os elementos visuais com ImageScript e persiste.
//
// Nada de chave de IA sai daqui para o cliente. Processa um orçamento pequeno de
// páginas por execução e se re-invoca; o cron é a rede de segurança. Rate limit
// (429) NÃO derruba o job: pausa e retoma sem perder o progresso.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const FLASH_MODEL = Deno.env.get('GEMINI_FLASH_MODEL') || 'gemini-3.5-flash';
const FLASH_LITE_MODEL = Deno.env.get('GEMINI_FLASH_LITE_MODEL') || Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
const BUCKET = 'provas-visao';
// Página com texto nativo suficiente não precisa de visão: extrai por texto.
const MINIMO_CHARS_POR_PAGINA = 200;
const TEMPO_MAXIMO_EXECUCAO_MS = 60_000;
const MAX_PAGINAS_POR_EXECUCAO = 4;
const PACE_ENTRE_PAGINAS_MS = 3_000;
const MAX_TENTATIVAS_429 = 4;
const ESPERA_MAXIMA_429_MS = 30_000;
const MAX_QUESTOES_VISUAIS = 8;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Erro de rate limit: sinaliza que o job deve PAUSAR (não falhar).
class LimiteError extends Error {}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchComTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controlador.signal });
  } finally {
    clearTimeout(timer);
  }
}

function esperaDoRetryAfter(header: string | null, tentativa: number) {
  const segundos = Number(header);
  const base = Number.isFinite(segundos) && segundos > 0 ? segundos * 1_000 : 6_000 * 2 ** tentativa;
  return Math.min(ESPERA_MAXIMA_429_MS, Math.max(2_000, base));
}

function extrairJson(texto: string) {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const inicio = Math.min(...[limpo.indexOf('{'), limpo.indexOf('[')].filter((i) => i >= 0));
    const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
    if (Number.isFinite(inicio) && fim > inicio) return JSON.parse(limpo.slice(inicio, fim + 1));
    throw new Error('A IA não retornou JSON válido.');
  }
}

function textoDaInteracao(payload: Record<string, unknown>) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i] as { content?: Array<{ text?: string }> };
    const textos = (step?.content || []).map((c) => c?.text).filter((t): t is string => typeof t === 'string');
    if (textos.length) return textos.join('\n');
  }
  return '';
}

// Upload da página ao Gemini Files API, com retry em 429 (mesmo fluxo da `ia`).
async function uploadGemini(bytes: Uint8Array, nome: string) {
  for (let tentativa = 0; ; tentativa += 1) {
    const inicio = await fetchComTimeout('https://generativelanguage.googleapis.com/upload/v1beta/files', {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(bytes.byteLength),
        'X-Goog-Upload-Header-Content-Type': 'image/png',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: nome } }),
    }, 30_000);

    if (inicio.status === 429) {
      if (tentativa >= MAX_TENTATIVAS_429) throw new LimiteError('Limite do Gemini no upload da imagem.');
      await esperar(esperaDoRetryAfter(inicio.headers.get('retry-after'), tentativa));
      continue;
    }
    const uploadUrl = inicio.headers.get('x-goog-upload-url');
    if (!inicio.ok || !uploadUrl) throw new Error('Não foi possível preparar a imagem para o Gemini.');

    const enviado = await fetchComTimeout(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(bytes.byteLength),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: bytes as unknown as BodyInit,
    }, 60_000);
    if (!enviado.ok) throw new Error('Não foi possível enviar a imagem ao Gemini.');
    const payload = await enviado.json();
    const file = payload?.file;
    if (!file?.uri) throw new Error('O Gemini não confirmou a imagem enviada.');
    return file as { uri: string; name?: string };
  }
}

async function apagarArquivoGemini(name: string | undefined) {
  if (!name) return;
  try {
    await fetchComTimeout(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    }, 10_000);
  } catch {
    // O Files API também remove sozinho após 48h.
  }
}

function schemaQuestoes() {
  return {
    type: 'text',
    mime_type: 'application/json',
    schema: {
      type: 'object',
      properties: {
        questoes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              numero: { type: 'integer' },
              enunciado: { type: 'string' },
              alternativas: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { letra: { type: 'string' }, texto: { type: 'string' } },
                  required: ['letra', 'texto'],
                },
              },
              elementos_visuais: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    descricao: { type: 'string' },
                    bbox: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['descricao', 'bbox'],
                },
              },
            },
            required: ['numero', 'enunciado', 'alternativas', 'elementos_visuais'],
          },
        },
      },
      required: ['questoes'],
    },
  };
}

type ElementoVisual = { descricao?: string; bbox?: number[] };
type QuestaoVisao = {
  numero?: number;
  enunciado?: string;
  alternativas?: Array<{ letra?: string; texto?: string }>;
  elementos_visuais?: ElementoVisual[];
};

// Chama o endpoint de interações do Gemini com retry em 429.
async function interacaoGemini(requestBody: unknown, numeroPagina: number) {
  for (let tentativa = 0; ; tentativa += 1) {
    const response = await fetchComTimeout('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }, 120_000);
    if (response.status === 429) {
      if (tentativa >= MAX_TENTATIVAS_429) throw new LimiteError(`Limite do Gemini na página ${numeroPagina}.`);
      await esperar(esperaDoRetryAfter(response.headers.get('retry-after'), tentativa));
      continue;
    }
    if (!response.ok) throw new Error(`Gemini respondeu ${response.status} na página ${numeroPagina}.`);
    return response.json();
  }
}

async function extrairQuestoesDaPagina(textoPagina: string, imagemBytes: Uint8Array, numeroPagina: number) {
  const file = await uploadGemini(imagemBytes, `pagina-${numeroPagina}.png`);
  try {
    const prompt = `Esta é a página ${numeroPagina} de uma prova de vestibular. Use a IMAGEM como fonte principal e o TEXTO extraído como apoio.
Extraia as questões desta página. Para cada questão devolva número, enunciado e alternativas (letra + texto).
Para cada elemento visual essencial (gráfico, tabela, mapa, figura, fórmula) informe uma descrição curta e o "bbox" [x0,y0,x1,y1] com coordenadas NORMALIZADAS entre 0 e 1 relativas à página (0,0 = topo-esquerda).
Não invente questões que não estejam na página. Se a página não tiver questões, devolva "questoes": [].
Não resolva nem classifique. Responda só JSON.

TEXTO EXTRAÍDO DA PÁGINA:
${textoPagina.slice(0, 6_000)}`;

    const payload = await interacaoGemini({
      model: FLASH_MODEL,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', uri: file.uri, mime_type: 'image/png' },
      ],
      generation_config: { thinking_level: 'minimal' },
      response_format: schemaQuestoes(),
    }, numeroPagina);

    const texto = textoDaInteracao(payload);
    if (!texto) throw new Error(`Gemini retornou resposta vazia na página ${numeroPagina}.`);
    const resultado = extrairJson(texto) as { questoes?: QuestaoVisao[] };
    return Array.isArray(resultado.questoes) ? resultado.questoes : [];
  } finally {
    await apagarArquivoGemini(file.name);
  }
}

// Página com texto nativo: extração só por texto (Flash-Lite, barato). Sem
// upload de imagem, sem recorte — o custo de visão é reservado ao escaneado.
async function extrairQuestoesDeTexto(textoPagina: string, numeroPagina: number) {
  const prompt = `Este é o TEXTO NATIVO da página ${numeroPagina} de uma prova de vestibular (camada de texto do PDF).
Extraia as questões: para cada uma, número, enunciado e alternativas (letra + texto).
Não invente questões. Se não houver questões nesta página, devolva "questoes": [].
Deixe "elementos_visuais" como lista vazia (esta extração é textual).
Não resolva nem classifique. Responda só JSON.

TEXTO DA PÁGINA:
${textoPagina.slice(0, 8_000)}`;

  const payload = await interacaoGemini({
    model: FLASH_LITE_MODEL,
    input: [{ type: 'text', text: prompt }],
    generation_config: { thinking_level: 'minimal' },
    response_format: schemaQuestoes(),
  }, numeroPagina);

  const texto = textoDaInteracao(payload);
  if (!texto) throw new Error(`Gemini retornou resposta vazia (texto) na página ${numeroPagina}.`);
  const resultado = extrairJson(texto) as { questoes?: QuestaoVisao[] };
  return Array.isArray(resultado.questoes) ? resultado.questoes : [];
}

// bbox normalizado (0..1) -> retângulo em pixels, preso aos limites da imagem.
function bboxParaPixels(bbox: number[], largura: number, altura: number) {
  const [x0 = 0, y0 = 0, x1 = 1, y1 = 1] = bbox || [];
  const px = Math.max(0, Math.min(largura - 1, Math.round(Math.min(x0, x1) * largura)));
  const py = Math.max(0, Math.min(altura - 1, Math.round(Math.min(y0, y1) * altura)));
  const w = Math.max(1, Math.min(largura - px, Math.round(Math.abs(x1 - x0) * largura)));
  const h = Math.max(1, Math.min(altura - py, Math.round(Math.abs(y1 - y0) * altura)));
  return { px, py, w, h };
}

async function baixarBytes(caminho: string) {
  const { data, error } = await admin.storage.from(BUCKET).download(caminho);
  if (error || !data) throw new Error(`Falha ao baixar ${caminho}: ${error?.message || 'vazio'}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function processarPagina(prefixo: string, numero: number, textoPagina: string) {
  // Página com texto nativo suficiente: extração textual barata, sem visão.
  if (textoPagina.trim().length >= MINIMO_CHARS_POR_PAGINA) {
    const questoes = await extrairQuestoesDeTexto(textoPagina, numero);
    return {
      pagina: numero,
      origem: 'texto_nativo',
      questoes: questoes.map((questao) => ({
        numero: questao.numero ?? null,
        enunciado: String(questao.enunciado || ''),
        alternativas: Array.isArray(questao.alternativas) ? questao.alternativas : [],
        elementos_visuais: [],
        imagens: [],
      })),
    };
  }

  // Página escaneada/imagem: visão + recortes.
  const imagemBytes = await baixarBytes(`${prefixo}/pagina-${String(numero).padStart(3, '0')}.png`);
  const questoes = await extrairQuestoesDaPagina(textoPagina, imagemBytes, numero);

  let pagina: Image | null = null;
  const saida = [];
  for (const questao of questoes) {
    const imagens: string[] = [];
    const visuais = (questao.elementos_visuais || []).slice(0, MAX_QUESTOES_VISUAIS);
    for (let i = 0; i < visuais.length; i += 1) {
      const bbox = visuais[i].bbox;
      if (!Array.isArray(bbox) || bbox.length < 4) continue;
      try {
        if (!pagina) pagina = await Image.decode(imagemBytes);
        const { px, py, w, h } = bboxParaPixels(bbox, pagina.width, pagina.height);
        const recorte = pagina.clone().crop(px, py, w, h);
        const bytes = await recorte.encode();
        const caminho = `${prefixo}/recortes/p${String(numero).padStart(3, '0')}-q${questao.numero || 0}-${i}.png`;
        const { error } = await admin.storage.from(BUCKET).upload(caminho, bytes, {
          contentType: 'image/png',
          upsert: true,
        });
        if (!error) imagens.push(caminho);
      } catch {
        // Um recorte que falha não derruba a questão nem a página.
      }
    }
    saida.push({
      numero: questao.numero ?? null,
      enunciado: String(questao.enunciado || ''),
      alternativas: Array.isArray(questao.alternativas) ? questao.alternativas : [],
      elementos_visuais: visuais.map((v) => String(v.descricao || '')),
      imagens,
    });
  }
  return { pagina: numero, origem: 'visao', questoes: saida };
}

type JobLote = { id: string; storage_prefix: string; total_paginas: number; paginas_processadas: number };

// Processa um lote de páginas (orçamento de páginas e de tempo).
// done = job completo; limitado = pausou por rate limit (retomar depois).
async function processarLote(job: JobLote, prazoFinal: number) {
  const pdfBytes = await baixarBytes(`${job.storage_prefix}/original.pdf`);
  const pdf = await getDocumentProxy(pdfBytes);
  const extraido = await extractText(pdf, { mergePages: false });
  const textos: string[] = Array.isArray(extraido.text) ? extraido.text.map(String) : [String(extraido.text || '')];

  let processadas = job.paginas_processadas;
  for (
    let numero = job.paginas_processadas + 1;
    numero <= job.total_paginas
    && (numero - job.paginas_processadas) <= MAX_PAGINAS_POR_EXECUCAO
    && Date.now() < prazoFinal;
    numero += 1
  ) {
    try {
      const resultadoPagina = await processarPagina(job.storage_prefix, numero, textos[numero - 1] || '');
      const { error } = await admin.rpc('anexar_pagina_analysis_job', {
        p_job_id: job.id,
        p_pagina: resultadoPagina,
      });
      if (error) throw new Error(`Falha ao gravar a página ${numero}: ${error.message}`);
      processadas = numero;
      if (numero < job.total_paginas) await esperar(PACE_ENTRE_PAGINAS_MS);
    } catch (erro) {
      if (erro instanceof LimiteError) return { done: false, limitado: true };
      throw erro;
    }
  }
  return { done: processadas >= job.total_paginas, limitado: false };
}

// Re-invoca o próprio worker para continuar um job que não coube em uma
// execução. Continuação imediata; o cron é a rede de segurança.
function invocarSelf(jobId: string) {
  return fetch(`${SUPABASE_URL}/functions/v1/analise-visao-worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ job_id: jobId }),
  }).then(() => {}).catch(() => {});
}

async function processarComContinuacao(job: JobLote, prazoFinal: number) {
  try {
    const { done, limitado } = await processarLote(job, prazoFinal);
    // Rate limit: deixa o job 'processing' para o cron retomar mais tarde, sem
    // re-invocar na hora (bateria no mesmo 429).
    if (!done && !limitado) EdgeRuntime.waitUntil(invocarSelf(job.id));
  } catch (erro) {
    await admin.rpc('falhar_analysis_job', {
      p_job_id: job.id,
      p_erro: erro instanceof Error ? erro.message : 'Falha ao processar a prova.',
    });
  }
}

// Continua um job específico (auto-continuação), sem passar pelo claim.
async function continuarJob(jobId: string, prazoFinal: number) {
  const { data } = await admin.from('analysis_jobs')
    .select('id, storage_prefix, total_paginas, paginas_processadas, status')
    .eq('id', jobId)
    .maybeSingle();
  if (!data || data.status !== 'processing') return false;
  await processarComContinuacao(data as JobLote, prazoFinal);
  return true;
}

async function processarFila(prazoFinal: number) {
  let jobsProcessados = 0;
  while (Date.now() < prazoFinal) {
    const { data, error } = await admin.rpc('reivindicar_analysis_job');
    if (error) throw new Error(`Falha ao reivindicar job: ${error.message}`);
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) break;
    await processarComContinuacao(job as JobLote, prazoFinal);
    jobsProcessados += 1;
  }
  return jobsProcessados;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  if (!SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
    return json({ erro: 'Worker não configurado (service role ou Gemini ausente).' }, 503);
  }

  const prazoFinal = Date.now() + TEMPO_MAXIMO_EXECUCAO_MS;
  try {
    const corpo = await req.json().catch(() => ({} as Record<string, unknown>));
    if (corpo && typeof corpo.job_id === 'string') {
      const continuado = await continuarJob(corpo.job_id, prazoFinal);
      return json({ ok: true, continuado });
    }
    const jobsProcessados = await processarFila(prazoFinal);
    return json({ ok: true, jobsProcessados });
  } catch (erro) {
    return json({ erro: erro instanceof Error ? erro.message : 'Falha inesperada no worker.' }, 500);
  }
});
