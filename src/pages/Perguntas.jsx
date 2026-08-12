import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import PerguntaModal from '../components/PerguntaModal.jsx';
import Quiz from '../components/Quiz.jsx';
import { importarQuestaoExemplo } from '../lib/perguntasSeedExemplo';
import { embaralharQuestoes } from '../lib/bancoQuestoes';
import { concluirTesteBanco, criarTesteBanco } from '../lib/transactionService';

const DIFICULDADE_LABEL = { facil: 'Fácil', media: 'Média', dificil: 'Difícil' };

export default function Perguntas() {
  const { user } = useAuth();
  const [materias, setMaterias] = useState([]);
  const [perguntas, setPerguntas] = useState([]);
  const [provas, setProvas] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalPergunta, setModalPergunta] = useState(undefined);
  const [mensagem, setMensagem] = useState('');

  const [filtroMateria, setFiltroMateria] = useState('');
  const [filtroSubgenero, setFiltroSubgenero] = useState('');
  const [filtroProva, setFiltroProva] = useState('');
  const [quantidadeTeste, setQuantidadeTeste] = useState(20);
  const [estrategiaTeste, setEstrategiaTeste] = useState('aleatorio');

  const [quizAtivo, setQuizAtivo] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: mData }, { data: pData }, { data: provasData }, { data: historicoData }] = await Promise.all([
      supabase.from('materias').select('*, subgeneros(*)').order('ordem', { ascending: true }),
      supabase.from('perguntas').select('*').order('created_at', { ascending: false }),
      supabase.from('provas_banco').select('id,titulo,instituicao,ano,semestre,status,questoes_publicadas').order('created_at', { ascending: false }),
      supabase.from('historico_respostas').select('pergunta_id,correta').order('respondido_em', { ascending: false }).limit(5000),
    ]);
    setMaterias(mData || []);
    setPerguntas(pData || []);
    setProvas(provasData || []);
    setHistorico(historicoData || []);
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
    if (filtroProva && p.prova_id !== filtroProva) return false;
    return true;
  });

  async function iniciarTeste() {
    setMensagem('');
    const selecionadas = embaralharQuestoes(perguntasFiltradas, historico, estrategiaTeste, quantidadeTeste);
    if (!selecionadas.length) return;
    try {
      const titulo = filtroProva
        ? `Simulado — ${provas.find((prova) => prova.id === filtroProva)?.titulo || 'prova selecionada'}`
        : 'Teste do banco de questões';
      const testeId = await criarTesteBanco(titulo, selecionadas, {
        estrategia: estrategiaTeste,
        materia_id: filtroMateria || null,
        subgenero_id: filtroSubgenero || null,
        prova_id: filtroProva || null,
      });
      setQuizAtivo({ id: testeId, perguntas: selecionadas });
    } catch (error) {
      setMensagem(`Não foi possível criar o teste: ${error.message}`);
    }
  }

  async function finalizarTeste() {
    if (!quizAtivo?.id) return;
    try {
      await concluirTesteBanco(quizAtivo.id);
      setMensagem('Teste concluído e desempenho salvo.');
      await carregar();
    } catch (error) {
      setMensagem(`O resultado local foi concluído, mas o resumo não pôde ser salvo: ${error.message}`);
    }
  }

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
        <button className="btn" style={{ marginBottom: 16 }} onClick={() => setQuizAtivo(null)}>← Sair do quiz</button>
        <Quiz
          perguntas={quizAtivo.perguntas}
          userId={user.id}
          testeId={quizAtivo.id}
          onFinalizar={finalizarTeste}
          onSair={() => setQuizAtivo(null)}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Banco de questões e simulados</h2>
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
        {provas.length > 0 && (
          <select value={filtroProva} onChange={(e) => setFiltroProva(e.target.value)}>
            <option value="">Todas as provas</option>
            {provas.map((prova) => (
              <option key={prova.id} value={prova.id}>{prova.titulo}</option>
            ))}
          </select>
        )}
        <select value={estrategiaTeste} onChange={(e) => setEstrategiaTeste(e.target.value)} aria-label="Prioridade do teste">
          <option value="aleatorio">Misturar questões</option>
          <option value="mais_erradas">Priorizar meus erros</option>
          <option value="nao_respondidas">Priorizar não respondidas</option>
        </select>
        <input
          type="number"
          min="1"
          max={Math.max(1, perguntasFiltradas.length)}
          value={quantidadeTeste}
          onChange={(e) => setQuantidadeTeste(e.target.value)}
          aria-label="Quantidade de questões"
          style={{ width: 96 }}
        />
        <button className="btn btn-primary" disabled={perguntasFiltradas.length === 0} onClick={iniciarTeste}>
          Gerar teste ({Math.min(Number(quantidadeTeste) || 20, perguntasFiltradas.length)})
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
                  {p.numero_original ? ` · questão ${p.numero_original}` : ''}
                  {p.fonte ? ` · ${p.fonte}` : ''}
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
