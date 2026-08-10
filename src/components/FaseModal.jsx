import { useState } from 'react';
import { supabase } from '../supabaseClient';

const CORES = ['#F2C811', '#2F81F7', '#238636', '#A371F7', '#F85149', '#3F8CB0', '#8B949E'];

export default function FaseModal({ cronogramaId, userId, fase, onClose, onSaved }) {
  const [nome, setNome] = useState(fase?.nome || '');
  const [cor, setCor] = useState(fase?.cor || CORES[0]);
  const [peso, setPeso] = useState(fase?.peso || '');
  const [ordem, setOrdem] = useState(fase?.ordem ?? 0);
  const [dataInicio, setDataInicio] = useState(fase?.data_inicio || '');
  const [dataPrazo, setDataPrazo] = useState(fase?.data_prazo || '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSaving(true);
    const payload = {
      cronograma_id: cronogramaId,
      user_id: userId,
      nome,
      cor,
      peso: peso || null,
      ordem: Number(ordem) || 0,
      data_inicio: dataInicio || null,
      data_prazo: dataPrazo || null,
    };
    const { error } = fase
      ? await supabase.from('fases').update(payload).eq('id', fase.id)
      : await supabase.from('fases').insert(payload);
    setSaving(false);
    if (error) { setErro(error.message); return; }
    onSaved(); onClose();
  }

  async function excluir() {
    if (!confirm('Excluir esta fase? As tarefas ligadas a ela ficam sem fase (não são apagadas).')) return;
    await supabase.from('fases').delete().eq('id', fase.id);
    onSaved(); onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>{fase ? 'Editar fase' : 'Nova fase'}</h3>

        <input type="text" placeholder="Nome da fase" value={nome} onChange={(e) => setNome(e.target.value)} required />

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Cor</div>
          <div style={{ display: 'flex', gap: 6 }}>
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

        <input type="text" placeholder="Peso (opcional, ex: 25-30%)" value={peso} onChange={(e) => setPeso(e.target.value)} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Ordem</div>
            <input type="text" inputMode="numeric" value={ordem} onChange={(e) => setOrdem(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Início (Timeline)</div>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Prazo (Timeline)</div>
            <input type="date" value={dataPrazo} onChange={(e) => setDataPrazo(e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          {fase && <button className="btn" type="button" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={excluir}>Excluir</button>}
        </div>
      </form>
    </div>
  );
}
