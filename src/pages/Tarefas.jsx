import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import ListView from '../components/ListView.jsx';
import KanbanView from '../components/KanbanView.jsx';
import GeneralTaskModal from '../components/GeneralTaskModal.jsx';

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Tarefas() {
  const { user } = useAuth();
  const [cronogramas, setCronogramas] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState('hoje');
  const [modalTarefa, setModalTarefa] = useState(undefined);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: cData }, { data: tData }, { data: mData }] = await Promise.all([
      supabase.from('cronogramas').select('*, fases(*)').eq('ativo', true),
      supabase.from('tarefas').select('*').order('data_prazo', { ascending: true, nullsFirst: false }),
      supabase.from('materias').select('*').order('ordem', { ascending: true }),
    ]);
    setCronogramas(cData || []);
    setTarefas(tData || []);
    setMaterias(mData || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const fasesById = {};
  const cronogramasById = {};
  cronogramas.forEach((c) => {
    cronogramasById[c.id] = c;
    (c.fases || []).forEach((f) => { fasesById[f.id] = f; });
  });
  const materiasById = Object.fromEntries(materias.map((m) => [m.id, m]));

  const hoje = hojeISO();
  const atrasadas = tarefas.filter((t) => t.status !== 'concluido' && t.data_prazo && t.data_prazo < hoje);
  const deHoje = tarefas.filter((t) => t.status !== 'concluido' && t.data_prazo === hoje);

  function nomeContexto(t) {
    const cronograma = cronogramasById[t.cronograma_id];
    const fase = fasesById[t.fase_id];
    const materia = materiasById[t.materia_id];
    const partes = [materia?.nome, cronograma?.nome, fase?.nome].filter(Boolean);
    return partes.length ? partes.join(' · ') : 'Avulsa';
  }

  if (loading) return <div className="empty-state">Carregando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Tarefas</h2>
        <button className="btn btn-primary" onClick={() => setModalTarefa(null)}>+ Nova tarefa</button>
      </div>

      <div className="tabbar">
        <button className={'tab-btn' + (aba === 'hoje' ? ' active' : '')} onClick={() => setAba('hoje')}>Hoje</button>
        <button className={'tab-btn' + (aba === 'lista' ? ' active' : '')} onClick={() => setAba('lista')}>Lista</button>
        <button className={'tab-btn' + (aba === 'kanban' ? ' active' : '')} onClick={() => setAba('kanban')}>Kanban</button>
      </div>

      {aba === 'hoje' && (
        <div>
          {atrasadas.length === 0 && deHoje.length === 0 && (
            <div className="empty-state">Nada atrasado e nada pra hoje. 🎉</div>
          )}

          {atrasadas.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 10 }}>Atrasadas ({atrasadas.length})</h3>
              <div className="card">
                {atrasadas.map((t) => (
                  <div key={t.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => setModalTarefa(t)}>
                    <span style={{ flex: 1 }}>{t.titulo}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{nomeContexto(t)}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--danger)', minWidth: 70, textAlign: 'right' }}>
                      {new Date(t.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {deHoje.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, color: 'var(--gold)', marginBottom: 10 }}>Hoje ({deHoje.length})</h3>
              <div className="card">
                {deHoje.map((t) => (
                  <div key={t.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => setModalTarefa(t)}>
                    <span style={{ flex: 1 }}>{t.titulo}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{nomeContexto(t)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {aba === 'lista' && <ListView tarefas={tarefas} fasesById={fasesById} materiasById={materiasById} onEdit={setModalTarefa} />}
      {aba === 'kanban' && <KanbanView tarefas={tarefas} fasesById={fasesById} materiasById={materiasById} onEdit={setModalTarefa} onChanged={carregar} />}

      {modalTarefa !== undefined && (
        <GeneralTaskModal
          cronogramas={cronogramas}
          materias={materias}
          userId={user.id}
          tarefa={modalTarefa}
          onClose={() => setModalTarefa(undefined)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
