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

  it('não anexa à alternativa E o texto de apoio das questões seguintes', () => {
    const texto = `Questão 1
Enunciado suficientemente longo para validar a separação entre questões e textos compartilhados.
(A) Primeira
(B) Segunda
(C) Terceira
(D) Quarta
(E) Separação magnética
14 VESTIBULAR · Fatec
Leia o texto para responder às questões 2 e 3.
Contexto compartilhado que pertence apenas às duas questões seguintes.
Questão 2
Enunciado da segunda questão longo o bastante para permitir a classificação corretamente.
(A) Um
(B) Dois
(C) Três
(D) Quatro
(E) Cinco
Questão 3
Enunciado da terceira questão longo o bastante para completar a sequência deste teste.
(A) Um
(B) Dois
(C) Três
(D) Quatro
(E) Cinco`;
    const resultado = segmentarTextoBruto(texto, 'fatec');

    expect(resultado.questoes[0].alternativas[4]).toBe('(E) Separação magnética');
    expect(resultado.questoes[1].apoio[0].texto).toContain('Contexto compartilhado');
    expect(resultado.questoes[2].apoio[0].texto).toContain('Contexto compartilhado');
  });

  it('interrompe a última alternativa ao encontrar um cabeçalho fora da sequência', () => {
    const texto = `Questão 1
Enunciado suficientemente longo para validar uma quebra de ordem na camada textual do PDF.
(A) Primeira
(B) Segunda
(C) Terceira
(D) Quarta
(E) Quinta
Questão 40
Este bloco não pode fazer parte da alternativa E anterior.
Questão 2
Enunciado da segunda questão suficientemente longo para completar a sequência principal.
(A) Um
(B) Dois
(C) Três
(D) Quatro
(E) Cinco`;
    const resultado = segmentarTextoBruto(texto, 'fatec');

    expect(resultado.questoes[0].alternativas[4]).toBe('(E) Quinta');
  });
});
