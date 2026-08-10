// Extração de texto 100% no navegador. Nada sai da máquina nesta etapa.
//
// PDF passa pela reconstrução de layout (layoutPdf.js), que é o que faz páginas
// de duas colunas funcionarem. DOCX e TXT são de coluna única por natureza e
// vão direto.

import { extrairPaginasPdf, montarLinhas } from './layoutPdf';

const MINIMO_CHARS_POR_PAGINA = 200;

function extensaoDe(nome) {
  const m = /\.([a-z0-9]+)$/i.exec(nome || '');
  return m ? m[1].toLowerCase() : '';
}

function comoLinhas(texto) {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((t) => ({ texto: t, pagina: 1 }));
}

async function extrairDocx(arquivo) {
  const mod = await import('mammoth/mammoth.browser.min.js');
  const mammoth = mod.default || mod;
  const buffer = await arquivo.arrayBuffer();
  const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return comoLinhas(String(value || ''));
}

/**
 * Extrai as linhas de um arquivo de prova, já na ordem de leitura correta.
 *
 * Devolve {
 *   tipo, linhas, totalPaginas, totalCaracteres,
 *   moldura, paginasComColuna, provavelDigitalizado
 * }
 */
export async function extrairDeArquivo(arquivo, onProgresso) {
  const ext = extensaoDe(arquivo.name);
  let tipo;
  let linhas;
  let totalPaginas = 1;
  let moldura = [];
  let paginasComColuna = 0;

  if (ext === 'pdf') {
    tipo = 'pdf';
    const paginas = await extrairPaginasPdf(arquivo, onProgresso);
    totalPaginas = paginas.length;
    const r = montarLinhas(paginas);
    linhas = r.linhas;
    moldura = r.moldura;
    paginasComColuna = r.paginasComColuna;
  } else if (ext === 'docx') {
    tipo = 'docx';
    linhas = await extrairDocx(arquivo);
  } else if (ext === 'txt' || ext === 'md' || ext === 'text') {
    tipo = 'txt';
    linhas = comoLinhas(await arquivo.text());
  } else if (ext === 'doc') {
    throw new Error('Arquivos .doc (Word antigo) nao sao suportados. Salve como .docx ou .pdf.');
  } else {
    throw new Error(`Formato nao suportado: .${ext || '???'}. Use PDF, DOCX ou TXT.`);
  }

  const totalCaracteres = linhas.reduce((s, l) => s + l.texto.length, 0);

  return {
    tipo,
    linhas,
    totalPaginas,
    totalCaracteres,
    moldura,
    paginasComColuna,
    provavelDigitalizado:
      tipo === 'pdf' && totalCaracteres / Math.max(1, totalPaginas) < MINIMO_CHARS_POR_PAGINA,
  };
}
