import { describe, expect, it } from 'vitest';
import {
  clampDpi, escalaDpi, caminhoPdf, caminhoPaginaPng,
  DPI_MIN, DPI_MAX, DPI_PADRAO,
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
