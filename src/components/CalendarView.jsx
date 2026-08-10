import { useState } from 'react';
import { supabase } from '../supabaseClient';

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

// datasImportantes, onEditData, onDayClick e horasPorDia são opcionais —
// telas que não usam essas funcionalidades continuam funcionando igual.
export default function CalendarView({
  tarefas,
  materiasById = {},
  datasImportantes = [],
  horasPorDia,
  onEdit,
  onEditData,
  onDayClick,
  onChanged,
}) {
  const [ref, setRef] = useState(new Date());
  const [dragOverDia, setDragOverDia] = useState(null);

  const ano = ref.getFullYear();
  const mes = ref.getMonth();
  const primeiroDia = new Date(ano, mes, 1);
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const offset = primeiroDia.getDay();

  const porDia = {};
  tarefas.forEach((t) => {
    if (!t.data_prazo) return;
    const d = t.data_prazo;
    if (!porDia[d]) porDia[d] = [];
    porDia[d].push(t);
  });

  const datasPorDia = {};
  datasImportantes.forEach((d) => {
    if (!d.data) return;
    if (!datasPorDia[d.data]) datasPorDia[d.data] = [];
    datasPorDia[d.data].push(d);
  });

  const celulas = [];
  for (let i = 0; i < offset; i++) celulas.push(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(d);

  function chaveData(dia) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }

  function horasDoDia(chave) {
    return (porDia[chave] || []).reduce((soma, t) => soma + (Number(t.horas_estimadas) || 0), 0);
  }

  async function moverParaDia(taskId, novaData) {
    await supabase.from('tarefas').update({ data_prazo: novaData }).eq('id', taskId);
    onChanged && onChanged();
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <button className="btn" onClick={() => setRef(new Date(ano, mes - 1, 1))}>←</button>
        <div style={{ fontFamily: 'Oswald, sans-serif', fontSize: 14, textTransform: 'uppercase' }}>
          {MESES[mes]} de {ano}
        </div>
        <button className="btn" onClick={() => setRef(new Date(ano, mes + 1, 1))}>→</button>
      </div>

      <div className="calendar-grid" style={{ marginBottom: 4 }}>
        {DIAS_SEMANA.map((d) => (
          <div key={d} style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>{d}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {celulas.map((dia, i) => {
          const chave = dia ? chaveData(dia) : null;
          const horasNoDia = dia ? horasDoDia(chave) : 0;
          const acimaDoLimite = horasPorDia && horasNoDia > horasPorDia;
          return (
            <div
              key={i}
              className={'calendar-cell' + (dragOverDia === chave ? ' dragover' : '')}
              style={{ opacity: dia ? 1 : 0.3, cursor: dia && onDayClick ? 'pointer' : undefined }}
              onDragOver={(e) => { if (!dia) return; e.preventDefault(); setDragOverDia(chave); }}
              onDragLeave={() => setDragOverDia(null)}
              onDrop={(e) => {
                if (!dia) return;
                e.preventDefault();
                const taskId = e.dataTransfer.getData('text/plain');
                setDragOverDia(null);
                moverParaDia(taskId, chave);
              }}
              onClick={() => { if (dia && onDayClick) onDayClick(chave); }}
            >
              {dia && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className="daynum">{dia}</div>
                    {horasNoDia > 0 && (
                      <span style={{ fontSize: 10, color: acimaDoLimite ? 'var(--danger)' : 'var(--muted)' }}>
                        {horasNoDia}{horasPorDia ? `/${horasPorDia}` : ''}h
                      </span>
                    )}
                  </div>
                  {(datasPorDia[chave] || []).map((d) => (
                    <div
                      key={'data-' + d.id}
                      className="calendar-task"
                      style={{
                        borderLeftColor: d.cor || '#F2C811',
                        background: 'rgba(242, 200, 17, 0.12)',
                        fontWeight: 600,
                        cursor: onEditData ? 'pointer' : 'default',
                      }}
                      title={d.titulo}
                      onClick={(e) => { e.stopPropagation(); onEditData && onEditData(d); }}
                    >
                      {'\u{1F6A9}'} {d.titulo}
                    </div>
                  ))}
                  {(porDia[chave] || []).map((t) => (
                    <div
                      key={t.id}
                      className="calendar-task"
                      style={{ borderLeftColor: materiasById[t.materia_id]?.cor || undefined, cursor: 'grab' }}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData('text/plain', t.id); }}
                      onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                    >
                      {t.titulo}{t.horas_estimadas ? ` (${t.horas_estimadas}h)` : ''}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
