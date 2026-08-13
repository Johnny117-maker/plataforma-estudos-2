import { useEffect, useState } from 'react';
import {
  DPI_MAX, DPI_MIN, DPI_PADRAO,
  enviarProvaParaAnalise, listarAnalysisJobs,
} from '../lib/provaVisao';

const ROTULO_FASE = {
  upload_pdf: 'Enviando o PDF…',
  render: 'Renderizando páginas',
  upload_paginas: 'Enviando páginas',
  criar_job: 'Criando o job…',
};

const ROTULO_STATUS = {
  pending: 'Na fila',
  processing: 'Processando',
  done: 'Concluído',
  error: 'Erro',
  canceled: 'Cancelado',
};

export default function AnalisarProvaVisao() {
  const [arquivo, setArquivo] = useState(null);
  const [dpi, setDpi] = useState(DPI_PADRAO);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState('');
  const [jobs, setJobs] = useState([]);

  async function carregarJobs() {
    try {
      setJobs(await listarAnalysisJobs());
    } catch (e) {
      setErro(e.message);
    }
  }

  useEffect(() => { carregarJobs(); }, []);

  // Enquanto houver job na fila ou processando, atualiza o progresso ao vivo.
  useEffect(() => {
    const ativo = jobs.some((job) => job.status === 'pending' || job.status === 'processing');
    if (!ativo) return undefined;
    const timer = setInterval(() => { carregarJobs(); }, 5_000);
    return () => clearInterval(timer);
  }, [jobs]);

  async function enviar() {
    if (!arquivo) return;
    setEnviando(true);
    setErro('');
    setProgresso(null);
    try {
      await enviarProvaParaAnalise(arquivo, { dpi, onProgresso: setProgresso });
      setArquivo(null);
      await carregarJobs();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  function textoProgresso() {
    if (!progresso) return 'Enviando…';
    const base = ROTULO_FASE[progresso.fase] || 'Processando';
    return progresso.total ? `${base} ${progresso.atual}/${progresso.total}…` : `${base}`;
  }

  return (
    <div className="page">
      <h1>Analisar prova (visão)</h1>
      <p className="selection-help">
        Novo pipeline: o PDF e uma imagem de cada página ({DPI_MIN}–{DPI_MAX} DPI) são enviados para o
        armazenamento seguro e um job entra na fila. O worker (próxima etapa) lê texto + imagem com um
        modelo de visão e extrai as questões.
      </p>

      <div className="card">
        <label className="field">
          <span>Arquivo PDF</span>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => { setArquivo(e.target.files?.[0] || null); setErro(''); }}
            disabled={enviando}
          />
        </label>

        <label className="field">
          <span>Resolução da imagem: {dpi} DPI</span>
          <input
            type="range"
            min={DPI_MIN}
            max={DPI_MAX}
            step={10}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
            disabled={enviando}
          />
        </label>

        <button className="btn btn-primary" onClick={enviar} disabled={enviando || !arquivo}>
          {enviando ? textoProgresso() : 'Enviar para análise'}
        </button>
        {erro && <p className="selection-help" style={{ color: 'var(--danger, crimson)' }}>{erro}</p>}
      </div>

      <h3>Jobs recentes</h3>
      {jobs.length === 0 ? (
        <p className="selection-help">Nenhum job ainda.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Prova</th><th>Status</th><th>Páginas</th><th>Criado</th></tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.nome}</td>
                  <td>{ROTULO_STATUS[job.status] || job.status}{job.erro ? ` — ${job.erro}` : ''}</td>
                  <td>{job.paginas_processadas}/{job.total_paginas}</td>
                  <td>{new Date(job.created_at).toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
