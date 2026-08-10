import { describe, expect, it } from 'vitest';
import { cruzarFrequencias } from './analiseProvas';

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
