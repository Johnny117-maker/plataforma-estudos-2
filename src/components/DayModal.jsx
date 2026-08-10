export default function DayModal({
  data,
  tarefas = [],
  datasImportantes = [],
  materiasById = {},
  horasPorDia,
  onEditTarefa,
  onEditData,
  onNovaTarefa,
  onNovaData,
  onExcluirTarefa,
  onExcluirData,
  onClose,
}) {
  const dataFormatada = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const vazio = tarefas.length === 0 && datasImportantes.length === 0;
  const horasNoDia = tarefas.reduce((soma, t) => soma + (Number(t.horas_estimadas) || 0), 0);
  const acimaDoLimite = horasPorDia && horasNoDia > horasPorDia;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h3 style={{ fontSize: 15, textTransform: 'capitalize', margin: 0 }}>{dataFormatada}</h3>
          {horasNoDia > 0 && (
            <span style={{ fontSize: 12, color: acimaDoLimite ? 'var(--danger)' : 'var(--muted)' }}>
              {horasNoDia}{horasPorDia ? ` / ${horasPorDia}` : ''}h
            </span>
          )}
        </div>

        {vazio && (
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>
            Nada marcado pra esse dia ainda.
          </div>
        )}

        {acimaDoLimite && (
          <div style={{ fontSize: 11.5, color: 'var(--danger)', marginBottom: 10 }}>
            Esse dia passou do seu limite de {horasPorDia}h — considere mover alguma tarefa.
          </div>
        )}

        {datasImportantes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: tarefas.length > 0 ? 10 : 0 }}>
            {datasImportantes.map((d) => (
              <div key={d.id} className="list-row">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.cor || '#F2C811', flexShrink: 0 }} />
                <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => onEditData(d)}>{'\u{1F6A9}'} {d.titulo}</span>
                <button
                  type="button"
                  title="Remover"
                  className="btn"
                  style={{ padding: '1px 8px', fontSize: 13, color: 'var(--danger)' }}
                  onClick={() => onExcluirData(d)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {tarefas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {tarefas.map((t) => (
              <div key={t.id} className="list-row">
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: materiasById[t.materia_id]?.cor || 'var(--muted)',
                }} />
                <span style={{ flex: 1, cursor: 'pointer' }} onClick={() => onEditTarefa(t)}>{t.titulo}</span>
                {t.horas_estimadas ? (
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.horas_estimadas}h</span>
                ) : null}
                <button
                  type="button"
                  title="Remover"
                  className="btn"
                  style={{ padding: '1px 8px', fontSize: 13, color: 'var(--danger)' }}
                  onClick={() => onExcluirTarefa(t)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" type="button" onClick={onNovaTarefa}>+ Nova tarefa</button>
          <button className="btn" type="button" onClick={onNovaData}>+ Nova data</button>
          <button className="btn" type="button" style={{ marginLeft: 'auto' }} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
