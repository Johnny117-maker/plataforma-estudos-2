import { useState } from 'react';
import { supabase } from '../supabaseClient';

const CATEGORIAS = [
  { valor: 'estudos', label: 'Estudos' },
  { valor: 'tarefas', label: 'Tarefas' },
  { valor: 'viagem', label: 'Viagem' },
  { valor: 'projeto', label: 'Projeto' },
  { valor: 'outro', label: 'Outro' },
];

// Só essas categorias têm data final e horas por dia (fazem sentido de
// serem organizadas "até um prazo"; Tarefas e Outro ficam livres).
const CATEGORIAS_COM_PRAZO = ['estudos', 'viagem', 'projeto', 'tarefas'];

export default function ConfigurarCronogramaModal({ cronograma, onClose, onSaved }) {
  const [categoria, setCategoria] = useState(cronograma.categoria || 'estudos');
  const [dataFinal, setDataFinal] = useState(cronograma.data_final || '');
  const [horasPorDia, setHorasPorDia] = useState(cronograma.horas_por_dia ?? '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const temPrazo = CATEGORIAS_COM_PRAZO.includes(categoria);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSaving(true);
    const { error } = await supabase
      .from('cronogramas')
      .update({
        categoria,
        data_final: temPrazo ? (dataFinal || null) : null,
        horas_por_dia: temPrazo && horasPorDia !== '' ? Number(horasPorDia) : null,
      })
      .eq('id', cronograma.id);
    setSaving(false);
    if (error) { setErro(error.message); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Configurar cronograma</h3>

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Categoria</div>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>{c.label}</option>
            ))}
          </select>
        </div>

        {temPrazo && (
          <>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                Data final {categoria === 'estudos' ? '(prova, prazo do vestibular...)' : categoria === 'viagem' ? '(data da viagem)' : '(entrega do projeto)'}
              </div>
              <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                Horas disponíveis por dia (opcional)
              </div>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="Ex: 2"
                value={horasPorDia}
                onChange={(e) => setHorasPorDia(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}

        {!temPrazo && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            Essa categoria não usa data final nem horas por dia — fica livre, sem prazo fixo.
          </div>
        )}

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
