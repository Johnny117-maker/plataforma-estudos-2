import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import PerguntaModal from '../components/PerguntaModal.jsx';
import Quiz from '../components/Quiz.jsx';
import { importarQuestaoExemplo } from '../lib/perguntasSeedExemplo';

const DIFICULDADE_LABEL = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' };

export default function Perguntas() {
  const { user } = useAuth();
  const [materias, setMaterias] = useState([]);
  const [perguntas, setPerguntas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalPergunta, setModalPergunta] = useState(undefined);
  const [mensagem, setMensagem] = useState('');

  const [filtroMateria, setFiltroMateria] = useState('');
  const [filtroSubgenero, setFiltroSubgenero] = useState('');

  const [quizAtivo, setQuizAtivo] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: mData }, { data: pData }] = await Promise.all([
      supabase.from('materias').select('*, subgeneros(*)').order('ordem', { ascending: true }),
      supabase.from('perguntas').select('*').order('created_at', { ascending: false }),
    ]);
    setMaterias(mData || []);
    setPerguntas(pData || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const materiasById = Object.fromEntries(materias.map((m) => [m.id, m]));
  const subgenerosById = {};
  materias.forEach((m) => (m.subgeneros || []).forEach((s) => { subgenerosById[s.id] = s; }));

  const subgenerosDoFiltro = materias.find((m) => m.id === filtroMateria)?.subgeneros || [];

  const perguntasFiltradas = perguntas.filter((p) => {
    if (filtroMateria && p.materia_id !== filtroMateria) return false;
    if (filtroSubgenero && p.subgenero_id !== filtroSubgenero) return false;
    return true;
  });

  async function importarExemplo() {
    const r = await importarQuestaoExemplo(user.id);
    setMensagem(r.ok ? 'Questão de exemplo importada.' : r.erro);
    if (r.ok) carregar();
  }

  if (loading) return <div className="empty-state">Carregando…</div>;

  if (materias.length === 0) {
    return (
      <div className="empty-state">
        Crie suas matérias primeiro, na aba "Matérias e Assuntos".
      </div>
    );
  }

  if (quizAtivo) {
    return (
      <div>
        <button className="btn" style={{ marginBottom: 16 }} onClick={() => setQuizAtivo(false)}>← Sair do quiz</button>
        <Quiz perguntas={perguntasFiltradas} userId={user.id} onSair={() => setQuizAtivo(false)} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Perguntas e Respostas</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={importarExemplo}>Importar questão de exemplo</button>
          <button className="btn btn-primary" onClick={() => setModalPergunta(null)}>+ Nova pergunta</button>
        </div>
      </div>

      {mensagem && <div style={{ fontSize: 12.5, color: 'var(--gold)', marginBottom: 14 }}>{mensagem}</div>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={filtroMateria} onChange={(e) => { setFiltroMateria(e.target.value); setFiltroSubgenero(''); }}>
          <option value="">Todas as matérias</option>
          {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        {filtroMateria && (
          <select value={filtroSubgenero} onChange={(e) => setFiltroSubgenero(e.target.value)}>
            <option value="">Todos os assuntos</option>
            {subgenerosDoFiltro.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        )}
        <button className="btn btn-primary" disabled={perguntasFiltradas.length === 0} onClick={() => setQuizAtivo(true)}>
          Praticar ({perguntasFiltradas.length})
        </button>
      </div>

      {perguntasFiltradas.length === 0 ? (
        <div className="empty-state">Nenhuma pergunta ainda pra esse filtro.</div>
      ) : (
        <div className="card">
          {perguntasFiltradas.map((p) => (
            <div key={p.id} className="list-row" style={{ cursor: 'pointer', alignItems: 'flex-start' }} onClick={() => setModalPergunta(p)}>
              <span
                style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: materiasById[p.materia_id]?.cor || 'var(--muted)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5 }}>{p.enunciado}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {materiasById[p.materia_id]?.nome}
                  {subgenerosById[p.subgenero_id] ? ` · ${subgenerosById[p.subgenero_id].nome}` : ''}
                  {' · '}{DIFICULDADE_LABEL[p.dificuldade]}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalPergunta !== undefined && (
        <PerguntaModal
          materias={materias}
          userId={user.id}
          pergunta={modalPergunta}
          onClose={() => setModalPergunta(undefined)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
