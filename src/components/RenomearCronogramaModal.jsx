import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function RenomearCronogramaModal({ cronograma, onClose, onSaved }) {
  const [nome, setNome] = useState(cronograma.nome);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setErro('');
    setSaving(true);
    const { error } = await supabase
      .from('cronogramas')
      .update({ nome: nome.trim() })
      .eq('id', cronograma.id);
    setSaving(false);
    if (error) { setErro(error.message); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Renomear cronograma</h3>

        <input
          type="text"
          placeholder="Nome do cronograma"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          autoFocus
        />

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
