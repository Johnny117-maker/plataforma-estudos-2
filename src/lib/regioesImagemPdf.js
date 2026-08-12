const IDENTIDADE = [1, 0, 0, 1, 0, 0];
const LADO_MINIMO = 24;
const AREA_MINIMA = 1_200;

function multiplicar(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformarPonto(matriz, x, y) {
  return [
    matriz[0] * x + matriz[2] * y + matriz[4],
    matriz[1] * x + matriz[3] * y + matriz[5],
  ];
}

function caixaDaMatriz(matriz) {
  const pontos = [
    transformarPonto(matriz, 0, 0),
    transformarPonto(matriz, 1, 0),
    transformarPonto(matriz, 0, 1),
    transformarPonto(matriz, 1, 1),
  ];
  const xs = pontos.map((ponto) => ponto[0]);
  const ys = pontos.map((ponto) => ponto[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return { x0, x1, y0, y1, largura: x1 - x0, altura: y1 - y0 };
}

/** Recupera a posição dos objetos raster a partir da lista de operadores do PDF.js. */
export function extrairRegioesRaster(fnArray, argsArray, OPS) {
  const regioes = [];
  const pilha = [];
  let matriz = [...IDENTIDADE];

  for (let indice = 0; indice < (fnArray || []).length; indice += 1) {
    const operacao = fnArray[indice];
    const argumentos = argsArray?.[indice] || [];
    if (operacao === OPS.save) {
      pilha.push([...matriz]);
    } else if (operacao === OPS.restore) {
      matriz = pilha.pop() || [...IDENTIDADE];
    } else if (operacao === OPS.transform && argumentos.length >= 6) {
      matriz = multiplicar(matriz, argumentos);
    } else if (operacao === OPS.paintImageXObject || operacao === OPS.paintInlineImageXObject) {
      const caixa = caixaDaMatriz(matriz);
      if (caixa.largura >= LADO_MINIMO && caixa.altura >= LADO_MINIMO
        && caixa.largura * caixa.altura >= AREA_MINIMA) {
        regioes.push({
          ...caixa,
          objeto: typeof argumentos[0] === 'string' ? argumentos[0] : null,
          operador: operacao,
        });
      }
    }
  }
  return regioes;
}

function areaIntersecao(a, b) {
  const largura = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const altura = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return largura * altura;
}

function intersecao(a, b) {
  const x0 = Math.max(a.x0, b.x0);
  const x1 = Math.min(a.x1, b.x1);
  const y0 = Math.max(a.y0, b.y0);
  const y1 = Math.min(a.y1, b.y1);
  return x1 > x0 && y1 > y0 ? { x0, x1, y0, y1 } : null;
}

// Soma a união real dos retângulos. Uma questão diagramada pode gerar várias
// faixas de texto ao redor do mesmo gráfico; testar cada faixa isoladamente
// fazia o gráfico ser rejeitado e deixava passar apenas um ícone pequeno.
function areaUniao(retangulos) {
  const xs = [...new Set(retangulos.flatMap((item) => [item.x0, item.x1]))]
    .sort((a, b) => a - b);
  let area = 0;
  for (let indice = 0; indice + 1 < xs.length; indice += 1) {
    const x0 = xs[indice];
    const x1 = xs[indice + 1];
    if (x1 <= x0) continue;
    const intervalos = retangulos
      .filter((item) => item.x0 < x1 && item.x1 > x0)
      .map((item) => [item.y0, item.y1])
      .sort((a, b) => a[0] - b[0]);
    let inicio = null;
    let fim = null;
    let altura = 0;
    for (const [y0, y1] of intervalos) {
      if (inicio === null) {
        inicio = y0;
        fim = y1;
      } else if (y0 <= fim) {
        fim = Math.max(fim, y1);
      } else {
        altura += fim - inicio;
        inicio = y0;
        fim = y1;
      }
    }
    if (inicio !== null) altura += fim - inicio;
    area += (x1 - x0) * altura;
  }
  return area;
}

export function regiaoPertenceAQuestao(regiao, recortes) {
  const area = Math.max(1, regiao.largura * regiao.altura);
  const intersecoes = (recortes || [])
    .filter((recorte) => recorte.pagina === regiao.pagina && areaIntersecao(regiao, recorte) > 0)
    .map((recorte) => intersecao(regiao, recorte))
    .filter(Boolean);
  return areaUniao(intersecoes) / area >= 0.72;
}

export function expandirRegiao(regiao, margem = 3, margemVertical = margem) {
  const x0 = Math.max(0, regiao.x0 - margem);
  const x1 = Math.min(regiao.larguraPagina, regiao.x1 + margem);
  const y0 = Math.max(0, regiao.y0 - margemVertical);
  const y1 = Math.min(regiao.alturaPagina, regiao.y1 + margemVertical);
  return {
    ...regiao,
    x0,
    x1,
    y0,
    y1,
    largura: x1 - x0,
    altura: y1 - y0,
  };
}

function expandirBlocoVisual(regiao) {
  const x0 = Math.max(0, regiao.x0 - 10);
  const x1 = Math.min(regiao.larguraPagina, regiao.x1 + 10);
  // Há mais contexto útil acima (títulos) do que abaixo (onde normalmente já
  // começa o cabeçalho da questão). As margens assimétricas evitam capturar
  // "Questão 07" junto com o gráfico compartilhado.
  const y0 = Math.max(0, regiao.y0);
  const y1 = Math.min(regiao.alturaPagina, regiao.y1 + 24);
  return {
    ...regiao,
    x0,
    x1,
    y0,
    y1,
    largura: x1 - x0,
    altura: y1 - y0,
  };
}

function distanciaEntreIntervalos(a0, a1, b0, b1) {
  if (a1 < b0) return b0 - a1;
  if (b1 < a0) return a0 - b1;
  return 0;
}

function regioesRelacionadas(a, b) {
  const distanciaX = distanciaEntreIntervalos(a.x0, a.x1, b.x0, b.x1);
  const distanciaY = distanciaEntreIntervalos(a.y0, a.y1, b.y0, b.y1);
  const limiteX = Math.max(12, Math.min(a.largura, b.largura) * 0.35);
  const limiteY = Math.max(12, Math.min(a.altura, b.altura) * 0.35);
  return distanciaX <= limiteX && distanciaY <= limiteY;
}

/** Inclui pequenos objetos conectados a uma região principal já validada. */
export function incluirRegioesRelacionadas(sementes, candidatas) {
  const incluidas = new Set(sementes || []);
  const fila = [...incluidas];
  for (let indice = 0; indice < fila.length; indice += 1) {
    const atual = fila[indice];
    for (const candidata of candidatas || []) {
      if (incluidas.has(candidata) || candidata.pagina !== atual.pagina) continue;
      if (!regioesRelacionadas(atual, candidata)) continue;
      incluidas.add(candidata);
      fila.push(candidata);
    }
  }
  return [...incluidas];
}

function agruparRegioes(regioes) {
  const pendentes = new Set(regioes.map((_, indice) => indice));
  const grupos = [];
  while (pendentes.size) {
    const primeiro = pendentes.values().next().value;
    pendentes.delete(primeiro);
    const indices = [primeiro];
    for (let cursor = 0; cursor < indices.length; cursor += 1) {
      const atual = regioes[indices[cursor]];
      for (const candidato of [...pendentes]) {
        if (!regioesRelacionadas(atual, regioes[candidato])) continue;
        pendentes.delete(candidato);
        indices.push(candidato);
      }
    }
    grupos.push(indices.map((indice) => regioes[indice]));
  }
  return grupos;
}

function unirRegioes(regioes) {
  const base = regioes[0];
  const x0 = Math.min(...regioes.map((item) => item.x0));
  const x1 = Math.max(...regioes.map((item) => item.x1));
  const y0 = Math.min(...regioes.map((item) => item.y0));
  const y1 = Math.max(...regioes.map((item) => item.y1));
  return {
    ...base,
    x0,
    x1,
    y0,
    y1,
    largura: x1 - x0,
    altura: y1 - y0,
    objeto: null,
    objetos: [...new Set(regioes.map((item) => item.objeto).filter(Boolean))],
  };
}

/**
 * Transforma objetos raster próximos em um único bloco visual. Isso preserva
 * títulos, escalas e rótulos desenhados como texto ao redor do gráfico, em vez
 * de produzir uma coleção de ícones e pedaços desconectados.
 */
export function criarRegioesCapturaRaster(regioes) {
  return agruparRegioes(regioes || []).map((grupo) => {
    if (grupo.length === 1) {
      return { ...expandirRegiao(grupo[0], 3), tipoCaptura: 'objeto_raster' };
    }
    return {
      ...expandirBlocoVisual(unirRegioes(grupo)),
      tipoCaptura: 'bloco_visual_raster',
    };
  });
}
