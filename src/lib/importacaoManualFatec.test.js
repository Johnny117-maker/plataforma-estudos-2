import { describe, expect, it } from 'vitest';
import {
  corrigirQuestoesFatecParaImportacao,
  criarAlternativasVisuais,
  deveTerRecursoVisual,
  identificarArquivoFatec,
  organizarParesFatec,
  reconstruirQuestaoPelaGeometria,
  TOTAL_QUESTOES_CADERNOS_FATEC,
} from './importacaoManualFatec';

function linha(texto, y0, x0 = 30, pagina = 1) {
  return {
    texto,
    pagina,
    x0,
    x1: x0 + 220,
    y0,
    y1: y0 + 10,
    larguraPagina: 600,
    alturaPagina: 800,
  };
}

describe('importação manual dos cadernos Fatec', () => {
  it('reconhece os quatro pares e o total esperado', () => {
    expect(TOTAL_QUESTOES_CADERNOS_FATEC).toBe(238);
    expect(identificarArquivoFatec('Prova - 2° Semestre 2026(1).pdf')).toMatchObject({
      chave: '2026-2',
      papel: 'prova',
      suportado: true,
    });
    expect(organizarParesFatec([
      { name: 'Prova - 1° Semestre 2024.pdf' },
      { name: 'Gabarito - 1° Semestre 2024.pdf' },
    ])).toHaveLength(1);
  });

  it('recusa um par sem gabarito', () => {
    expect(() => organizarParesFatec([
      { name: 'Prova - 1° Semestre 2026.pdf' },
    ])).toThrow(/par 2026-1 está incompleto/i);
  });

  it('reconstrói alternativas que ficaram depois do cabeçalho seguinte', () => {
    const linhas = [
      linha('Questão 1', 400),
      linha('Enunciado principal', 382),
      linha('Complemento ao lado da figura', 365, 300),
      linha('(A) primeira opção completa', 345, 300),
      linha('(B) segunda opção completa', 325, 300),
      linha('(C) terceira opção completa', 305, 300),
      linha('(D) quarta opção completa', 285, 300),
      linha('(E) quinta opção', 265, 300),
      linha('continuação da quinta opção', 250, 320),
      linha('Fonte: exemplo', 238, 40),
      linha('Questão 2', 220),
      linha('Enunciado seguinte', 202),
      linha('(A) opção um', 182),
      linha('(B) opção dois', 162),
      linha('(C) opção três', 142),
      linha('(D) opção quatro', 122),
      linha('(E) opção cinco', 102),
      linha('Questão 3', 70),
    ];

    const reconstruida = reconstruirQuestaoPelaGeometria(linhas, 1);
    expect(reconstruida.letras.join('')).toBe('ABCDE');
    expect(reconstruida.alternativas).toHaveLength(5);
    expect(reconstruida.alternativas[4]).toContain('continuação');
    expect(reconstruida.enunciado).not.toContain('Fonte');

    const corrigidas = corrigirQuestoesFatecParaImportacao(linhas, [
      {
        numero: 1,
        enunciado: 'Enunciado principal',
        alternativas: [],
        letras: [],
        lacunasVisuaisOrigem: [{ y0: 240, y1: 350, area: 25_000 }],
      },
      {
        numero: 2,
        enunciado: 'texto contaminado',
        alternativas: new Array(10).fill('(A) opção'),
        letras: [],
        lacunasVisuaisOrigem: [],
      },
    ]);
    expect(corrigidas.map((questao) => questao.alternativas.length)).toEqual([5, 5]);
    expect(corrigidas[0].corrigidaPorGeometria).toBe(true);
  });

  it('mantém cinco escolhas quando as alternativas são os próprios gráficos', () => {
    const questoes = corrigirQuestoesFatecParaImportacao([], [
      {
        numero: 41,
        alternativas: ['(A)', '(C)', '(D)'],
        letras: ['A', 'C', 'D'],
        dependeDeVisual: true,
        lacunasVisuaisOrigem: [],
      },
      {
        numero: 46,
        alternativas: ['(A)', '(B)', '(C)', '(D)', '(E)'],
        letras: ['A', 'B', 'C', 'D', 'E'],
        dependeDeVisual: true,
        lacunasVisuaisOrigem: [],
      },
    ]);
    expect(questoes[0].alternativas).toEqual(criarAlternativasVisuais());
    expect(questoes[1].alternativas).toEqual(criarAlternativasVisuais());
    expect(questoes.every((questao) => questao.alternativasRepresentadasNaImagem)).toBe(true);
  });

  it('detecta um painel visual grande mesmo sem a palavra figura', () => {
    expect(deveTerRecursoVisual({
      dependeDeVisual: false,
      lacunasVisuaisOrigem: [{ y0: 100, y1: 190, area: 22_000 }],
    })).toBe(true);
  });
});
