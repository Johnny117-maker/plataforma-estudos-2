import { describe, expect, it } from 'vitest';
import {
  calcularIndisponibilidadeGroq,
  escolherRota,
  somarUsoProvedor,
  TAMANHO_LOTE_GEMINI,
  TAMANHO_LOTE_GROQ,
} from './roteadorIA';

describe('roteadorIA', () => {
  it('usa Groq quando a estrategia e hibrida e o provedor esta disponivel', () => {
    expect(escolherRota({ estrategia: 'hibrida', groqDisponivel: true })).toMatchObject({
      provedorPreferido: 'auto',
      tamanhoLote: TAMANHO_LOTE_GROQ,
    });
  });

  it('usa Gemini quando a Groq esta indisponivel', () => {
    expect(escolherRota({ estrategia: 'hibrida', groqDisponivel: false })).toMatchObject({
      provedorPreferido: 'gemini',
      tamanhoLote: TAMANHO_LOTE_GEMINI,
    });
  });

  it('respeita o modo somente Gemini', () => {
    expect(escolherRota({ estrategia: 'gemini', groqDisponivel: true }).provedorPreferido)
      .toBe('gemini');
  });

  it('calcula o cooldown da Groq quando o fallback foi causado por limite', () => {
    const agora = 1_000;
    expect(calcularIndisponibilidadeGroq({
      provedor: 'gemini',
      motivoFallback: 'groq_rate_limit',
      groqRetryAfter: 45,
    }, agora)).toBe(46_000);
  });

  it('soma a quantidade processada por provedor', () => {
    const parcial = somarUsoProvedor({ groq: 8, gemini: 0 }, { provedor: 'gemini' }, 24);
    expect(parcial).toEqual({ groq: 8, gemini: 24 });
  });
});
