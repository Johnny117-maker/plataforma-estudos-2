import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { extrairDeArquivo } from '../lib/extrairTexto';
import { classificarQuestoesIA } from '../lib/iaService';
import { cruzarFrequencias, serializarDocumentos } from '../lib/analiseProvas';
import { limparLinhas, segmentarQuestoes, PERFIS } from '../lib/segmentarProva';
import { gerarCronogramaDaAnalise, salvarAnaliseProvas } from '../lib/transactionService';

const MAX_ARQUIVOS = 20;
const MAX_BYTES = 25 * 1024 * 1024;

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hoje() { return new Date().toISOString().slice(0, 10); }
function tamanho(bytes) { return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

export default function AnalisarProva() {
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState('auto');
  const [documentos, setDocumentos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState('');
  const [analiseId, setAnaliseId] = useState(null);
  const [nome, setNome] = useState('Análise comparativa de provas');
  const [dataInicio, setDataInicio] = useState(hoje());
  const [dataFinal, setDataFinal] = useState('');
  const [horas, setHoras] = useState('2');

  useEffect(() => {
    supabase.from('materias').select('id,nome,subgeneros(id,nome)').order('ordem').then(({ data }) => setMaterias(data || []));
  }, []);

  const frequencias = useMemo(() => cruzarFrequencias(documentos), [documentos]);
  const totalQuestoes = documentos.reduce((s, d) => s + d.questoes.length, 0);
  const classificadas = documentos.reduce((s, d) => s + d.questoes.filter((q) => q.classificacao).length, 0);

  async function processar(files) {
    const lista = [...files].slice(0, MAX_ARQUIVOS);
    setErro(''); setAnaliseId(null);
    if (!lista.length) return;
    if (lista.some((f) => f.size > MAX_BYTES)) { setErro('Cada arquivo deve ter no máximo 25 MB.'); return; }
    setProcessando(true);
    const saida = [];
    try {
      for (let i = 0; i < lista.length; i += 1) {
        const file = lista[i];
        setProgresso(`Extraindo ${i + 1}/${lista.length}: ${file.name}`);
        const extracao = await extrairDeArquivo(file, (p, t) => setProgresso(`${file.name}: página ${p}/${t}`));
        const hash = await sha256(file);
        if (extracao.provavelDigitalizado) {
          saida.push({ nome: file.name, tipo: extracao.tipo, tamanho: file.size, totalPaginas: extracao.totalPaginas, hash, texto: '', perfil, avisos: ['PDF digitalizado: OCR necessário.'], questoes: [], erro: 'Sem texto embutido' });
          continue;
        }
        const { linhas } = limparLinhas(extracao.linhas);
        const seg = segmentarQuestoes(linhas, perfil);
        saida.push({
          nome: file.name, tipo: extracao.tipo, tamanho: file.size, totalPaginas: extracao.totalPaginas,
          hash, texto: linhas.map((l) => l.texto).join('\n'), perfil: seg.perfilUsado,
          avisos: seg.avisos, questoes: seg.questoes.map((q, qi) => ({ ...q, id: `${i}-${q.numero}-${qi}` })),
        });
      }
      setDocumentos(saida);
    } catch (error) { setErro(error.message); }
    finally { setProcessando(false); setProgresso(''); }
  }

  async function classificar() {
    setErro(''); setProcessando(true);
    try {
      const questoes = documentos.flatMap((d) => d.questoes);
      const resultados = await classificarQuestoesIA(questoes, materias, (atual, total) => setProgresso(`Classificando lote ${atual}/${total}`));
      const porId = new Map(resultados.map((r) => [String(r.id), r]));
      setDocumentos((atuais) => atuais.map((d) => ({ ...d, questoes: d.questoes.map((q) => ({ ...q, classificacao: porId.get(String(q.id)) || null })) })));
    } catch (error) { setErro(error.message); }
    finally { setProcessando(false); setProgresso(''); }
  }

  async function salvar() {
    setErro(''); setProcessando(true); setProgresso('Salvando análise e cruzamento…');
    try { setAnaliseId(await salvarAnaliseProvas(nome, serializarDocumentos(documentos))); }
    catch (error) { setErro(error.message); }
    finally { setProcessando(false); setProgresso(''); }
  }

  async function gerarCronograma() {
    setErro(''); setProcessando(true); setProgresso('Gerando cronograma por prioridade…');
    try { navigate(`/cronogramas/${await gerarCronogramaDaAnalise(analiseId, dataInicio, dataFinal, Number(horas))}`); }
    catch (error) { setErro(error.message); setProcessando(false); setProgresso(''); }
  }

  function exportar() {
    const blob = new Blob([JSON.stringify({ nome, documentos: serializarDocumentos(documentos), frequencias }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'analise-provas.json'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2>Analisar múltiplas provas</h2>
      <p className="page-description">Envie até 20 provas. A extração acontece no navegador; somente os textos segmentados são enviados em pequenos lotes para classificação quando você solicitar.</p>
      <div className="toolbar responsive-toolbar">
        <select value={perfil} onChange={(e) => setPerfil(e.target.value)}>{Object.entries(PERFIS).map(([id, p]) => <option key={id} value={id}>{p.rotulo}</option>)}</select>
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome da análise" />
      </div>
      <div className="card file-drop" onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); processar(e.dataTransfer.files); }}>
        <input ref={inputRef} hidden multiple type="file" accept=".pdf,.docx,.txt,.md" onChange={(e) => processar(e.target.files)} />
        <strong>Clique ou arraste várias provas</strong><span>PDF, DOCX, TXT ou Markdown · até {MAX_ARQUIVOS} arquivos</span>
      </div>
      {processando && <div className="empty-state">{progresso || 'Processando…'}</div>}
      {erro && <div className="form-error card">{erro}</div>}
      {documentos.length > 0 && <>
        <div className="stats-grid"><div className="card"><strong>{documentos.length}</strong><span>documentos</span></div><div className="card"><strong>{totalQuestoes}</strong><span>questões</span></div><div className="card"><strong>{classificadas}</strong><span>classificadas</span></div><div className="card"><strong>{frequencias.length}</strong><span>assuntos</span></div></div>
        <div className="button-row wrap"><button className="btn btn-primary" onClick={classificar} disabled={processando || !totalQuestoes}>Classificar com IA</button><button className="btn" onClick={salvar} disabled={processando || classificadas !== totalQuestoes || !totalQuestoes}>Salvar análise</button><button className="btn" onClick={exportar}>Exportar JSON</button></div>
        <div className="card table-scroll"><table className="data-table"><thead><tr><th>Matéria</th><th>Assunto</th><th>Provas</th><th>Questões</th><th>Frequência</th></tr></thead><tbody>{frequencias.map((f) => <tr key={`${f.materia}-${f.assunto}`}><td>{f.materia}</td><td>{f.assunto}</td><td>{f.documentos}/{documentos.length}</td><td>{f.questoes}</td><td>{(f.percentual * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
        <div className="document-grid">{documentos.map((d, i) => <div className="card" key={`${d.hash}-${i}`}><strong>{d.nome}</strong><span>{tamanho(d.tamanho)} · {d.totalPaginas} pág. · {d.questoes.length} questões</span>{d.erro && <span className="form-error">{d.erro}</span>}{d.avisos?.map((a) => <small key={a}>{a}</small>)}</div>)}</div>
      </>}
      {analiseId && <div className="card schedule-generator"><h3>Gerar cronograma pela frequência</h3><p>Assuntos recorrentes em mais provas recebem prioridade maior.</p><div className="responsive-form-row"><label>Início<input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></label><label>Fim<input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} /></label><label>Horas/dia<input type="number" min="0.5" step="0.5" value={horas} onChange={(e) => setHoras(e.target.value)} /></label></div><button className="btn btn-primary" disabled={!dataFinal || processando} onClick={gerarCronograma}>Criar cronograma automático</button></div>}
    </div>
  );
}
