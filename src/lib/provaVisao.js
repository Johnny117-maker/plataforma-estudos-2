// Pipeline de análise por visão — etapa do navegador.
//
// O React sobe o PDF e uma renderização PNG de cada página (180–220 DPI) para o
// bucket privado `provas-visao` e cria um analysis_jobs com status 'pending'. O
// worker (etapa seguinte) baixa esses arquivos, envia texto + imagem ao modelo
// de visão e persiste as questões estruturadas. Nada de chave de IA aqui.

import { supabase } from '../supabaseClient';

export const BUCKET_PROVAS_VISAO = 'provas-visao';
export const DPI_MIN = 180;
export const DPI_MAX = 220;
export const DPI_PADRAO = 200;

/** DPI sempre dentro da faixa combinada (180–220), inteiro. */
export function clampDpi(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return DPI_PADRAO;
  return Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(n)));
}

/** pdf.js trabalha em pontos (72 por polegada); a escala é DPI/72. */
export function escalaDpi(dpi) {
  return clampDpi(dpi) / 72;
}

export function caminhoPdf(prefixo) {
  return `${prefixo}/original.pdf`;
}

export function caminhoPaginaPng(prefixo, numero) {
  return `${prefixo}/pagina-${String(numero).padStart(3, '0')}.png`;
}

function canvasParaBlobPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível renderizar a página em PNG.'))),
      'image/png'
    );
  });
}

/** Renderiza cada página do PDF em PNG no DPI escolhido (usa canvas do navegador). */
export async function renderizarPaginasPng(arquivoPdf, { dpi = DPI_PADRAO, onProgresso } = {}) {
  const pdfjsLib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default || worker;
  const doc = await pdfjsLib.getDocument({ data: await arquivoPdf.arrayBuffer() }).promise;
  const escala = escalaDpi(dpi);
  const paginas = [];
  try {
    for (let numero = 1; numero <= doc.numPages; numero += 1) {
      onProgresso?.(numero, doc.numPages);
      const page = await doc.getPage(numero);
      const viewport = page.getViewport({ scale: escala });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const contexto = canvas.getContext('2d', { alpha: false });
      contexto.fillStyle = '#ffffff';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: contexto, viewport }).promise;
      paginas.push({ numero, blob: await canvasParaBlobPng(canvas) });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return paginas;
}

async function idDoUsuario() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) throw new Error('Sessão expirada. Entre novamente para enviar a prova.');
  return data.user.id;
}

/**
 * Sobe o PDF + os PNGs das páginas e cria o registro analysis_jobs (pending).
 *
 * onProgresso recebe { fase, atual, total }:
 *   fase = 'upload_pdf' | 'render' | 'upload_paginas' | 'criar_job'
 *
 * Devolve { jobId, prefixo, totalPaginas }.
 */
export async function enviarProvaParaAnalise(arquivoPdf, { dpi = DPI_PADRAO, nome, onProgresso } = {}) {
  if (!arquivoPdf) throw new Error('Selecione um PDF.');
  if (arquivoPdf.type && arquivoPdf.type !== 'application/pdf') {
    throw new Error('Este pipeline aceita apenas PDF.');
  }
  const uid = await idDoUsuario();
  const prefixo = `${uid}/${crypto.randomUUID()}`;

  onProgresso?.({ fase: 'upload_pdf' });
  const subidaPdf = await supabase.storage.from(BUCKET_PROVAS_VISAO)
    .upload(caminhoPdf(prefixo), arquivoPdf, { contentType: 'application/pdf', upsert: false });
  if (subidaPdf.error) throw new Error(`Falha ao enviar o PDF: ${subidaPdf.error.message}`);

  const paginas = await renderizarPaginasPng(arquivoPdf, {
    dpi,
    onProgresso: (atual, total) => onProgresso?.({ fase: 'render', atual, total }),
  });
  if (!paginas.length) throw new Error('O PDF não possui páginas renderizáveis.');

  for (const pagina of paginas) {
    onProgresso?.({ fase: 'upload_paginas', atual: pagina.numero, total: paginas.length });
    const subida = await supabase.storage.from(BUCKET_PROVAS_VISAO)
      .upload(caminhoPaginaPng(prefixo, pagina.numero), pagina.blob, {
        contentType: 'image/png',
        upsert: true,
      });
    if (subida.error) throw new Error(`Falha ao enviar a página ${pagina.numero}: ${subida.error.message}`);
  }

  onProgresso?.({ fase: 'criar_job' });
  const { data, error } = await supabase.rpc('criar_analysis_job', {
    p_nome: nome || arquivoPdf.name,
    p_storage_prefix: prefixo,
    p_total_paginas: paginas.length,
  });
  if (error) throw new Error(`Falha ao criar o job: ${error.message}`);

  return { jobId: data, prefixo, totalPaginas: paginas.length };
}

/** Últimos jobs do usuário (RLS garante que só vêm os dele). */
export async function listarAnalysisJobs(limite = 20) {
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('id, nome, status, total_paginas, paginas_processadas, erro, created_at')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return data || [];
}
