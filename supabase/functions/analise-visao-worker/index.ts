// Worker do pipeline de análise por visão.
//
// Reivindica um analysis_job, baixa o PDF e os PNGs das páginas (renderizados
// pelo navegador), extrai o texto nativo com unpdf (edge-friendly, sem canvas
// nativo), envia texto + imagem ao Gemini Flash, recebe as questões em JSON
// estruturado, recorta os elementos visuais com ImageScript e persiste tudo.
//
// Nada de chave de IA sai daqui para o cliente. Processa um orçamento de páginas
// por execução; o cron reprograma jobs longos ou abandonados.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf';
import { Image } from 'https://deno.land/x/imagescript@1.3.0/mod.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const FLASH_MODEL = Deno.env.get('GEMINI_FLASH_MODEL') || 'gemini-3.5-flash';
const BUCKET = 'provas-visao';
const TEMPO_MAXIMO_EXECUCAO_MS = 105_000;
const MAX_PAGINAS_POR_EXECUCAO = 12;
const MAX_QUESTOES_VISUAIS = 8; // recortes por página, evita explosão de storage

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
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

// Upload da página ao Gemini Files API (mesmo fluxo da função `ia`).
async function uploadGemini(bytes: Uint8Array, nome: string) {
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

// Envia texto + imagem da página e recebe as questões estruturadas.
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

    const requestBody = {
      model: FLASH_MODEL,
      input: [
        { type: 'text', text: prompt },
        { type: 'image', uri: file.uri, mime_type: 'image/png' },
      ],
      generation_config: { thinking_level: 'minimal' },
      response_format: schemaQuestoes(),
    };

    const response = await fetchComTimeout('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }, 120_000);
    if (!response.ok) {
      const status = response.status === 429 ? 429 : response.status;
      throw new Error(`Gemini respondeu ${status} na página ${numeroPagina}.`);
    }
    const texto = textoDaInteracao(await response.json());
    if (!texto) throw new Error(`Gemini retornou resposta vazia na página ${numeroPagina}.`);
    const resultado = extrairJson(texto) as { questoes?: QuestaoVisao[] };
    return Array.isArray(resultado.questoes) ? resultado.questoes : [];
  } finally {
    await apagarArquivoGemini(file.name);
  }
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
  return { pagina: numero, questoes: saida };
}

async function processarJob(job: {
  id: string;
  storage_prefix: string;
  total_paginas: number;
  paginas_processadas: number;
}, prazoFinal: number) {
  const pdfBytes = await baixarBytes(`${job.storage_prefix}/original.pdf`);
  const pdf = await getDocumentProxy(pdfBytes);
  const extraido = await extractText(pdf, { mergePages: false });
  const textos: string[] = Array.isArray(extraido.text) ? extraido.text.map(String) : [String(extraido.text || '')];

  let processadasNaExecucao = 0;
  for (
    let numero = job.paginas_processadas + 1;
    numero <= job.total_paginas
    && processadasNaExecucao < MAX_PAGINAS_POR_EXECUCAO
    && Date.now() < prazoFinal;
    numero += 1
  ) {
    const resultadoPagina = await processarPagina(job.storage_prefix, numero, textos[numero - 1] || '');
    const { error } = await admin.rpc('anexar_pagina_analysis_job', {
      p_job_id: job.id,
      p_pagina: resultadoPagina,
    });
    if (error) throw new Error(`Falha ao gravar a página ${numero}: ${error.message}`);
    processadasNaExecucao += 1;
  }
  return processadasNaExecucao;
}

async function processarFila() {
  const prazoFinal = Date.now() + TEMPO_MAXIMO_EXECUCAO_MS;
  let jobsProcessados = 0;

  while (Date.now() < prazoFinal) {
    const { data, error } = await admin.rpc('reivindicar_analysis_job');
    if (error) throw new Error(`Falha ao reivindicar job: ${error.message}`);
    const job = Array.isArray(data) ? data[0] : data;
    if (!job) break;

    try {
      await processarJob(job, prazoFinal);
      jobsProcessados += 1;
    } catch (erro) {
      await admin.rpc('falhar_analysis_job', {
        p_job_id: job.id,
        p_erro: erro instanceof Error ? erro.message : 'Falha ao processar a prova.',
      });
    }
  }
  return jobsProcessados;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  if (!SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
    return json({ erro: 'Worker não configurado (service role ou Gemini ausente).' }, 503);
  }

  try {
    const jobsProcessados = await processarFila();
    return json({ ok: true, jobsProcessados });
  } catch (erro) {
    return json({ erro: erro instanceof Error ? erro.message : 'Falha inesperada no worker.' }, 500);
  }
});
