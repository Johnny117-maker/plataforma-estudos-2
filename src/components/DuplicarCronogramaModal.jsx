import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { duplicarCronograma } from '../lib/duplicarCronograma';

export default function DuplicarCronogramaModal({ cronograma, userId, onClose }) {
  const navigate = useNavigate();
  const [novoNome, setNovoNome] = useState(`${cronograma.nome} (cópia)`);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function duplicar(e) {
    e.preventDefault();
    if (!novoNome.trim()) return;
    setErro('');
    setSaving(true);
    const r = await duplicarCronograma(cronograma.id, userId, novoNome.trim());
    setSaving(false);
    if (!r.ok) { setErro(r.erro); return; }
    onClose();
    navigate(`/cronogramas/${r.id}`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={duplicar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Duplicar cronograma</h3>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 4 }}>
          Cria uma cópia completa de "{cronograma.nome}": todas as fases, tarefas
          (com o mesmo status e prazos) e datas importantes associadas a ele.
        </div>

        <input
          type="text"
          placeholder="Nome da cópia"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          required
          autoFocus
        />

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Duplicando…' : 'Duplicar'}
          </button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
