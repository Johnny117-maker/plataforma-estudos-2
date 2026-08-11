import { describe, expect, it } from 'vitest';
import { aplicarDescricoesVisuais } from './documentoVisual';

describe('aplicarDescricoesVisuais', () => {
  it('associa a descrição pelo número e a coloca antes do enunciado', () => {
    const resultado = aplicarDescricoesVisuais(
      [{ numero: 7, paraClassificar: 'Calcule o valor indicado no gráfico.', dependeDeVisual: true }],
      [{ numero: 7, descricao: 'Gráfico de barras com valores 10, 20 e 30.' }]
    );

    expect(resultado.aplicadas).toBe(1);
    expect(resultado.questoes[0]).toMatchObject({
      visualAnalisado: true,
      descricaoVisual: 'Gráfico de barras com valores 10, 20 e 30.',
    });
    expect(resultado.questoes[0].paraClassificar).toMatch(/^\[Descrição visual:/);
  });

  it('preserva questões que não receberam descrição', () => {
    const questao = { numero: 2, paraClassificar: 'Texto normal.' };
    const resultado = aplicarDescricoesVisuais([questao], [{ numero: 3, descricao: 'Outra figura' }]);
    expect(resultado.aplicadas).toBe(0);
    expect(resultado.questoes[0]).toBe(questao);
  });
});
