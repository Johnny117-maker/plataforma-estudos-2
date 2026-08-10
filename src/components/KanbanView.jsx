import { useState } from 'react';
import { supabase } from '../supabaseClient';

const COLUNAS = [
  { status: 'nao_iniciado', label: 'Não iniciado' },
  { status: 'andamento', label: 'Em andamento' },
  { status: 'concluido', label: 'Concluído' },
];

export default function KanbanView({ tarefas, fasesById, materiasById = {}, onEdit, onChanged }) {
  const [dragOverCol, setDragOverCol] = useState(null);

  async function moverPara(taskId, novoStatus) {
    await supabase.from('tarefas').update({ status: novoStatus }).eq('id', taskId);
    onChanged();
  }

  return (
    <div className="kanban-cols">
      {COLUNAS.map((col) => {
        const itens = tarefas.filter((t) => t.status === col.status);
        return (
          <div key={col.status}>
            <div className="kanban-col-title">
              <span>{col.label}</span>
              <span>{itens.length}</span>
            </div>
            <div
              className={'kanban-col-body' + (dragOverCol === col.status ? ' dragover' : '')}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.status); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData('text/plain');
                setDragOverCol(null);
                moverPara(taskId, col.status);
              }}
            >
              {itens.length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 8 }}>Vazio</div>}
              {itens.map((t) => (
                <div
                  key={t.id}
                  className={'task-card' + (t.status === 'concluido' ? ' concluido' : '')}
                  style={{ borderLeftColor: materiasById[t.materia_id]?.cor || fasesById[t.fase_id]?.cor || undefined }}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
                  onClick={() => onEdit(t)}
                >
                  {materiasById[t.materia_id] && (
                    <div className="fase" style={{ color: materiasById[t.materia_id].cor }}>{materiasById[t.materia_id].nome}</div>
                  )}
                  {fasesById[t.fase_id] && <div className="fase">{fasesById[t.fase_id].nome}</div>}
                  {t.titulo}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
