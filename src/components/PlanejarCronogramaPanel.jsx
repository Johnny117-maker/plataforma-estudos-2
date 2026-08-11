import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { planejarCronograma, planoParaCronograma } from '../lib/planejadorCronograma';
import { criarCronogramaCompleto } from '../lib/transactionService';

const CORES = ['#C9963F', '#4FB6AE', '#A371F7', '#2F81F7', '#5B6B3F', '#D96C82'];

function hoje() { return new Date().toISOString().slice(0, 10); }

export default function PlanejarCronogramaPanel({ documentosSelecionados, frequencias, materias, nomeSugerido }) {
  const navigate = useNavigate();
  const [nome, setNome] = useState(nomeSugerido || 'Cronograma das provas');
  const [cor, setCor] = useState(CORES[0]);
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFinal, setDataFinal] = useState('');
  const [horas, setHoras] = useState('2');
  const [usarIA, setUsarIA] = useState(true);

  const [plano, setPlano] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState('');

  const pronto = Boolean(dataInicio && dataFinal && Number(horas) > 0 && frequencias.length);

  async function gerar() {
    setErro('');
    setPlano(null);
    setOcupado(true);
    try {
      const resultado = await planejarCronograma({
        documentosSelecionados,
        frequencias,
        dataInicio,
        dataFinal,
        horasPorDia: Number(horas),
        materias,
        usarIA,
        onProgresso: setProgresso,
      });
      setPlano(resultado);
    } catch (error) {
      setErro(error.message);
    } finally {
      setOcupado(false);
      setProgresso('');
    }
  }

  async function confirmar() {
    setErro('');
    setOcupado(true);
    setProgresso('Criando o cronograma…');
    try {
      const payload = planoParaCronograma(plano, {
        nome, cor, dataFinal, horasPorDia: Number(horas),
      });
      const id = await criarCronogramaCompleto(payload);
      navigate(`/cronogramas/${id}`);
    } catch (error) {
      setErro(error.message);
      setOcupado(false);
      setProgresso('');
    }
  }

  return (
    <div className="card schedule-generator">
      <h3>Cronograma personalizado a partir das provas</h3>
      <p className="page-description" style={{ marginBottom: 14 }}>
        O plano é montado a partir do que estas provas cobraram: os assuntos mais recorrentes
        recebem mais tempo, a ordem respeita pré-requisitos e os tópicos de maior carga voltam
        como revisão no último terço do período.
      </p>

      <div className="responsive-form-row" style={{ marginBottom: 10 }}>
        <label style={{ flex: 2 }}>
          Nome
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cronograma" />
        </label>
        <label>
          Início
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </label>
        <label>
          Fim
          <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} />
        </label>
        <label>
          Horas/dia
          <input type="number" min="0.5" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} />
        </label>
      </div>

      <div className="button-row wrap compact-row" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {CORES.map((c) => (
            <div
              key={c}
              onClick={() => setCor(c)}
              style={{
                width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                outline: cor === c ? '2px solid var(--text)' : 'none', outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <label className="selection-label" style={{ marginLeft: 'auto' }}>
          <input type="checkbox" checked={usarIA} onChange={(e) => setUsarIA(e.target.checked)} />
          <span><small>Usar IA para ordenar e detalhar os tópicos</small></span>
        </label>
      </div>

      {!frequencias.length && (
        <p className="selection-help">Selecione e classifique conteúdos para liberar o planejamento.</p>
      )}

      <div className="button-row wrap" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" type="button" onClick={gerar} disabled={!pronto || ocupado}>
          {plano ? 'Refazer plano' : 'Montar plano'}
        </button>
        {plano && (
          <button className="btn" type="button" onClick={confirmar} disabled={ocupado}>
            Criar este cronograma
          </button>
        )}
      </div>

      {ocupado && <div className="empty-state">{progresso || 'Processando…'}</div>}
      {erro && <div className="form-error">{erro}</div>}

      {plano && (
        <div style={{ marginTop: 16 }}>
          <div className="stats-grid">
            <div className="card"><strong>{plano.fases.length}</strong><span>fases</span></div>
            <div className="card"><strong>{plano.totalTarefas}</strong><span>tarefas</span></div>
            <div className="card"><strong>{plano.horasTotais}h</strong><span>de {plano.horasDisponiveis}h disponíveis</span></div>
            <div className="card"><strong>{plano.contexto.dias}</strong><span>dias</span></div>
          </div>

          {plano.aviso && <p className="selection-help">{plano.aviso}</p>}
          {plano.origem === 'deterministico' && !plano.aviso && (
            <p className="selection-help">
              Plano gerado só pela recorrência dos assuntos, sem IA. Ele não conhece pré-requisitos
              nem quebra assunto em subtópicos.
            </p>
          )}

          <div className="document-review-list">
            {plano.fases.map((fase) => (
              <article className="card document-review" key={`${fase.ordem}-${fase.nome}`}>
                <div className="document-review-header">
                  <span className="selection-label">
                    <span
                      className="dot"
                      style={{ width: 10, height: 10, borderRadius: '50%', background: fase.cor, marginTop: 5 }}
                    />
                    <span>
                      <strong>{fase.nome}</strong>
                      {fase.descricao && <small>{fase.descricao}</small>}
                      <small>
                        {fase.tarefas.length} tarefa(s) ·{' '}
                        {fase.tarefas.reduce((s, t) => s + t.horas_estimadas, 0)}h ·{' '}
                        {fase.data_inicio} a {fase.data_prazo}
                      </small>
                    </span>
                  </span>
                </div>

                <details className="content-review">
                  <summary>Ver tarefas</summary>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr><th>Tarefa</th><th>Por quê</th><th>Prazo</th><th>Horas</th></tr>
                      </thead>
                      <tbody>
                        {fase.tarefas.map((tarefa, i) => (
                          <tr key={`${tarefa.titulo}-${i}`}>
                            <td>{tarefa.titulo}</td>
                            <td style={{ color: 'var(--muted)', fontSize: 12 }}>{tarefa.descricao || '—'}</td>
                            <td>{tarefa.data_prazo}</td>
                            <td>{tarefa.horas_estimadas}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}