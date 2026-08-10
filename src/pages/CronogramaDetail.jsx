import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import ListView from '../components/ListView.jsx';
import KanbanView from '../components/KanbanView.jsx';
import CalendarView from '../components/CalendarView.jsx';
import TimelineView from '../components/TimelineView.jsx';
import TaskModal from '../components/TaskModal.jsx';
import FaseModal from '../components/FaseModal.jsx';
import DataImportanteModal from '../components/DataImportanteModal.jsx';
import DuplicarCronogramaModal from '../components/DuplicarCronogramaModal.jsx';
import RenomearCronogramaModal from '../components/RenomearCronogramaModal.jsx';
import DayModal from '../components/DayModal.jsx';
import ReorganizarIAModal from '../components/ReorganizarIAModal.jsx';
import ConfigurarCronogramaModal from '../components/ConfigurarCronogramaModal.jsx';

const ABAS = [
  { key: 'lista', label: 'Lista' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'calendario', label: 'Calendário' },
  { key: 'timeline', label: 'Timeline' },
];

const CATEGORIA_LABEL = {
  estudos: 'Estudos',
  tarefas: 'Tarefas',
  viagem: 'Viagem',
  projeto: 'Projeto',
  outro: 'Outro',
};

function diasAte(dataStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataStr + 'T00:00:00');
  return Math.round((alvo - hoje) / 86400000);
}

export default function CronogramaDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cronograma, setCronograma] = useState(null);
  const [fases, setFases] = useState([]);
  const [tarefas, setTarefas] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [datasImportantes, setDatasImportantes] = useState([]);
  const [aba, setAba] = useState('lista');
  const [loading, setLoading] = useState(true);
  const [modalTarefa, setModalTarefa] = useState(undefined); // undefined = fechado, null = nova, objeto = editar
  const [modalFase, setModalFase] = useState(undefined);
  const [modalDataImportante, setModalDataImportante] = useState(undefined);
  const [modalDuplicar, setModalDuplicar] = useState(false);
  const [modalRenomear, setModalRenomear] = useState(false);
  const [modalReorganizarIA, setModalReorganizarIA] = useState(false);
  const [modalConfigurar, setModalConfigurar] = useState(false);
  const [filtroMateria, setFiltroMateria] = useState('');
  const [filtroFase, setFiltroFase] = useState('');
  const [mostrarFases, setMostrarFases] = useState(false);
  const [mostrarDatas, setMostrarDatas] = useState(false);

  // dia clicado no calendário (string 'YYYY-MM-DD') ou null se fechado
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  // usados só pra pré-preencher a data quando "+ Nova tarefa"/"+ Nova data"
  // são abertos a partir do dia clicado
  const [tarefaDataInicial, setTarefaDataInicial] = useState('');
  const [dataImportanteDataInicial, setDataImportanteDataInicial] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: cData }, { data: fData }, { data: tData }, { data: mData }, { data: dData }] = await Promise.all([
      supabase.from('cronogramas').select('*').eq('id', id).single(),
      supabase.from('fases').select('*').eq('cronograma_id', id).order('ordem', { ascending: true }),
      supabase.from('tarefas').select('*').eq('cronograma_id', id).order('ordem', { ascending: true }),
      supabase.from('materias').select('*').order('ordem', { ascending: true }),
      supabase.from('datas_importantes').select('*').eq('cronograma_id', id).order('data', { ascending: true }),
    ]);
    setCronograma(cData);
    setFases(fData || []);
    setTarefas(tData || []);
    setMaterias(mData || []);
    setDatasImportantes(dData || []);
    setLoading(false);
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function excluirCronograma() {
    if (!confirm('Excluir este cronograma? Todas as fases e tarefas ligadas a ele também serão apagadas. Essa ação não pode ser desfeita.')) return;
    const { error } = await supabase.from('cronogramas').delete().eq('id', id);
    if (!error) navigate('/');
  }

  function abrirNovaTarefa(dataPrazo = '') {
    setTarefaDataInicial(dataPrazo);
    setModalTarefa(null);
  }

  function abrirNovaData(dataInicial = '') {
    setDataImportanteDataInicial(dataInicial);
    setModalDataImportante(null);
  }

  async function excluirTarefaRapida(t) {
    if (!confirm(`Excluir "${t.titulo}"?`)) return;
    await supabase.from('tarefas').delete().eq('id', t.id);
    carregar();
  }

  async function excluirDataRapida(d) {
    if (!confirm(`Excluir "${d.titulo}"?`)) return;
    await supabase.from('datas_importantes').delete().eq('id', d.id);
    carregar();
  }

  if (loading) return <div className="empty-state">Carregando…</div>;
  if (!cronograma) return <div className="empty-state">Cronograma não encontrado.</div>;

  const fasesById = Object.fromEntries(fases.map((f) => [f.id, f]));
  const materiasById = Object.fromEntries(materias.map((m) => [m.id, m]));
  const total = tarefas.length;
  const concluidas = tarefas.filter((t) => t.status === 'concluido').length;
  const pct = total ? Math.round((concluidas / total) * 100) : 0;

  const filtrosAtivos = Boolean(filtroMateria || filtroFase);
  const tarefasFiltradas = tarefas.filter((t) => (
    (!filtroMateria || t.materia_id === filtroMateria)
    && (!filtroFase || t.fase_id === filtroFase)
  ));
  // matérias que de fato aparecem em alguma tarefa deste cronograma, pra não
  // mostrar opções de filtro vazias
  const materiaIdsPresentes = new Set(tarefas.map((t) => t.materia_id).filter(Boolean));
  const materiasDoCronograma = materias.filter((m) => materiaIdsPresentes.has(m.id));
  // no Timeline, se filtrar por matéria, só mostra fases que têm ao menos
  // uma tarefa daquela matéria
  const fasesFiltradas = fases.filter((f) => (
    (!filtroFase || f.id === filtroFase)
    && (!filtroMateria || tarefas.some((t) => t.fase_id === f.id && t.materia_id === filtroMateria))
  ));

  const tarefasDoDia = diaSelecionado ? tarefasFiltradas.filter((t) => t.data_prazo === diaSelecionado) : [];
  const datasDoDia = diaSelecionado ? datasImportantes.filter((d) => d.data === diaSelecionado) : [];

  return (
    <div>
      <Link to="/" style={{ fontSize: 12, color: 'var(--muted)' }}>← Cronogramas</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ color: cronograma.cor }}>{cronograma.nome}</h2>
          <button
            className="btn"
            title="Renomear cronograma"
            style={{ padding: '2px 8px', fontSize: 12 }}
            onClick={() => setModalRenomear(true)}
          >
            ✎
          </button>
          <span
            className="btn"
            style={{ padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
            title="Configurar categoria, prazo e horas por dia"
            onClick={() => setModalConfigurar(true)}
          >
            {CATEGORIA_LABEL[cronograma.categoria] || 'Estudos'}
            {cronograma.data_final && ` · até ${new Date(cronograma.data_final + 'T00:00:00').toLocaleDateString('pt-BR')}`}
            {cronograma.data_final && ` (${diasAte(cronograma.data_final)}d)`}
            {cronograma.horas_por_dia ? ` · ${cronograma.horas_por_dia}h/dia` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => abrirNovaTarefa()}>+ Nova tarefa</button>
          <button className="btn" onClick={() => abrirNovaData()}>+ Nova data</button>
          <button className="btn" onClick={() => setModalDuplicar(true)}>Duplicar cronograma</button>
          <button className="btn" onClick={() => setModalReorganizarIA(true)}>Reorganizar com IA</button>
          <button className="btn" style={{ color: 'var(--danger)' }} onClick={excluirCronograma}>Excluir cronograma</button>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        {concluidas} de {total} tarefas concluídas ({pct}%)
      </div>

      <div style={{ marginBottom: 18 }}>
        <button className="btn" onClick={() => setMostrarFases((v) => !v)}>
          {mostrarFases ? 'Ocultar fases' : `Gerenciar fases (${fases.length})`}
        </button>
        {mostrarFases && (
          <div className="card" style={{ marginTop: 10 }}>
            {fases.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>Nenhuma fase ainda.</div>}
            {fases.map((f) => (
              <div key={f.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => setModalFase(f)}>
                <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: f.cor, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{f.nome}</span>
                {f.peso && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{f.peso}</span>}
                <span style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 130, textAlign: 'right' }}>
                  {f.data_inicio && f.data_prazo
                    ? `${new Date(f.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')} → ${new Date(f.data_prazo + 'T00:00:00').toLocaleDateString('pt-BR')}`
                    : 'sem datas'}
                </span>
              </div>
            ))}
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => setModalFase(null)}>+ Nova fase</button>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 18 }}>
        <button className="btn" onClick={() => setMostrarDatas((v) => !v)}>
          {mostrarDatas ? 'Ocultar datas importantes' : `Datas importantes (${datasImportantes.length})`}
        </button>
        {mostrarDatas && (
          <div className="card" style={{ marginTop: 10 }}>
            {datasImportantes.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>Nenhuma data importante ainda.</div>
            )}
            {datasImportantes.map((d) => (
              <div key={d.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => setModalDataImportante(d)}>
                <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: d.cor || '#F2C811', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{'\u{1F6A9}'} {d.titulo}</span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 90, textAlign: 'right' }}>
                  {new Date(d.data + 'T00:00:00').toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))}
            <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={() => abrirNovaData()}>+ Nova data</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todas as matérias</option>
          {materiasDoCronograma.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <select value={filtroFase} onChange={(e) => setFiltroFase(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todas as fases</option>
          {fases.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        {filtrosAtivos && (
          <>
            <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {tarefasFiltradas.length} de {tarefas.length} tarefas
            </span>
            <button className="btn" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => { setFiltroMateria(''); setFiltroFase(''); }}>
              Limpar filtros
            </button>
          </>
        )}
      </div>

      <div className="tabbar">
        {ABAS.map((a) => (
          <button key={a.key} className={'tab-btn' + (aba === a.key ? ' active' : '')} onClick={() => setAba(a.key)}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'lista' && <ListView tarefas={tarefasFiltradas} fasesById={fasesById} materiasById={materiasById} onEdit={setModalTarefa} />}
      {aba === 'kanban' && <KanbanView tarefas={tarefasFiltradas} fasesById={fasesById} materiasById={materiasById} onEdit={setModalTarefa} onChanged={carregar} />}
      {aba === 'calendario' && (
        <CalendarView
          tarefas={tarefasFiltradas}
          materiasById={materiasById}
          datasImportantes={datasImportantes}
          horasPorDia={cronograma.horas_por_dia}
          onEdit={setModalTarefa}
          onEditData={setModalDataImportante}
          onDayClick={setDiaSelecionado}
          onChanged={carregar}
        />
      )}
      {aba === 'timeline' && <TimelineView fases={fasesFiltradas} datasImportantes={datasImportantes} />}

      {diaSelecionado && (
        <DayModal
          data={diaSelecionado}
          tarefas={tarefasDoDia}
          datasImportantes={datasDoDia}
          materiasById={materiasById}
          horasPorDia={cronograma.horas_por_dia}
          onEditTarefa={(t) => { setDiaSelecionado(null); setModalTarefa(t); }}
          onEditData={(d) => { setDiaSelecionado(null); setModalDataImportante(d); }}
          onNovaTarefa={() => { const dia = diaSelecionado; setDiaSelecionado(null); abrirNovaTarefa(dia); }}
          onNovaData={() => { const dia = diaSelecionado; setDiaSelecionado(null); abrirNovaData(dia); }}
          onExcluirTarefa={excluirTarefaRapida}
          onExcluirData={excluirDataRapida}
          onClose={() => setDiaSelecionado(null)}
        />
      )}

      {modalTarefa !== undefined && (
        <TaskModal
          cronogramaId={id}
          userId={user.id}
          fases={fases}
          materias={materias}
          tarefa={modalTarefa}
          dataInicial={tarefaDataInicial}
          onClose={() => { setModalTarefa(undefined); setTarefaDataInicial(''); }}
          onSaved={carregar}
        />
      )}

      {modalFase !== undefined && (
        <FaseModal
          cronogramaId={id}
          userId={user.id}
          fase={modalFase}
          onClose={() => setModalFase(undefined)}
          onSaved={carregar}
        />
      )}

      {modalDataImportante !== undefined && (
        <DataImportanteModal
          userId={user.id}
          dataImportante={modalDataImportante}
          cronogramaIdFixo={id}
          dataInicial={dataImportanteDataInicial}
          onClose={() => { setModalDataImportante(undefined); setDataImportanteDataInicial(''); }}
          onSaved={carregar}
        />
      )}

      {modalDuplicar && (
        <DuplicarCronogramaModal
          cronograma={cronograma}
          userId={user.id}
          onClose={() => setModalDuplicar(false)}
        />
      )}

      {modalRenomear && (
        <RenomearCronogramaModal
          cronograma={cronograma}
          onClose={() => setModalRenomear(false)}
          onSaved={carregar}
        />
      )}

      {modalReorganizarIA && (
        <ReorganizarIAModal
          cronograma={cronograma}
          fases={fases}
          tarefas={tarefas}
          onClose={() => setModalReorganizarIA(false)}
          onAplicado={carregar}
        />
      )}

      {modalConfigurar && (
        <ConfigurarCronogramaModal
          cronograma={cronograma}
          onClose={() => setModalConfigurar(false)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
