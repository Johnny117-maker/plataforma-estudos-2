import { useState } from 'react';
import { supabase } from '../supabaseClient';

const CORES = ['#F2C811', '#2F81F7', '#238636', '#A371F7', '#F85149', '#3F8CB0', '#8B949E'];

// cronogramaIdFixo: quando informado (ex: dentro da tela de um cronograma),
// esconde o seletor de cronograma e associa a data automaticamente a ele.
// dataInicial: opcional, só usada quando `dataImportante` não é passada
// (criação), pra pré-preencher a data quando ela é criada a partir do dia
// clicado no calendário.
export default function DataImportanteModal({
  userId,
  cronogramas = [],
  dataImportante,
  cronogramaIdFixo,
  dataInicial = '',
  onClose,
  onSaved,
}) {
  const [titulo, setTitulo] = useState(dataImportante?.titulo || '');
  const [data, setData] = useState(dataImportante?.data || dataInicial || '');
  const [cronogramaId, setCronogramaId] = useState(
    dataImportante?.cronograma_id || cronogramaIdFixo || ''
  );
  const [cor, setCor] = useState(dataImportante?.cor || CORES[0]);
  const [observacao, setObservacao] = useState(dataImportante?.observacao || '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    if (!titulo.trim() || !data) {
      setErro('Preencha título e data.');
      return;
    }
    setSaving(true);
    const payload = {
      user_id: userId,
      titulo: titulo.trim(),
      data,
      cronograma_id: cronogramaId || null,
      cor,
      observacao: observacao.trim() || null,
    };
    const { error } = dataImportante
      ? await supabase.from('datas_importantes').update(payload).eq('id', dataImportante.id)
      : await supabase.from('datas_importantes').insert(payload);
    setSaving(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function excluir() {
    if (!confirm('Excluir esta data importante?')) return;
    await supabase.from('datas_importantes').delete().eq('id', dataImportante.id);
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>
          {dataImportante ? 'Editar data importante' : 'Nova data importante'}
        </h3>

        <input
          type="text"
          placeholder="Ex: Prova 1ª fase UNICAMP"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
        />

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Data</div>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            required
            style={{ width: '100%' }}
          />
        </div>

        {!cronogramaIdFixo && (
          <select value={cronogramaId} onChange={(e) => setCronogramaId(e.target.value)}>
            <option value="">Nenhum cronograma (data global)</option>
            {cronogramas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        )}

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

        <textarea
          placeholder="Observação (opcional)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          style={{ width: '100%', resize: 'vertical' }}
        />

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          {dataImportante && (
            <button
              className="btn"
              type="button"
              style={{ marginLeft: 'auto', color: 'var(--danger)' }}
              onClick={excluir}
            >
              Excluir
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
