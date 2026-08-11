function hoje() { return new Date().toISOString().slice(0, 10); }
function dataPt(data) { return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR'); }

export default function AdaptiveDashboard({ cronograma, tarefas, desempenhos, revisoes, onRegistrar, modo = 'completo' }) {
  const concluidas = tarefas.filter((t) => t.status === 'concluido');
  const pendentes = tarefas.filter((t) => t.status !== 'concluido');
  const questoes = desempenhos.reduce((s, d) => s + Number(d.questoes_realizadas || 0), 0);
  const acertos = desempenhos.reduce((s, d) => s + Number(d.acertos || 0), 0);
  const minutos = desempenhos.reduce((s, d) => s + Number(d.tempo_realizado_minutos || 0), 0);
  const percentual = questoes ? Math.round((acertos / questoes) * 100) : 0;
  const progresso = tarefas.length ? Math.round((concluidas.length / tarefas.length) * 100) : 0;
  const alvoHoje = pendentes
    .filter((t) => t.data_prazo <= hoje())
    .sort((a, b) => b.prioridade_score - a.prioridade_score || a.data_prazo.localeCompare(b.data_prazo));
  const proximas = pendentes
    .filter((t) => t.data_prazo > hoje())
    .sort((a, b) => a.data_prazo.localeCompare(b.data_prazo) || b.prioridade_score - a.prioridade_score)
    .slice(0, 6);
  const revisoesPendentes = revisoes.filter((r) => r.status === 'pendente').length;

  return (
    <div className="adaptive-dashboard">
      {modo !== 'hoje' && <div className="stats-grid">
        <div className="card"><strong>{progresso}%</strong><span>tarefas concluídas</span></div>
        <div className="card"><strong>{percentual}%</strong><span>acerto acumulado</span></div>
        <div className="card"><strong>{questoes}</strong><span>questões realizadas</span></div>
        <div className="card"><strong>{Math.round((minutos / 60) * 10) / 10}h</strong><span>estudo registrado</span></div>
      </div>}

      {modo !== 'hoje' && <div className="goal-progress card">
        <div><strong>Meta {cronograma.meta_acertos || 0}/{cronograma.total_questoes_meta || 60}</strong><span>{revisoesPendentes} revisões pendentes</span></div>
        <div className="progress-track"><span style={{ width: `${Math.min(100, percentual)}%` }} /></div>
        <small>O percentual usa apenas tarefas com questões registradas.</small>
      </div>}

      {modo !== 'desempenho' && <div className="adaptive-dashboard-grid">
        <section className="card">
          <h3>Hoje e atrasadas</h3>
          {!alvoHoje.length && <p className="page-description">Nenhuma tarefa vencida. O cronograma está em dia.</p>}
          {alvoHoje.map((tarefa) => (
            <div className="today-task" key={tarefa.id}>
              <div><strong>{tarefa.titulo}</strong><span>{dataPt(tarefa.data_prazo)} · {tarefa.duracao_minutos || Math.round(tarefa.horas_estimadas * 60)} min · prioridade {tarefa.prioridade_score}</span></div>
              <button className="btn btn-primary" onClick={() => onRegistrar(tarefa)}>Registrar</button>
            </div>
          ))}
        </section>
        <section className="card">
          <h3>Próximas tarefas</h3>
          {proximas.map((tarefa) => (
            <div className="upcoming-task" key={tarefa.id}>
              <span>{dataPt(tarefa.data_prazo)}</span><strong>{tarefa.titulo}</strong>
            </div>
          ))}
        </section>
      </div>}
    </div>
  );
}
