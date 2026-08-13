import { describe, expect, it } from 'vitest';
import { resumoEstruturaDeterministico, montarEntradaIAEstrutura } from './analiseEstrutura';

function questao(numero, { area, origem, dificuldade, visual, apoio } = {}) {
  return {
    numero,
    enunciado: `Enunciado da questão ${numero} com conteúdo suficiente para amostra.`,
    dependeDeVisual: Boolean(visual),
    apoio: apoio || [],
    classificacao: area
      ? { materia_nome: area, dificuldade: dificuldade || 'media', origem: origem || 'ia' }
      : undefined,
  };
}

describe('resumoEstruturaDeterministico', () => {
  it('classifica como "por_disciplina" quando as áreas vêm de cabeçalhos', () => {
    const documentos = [{
      perfil: 'fatec',
      questoes: [
        questao(1, { area: 'Matemática', origem: 'cabecalho_de_area', dificuldade: 'facil' }),
        questao(2, { area: 'Matemática', origem: 'cabecalho_de_area', dificuldade: 'media', visual: true }),
        questao(3, { area: 'História Geral', origem: 'cabecalho_de_area', dificuldade: 'dificil' }),
        questao(4, { area: 'Biologia', origem: 'cabecalho_de_area', dificuldade: 'media' }),
      ],
    }];
    const r = resumoEstruturaDeterministico(documentos);
    expect(r.total_questoes).toBe(4);
    expect(r.perfil_banca).toBe('fatec');
    expect(r.tipo_prova).toBe('por_disciplina');
    expect(r.por_area[0]).toEqual({ area: 'Matemática', questoes: 2, percentual: 0.5 });
    expect(r.por_dificuldade).toEqual({ facil: 1, media: 2, dificil: 1 });
    expect(r.percentual_visual).toBe(0.25);
  });

  it('classifica como "tematica" quando há poucas áreas distintas', () => {
    const documentos = [{
      perfil: 'fatec',
      questoes: [
        questao(1, { area: 'Multidisciplinar', origem: 'ia' }),
        questao(2, { area: 'Multidisciplinar', origem: 'ia' }),
        questao(3, { area: 'Linguagens', origem: 'ia' }),
      ],
    }];
    expect(resumoEstruturaDeterministico(documentos).tipo_prova).toBe('tematica');
  });

  it('marca "indefinido" quando nenhuma questão foi classificada', () => {
    const documentos = [{ perfil: 'fatec', questoes: [questao(1), questao(2)] }];
    const r = resumoEstruturaDeterministico(documentos);
    expect(r.tipo_prova).toBe('indefinido');
    expect(r.por_area).toEqual([]);
  });

  it('conta grupos de texto de apoio distintos por alvos', () => {
    const apoio = [{ alvos: [2, 3], rotulo: 'Leia o texto', texto: 'Contexto compartilhado.' }];
    const documentos = [{
      perfil: 'fatec',
      questoes: [
        questao(2, { area: 'Português', apoio }),
        questao(3, { area: 'Português', apoio }),
      ],
    }];
    expect(resumoEstruturaDeterministico(documentos).grupos_texto_apoio).toBe(1);
  });
});

describe('montarEntradaIAEstrutura', () => {
  it('deduplica textos de apoio e limita a amostra ao texto, sem o PDF', () => {
    const apoio = [{ alvos: [2, 3], rotulo: 'Leia', texto: 'Texto de apoio compartilhado.' }];
    const documentos = [{
      perfil: 'fatec',
      questoes: [
        questao(2, { area: 'Português', apoio }),
        questao(3, { area: 'Português', apoio }),
      ],
    }];
    const deterministico = resumoEstruturaDeterministico(documentos);
    const entrada = montarEntradaIAEstrutura(documentos, deterministico);
    expect(entrada.textos_apoio).toHaveLength(1);
    expect(entrada.textos_apoio[0].alvos).toEqual([2, 3]);
    expect(entrada.amostra_enunciados).toHaveLength(2);
    expect(entrada.resumo.total_questoes).toBe(2);
  });
});
