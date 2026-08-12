import { describe, expect, it } from 'vitest';
import { segmentarTextoBruto } from './segmentarProva';

describe('segmentarTextoBruto', () => {
  it('segmenta questões genéricas em sequência sem confundir alternativas', () => {
    const texto = `Questão 1\nQual é o resultado?\nA) 1\nB) 2\nQuestão 2\nOutro enunciado suficientemente longo para a classificação funcionar corretamente.\nA) Sim\nB) Não`;
    const resultado = segmentarTextoBruto(texto, 'generico');
    expect(resultado.questoes).toHaveLength(2);
    expect(resultado.questoes.map((q) => q.numero)).toEqual([1, 2]);
  });

  it('agrupa linhas quebradas dentro da alternativa correspondente', () => {
    const texto = `Questão 1\nQual alternativa descreve corretamente o fenômeno apresentado no enunciado?\n(A) Primeira parte\ncontinuação da alternativa A\n(B) Segunda\n(C) Terceira\n(D) Quarta\n(E) Quinta\nQuestão 2\nOutro enunciado longo o bastante para encerrar a primeira questão corretamente.\n(A) Um\n(B) Dois\n(C) Três\n(D) Quatro\n(E) Cinco`;
    const resultado = segmentarTextoBruto(texto, 'fatec');
    expect(resultado.questoes[0].alternativas).toHaveLength(5);
    expect(resultado.questoes[0].alternativas[0]).toContain('continuação da alternativa A');
  });
});
