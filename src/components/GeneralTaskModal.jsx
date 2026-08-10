import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function GeneralTaskModal({ cronogramas, materias = [], userId, tarefa, onClose, onSaved }) {
  const [titulo, setTitulo] = useState(tarefa?.titulo || '');
  const [cronogramaId, setCronogramaId] = useState(tarefa?.cronograma_id || '');
  const [faseId, setFaseId] = useState(tarefa?.fase_id || '');
  const [materiaId, setMateriaId] = useState(tarefa?.materia_id || '');
  const [status, setStatus] = useState(tarefa?.status || 'nao_iniciado');
  const [prioridade, setPrioridade] = useState(tarefa?.prioridade || 'media');
  const [dataPrazo, setDataPrazo] = useState(tarefa?.data_prazo || '');
  const [saving, setSaving] = useState(false);

  const fasesDisponiveis = cronogramas.find((c) => c.id === cronogramaId)?.fases || [];

  async function salvar(e) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      user_id: userId,
      titulo,
      cronograma_id: cronogramaId || null,
      fase_id: faseId || null,
      materia_id: materiaId || null,
      status,
      prioridade,
      data_prazo: dataPrazo || null,
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

        <select value={cronogramaId} onChange={(e) => { setCronogramaId(e.target.value); setFaseId(''); }}>
          <option value="">Tarefa avulsa (sem cronograma)</option>
          {cronogramas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>

        {cronogramaId && (
          <select value={faseId} onChange={(e) => setFaseId(e.target.value)}>
            <option value="">Sem fase</option>
            {fasesDisponiveis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        )}

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

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Prazo (opcional)</div>
          <input type="date" value={dataPrazo} onChange={(e) => setDataPrazo(e.target.value)} />
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
