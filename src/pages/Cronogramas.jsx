import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';

const CORES = ['#F2C811', '#2F81F7', '#238636', '#A371F7', '#F85149', '#3F8CB0'];

export default function Cronogramas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cronogramas, setCronogramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [dataAlvo, setDataAlvo] = useState('');
  const [cor, setCor] = useState(CORES[0]);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from('cronogramas')
      .select('*, fases(id)')
      .eq('ativo', true)
      .order('created_at', { ascending: true });
    if (!error) setCronogramas(data);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function criarCronograma(e) {
    e.preventDefault();
    const { error } = await supabase.from('cronogramas').insert({
      user_id: user.id,
      nome,
      cor,
      data_final: dataAlvo || null,
    });
    if (!error) {
      setNome(''); setDataAlvo(''); setShowForm(false);
      carregar();
    }
  }

  async function excluirCronograma(e, id) {
    e.stopPropagation();
    if (!confirm('Excluir este cronograma? Todas as fases e tarefas ligadas a ele também serão apagadas. Essa ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('cronogramas').delete().eq('id', id);
    if (!error) carregar();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Cronogramas</h2>
        <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancelar' : '+ Novo cronograma'}
        </button>
      </div>

      {showForm && (
        <form className="card" onSubmit={criarCronograma} style={{ marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Nome</div>
            <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex: PL-300" />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Data alvo (opcional)</div>
            <input type="date" value={dataAlvo} onChange={(e) => setDataAlvo(e.target.value)} />
          </div>
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
          <button className="btn btn-primary" type="submit">Criar</button>
        </form>
      )}

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : cronogramas.length === 0 ? (
        <div className="empty-state">Nenhum cronograma ainda. Crie o primeiro acima.</div>
      ) : (
        <div className="cronograma-list">
          {cronogramas.map((c) => (
            <div key={c.id} className="card cronograma-item" onClick={() => navigate(`/cronogramas/${c.id}`)}>
              <span className="dot" style={{ background: c.cor }} />
              <div style={{ flex: 1 }}>
                <div className="name">{c.nome}</div>
                <div className="meta">
                  {c.fases?.length || 0} fase(s)
                  {c.data_final ? ` · alvo: ${new Date(c.data_final + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                </div>
              </div>
              <button
                className="btn"
                style={{ color: 'var(--danger)', flexShrink: 0 }}
                title="Excluir cronograma"
                onClick={(e) => excluirCronograma(e, c.id)}
              >
                Excluir
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
