import { useState } from 'react';
import { supabase } from '../supabaseClient';

const CORES = ['#F2C811', '#2F81F7', '#238636', '#A371F7', '#F85149', '#3F8CB0', '#8B949E', '#DB6D28', '#3FB950'];

export default function MateriaModal({ userId, proximaOrdem, onClose, onSaved }) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES[0]);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setErro('');
    setSaving(true);
    const { error } = await supabase
      .from('materias')
      .insert({ user_id: userId, nome: nome.trim(), cor, ordem: proximaOrdem });
    setSaving(false);
    if (error) { setErro(error.message); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Nova matéria</h3>

        <input
          type="text"
          placeholder="Nome da matéria"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          autoFocus
        />

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Cor</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CORES.map((c) => (
              <div
                key={c}
                onClick={() => setCor(c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  outline: cor === c ? '2px solid var(--text)' : 'none', outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

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
