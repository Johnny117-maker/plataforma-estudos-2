// Reconstrução de layout de PDF.
//
// O pdf.js não entrega linhas nem colunas: entrega fragmentos de texto soltos
// com posição. Ordenar esses fragmentos só por Y funciona em página de coluna
// única e destrói qualquer página de duas colunas, porque intercala a coluna
// da esquerda com a da direita.
//
// A solução aqui é o corte XY recursivo: a página é partida repetidamente pelo
// maior espaço em branco, primeiro procurando a calha vertical entre colunas e,
// não havendo, o vão horizontal mais alto. Cada pedaço é processado na ordem
// natural de leitura, então a concatenação sai correta mesmo em página mista
// (bloco de largura total em cima, duas colunas embaixo).
//
// Os limiares abaixo foram calibrados contra dois documentos reais: a prova
// comentada da Unicamp 2026 (71 páginas, duas colunas a partir da p. 7) e a
// prova da Fatec 2026 (24 páginas, layout misto).

const MIN_CALHA_REL = 0.025; // largura mínima da calha, relativa ao bloco
const MIN_LADO_REL = 0.12; // fração mínima de itens de cada lado da calha
const FAIXA_MEIO = [0.2, 0.8]; // onde a calha pode estar, em fração da largura
const LARGURA_MIN_COLUNA = 0.55; // bloco estreito não pode virar duas colunas
const VAO_MIN_LINHAS = 0.9; // vão horizontal mínimo, em alturas de linha
const TOLERANCIA_LINHA = 3; // diferença de Y ainda considerada mesma linha
const FOLGA_ESPACO = 1.2; // distância horizontal que vira um espaço
const BANDA_MOLDURA = 0.09; // faixa do topo/rodapé onde há cabeçalho e rodapé
const PROPORCAO_MOLDURA = 0.55; // em quantas páginas a linha precisa repetir
const PROFUNDIDADE_MAX = 8;

// Uma linha que abre questão nunca é moldura, por mais que se repita. Sem esta
// trava, "Questão 01", "Questão 02"... viram todas a mesma chave e o detector
// de rodapé apaga exatamente o que precisamos encontrar.
const RE_ABRE_QUESTAO = /^\s*quest[ãa]o\s*n?[ºo°.]?\s*\d{1,3}\b/i;

function alturaMediana(itens) {
  const hs = itens.map((i) => i.h).sort((a, b) => a - b);
  return hs.length ? hs[Math.floor(hs.length / 2)] || 10 : 10;
}

// Procura uma faixa vertical completamente vazia no meio do bloco. Por ser
// vazia de ponta a ponta, ela é necessariamente uma calha entre colunas.
function corteVertical(itens, larguraPagina) {
  if (itens.length < 4) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const i of itens) {
    if (i.x0 < x0) x0 = i.x0;
    if (i.x1 > x1) x1 = i.x1;
  }
  const L = x1 - x0;
  if (L <= 0) return null;
  if (larguraPagina && L < larguraPagina * LARGURA_MIN_COLUNA) return null;

  const N = 200;
  const ocupado = new Array(N).fill(false);
  for (const it of itens) {
    const a = Math.max(0, Math.floor(((it.x0 - x0) / L) * N));
    const b = Math.min(N - 1, Math.floor(((it.x1 - x0) / L) * N));
    for (let k = a; k <= b; k++) ocupado[k] = true;
  }

  let melhor = null;
  let k = 0;
  while (k < N) {
    if (ocupado[k]) {
      k++;
      continue;
    }
    let j = k;
    while (j < N && !ocupado[j]) j++;
    const centro = (k + j) / 2 / N;
    const larg = (j - k) / N;
    if (centro >= FAIXA_MEIO[0] && centro <= FAIXA_MEIO[1] && larg >= MIN_CALHA_REL) {
      if (!melhor || larg > melhor.larg) melhor = { x: ((k + j) / 2 / N) * L + x0, larg };
    }
    k = j;
  }
  if (!melhor) return null;

  const esq = itens.filter((i) => i.x1 <= melhor.x).length;
  const dir = itens.length - esq;
  if (esq < itens.length * MIN_LADO_REL || dir < itens.length * MIN_LADO_REL) return null;
  return melhor.x;
}

// Vãos horizontais candidatos, do mais alto para o mais baixo. Cortar sempre
// no mais alto preserva a ordem de leitura por construção: topo vem antes.
function vaosHorizontais(itens) {
  const hm = alturaMediana(itens);
  const ordenados = [...itens].sort((a, b) => a.y0 - b.y0);
  let fim = ordenados[0].y1;
  const cands = [];
  for (let k = 1; k < ordenados.length; k++) {
    const it = ordenados[k];
    const vao = it.y0 - fim;
    if (vao > hm * VAO_MIN_LINHAS) cands.push({ y: (fim + it.y0) / 2, vao });
    if (it.y1 > fim) fim = it.y1;
  }
  return cands.sort((a, b) => b.y - a.y);
}

function corteXY(itens, larguraPagina, prof = 0) {
  if (itens.length < 4 || prof > PROFUNDIDADE_MAX) return [itens];

  const xc = corteVertical(itens, larguraPagina);
  if (xc !== null) {
    const esq = itens.filter((i) => i.x1 <= xc);
    const dir = itens.filter((i) => i.x1 > xc);
    if (esq.length && dir.length) {
      return [
        ...corteXY(esq, larguraPagina, prof + 1),
        ...corteXY(dir, larguraPagina, prof + 1),
      ];
    }
  }

  for (const { y } of vaosHorizontais(itens)) {
    const topo = itens.filter((i) => i.y0 >= y);
    const baixo = itens.filter((i) => i.y0 < y);
    if (topo.length && baixo.length) {
      return [
        ...corteXY(topo, larguraPagina, prof + 1),
        ...corteXY(baixo, larguraPagina, prof + 1),
      ];
    }
  }

  return [itens];
}

// Agrupa os itens de um bloco em linhas, de cima para baixo.
function linhasDoBloco(itens) {
  const ordenados = [...itens].sort((a, b) => b.yc - a.yc);
  const grupos = [];
  let atual = null;
  for (const it of ordenados) {
    if (!atual || Math.abs(it.yc - atual.yc) > TOLERANCIA_LINHA) {
      atual = { yc: it.yc, itens: [it] };
      grupos.push(atual);
    } else {
      atual.itens.push(it);
    }
  }
  return grupos.map((g) => {
    g.itens.sort((a, b) => a.x0 - b.x0);
    let texto = '';
    let fimAnterior = null;
    for (const p of g.itens) {
      if (
        fimAnterior !== null &&
        p.x0 - fimAnterior > FOLGA_ESPACO &&
        !texto.endsWith(' ') &&
        !p.t.startsWith(' ')
      ) {
        texto += ' ';
      }
      texto += p.t;
      fimAnterior = p.x1;
    }
    return {
      texto: texto.replace(/\s+$/, ''),
      x0: Math.min(...g.itens.map((item) => item.x0)),
      x1: Math.max(...g.itens.map((item) => item.x1)),
      y0: Math.min(...g.itens.map((item) => item.y0)),
      y1: Math.max(...g.itens.map((item) => item.y1)),
    };
  });
}

function chaveMoldura(txt) {
  return txt.replace(/\s+/g, ' ').trim().toLowerCase().replace(/\d+/g, '#');
}

// Agrupamento simples por Y, sem corte XY. Só serve para as faixas finas de
// topo e rodapé, onde não existe estrutura de coluna para preservar.
function linhasSimples(itens) {
  const ordenados = [...itens].sort((a, b) => b.yc - a.yc);
  const grupos = [];
  let atual = null;
  for (const it of ordenados) {
    if (!atual || Math.abs(it.yc - atual.yc) > TOLERANCIA_LINHA) {
      atual = { yc: it.yc, itens: [it] };
      grupos.push(atual);
    } else {
      atual.itens.push(it);
    }
  }
  for (const g of grupos) {
    g.itens.sort((a, b) => a.x0 - b.x0);
    g.texto = g.itens.map((i) => i.t).join(' ');
  }
  return grupos;
}

function faixaMoldura(pagina) {
  const H = pagina.altura;
  return pagina.itens.filter((i) => i.yc > H * (1 - BANDA_MOLDURA) || i.yc < H * BANDA_MOLDURA);
}

// Descobre cabeçalhos e rodapés pelo que se repete nas bordas de quase todas as
// páginas. Os dígitos são normalizados, então "Página 3" e "Página 7" contam
// como a mesma linha.
function detectarMoldura(paginas) {
  const contagem = new Map();
  for (const pagina of paginas) {
    const vistas = new Set();
    for (const g of linhasSimples(faixaMoldura(pagina))) {
      if (RE_ABRE_QUESTAO.test(g.texto)) continue;
      const k = chaveMoldura(g.texto);
      if (!k || k.length > 120 || vistas.has(k)) continue;
      vistas.add(k);
      contagem.set(k, (contagem.get(k) || 0) + 1);
    }
  }
  const limite = Math.max(2, Math.floor(paginas.length * PROPORCAO_MOLDURA));
  const moldura = new Set();
  for (const [k, v] of contagem) if (v >= limite) moldura.add(k);
  return moldura;
}

// Junta palavras quebradas no fim da linha. O hífen macio (U+00AD) é o caso
// mais comum em PDF diagramado; o hífen normal só é removido quando a linha
// seguinte começa em minúscula.
function juntarHifenizadas(linhas) {
  const out = [];
  for (let i = 0; i < linhas.length; i++) {
    let atual = linhas[i];
    while (i + 1 < linhas.length) {
      const proxima = linhas[i + 1];
      if (proxima.pagina !== atual.pagina) break;
      const macio = /\u00AD\s*$/.test(atual.texto);
      const duro = /[a-zà-ú]-\s*$/.test(atual.texto) && /^[a-zà-ú]/.test(proxima.texto);
      if (!macio && !duro) break;
      if (atual === linhas[i]) atual = { ...atual };
      atual.texto = atual.texto.replace(/[\u00AD-]\s*$/, '') + proxima.texto.replace(/^\s+/, '');
      atual.x0 = Math.min(atual.x0, proxima.x0);
      atual.x1 = Math.max(atual.x1, proxima.x1);
      atual.y0 = Math.min(atual.y0, proxima.y0);
      atual.y1 = Math.max(atual.y1, proxima.y1);
      i++;
    }
    out.push(atual);
  }
  return out;
}

/**
 * Extrai as páginas de um PDF já com coordenadas.
 * Devolve [{ numero, itens, largura, altura }].
 */
export async function extrairPaginasPdf(arquivo, onProgresso) {
  const pdfjsLib = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker.default || worker;

  const buffer = await arquivo.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (onProgresso) onProgresso(n, doc.numPages);
    const page = await doc.getPage(n);
    const [, , largura, altura] = page.view;
    const conteudo = await page.getTextContent();

    const itens = [];
    for (const it of conteudo.items) {
      if (typeof it.str !== 'string' || !it.str.trim()) continue;
      const t = it.transform;
      if (!t || t.length < 6) continue;
      const h = it.height || 10;
      // No pdf.js o eixo Y já cresce para cima, então valor maior significa
      // posição mais alta na página.
      itens.push({
        x0: t[4],
        x1: t[4] + (it.width || 0),
        y0: t[5],
        y1: t[5] + h,
        yc: t[5] + h / 2,
        h,
        t: it.str,
      });
    }
    paginas.push({ numero: n, itens, largura, altura });
    page.cleanup();
  }
  await doc.destroy();
  return paginas;
}

/**
 * Converte as páginas em uma lista de linhas na ordem de leitura correta,
 * já sem cabeçalho, rodapé e número de página.
 *
 * Devolve { linhas, moldura, paginasComColuna }.
 */
export function montarLinhas(paginas) {
  const validas = paginas.filter((p) => p.itens.length > 0);
  const moldura = validas.length >= 3 ? detectarMoldura(validas) : new Set();

  const linhas = [];
  let paginasComColuna = 0;

  for (const pagina of validas) {
    const remover = new Set();
    for (const g of linhasSimples(faixaMoldura(pagina))) {
      if (RE_ABRE_QUESTAO.test(g.texto)) continue;
      if (moldura.has(chaveMoldura(g.texto))) for (const i of g.itens) remover.add(i);
    }
    const corpo = pagina.itens.filter((i) => !remover.has(i));
    if (!corpo.length) continue;

    let x0 = Infinity;
    let x1 = -Infinity;
    for (const i of corpo) {
      if (i.x0 < x0) x0 = i.x0;
      if (i.x1 > x1) x1 = i.x1;
    }
    const largura = x1 - x0;
    if (corteVertical(corpo, largura) !== null) paginasComColuna++;

    for (const bloco of corteXY(corpo, largura)) {
      for (const linha of linhasDoBloco(bloco)) {
        if (linha.texto.trim()) linhas.push({
          ...linha,
          pagina: pagina.numero,
          larguraPagina: pagina.largura,
          alturaPagina: pagina.altura,
        });
      }
    }
  }

  return {
    linhas: juntarHifenizadas(linhas),
    moldura: [...moldura],
    paginasComColuna,
  };
}
