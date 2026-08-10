import { useState } from 'react';
import { supabase } from '../supabaseClient';

// dataInicial é opcional: só é usada quando `tarefa` não é passada (criação),
// pra pré-preencher o prazo quando a tarefa é criada a partir do dia
// clicado no calendário. Não afeta o uso normal do modal.
export default function TaskModal({ cronogramaId, userId, fases, materias = [], tarefa, dataInicial = '', onClose, onSaved }) {
  const [titulo, setTitulo] = useState(tarefa?.titulo || '');
  const [faseId, setFaseId] = useState(tarefa?.fase_id || fases[0]?.id || '');
  const [materiaId, setMateriaId] = useState(tarefa?.materia_id || '');
  const [status, setStatus] = useState(tarefa?.status || 'nao_iniciado');
  const [prioridade, setPrioridade] = useState(tarefa?.prioridade || 'media');
  const [dataPrazo, setDataPrazo] = useState(tarefa?.data_prazo || dataInicial || '');
  const [horasEstimadas, setHorasEstimadas] = useState(tarefa?.horas_estimadas ?? '');
  const [saving, setSaving] = useState(false);

  async function salvar(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      cronograma_id: cronogramaId,
      user_id: userId,
      titulo,
      fase_id: faseId || null,
      materia_id: materiaId || null,
      status,
      prioridade,
      data_prazo: dataPrazo || null,
      horas_estimadas: horasEstimadas !== '' ? Number(horasEstimadas) : null,
    };
    const { error } = tarefa
      ? await supabase.from('tarefas').update(payload).eq('id', tarefa.id)
      : await supabase.from('tarefas').insert(payload);
    setSaving(false);
    if (!error) { onSaved(); onClose(); }
  }

  async function excluir() {
    if (!confirm('Excluir esta tarefa?')) return;
    await supabase.from('tarefas').delete().eq('id', tarefa.id);
    onSaved(); onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>{tarefa ? 'Editar tarefa' : 'Nova tarefa'}</h3>

        <input type="text" placeholder="Título da tarefa" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />

        <select value={faseId} onChange={(e) => setFaseId(e.target.value)}>
          <option value="">Sem fase</option>
          {fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>

        {materias.length > 0 && (
          <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
            <option value="">Sem matéria</option>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        )}

        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="nao_iniciado">Não iniciado</option>
          <option value="andamento">Em andamento</option>
          <option value="concluido">Concluído</option>
        </select>

        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
          <option value="baixa">Prioridade baixa</option>
          <option value="media">Prioridade média</option>
          <option value="alta">Prioridade alta</option>
        </select>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Prazo (opcional)</div>
            <input type="date" value={dataPrazo} onChange={(e) => setDataPrazo(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Horas estimadas (opcional)</div>
            <input
              type="number"
              min="0"
              step="0.5"
              placeholder="Ex: 1.5"
              value={horasEstimadas}
              onChange={(e) => setHorasEstimadas(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          {tarefa && <button className="btn" type="button" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={excluir}>Excluir</button>}
        </div>
      </form>
    </div>
  );
}
