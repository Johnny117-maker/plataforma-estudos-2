import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {},
}));
import {
  aplicarResultadosAoSnapshot,
  criarSnapshotDocumentos,
  filtrarJobsAtivos,
  filtrarJobsFinalizados,
  montarLotesClassificacao,
  percentualJob,
  rotuloStatusJob,
} from './analiseAssincrona';

function questao(id, { visual = false, classificada = false } = {}) {
  return {
    id,
    enunciado: `Enunciado suficientemente longo da questão ${id}`,
    paraClassificar: `Enunciado suficientemente longo da questão ${id}`,
    dependeDeVisual: visual,
    classificacao: classificada ? { materia_nome: 'Matemática', assunto_nome: 'Porcentagem' } : null,
  };
}

describe('jobs assíncronos de análise', () => {
  it('separa questões visuais das textuais e ignora classificadas', () => {
    const lotes = montarLotesClassificacao([{
      nome: 'prova.pdf', hash: 'abc', contexto: 'tema',
      questoes: [questao('1'), questao('2', { visual: true }), questao('3', { classificada: true })],
    }]);
    expect(lotes).toHaveLength(2);
    expect(lotes[0]).toMatchObject({ requerFlash: false });
    expect(lotes[0].questoes.map((item) => item.id)).toEqual(['1']);
    expect(lotes[1]).toMatchObject({ requerFlash: true });
    expect(lotes[1].questoes.map((item) => item.id)).toEqual(['2']);
  });

  it('limita lotes textuais a 24 itens', () => {
    const lotes = montarLotesClassificacao([{
      nome: 'prova.pdf', hash: 'abc', questoes: Array.from({ length: 49 }, (_, i) => questao(String(i))),
    }]);
    expect(lotes.map((lote) => lote.questoes.length)).toEqual([24, 24, 1]);
  });

  it('reconstrói o snapshot e normaliza o resultado da fila', () => {
    const snapshot = criarSnapshotDocumentos([{
      nome: 'prova.pdf', tipo: 'pdf', tamanho: 10, totalPaginas: 1, hash: 'abc', questoes: [questao('1')],
    }]);
    const documentos = aplicarResultadosAoSnapshot(snapshot, [{
      resultado: { classificacoes: [{
        id: '1', materia_nome: 'Matemática', assunto_nome: 'Porcentagem', dificuldade: 'facil', confianca: 0.9,
      }] },
    }]);
    expect(documentos[0].questoes[0].classificacao).toMatchObject({
      materia_nome: 'Matemática', assunto_nome: 'Porcentagem e variação percentual', origem: 'ia_assincrona',
    });
  });

  it('calcula progresso e traduz estados persistidos', () => {
    expect(percentualJob({ total_itens: 100, itens_concluidos: 38, itens_falhos: 2 })).toBe(40);
    expect(rotuloStatusJob('aguardando_batch')).toBe('Aguardando Gemini Batch');
  });

  it('mantém na tela somente processamentos ainda ativos', () => {
    const jobs = [
      { id: '1', status: 'pendente' },
      { id: '2', status: 'processando' },
      { id: '3', status: 'aguardando_batch' },
      { id: '4', status: 'concluido' },
      { id: '5', status: 'falhou' },
      { id: '6', status: 'cancelado' },
    ];

    expect(filtrarJobsAtivos(jobs).map((job) => job.id)).toEqual(['1', '2', '3']);
    expect(filtrarJobsFinalizados(jobs).map((job) => job.id)).toEqual(['4', '5', '6']);
  });
});
