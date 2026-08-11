import { describe, expect, it } from 'vitest';
import {
  calcularPrioridades,
  DISPONIBILIDADE_PADRAO,
  gerarCronogramaAdaptativo,
  sugerirReorganizacaoAdaptativa,
} from './cronogramaAdaptativo';

const assuntos = [
  { materia: 'Matemática', assunto: 'Porcentagem', questoes: 12, documentos: 6, desempenho_percentual: 40, importancia: 90 },
  { materia: 'Química', assunto: 'Estequiometria', questoes: 6, documentos: 4, desempenho_percentual: 80, importancia: 70 },
];

describe('cronograma adaptativo', () => {
  it('prioriza recorrência e lacuna sem ultrapassar 100', () => {
    const resultado = calcularPrioridades(assuntos);
    expect(resultado[0].assunto).toBe('Porcentagem');
    expect(resultado[0].prioridade_score).toBeGreaterThan(resultado[1].prioridade_score);
    expect(resultado.every((item) => item.prioridade_score <= 100)).toBe(true);
  });

  it('gera quatro fases, revisões e não ultrapassa 85% da disponibilidade', () => {
    const plano = gerarCronogramaAdaptativo({
      objetivo: {
        nome: 'FATEC', objetivo: 'Vestibular FATEC', vestibular: 'FATEC',
        data_inicio: '2026-08-11', data_prova: '2026-12-11', meta_acertos: 48, total_questoes: 60,
      },
      disponibilidade: DISPONIBILIDADE_PADRAO,
      assuntos,
      totalProvas: 7,
    });
    expect(plano.fases).toHaveLength(4);
    expect(plano.revisoes.length).toBeGreaterThan(0);
    expect(plano.resumo.ocupacao_percentual).toBeLessThanOrEqual(100);
    expect(plano.fases.flatMap((f) => f.tarefas).some((t) => t.tipo === 'simulado')).toBe(true);
  });

  it('mantém tarefa fixa fora das atualizações de reorganização', () => {
    const resultado = sugerirReorganizacaoAdaptativa({
      dataInicio: '2026-08-11', dataFinal: '2026-08-20', disponibilidade: DISPONIBILIDADE_PADRAO,
      desempenhos: [{ tarefa_id: 'a', percentual_acerto: 40 }],
      tarefas: [
        { id: 'a', status: 'nao_iniciado', fixa: false, data_prazo: '2026-08-01', duracao_minutos: 60, prioridade_score: 60 },
        { id: 'b', status: 'nao_iniciado', fixa: true, data_prazo: '2026-08-15', duracao_minutos: 60, prioridade_score: 90 },
      ],
    });
    expect(resultado.atualizacoes.map((item) => item.tarefa_id)).toEqual(['a']);
  });
});
