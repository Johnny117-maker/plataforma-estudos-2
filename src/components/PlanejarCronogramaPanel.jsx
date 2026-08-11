import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  assuntosDasFrequencias,
  calcularPrioridades,
  DIAS_SEMANA,
  DISPONIBILIDADE_PADRAO,
  gerarCronogramaAdaptativo,
  planoParaPayloadAdaptativo,
} from '../lib/cronogramaAdaptativo';
import { criarCronogramaAdaptativo } from '../lib/transactionService';

const ETAPAS = ['Objetivo', 'Disponibilidade', 'Diagnóstico', 'Prévia', 'Confirmação'];
const CORES = ['#C9963F', '#4FB6AE', '#A371F7', '#2F81F7', '#5B6B3F', '#D96C82'];

function hoje() { return new Date().toISOString().slice(0, 10); }
function horas(minutos) { return `${Math.round((minutos / 60) * 10) / 10}h`; }
function formatarData(data) { return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR'); }

export default function PlanejarCronogramaPanel({
  documentosSelecionados, frequencias, materias, nomeSugerido, analiseId,
}) {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState(0);
  const [objetivo, setObjetivo] = useState({
    nome: nomeSugerido || 'Cronograma FATEC',
    objetivo: 'Preparação para o vestibular da FATEC',
    vestibular: 'FATEC',
    data_inicio: hoje(),
    data_prova: '',
    meta_acertos: 48,
    total_questoes: 60,
    cor: CORES[0],
    analise_id: analiseId || null,
  });
  const [disponibilidade, setDisponibilidade] = useState(() => DISPONIBILIDADE_PADRAO.map((d) => ({ ...d })));
  const [assuntos, setAssuntos] = useState(() => assuntosDasFrequencias(frequencias, materias));
  const [plano, setPlano] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const prioridades = useMemo(() => calcularPrioridades(assuntos), [assuntos]);
  const minutosSemanais = disponibilidade.reduce(
    (total, dia) => total + (dia.ativo ? Number(dia.minutos_disponiveis) || 0 : 0), 0,
  );

  function atualizarObjetivo(campo, valor) {
    setObjetivo((atual) => ({ ...atual, [campo]: valor }));
    setPlano(null);
  }

  function atualizarDia(diaSemana, campo, valor) {
    setDisponibilidade((atual) => atual.map((dia) => (
      dia.dia_semana === diaSemana ? { ...dia, [campo]: valor } : dia
    )));
    setPlano(null);
  }

  function atualizarAssunto(indice, campo, valor) {
    setAssuntos((atuais) => atuais.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
    setPlano(null);
  }

  function validarEtapaAtual() {
    if (etapa === 0) {
      if (!objetivo.nome.trim() || !objetivo.objetivo.trim()) return 'Informe o nome e o objetivo.';
      if (!objetivo.data_inicio || !objetivo.data_prova) return 'Informe o início e a data da prova.';
      if (objetivo.data_inicio > objetivo.data_prova) return 'O início deve ser anterior à prova.';
      if (Number(objetivo.meta_acertos) > Number(objetivo.total_questoes)) return 'A meta de acertos não pode superar o total de questões.';
    }
    if (etapa === 1 && minutosSemanais <= 0) return 'Ative ao menos um dia com tempo disponível.';
    if (etapa === 2 && !assuntos.some((item) => item.incluir !== false)) return 'Selecione pelo menos um assunto.';
    return '';
  }

  function gerarPrevia() {
    const resultado = gerarCronogramaAdaptativo({
      objetivo: { ...objetivo, analise_id: analiseId || null },
      disponibilidade,
      assuntos,
      totalProvas: documentosSelecionados.length,
    });
    setPlano(resultado);
    return resultado;
  }

  function avancar() {
    setErro('');
    const mensagem = validarEtapaAtual();
    if (mensagem) { setErro(mensagem); return; }
    try {
      if (etapa === 2) gerarPrevia();
      setEtapa((valor) => Math.min(ETAPAS.length - 1, valor + 1));
    } catch (error) {
      setErro(error.message);
    }
  }

  async function confirmar() {
    setErro('');
    setOcupado(true);
    try {
      const atual = plano || gerarPrevia();
      const id = await criarCronogramaAdaptativo(planoParaPayloadAdaptativo(atual));
      navigate(`/cronogramas/${id}`);
    } catch (error) {
      setErro(error.message);
      setOcupado(false);
    }
  }

  return (
    <section className="card adaptive-wizard">
      <div className="adaptive-heading">
        <div>
          <h3>Gerador adaptativo de cronograma</h3>
          <p className="page-description">
            Frequência das provas + desempenho + disponibilidade. Datas, carga e revisões são calculadas pelo sistema.
          </p>
        </div>
        <span className="adaptive-badge">85% da capacidade</span>
      </div>

      <div className="wizard-steps" aria-label="Etapas do gerador">
        {ETAPAS.map((nome, indice) => (
          <button
            type="button"
            key={nome}
            className={`wizard-step${indice === etapa ? ' active' : ''}${indice < etapa ? ' done' : ''}`}
            onClick={() => indice < etapa && setEtapa(indice)}
          >
            <span>{indice + 1}</span>{nome}
          </button>
        ))}
      </div>

      {etapa === 0 && (
        <div className="wizard-panel">
          <h4>Objetivo e prazo</h4>
          <div className="adaptive-grid two">
            <label>Nome do cronograma<input value={objetivo.nome} onChange={(e) => atualizarObjetivo('nome', e.target.value)} /></label>
            <label>Vestibular<input value={objetivo.vestibular} onChange={(e) => atualizarObjetivo('vestibular', e.target.value)} /></label>
          </div>
          <label>Objetivo<textarea rows="3" value={objetivo.objetivo} onChange={(e) => atualizarObjetivo('objetivo', e.target.value)} /></label>
          <div className="adaptive-grid four">
            <label>Início<input type="date" value={objetivo.data_inicio} onChange={(e) => atualizarObjetivo('data_inicio', e.target.value)} /></label>
            <label>Data da prova<input type="date" value={objetivo.data_prova} onChange={(e) => atualizarObjetivo('data_prova', e.target.value)} /></label>
            <label>Meta de acertos<input type="number" min="0" value={objetivo.meta_acertos} onChange={(e) => atualizarObjetivo('meta_acertos', e.target.value)} /></label>
            <label>Total da prova<input type="number" min="1" value={objetivo.total_questoes} onChange={(e) => atualizarObjetivo('total_questoes', e.target.value)} /></label>
          </div>
          <div className="color-picker-row">
            <span>Cor</span>
            {CORES.map((cor) => (
              <button
                type="button" key={cor} aria-label={`Cor ${cor}`} onClick={() => atualizarObjetivo('cor', cor)}
                className={objetivo.cor === cor ? 'selected' : ''} style={{ background: cor }}
              />
            ))}
          </div>
        </div>
      )}

      {etapa === 1 && (
        <div className="wizard-panel">
          <div className="panel-title-row">
            <div><h4>Disponibilidade semanal</h4><p>O sistema usa 85% e preserva 15% para atrasos e imprevistos.</p></div>
            <strong>{horas(minutosSemanais)} por semana</strong>
          </div>
          <div className="availability-list">
            {DIAS_SEMANA.map((rotulo) => {
              const dia = disponibilidade.find((item) => item.dia_semana === rotulo.dia_semana);
              return (
                <div className={`availability-row${dia.ativo ? '' : ' disabled'}`} key={rotulo.dia_semana}>
                  <label className="toggle-day">
                    <input type="checkbox" checked={dia.ativo} onChange={(e) => atualizarDia(dia.dia_semana, 'ativo', e.target.checked)} />
                    <strong>{rotulo.nome}</strong>
                  </label>
                  <label>Minutos<input type="number" min="0" step="15" disabled={!dia.ativo} value={dia.minutos_disponiveis} onChange={(e) => atualizarDia(dia.dia_semana, 'minutos_disponiveis', Number(e.target.value))} /></label>
                  <label>Início<input type="time" disabled={!dia.ativo} value={dia.horario_inicio || ''} onChange={(e) => atualizarDia(dia.dia_semana, 'horario_inicio', e.target.value)} /></label>
                  <span>{dia.ativo ? horas(dia.minutos_disponiveis * 0.85) : 'Descanso'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {etapa === 2 && (
        <div className="wizard-panel">
          <div className="panel-title-row">
            <div><h4>Diagnóstico e prioridades</h4><p>Ajuste seu desempenho atual; a pontuação é recalculada imediatamente.</p></div>
            <strong>{prioridades.length} assuntos</strong>
          </div>
          <div className="table-scroll">
            <table className="data-table diagnostic-table">
              <thead><tr><th>Usar</th><th>Matéria / assunto</th><th>Provas</th><th>Seu acerto</th><th>Ajuste</th><th>Prioridade</th></tr></thead>
              <tbody>
                {assuntos.map((item, indice) => {
                  const calculado = prioridades.find((p) => p.materia === item.materia && p.assunto === item.assunto);
                  return (
                    <tr key={`${item.materia}-${item.assunto}`} className={item.incluir === false ? 'muted-row' : ''}>
                      <td><input type="checkbox" checked={item.incluir !== false} onChange={(e) => atualizarAssunto(indice, 'incluir', e.target.checked)} /></td>
                      <td><strong>{item.materia}</strong><small>{item.assunto}</small></td>
                      <td>{item.questoes} q. / {item.documentos} provas</td>
                      <td><input type="number" min="0" max="100" disabled={item.incluir === false} value={item.desempenho_percentual} onChange={(e) => atualizarAssunto(indice, 'desempenho_percentual', Number(e.target.value))} /></td>
                      <td>
                        <select disabled={item.incluir === false} value={item.ajuste_usuario} onChange={(e) => atualizarAssunto(indice, 'ajuste_usuario', Number(e.target.value))}>
                          <option value="-20">Reduzir muito</option><option value="-10">Reduzir</option>
                          <option value="0">Automático</option><option value="10">Aumentar</option><option value="20">Aumentar muito</option>
                        </select>
                      </td>
                      <td>{calculado ? <span className={`priority-pill ${calculado.prioridade}`}>{calculado.prioridade_score}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="selection-help">Fórmula: 40% frequência + 30% lacuna de desempenho + 15% importância + 10% revisão + 5% pré-requisitos.</p>
        </div>
      )}

      {etapa === 3 && plano && (
        <div className="wizard-panel">
          <div className="panel-title-row">
            <div><h4>Prévia do cronograma</h4><p>Nenhum registro foi salvo ainda.</p></div>
            <button className="btn" type="button" onClick={() => { try { gerarPrevia(); } catch (e) { setErro(e.message); } }}>Recalcular</button>
          </div>
          <div className="stats-grid adaptive-stats">
            <div className="card"><strong>{plano.resumo.total_tarefas}</strong><span>tarefas</span></div>
            <div className="card"><strong>{plano.resumo.horas_planejadas}h</strong><span>planejadas</span></div>
            <div className="card"><strong>{plano.resumo.questoes_meta}</strong><span>questões-alvo</span></div>
            <div className="card"><strong>{plano.resumo.dias_livres}</strong><span>dias de folga</span></div>
          </div>
          {plano.resumo.avisos.length > 0 && (
            <details className="warning-details"><summary>{plano.resumo.avisos.length} tarefa(s) não couberam</summary>{plano.resumo.avisos.map((aviso) => <p key={aviso}>{aviso}</p>)}</details>
          )}
          <div className="phase-preview-grid">
            {plano.fases.map((fase) => (
              <article className="phase-preview" key={fase.nome} style={{ borderTopColor: fase.cor }}>
                <div><strong>{fase.ordem + 1}. {fase.nome}</strong><span>{formatarData(fase.data_inicio)} → {formatarData(fase.data_prazo)}</span></div>
                <p>{fase.descricao}</p>
                <small>{fase.tarefas.length} tarefas · {horas(fase.tarefas.reduce((s, t) => s + t.duracao_minutos, 0))}</small>
                <details><summary>Ver tarefas</summary><ul>{fase.tarefas.map((t) => <li key={t.local_id}>{formatarData(t.data_prazo)} · {t.titulo} ({t.duracao_minutos} min)</li>)}</ul></details>
              </article>
            ))}
          </div>
        </div>
      )}

      {etapa === 4 && plano && (
        <div className="wizard-panel confirmation-panel">
          <span className="confirmation-icon">✓</span>
          <h4>Pronto para criar</h4>
          <p>
            <strong>{objetivo.nome}</strong> terá {plano.resumo.total_tarefas} tarefas em quatro fases,
            {` ${plano.revisoes.length} revisões espaçadas e ${plano.resumo.horas_planejadas} horas planejadas.`}
          </p>
          <div className="confirmation-summary">
            <span>Período<strong>{formatarData(objetivo.data_inicio)} a {formatarData(objetivo.data_prova)}</strong></span>
            <span>Meta<strong>{objetivo.meta_acertos}/{objetivo.total_questoes} acertos</strong></span>
            <span>Ocupação<strong>{plano.resumo.ocupacao_percentual}% da margem útil</strong></span>
          </div>
          <p className="selection-help">A criação é atômica: se uma fase, tarefa ou revisão falhar, nada incompleto será salvo.</p>
        </div>
      )}

      {erro && <div className="form-error card">{erro}</div>}
      <div className="wizard-actions">
        {etapa > 0 && <button className="btn" type="button" disabled={ocupado} onClick={() => { setErro(''); setEtapa((v) => v - 1); }}>Voltar</button>}
        <span />
        {etapa < ETAPAS.length - 1 && <button className="btn btn-primary" type="button" onClick={avancar}>Continuar</button>}
        {etapa === ETAPAS.length - 1 && <button className="btn btn-primary" type="button" disabled={ocupado} onClick={confirmar}>{ocupado ? 'Criando…' : 'Criar cronograma adaptativo'}</button>}
      </div>
    </section>
  );
}
