import { describe, expect, it } from 'vitest';
import {
  criarRegioesCapturaRaster,
  extrairRegioesRaster,
  incluirRegioesRelacionadas,
  regiaoPertenceAQuestao,
} from './regioesImagemPdf';

const OPS = { save: 10, restore: 11, transform: 12, paintImageXObject: 85, paintInlineImageXObject: 86 };

describe('figuras embutidas no PDF', () => {
  it('recupera a posição do diagrama pela matriz do operador de imagem', () => {
    const regioes = extrairRegioesRaster(
      [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
      [[], [307.79, 0, 0, 187.56, 136.65, 210.16], ['img_bateria', 1536, 936], []],
      OPS
    );

    expect(regioes).toHaveLength(1);
    expect(regioes[0]).toMatchObject({
      objeto: 'img_bateria',
      x0: 136.65,
      y0: 210.16,
    });
    expect(regioes[0].x1).toBeCloseTo(444.44, 1);
    expect(regioes[0].y1).toBeCloseTo(397.72, 1);
  });

  it('associa a figura somente à questão que contém sua área', () => {
    const figura = { pagina: 16, x0: 136, x1: 444, y0: 210, y1: 397, largura: 308, altura: 187 };
    const questao44 = [{ pagina: 16, x0: 14, x1: 567, y0: 430, y1: 730 }];
    const questao45 = [{ pagina: 16, x0: 14, x1: 567, y0: 40, y1: 420 }];

    expect(regiaoPertenceAQuestao(figura, questao44)).toBe(false);
    expect(regiaoPertenceAQuestao(figura, questao45)).toBe(true);
  });

  it('considera a união das faixas ao associar um gráfico compartilhado', () => {
    const grafico = {
      pagina: 4,
      x0: 62,
      x1: 491,
      y0: 440,
      y1: 625,
      largura: 429,
      altura: 185,
    };
    const faixasDoApoio = [
      { pagina: 4, x0: 14, x1: 567, y0: 630, y1: 728 },
      { pagina: 4, x0: 14, x1: 287, y0: 508, y1: 609 },
      { pagina: 4, x0: 295, x1: 567, y0: 508, y1: 609 },
      { pagina: 4, x0: 14, x1: 567, y0: 435, y1: 499 },
    ];

    expect(regiaoPertenceAQuestao(grafico, faixasDoApoio)).toBe(true);
  });

  it('agrupa gráficos e ícones próximos em um bloco visual completo', () => {
    const pagina = { pagina: 4, larguraPagina: 581, alturaPagina: 751 };
    const regioes = [
      { ...pagina, x0: 62, x1: 491, y0: 440, y1: 625, largura: 429, altura: 185, objeto: 'grafico' },
      { ...pagina, x0: 98, x1: 526, y0: 440, y1: 625, largura: 428, altura: 185, objeto: 'grafico' },
      { ...pagina, x0: 502, x1: 557, y0: 572, y1: 625, largura: 55, altura: 53, objeto: 'jogador-2' },
      { ...pagina, x0: 35, x1: 82, y0: 569, y1: 625, largura: 47, altura: 56, objeto: 'jogador-1' },
    ];

    const capturas = criarRegioesCapturaRaster(regioes);

    expect(capturas).toHaveLength(1);
    expect(capturas[0]).toMatchObject({
      tipoCaptura: 'bloco_visual_raster',
      x0: 25,
      x1: 567,
      y0: 440,
      y1: 649,
    });
  });

  it('inclui um ícone periférico conectado ao gráfico principal', () => {
    const pagina = { pagina: 4, larguraPagina: 581, alturaPagina: 751 };
    const grafico = {
      ...pagina,
      x0: 98,
      x1: 526,
      y0: 440,
      y1: 625,
      largura: 428,
      altura: 185,
    };
    const icone = {
      ...pagina,
      x0: 502,
      x1: 557,
      y0: 572,
      y1: 625,
      largura: 55,
      altura: 53,
    };

    expect(incluirRegioesRelacionadas([grafico], [grafico, icone])).toEqual([grafico, icone]);
  });
});
