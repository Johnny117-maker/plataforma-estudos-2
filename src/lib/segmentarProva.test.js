import { describe, expect, it } from 'vitest';
import { segmentarTextoBruto } from './segmentarProva';

describe('segmentarTextoBruto', () => {
  it('segmenta questões genéricas em sequência sem confundir alternativas', () => {
    const texto = `Questão 1\nQual é o resultado?\nA) 1\nB) 2\nQuestão 2\nOutro enunciado suficientemente longo para a classificação funcionar corretamente.\nA) Sim\nB) Não`;
    const resultado = segmentarTextoBruto(texto, 'generico');
    expect(resultado.questoes).toHaveLength(2);
    expect(resultado.questoes.map((q) => q.numero)).toEqual([1, 2]);
  });
});
