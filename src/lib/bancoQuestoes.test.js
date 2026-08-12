import { describe, expect, it } from 'vitest';
import {
  aplicarGabaritoNaProva,
  detectarIdentidadeProva,
  embaralharQuestoes,
  extrairItensGabarito,
  prepararProvasParaBanco,
  validarQuestaoParaBanco,
} from './bancoQuestoes';

describe('extração de gabarito', () => {
  it('lê várias respostas na mesma linha e preserva a disciplina', () => {
    const resultado = extrairItensGabarito([
      { texto: 'Matemática', pagina: 1 },
      { texto: '01 A 02 B 03 C', pagina: 1 },
      { texto: 'Física', pagina: 2 },
      { texto: 'Questão 4: D', pagina: 2 },
    ]);

    expect(resultado.itens).toEqual([
      expect.objectContaining({ numero: 1, resposta: 'A', disciplina: 'Matemática' }),
      expect.objectContaining({ numero: 2, resposta: 'B', disciplina: 'Matemática' }),
      expect.objectContaining({ numero: 3, resposta: 'C', disciplina: 'Matemática' }),
      expect.objectContaining({ numero: 4, resposta: 'D', disciplina: 'Física' }),
    ]);
  });

  it('faz a última resposta vencer quando há retificação', () => {
    const resultado = extrairItensGabarito([
      { texto: '44 D Química', pagina: 1 },
      { texto: 'Gabarito retificado — Questão 44: E', pagina: 2 },
    ]);
    expect(resultado.itens[0]).toMatchObject({ numero: 44, resposta: 'E', retificada: true });
    expect(resultado.retificado).toBe(true);
  });

  it('não herda a disciplina anterior em História e Multidisciplinar', () => {
    const resultado = extrairItensGabarito([
      { texto: 'História', pagina: 1 },
      { texto: '01 A', pagina: 1 },
      { texto: 'Multidisciplinar', pagina: 1 },
      { texto: '02 B', pagina: 1 },
    ]);
    expect(resultado.itens).toEqual([
      expect.objectContaining({ numero: 1, disciplina: 'História Geral' }),
      expect.objectContaining({ numero: 2, disciplina: 'Multidisciplinar' }),
    ]);
  });
});

describe('identificação e vínculo', () => {
  it('detecta instituição, ano e semestre pelo conteúdo', () => {
    expect(detectarIdentidadeProva('Vestibular FATEC — 2º semestre de 2026')).toEqual({
      instituicao: 'FATEC',
      ano: 2026,
      semestre: 2,
    });
  });

  it('associa respostas às questões pelo número, não pela posição', () => {
    const prova = { papel: 'prova', questoes: [{ numero: 2 }, { numero: 1 }] };
    const gabarito = {
      hash: 'gab',
      nome: 'gabarito.pdf',
      gabaritoItens: [{ numero: 1, resposta: 'C' }, { numero: 2, resposta: 'A' }],
    };
    const resultado = aplicarGabaritoNaProva(prova, gabarito);
    expect(resultado.questoes.map((questao) => questao.gabarito)).toEqual(['A', 'C']);
  });
});

describe('publicação e testes', () => {
  const materia = { id: 'materia-1', nome: 'Matemática', subgeneros: [{ id: 'assunto-1', nome: 'Função afim' }] };
  const questao = {
    id: 'q1',
    numero: 1,
    pagina: 3,
    enunciado: 'Enunciado suficientemente completo para ser armazenado como questão no banco.',
    alternativas: ['(A) Um', '(B) Dois', '(C) Três', '(D) Quatro', '(E) Cinco'],
    gabarito: 'B',
    selecionada: true,
    incluirBanco: true,
    classificacao: {
      materia_nome: 'Matemática',
      assunto_nome: 'Função afim',
      dificuldade: 'media',
      confianca: 0.91,
    },
    imagemStoragePath: 'usuario/prova/questao-001.webp',
  };

  it('bloqueia questão incompleta e prepara questão válida com alternativas limpas', () => {
    expect(validarQuestaoParaBanco({ ...questao, gabarito: null }, [materia]).pronta).toBe(false);
    const resultado = prepararProvasParaBanco([{
      papel: 'prova',
      selecionado: true,
      nome: 'prova.pdf',
      hash: 'abc',
      metadadosProva: { instituicao: 'FATEC', ano: 2026, semestre: 2 },
      gabaritoVinculado: { nome: 'gabarito.pdf', itens: [{ numero: 1, resposta: 'B' }] },
      questoes: [questao],
    }], [materia], 'FATEC', null);

    expect(resultado.prontas).toBe(1);
    expect(resultado.provas[0].questoes[0]).toMatchObject({
      resposta: 'B',
      alternativas: ['Um', 'Dois', 'Três', 'Quatro', 'Cinco'],
      materia_id: 'materia-1',
      subgenero_id: 'assunto-1',
      imagem_url: 'usuario/prova/questao-001.webp',
    });
  });

  it('bloqueia alternativa contaminada por cabeçalho ou apoio de outra questão', () => {
    const contaminada = {
      ...questao,
      alternativas: [
        '(A) Um',
        '(B) Dois',
        '(C) Três',
        '(D) Quatro',
        '(E) Cinco\nLeia o texto para responder às questões 2 e 3.\nContexto seguinte.',
      ],
    };
    const validacao = validarQuestaoParaBanco(contaminada, [materia]);

    expect(validacao.pronta).toBe(false);
    expect(validacao.pendencias).toContain('alternativa contém texto de outra questão');
  });

  it('não aprova questão visual sem a figura armazenada', () => {
    const validacao = validarQuestaoParaBanco({
      ...questao,
      letras: ['A', 'B', 'C', 'D', 'E'],
      dependeDeVisual: true,
      visualAnalisado: true,
      imagemStoragePath: null,
    }, [materia]);

    expect(validacao.pendencias).toContain('recurso visual ainda não extraído');
  });

  it('aprova a etapa visual quando o recorte foi armazenado', () => {
    const validacao = validarQuestaoParaBanco({
      ...questao,
      letras: ['A', 'B', 'C', 'D', 'E'],
      dependeDeVisual: true,
      visualAnalisado: true,
      imagemStoragePath: 'usuario/prova/questao-001.webp',
    }, [materia]);

    expect(validacao.pendencias).not.toContain('figura ainda não extraída');
  });

  it('prioriza questões com maior taxa de erro', () => {
    const perguntas = [{ id: 'a' }, { id: 'b' }];
    const historico = [
      { pergunta_id: 'a', correta: false },
      { pergunta_id: 'a', correta: false },
      { pergunta_id: 'b', correta: true },
    ];
    expect(embaralharQuestoes(perguntas, historico, 'mais_erradas', 1)[0].id).toBe('a');
  });
});
