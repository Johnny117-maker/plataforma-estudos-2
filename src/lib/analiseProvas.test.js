import { describe, expect, it } from 'vitest';
import { criarBlocosDeConteudo, cruzarFrequencias, filtrarSelecao, resumirSelecao } from './analiseProvas';

describe('cruzarFrequencias', () => {
  it('conta questões e presença por documento separadamente', () => {
    const documentos = [
      { questoes: [{ classificacao: { materia_nome: 'Matemática', assunto_nome: 'Funções' } }, { classificacao: { materia_nome: 'Matemática', assunto_nome: 'Funções' } }] },
      { questoes: [{ classificacao: { materia_nome: 'Matemática', assunto_nome: 'Funções' } }, { classificacao: { materia_nome: 'Física', assunto_nome: 'Mecânica' } }] },
    ];
    const resultado = cruzarFrequencias(documentos);
    expect(resultado[0]).toMatchObject({ materia: 'Matemática', assunto: 'Funções', questoes: 3, documentos: 2, percentual: 0.75, peso: 3 });
    expect(resultado[1]).toMatchObject({ materia: 'Física', assunto: 'Mecânica', questoes: 1, documentos: 1 });
  });
});

describe('seleção de conteúdos', () => {
  it('mantém somente arquivos e conteúdos selecionados com texto', () => {
    const documentos = [
      {
        nome: 'prova-a.pdf',
        selecionado: true,
        questoes: [
          { id: '1', selecionada: true, paraClassificar: 'Função quadrática', classificacao: { assunto_nome: 'Funções' } },
          { id: '2', selecionada: false, paraClassificar: 'Geometria' },
          { id: '3', selecionada: true, paraClassificar: '   ' },
        ],
      },
      { nome: 'prova-b.pdf', selecionado: false, questoes: [{ id: '4', paraClassificar: 'Mecânica' }] },
    ];

    const selecionados = filtrarSelecao(documentos);
    expect(selecionados).toHaveLength(1);
    expect(selecionados[0].questoes.map((item) => item.id)).toEqual(['1']);
    expect(selecionados[0].texto).toBe('Função quadrática');
    expect(resumirSelecao(documentos)).toEqual({ documentos: 1, conteudos: 1, classificados: 1 });
  });

  it('divide texto sem questões em trechos selecionáveis dentro do limite', () => {
    const blocos = criarBlocosDeConteudo([
      { texto: 'A'.repeat(2200), pagina: 1 },
      { texto: 'B'.repeat(2200), pagina: 2 },
    ], 'arquivo', 3000);

    expect(blocos).toHaveLength(2);
    expect(blocos.every((bloco) => bloco.paraClassificar.length <= 3000)).toBe(true);
    expect(blocos.map((bloco) => bloco.pagina)).toEqual([1, 2]);
    expect(blocos.every((bloco) => bloco.selecionada)).toBe(true);
  });
});
