const MARGEM_VERTICAL = 6;
const MARGEM_PAGINA = 14;
const LACUNA_VISUAL_MINIMA = 30;

function temCoordenadas(linha) {
  return [linha?.x0, linha?.x1, linha?.y0, linha?.y1, linha?.larguraPagina, linha?.alturaPagina]
    .every(Number.isFinite);
}

function colunaDaLinha(linha) {
  if (linha.x1 <= linha.larguraPagina * 0.58) return 'esquerda';
  if (linha.x0 >= linha.larguraPagina * 0.42) return 'direita';
  return 'pagina';
}

function limitesHorizontais(coluna, largura) {
  if (coluna === 'esquerda') return { x0: MARGEM_PAGINA, x1: largura / 2 - 4 };
  if (coluna === 'direita') return { x0: largura / 2 + 4, x1: largura - MARGEM_PAGINA };
  return { x0: MARGEM_PAGINA, x1: largura - MARGEM_PAGINA };
}

function concluirFaixa(faixas, atual) {
  if (!atual?.linhas.length) return;
  const primeira = atual.linhas[0];
  const largura = primeira.larguraPagina;
  const altura = primeira.alturaPagina;
  const minY = Math.min(...atual.linhas.map((linha) => linha.y0));
  const maxY = Math.max(...atual.linhas.map((linha) => linha.y1));

  const { x0, x1 } = limitesHorizontais(atual.coluna, largura);

  faixas.push({
    pagina: atual.pagina,
    x0: Math.max(0, x0),
    x1: Math.min(largura, x1),
    y0: Math.max(0, minY - MARGEM_VERTICAL),
    y1: Math.min(altura, maxY + MARGEM_VERTICAL),
    larguraPagina: largura,
    alturaPagina: altura,
    ordem: faixas.length,
  });
}

/**
 * Converte intervalos de linhas da questão em faixas de recorte. Colunas são
 * mantidas separadas para que uma questão da esquerda não capture a questão
 * vizinha da direita.
 */
export function criarRecortesOrigem(linhas, intervalos) {
  const faixas = [];

  for (const intervalo of intervalos || []) {
    const candidatas = (linhas || [])
      .slice(Math.max(0, intervalo.inicio), Math.max(0, intervalo.fim))
      .filter(temCoordenadas);
    let atual = null;

    for (const linha of candidatas) {
      const coluna = colunaDaLinha(linha);
      if (!atual || atual.pagina !== linha.pagina || atual.coluna !== coluna) {
        concluirFaixa(faixas, atual);
        atual = { pagina: linha.pagina, coluna, linhas: [] };
      }
      atual.linhas.push(linha);
    }
    concluirFaixa(faixas, atual);
  }

  return faixas.map((faixa, ordem) => ({ ...faixa, ordem }));
}

function concluirLacunas(lacunas, grupo) {
  if (!grupo?.linhas.length) return;
  const ordenadas = [...grupo.linhas].sort((a, b) => b.y1 - a.y1);
  const largura = ordenadas[0].larguraPagina;
  const altura = ordenadas[0].alturaPagina;
  const { x0, x1 } = limitesHorizontais(grupo.coluna, largura);

  for (let indice = 0; indice + 1 < ordenadas.length; indice += 1) {
    const superior = ordenadas[indice];
    const inferior = ordenadas[indice + 1];
    const tamanho = superior.y0 - inferior.y1;
    if (tamanho < LACUNA_VISUAL_MINIMA) continue;
    lacunas.push({
      pagina: grupo.pagina,
      x0: Math.max(0, x0),
      x1: Math.min(largura, x1),
      y0: Math.max(0, inferior.y1 + 2),
      y1: Math.min(altura, superior.y0 - 2),
      larguraPagina: largura,
      alturaPagina: altura,
      area: (x1 - x0) * Math.max(0, tamanho - 4),
    });
  }
}

/**
 * Localiza espaços gráficos entre linhas. É a alternativa para diagramas
 * vetoriais que não aparecem como objetos de imagem dentro do PDF.
 */
export function criarLacunasVisuaisOrigem(linhas, intervalos) {
  const lacunas = [];
  for (const intervalo of intervalos || []) {
    const candidatas = (linhas || [])
      .slice(Math.max(0, intervalo.inicio), Math.max(0, intervalo.fim))
      .filter(temCoordenadas);
    let grupo = null;
    for (const linha of candidatas) {
      const coluna = colunaDaLinha(linha);
      if (!grupo || grupo.pagina !== linha.pagina || grupo.coluna !== coluna) {
        concluirLacunas(lacunas, grupo);
        grupo = { pagina: linha.pagina, coluna, linhas: [] };
      }
      grupo.linhas.push(linha);
    }
    concluirLacunas(lacunas, grupo);
  }
  return lacunas
    .sort((a, b) => a.pagina - b.pagina || b.y1 - a.y1)
    .map((lacuna, ordem) => ({ ...lacuna, ordem }));
}
