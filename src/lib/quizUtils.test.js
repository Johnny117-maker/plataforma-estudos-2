import { describe, expect, it } from 'vitest';
import { opcoesDaPergunta, payloadPergunta, respostaObjetivaCorreta } from './quizUtils';

describe('quizUtils', () => {
  it('sempre materializa as opções de verdadeiro/falso', () => {
    expect(opcoesDaPergunta({ tipo: 'verdadeiro_falso', alternativas: [] })).toEqual(['Verdadeiro', 'Falso']);
    expect(payloadPergunta({ tipo: 'verdadeiro_falso', alternativas: [], respostaCorreta: '1', respostaModelo: '' })).toEqual({ alternativas: ['Verdadeiro', 'Falso'], resposta_correta: '1' });
  });

  it('preserva a resposta-modelo dissertativa sem criar alternativas', () => {
    expect(payloadPergunta({ tipo: 'dissertativa', alternativas: [], respostaCorreta: '0', respostaModelo: '  Modelo  ' })).toEqual({ alternativas: null, resposta_correta: 'Modelo' });
  });

  it('compara índices objetivos de forma estável', () => {
    expect(respostaObjetivaCorreta({ resposta_correta: '2' }, 2)).toBe(true);
    expect(respostaObjetivaCorreta({ resposta_correta: '2' }, 1)).toBe(false);
  });
});
