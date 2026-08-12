import { useEffect, useMemo, useState } from 'react';
import {
  listarHistoricoClassificacao,
  percentualJob,
  rotuloStatusJob,
  STATUS_JOB_FINAIS,
} from '../lib/analiseAssincrona';

const FILTROS = [
  ['todos', 'Todos os resultados'],
  ['concluido', 'Concluídos'],
  ['concluido_com_falhas', 'Com pendências'],
  ['falhou', 'Falharam'],
  ['cancelado', 'Cancelados'],
];

function dataHora(valor) {
  if (!valor) return '—';
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function duracao(job) {
  if (!job.created_at || !job.finished_at) return '—';
  const segundos = Math.max(0, Math.round((new Date(job.finished_at) - new Date(job.created_at)) / 1000));
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `${minutos}min ${segundos % 60}s`;
  const horas = Math.floor(minutos / 60);
  return `${horas}h ${minutos % 60}min`;
}

function modo(job) {
  if (job.modo_efetivo === 'batch') return 'Gemini Batch';
  if (job.modo_efetivo === 'fila') return 'Fila rápida';
  return job.modo_efetivo || job.modo_solicitado || 'Automático';
}

export default function HistoricoProcessamentos() {
  const [jobs, setJobs] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      setJobs(await listarHistoricoClassificacao());
    } catch (error) {
      setErro(error.message);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    return jobs.filter((job) => (
      (filtro === 'todos' || job.status === filtro)
      && (!termo || String(job.nome || '').toLocaleLowerCase('pt-BR').includes(termo))
    ));
  }, [busca, filtro, jobs]);

  const resumo = useMemo(() => ({
    total: jobs.length,
    concluidos: jobs.filter((job) => job.status === 'concluido').length,
    pendencias: jobs.filter((job) => job.status === 'concluido_com_falhas').length,
    interrompidos: jobs.filter((job) => ['falhou', 'cancelado'].includes(job.status)).length,
  }), [jobs]);

  return (
    <div>
      <div className="section-heading">
        <div>
          <h2>Histórico de Processamentos</h2>
          <p className="page-description">
            Consulte os processamentos em segundo plano que já terminaram. Os que ainda estão ativos continuam na tela de análise de provas.
          </p>
        </div>
        <button className="btn" type="button" onClick={carregar} disabled={carregando}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      <div className="stats-grid">
        <div className="card"><strong>{resumo.total}</strong><span>registrados</span></div>
        <div className="card"><strong>{resumo.concluidos}</strong><span>concluídos</span></div>
        <div className="card"><strong>{resumo.pendencias}</strong><span>com pendências</span></div>
        <div className="card"><strong>{resumo.interrompidos}</strong><span>falhos ou cancelados</span></div>
      </div>

      <div className="toolbar responsive-toolbar">
        <input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar pelo nome do processamento"
          aria-label="Buscar processamentos"
        />
        <select value={filtro} onChange={(event) => setFiltro(event.target.value)} aria-label="Filtrar por situação">
          {FILTROS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
        </select>
      </div>

      {erro && <div className="form-error card">{erro}</div>}
      {carregando && !jobs.length && <div className="empty-state">Carregando histórico…</div>}
      {!carregando && !erro && !visiveis.length && (
        <div className="empty-state">Nenhum processamento finalizado foi encontrado para este filtro.</div>
      )}

      {visiveis.length > 0 && (
        <div className="analysis-job-list">
          {visiveis.map((job) => {
            const provedores = job.provedores || {};
            const percentual = percentualJob(job);
            return (
              <article className={`card analysis-job history-job status-${job.status}`} key={job.id}>
                <div className="analysis-job-header">
                  <div>
                    <strong>{job.nome}</strong>
                    <span>{rotuloStatusJob(job.status)} · {modo(job)}</span>
                  </div>
                  <strong>{percentual}%</strong>
                </div>
                <progress max="100" value={percentual}>{percentual}%</progress>
                <div className="analysis-job-meta">
                  <span>Iniciado: {dataHora(job.created_at)}</span>
                  <span>Finalizado: {dataHora(job.finished_at)}</span>
                  <span>Duração: {duracao(job)}</span>
                  <span>{job.itens_concluidos || 0}/{job.total_itens || 0} classificados</span>
                  {Number(job.itens_falhos) > 0 && <span>{job.itens_falhos} pendentes</span>}
                  {Number(provedores.gemini_flash_lite) > 0 && <span>{provedores.gemini_flash_lite} Flash-Lite</span>}
                  {Number(provedores.gemini_flash) > 0 && <span>{provedores.gemini_flash} Flash</span>}
                  {Number(provedores.groq) > 0 && <span>{provedores.groq} Groq</span>}
                </div>
                {job.erro && (
                  <details className="content-review">
                    <summary>Ver erro registrado</summary>
                    <p className="document-warning">{job.erro}</p>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}

      <p className="selection-help">
        São exibidos os {Math.min(200, jobs.length || 100)} registros finais mais recentes. Situações consideradas: {STATUS_JOB_FINAIS.map(rotuloStatusJob).join(', ')}.
      </p>
    </div>
  );
}
