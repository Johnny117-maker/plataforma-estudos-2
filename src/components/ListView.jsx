const STATUS_LABEL = { nao_iniciado: 'Não iniciado', andamento: 'Em andamento', concluido: 'Concluído' };

export default function ListView({ tarefas, fasesById, materiasById = {}, onEdit }) {
  if (tarefas.length === 0) return <div className="empty-state">Nenhuma tarefa ainda.</div>;

  const ordenadas = [...tarefas].sort((a, b) => {
    if (!a.data_prazo) return 1;
    if (!b.data_prazo) return -1;
    return a.data_prazo.localeCompare(b.data_prazo);
  });

  return (
    <div className="card">
      {ordenadas.map((t) => (
        <div key={t.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => onEdit(t)}>
          <span className={`status-pill status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
          <span style={{ flex: 1 }} className={t.status === 'concluido' ? 'task-card concluido' : ''}>{t.titulo}</span>
          {materiasById[t.materia_id] && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: materiasById[t.materia_id].cor }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: materiasById[t.materia_id].cor, display: 'inline-block' }} />
              {materiasById[t.materia_id].nome}
            </span>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{fasesById[t.fase_id]?.nome || ''}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 70, textAlign: 'right' }}>
            {t.data_prazo ? new Date(t.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
