import { describe, expect, it } from 'vitest';
import {
  clampDpi, escalaDpi, caminhoPdf, caminhoPaginaPng,
  bboxParaPixels, resumirResultadoVisao, ehEscaneado,
  DPI_MIN, DPI_MAX, DPI_PADRAO, MINIMO_CHARS_POR_PAGINA,
} from './provaVisao';

describe('clampDpi', () => {
  it('mantém valores dentro da faixa', () => {
    expect(clampDpi(200)).toBe(200);
    expect(clampDpi(180)).toBe(DPI_MIN);
    expect(clampDpi(220)).toBe(DPI_MAX);
  });

  it('prende valores fora da faixa e arredonda', () => {
    expect(clampDpi(50)).toBe(DPI_MIN);
    expect(clampDpi(1000)).toBe(DPI_MAX);
    expect(clampDpi(199.6)).toBe(200);
  });

  it('usa o padrão para valores inválidos', () => {
    expect(clampDpi('abc')).toBe(DPI_PADRAO);
    expect(clampDpi(NaN)).toBe(DPI_PADRAO);
    expect(clampDpi(undefined)).toBe(DPI_PADRAO);
  });
});

describe('escalaDpi', () => {
  it('converte DPI em escala de pontos (DPI/72)', () => {
    expect(escalaDpi(180)).toBeCloseTo(2.5, 5);
    expect(escalaDpi(216)).toBeCloseTo(3, 5);
  });

  it('aplica o clamp antes de calcular', () => {
    expect(escalaDpi(10000)).toBeCloseTo(DPI_MAX / 72, 5);
  });
});

describe('caminhos de storage', () => {
  it('monta o caminho do PDF', () => {
    expect(caminhoPdf('uid/job')).toBe('uid/job/original.pdf');
  });

  it('monta o caminho da página com número zero-preenchido', () => {
    expect(caminhoPaginaPng('uid/job', 1)).toBe('uid/job/pagina-001.png');
    expect(caminhoPaginaPng('uid/job', 24)).toBe('uid/job/pagina-024.png');
    expect(caminhoPaginaPng('uid/job', 130)).toBe('uid/job/pagina-130.png');
  });
});

describe('bboxParaPixels', () => {
  it('converte bbox normalizado em retângulo de pixels', () => {
    expect(bboxParaPixels([0.1, 0.2, 0.6, 0.5], 1000, 2000)).toEqual({ px: 100, py: 400, w: 500, h: 600 });
  });

  it('normaliza a ordem dos cantos (x1<x0)', () => {
    expect(bboxParaPixels([0.6, 0.5, 0.1, 0.2], 1000, 2000)).toEqual({ px: 100, py: 400, w: 500, h: 600 });
  });

  it('prende o recorte aos limites da imagem', () => {
    const r = bboxParaPixels([0.9, 0.9, 1.5, 1.5], 1000, 1000);
    expect(r.px).toBeLessThanOrEqual(999);
    expect(r.px + r.w).toBeLessThanOrEqual(1000);
    expect(r.py + r.h).toBeLessThanOrEqual(1000);
  });

  it('garante recorte mínimo de 1px para bbox degenerado', () => {
    const r = bboxParaPixels([0.5, 0.5, 0.5, 0.5], 800, 600);
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.h).toBeGreaterThanOrEqual(1);
  });
});

describe('ehEscaneado', () => {
  it('considera escaneado quando há pouco texto por página', () => {
    // 24 páginas com ~50 chars/página → escaneado
    expect(ehEscaneado(1200, 24)).toBe(true);
  });

  it('considera texto nativo quando há bastante texto por página', () => {
    // prova real: ~2900 chars/página → NÃO é escaneado
    expect(ehEscaneado(70000, 24)).toBe(false);
  });

  it('usa o limite na fronteira', () => {
    expect(ehEscaneado(MINIMO_CHARS_POR_PAGINA * 10, 10)).toBe(false); // exatamente no limite
    expect(ehEscaneado(MINIMO_CHARS_POR_PAGINA * 10 - 1, 10)).toBe(true);
  });

  it('trata total de páginas inválido sem dividir por zero', () => {
    expect(ehEscaneado(0, 0)).toBe(true);
    expect(ehEscaneado(500, 0)).toBe(false);
  });
});

describe('resumirResultadoVisao', () => {
  it('conta páginas, questões e imagens', () => {
    const resultado = [
      { pagina: 1, questoes: [{ numero: 1, imagens: ['a.png'] }, { numero: 2, imagens: [] }] },
      { pagina: 2, questoes: [{ numero: 3, imagens: ['b.png', 'c.png'] }] },
    ];
    expect(resumirResultadoVisao(resultado)).toEqual({ paginas: 2, questoes: 3, imagens: 3 });
  });

  it('lida com resultado vazio ou inválido', () => {
    expect(resumirResultadoVisao([])).toEqual({ paginas: 0, questoes: 0, imagens: 0 });
    expect(resumirResultadoVisao(null)).toEqual({ paginas: 0, questoes: 0, imagens: 0 });
  });
});
