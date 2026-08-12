import { describe, expect, it } from 'vitest';
import { criarLacunasVisuaisOrigem, criarRecortesOrigem } from './recortesQuestao';

function linha(texto, pagina, x0, x1, y0, y1) {
  return { texto, pagina, x0, x1, y0, y1, larguraPagina: 600, alturaPagina: 800 };
}

describe('recortes das questões no PDF', () => {
  it('mantém colunas vizinhas em imagens separadas', () => {
    const linhas = [
      linha('Questão 1', 1, 30, 270, 700, 715),
      linha('Enunciado', 1, 30, 260, 650, 665),
      linha('Questão 2', 1, 330, 570, 700, 715),
      linha('Enunciado', 1, 330, 560, 650, 665),
    ];

    const esquerda = criarRecortesOrigem(linhas, [{ inicio: 0, fim: 2 }]);
    const direita = criarRecortesOrigem(linhas, [{ inicio: 2, fim: 4 }]);

    expect(esquerda).toHaveLength(1);
    expect(esquerda[0].x1).toBeLessThan(300);
    expect(direita).toHaveLength(1);
    expect(direita[0].x0).toBeGreaterThan(300);
  });

  it('gera partes ordenadas quando uma questão atravessa páginas', () => {
    const linhas = [
      linha('Questão 8', 2, 30, 270, 50, 65),
      linha('continuação', 3, 30, 270, 730, 745),
    ];
    const recortes = criarRecortesOrigem(linhas, [{ inicio: 0, fim: 2 }]);

    expect(recortes.map((item) => item.pagina)).toEqual([2, 3]);
    expect(recortes.map((item) => item.ordem)).toEqual([0, 1]);
  });

  it('localiza a faixa de uma figura vetorial entre os trechos de texto', () => {
    const linhas = [
      linha('Enunciado acima da figura', 1, 30, 570, 700, 715),
      linha('Fonte abaixo da figura', 1, 30, 570, 390, 405),
      linha('Continuação do enunciado', 1, 30, 570, 360, 375),
    ];
    const lacunas = criarLacunasVisuaisOrigem(linhas, [{ inicio: 0, fim: 3 }]);

    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]).toMatchObject({ pagina: 1, y0: 407, y1: 698 });
  });
});
