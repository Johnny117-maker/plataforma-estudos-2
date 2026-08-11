import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { aplicarCache } from '../lib/cacheClassificacao';
import PlanejarCronogramaPanel from '../components/PlanejarCronogramaPanel';
import { extrairDeArquivo } from '../lib/extrairTexto';
import { classificarQuestoesIA } from '../lib/iaService';

import {
  criarBlocosDeConteudo,
  cruzarFrequencias,
  filtrarSelecao,
  resumirSelecao,
  serializarDocumentos,
} from '../lib/analiseProvas';
import { limparLinhas, segmentarQuestoes, PERFIS } from '../lib/segmentarProva';
import { religarCabecalhos, mapearAreas, aplicarAreas } from '../lib/areasProva';
import { gerarCronogramaDaAnalise, salvarAnaliseProvas } from '../lib/transactionService';

const MAX_ARQUIVOS = 20;
const MAX_BYTES = 25 * 1024 * 1024;

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hoje() { return new Date().toISOString().slice(0, 10); }
function tamanho(bytes) { return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

function novoConteudoManual(hash) {
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return {
    id: `${hash}-manual-${id}`,
    numero: null,
    pagina: null,
    enunciado: '',
    alternativas: [],
    gabarito: null,
    topico: null,
    facilidade: null,
    apoio: [],
    caracteres: 0,
    dependeDeVisual: false,
    paraClassificar: '',
    origem: 'conteudo_adicionado',
    selecionada: true,
  };
}

function rotuloConteudo(item, indice) {
  if (item.origem === 'conteudo_adicionado') return `Conteúdo adicionado ${indice + 1}`;
  if (item.numero) return `Questão ${item.numero}`;
  return `Trecho extraído ${indice + 1}`;
}

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

  const documentosSelecionados = useMemo(() => filtrarSelecao(documentos), [documentos]);
  const selecao = useMemo(() => resumirSelecao(documentos), [documentos]);
  const frequencias = useMemo(() => cruzarFrequencias(documentosSelecionados), [documentosSelecionados]);
  const totalExtraido = documentos.reduce((s, d) => s + d.questoes.length, 0);
  const semClassificacao = selecao.conteudos - selecao.classificados;

  function invalidarAnalise() {
    setAnaliseId(null);
    setErro('');
  }

  async function processar(files) {
    const lista = [...files];
    const vagas = MAX_ARQUIVOS - documentos.length;
    setErro('');
    setAnaliseId(null);
    if (!lista.length) return;
    if (lista.length > vagas) {
      setErro(`Você pode adicionar mais ${vagas} arquivo(s). O limite por análise é ${MAX_ARQUIVOS}.`);
      return;
    }
    if (lista.some((f) => f.size > MAX_BYTES)) {
      setErro('Cada arquivo deve ter no máximo 25 MB.');
      return;
    }

    setProcessando(true);
    const saida = [];
    const hashes = new Set(documentos.map((doc) => doc.hash));
    try {
      for (let i = 0; i < lista.length; i += 1) {
        const file = lista[i];
        setProgresso(`Preparando ${i + 1}/${lista.length}: ${file.name}`);
        const hash = await sha256(file);
        if (hashes.has(hash)) continue;
        hashes.add(hash);

        const extracao = await extrairDeArquivo(file, (p, t) => setProgresso(`${file.name}: página ${p}/${t}`));
        if (extracao.provavelDigitalizado) {
          saida.push({
            nome: file.name,
            tipo: extracao.tipo,
            tamanho: file.size,
            totalPaginas: extracao.totalPaginas,
            hash,
            texto: '',
            perfil,
            selecionado: false,
            avisos: ['PDF digitalizado: OCR necessário antes de selecionar conteúdo.'],
            questoes: [],
            erro: 'Sem texto embutido',
          });
          continue;
        }

        // O rótulo "Questão NN" é desenhado como dois fragmentos separados por
        // um vão de ~13pt. Quando o corte XY cai nesse vão — acontece em página
        // de duas colunas — saem duas linhas e a questão some sem erro nenhum.
        const { linhas: linhasLimpas } = limparLinhas(extracao.linhas);
        const { linhas, religadas } = religarCabecalhos(linhasLimpas);

        const seg = segmentarQuestoes(linhas, perfil);
        const prefixo = hash.slice(0, 12);
        const questoesDetectadas = seg.questoes.map((questao, indice) => ({
          ...questao,
          id: `${prefixo}-questao-${questao.numero}-${indice}`,
          origem: 'questao_detectada',
          selecionada: true,
        }));
        const questoes = questoesDetectadas.length
          ? questoesDetectadas
          : criarBlocosDeConteudo(linhas, prefixo);

        const avisos = [...seg.avisos];
        if (religadas) {
          avisos.push(`${religadas} cabeçalho(s) de questão foram remontados a partir de fragmentos separados.`);
        }
        if (!questoesDetectadas.length && questoes.length) {
          avisos.push('A numeração não foi reconhecida; o texto foi dividido em trechos selecionáveis.');
        }

        // Muitos cadernos declaram a matéria de cada bloco ("MULTIDISCIPLINAR",
        // "QUÍMICA", "HISTÓRIA"...). Onde existe, classifica de graça e com
        // precisão maior que a da IA. Onde não existe, não faz nada.
        if (questoesDetectadas.length) {
          const { porNumero, areas } = mapearAreas(linhas, questoesDetectadas);
          if (areas.length) {
            const comArea = aplicarAreas(questoesDetectadas, porNumero, materias);
            avisos.push(`${comArea} de ${questoesDetectadas.length} questão(ões) classificadas pelos ${areas.length} cabeçalhos de área do caderno, sem usar IA.`);
          }
        }

        saida.push({
          nome: file.name,
          tipo: extracao.tipo,
          tamanho: file.size,
          totalPaginas: extracao.totalPaginas,
          hash,
          texto: linhas.map((linha) => linha.texto).join('\n'),
          perfil: seg.perfilUsado,
          selecionado: true,
          avisos,
          questoes,
        });
      }

      if (!saida.length) setErro('Os arquivos escolhidos já foram adicionados.');
      else setDocumentos((atuais) => [...atuais, ...saida]);
    } catch (error) {
      setErro(error.message);
    } finally {
      setProcessando(false);
      setProgresso('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function alterarDocumento(hash, atualizador) {
    invalidarAnalise();
    setDocumentos((atuais) => atuais.map((doc) => (doc.hash === hash ? atualizador(doc) : doc)));
  }

  function selecionarDocumento(hash, selecionado) {
    alterarDocumento(hash, (doc) => ({ ...doc, selecionado }));
  }

  function selecionarConteudos(hash, selecionada) {
    alterarDocumento(hash, (doc) => ({
      ...doc,
      selecionado: selecionada ? true : doc.selecionado,
      questoes: doc.questoes.map((questao) => ({ ...questao, selecionada })),
    }));
  }

  function atualizarConteudo(hash, id, texto) {
    alterarDocumento(hash, (doc) => ({
      ...doc,
      questoes: doc.questoes.map((questao) => (questao.id === id
        ? { ...questao, enunciado: texto, paraClassificar: texto, caracteres: texto.length, classificacao: null }
        : questao)),
    }));
  }

  function selecionarConteudo(hash, id, selecionada) {
    alterarDocumento(hash, (doc) => ({
      ...doc,
      selecionado: selecionada ? true : doc.selecionado,
      questoes: doc.questoes.map((questao) => (questao.id === id ? { ...questao, selecionada } : questao)),
    }));
  }

  function adicionarConteudo(hash) {
    alterarDocumento(hash, (doc) => ({
      ...doc,
      selecionado: true,
      questoes: [...doc.questoes, novoConteudoManual(hash)],
    }));
  }

  function removerConteudo(hash, id) {
    alterarDocumento(hash, (doc) => ({ ...doc, questoes: doc.questoes.filter((questao) => questao.id !== id) }));
  }

  function removerDocumento(hash) {
    invalidarAnalise();
    setDocumentos((atuais) => atuais.filter((doc) => doc.hash !== hash));
  }

  function selecionarTodos(selecionada) {
    invalidarAnalise();
    setDocumentos((atuais) => atuais.map((doc) => ({
      ...doc,
      selecionado: selecionada && !doc.erro,
      questoes: doc.questoes.map((questao) => ({ ...questao, selecionada: selecionada && !doc.erro })),
    })));
  }

  async function classificar() {
    setErro('');
    setAnaliseId(null);
    setProcessando(true);

    setProgresso('Consultando o que já foi classificado antes…');
    const todas = documentosSelecionados.flatMap((doc) => doc.questoes);
    const cache = await aplicarCache(todas);
    if (cache.aplicadas) {
      setDocumentos((atuais) => [...atuais]);   // força o re-render
      setProgresso(`${cache.aplicadas} reaproveitadas do cache.`);
    }

    const itens = todas.filter((questao) => !questao.classificacao);
      if (!itens.length) {
        setErro(`Tudo já estava classificado — ${cache.aplicadas} vieram do cache, sem chamar a IA.`);
      return;
    }
    
    try {
      const itens = documentosSelecionados
        .flatMap((doc) => doc.questoes)
        .filter((questao) => !questao.classificacao);
      if (!itens.length) {
        setErro('Todos os conteúdos selecionados já estão classificados.');
        return;
      }

      const aplicar = (lista) => {
        const porId = new Map(lista.map((r) => [String(r.id), r]));
        setDocumentos((atuais) => atuais.map((doc) => ({
          ...doc,
          questoes: doc.questoes.map((questao) => ({
            ...questao,
            classificacao: questao.classificacao || porId.get(String(questao.id)) || null,
          })),
        })));
      };

      const resultado = await classificarQuestoesIA(
        itens,
        materias,
        (atual, total, mensagem) => setProgresso(mensagem || `Lote ${atual}/${total}`),
        aplicar,
      );

      aplicar(resultado.classificacoes);

      if (resultado.interrompido) {
        setErro(`${resultado.classificacoes.length} de ${itens.length} classificados antes do limite da IA. `
          + 'Clique de novo em alguns minutos para continuar de onde parou — o que já foi feito está salvo.');
      } else if (resultado.falhas.length) {
        setErro(`${resultado.falhas.length} conteúdo(s) não foram classificados. ${resultado.erro || ''}`);
      }
    } catch (error) {
      setErro(error.message);
    } finally {
      setProcessando(false);
      setProgresso('');
    }
  }

  async function salvar() {
    setErro('');
    setProcessando(true);
    setProgresso('Salvando a seleção e o cruzamento…');
    try {
      if (!selecao.conteudos) throw new Error('Selecione pelo menos um conteúdo.');
      setAnaliseId(await salvarAnaliseProvas(nome, serializarDocumentos(documentosSelecionados)));
    } catch (error) {
      setErro(error.message);
    } finally {
      setProcessando(false);
      setProgresso('');
    }
  }

  async function gerarCronograma() {
    setErro('');
    if (!dataInicio || !dataFinal) {
      setErro('Informe a data de início e a data final antes de gerar.');
      return;
    }
    setProcessando(true);
    setProgresso('Gerando cronograma com os conteúdos selecionados…');
    try {
      const cronogramaId = await gerarCronogramaDaAnalise(analiseId, dataInicio, dataFinal, Number(horas));
      navigate(`/cronogramas/${cronogramaId}`);
    } catch (error) {
      setErro(error.message);
      setProcessando(false);
      setProgresso('');
    }
  }

  function exportar() {
    const blob = new Blob([
      JSON.stringify({ nome, documentos: serializarDocumentos(documentosSelecionados), frequencias }, null, 2),
    ], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analise-provas-selecao.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h2>Montar cronograma a partir de provas</h2>
      <p className="page-description">
        Envie um ou vários arquivos, escolha exatamente quais questões ou trechos devem entrar e gere um cronograma baseado somente no conteúdo selecionado. A extração acontece no navegador; os PDFs originais não são enviados à IA.
      </p>

      <div className="toolbar responsive-toolbar">
        <select value={perfil} onChange={(event) => setPerfil(event.target.value)} aria-label="Modelo de prova">
          {Object.entries(PERFIS).map(([id, item]) => <option key={id} value={id}>{item.rotulo}</option>)}
        </select>
        <input
          value={nome}
          onChange={(event) => { setNome(event.target.value); setAnaliseId(null); }}
          aria-label="Nome da análise"
          placeholder="Nome da análise"
        />
      </div>

      <div
        className="card file-drop"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); processar(event.dataTransfer.files); }}
      >
        <input
          ref={inputRef}
          hidden
          multiple
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={(event) => processar(event.target.files)}
        />
        <strong>Clique ou arraste uma ou várias provas</strong>
        <span>PDF, DOCX, TXT ou Markdown · até {MAX_ARQUIVOS} arquivos · 25 MB por arquivo</span>
      </div>

      {processando && <div className="empty-state">{progresso || 'Processando…'}</div>}
      {erro && <div className="form-error card">{erro}</div>}

      {documentos.length > 0 && (
        <>
          <div className="stats-grid">
            <div className="card"><strong>{documentos.length}</strong><span>arquivos adicionados</span></div>
            <div className="card"><strong>{selecao.documentos}</strong><span>arquivos selecionados</span></div>
            <div className="card"><strong>{selecao.conteudos}</strong><span>conteúdos selecionados</span></div>
            <div className="card"><strong>{selecao.classificados}</strong><span>conteúdos classificados</span></div>
          </div>

          <div className="selection-summary card">
            <div>
              <strong>Seleção usada no cronograma</strong>
              <span>{selecao.conteudos} de {totalExtraido} conteúdo(s), em {selecao.documentos} arquivo(s).</span>
            </div>
            <div className="button-row wrap compact-row">
              <button className="btn" type="button" onClick={() => selecionarTodos(true)}>Selecionar tudo</button>
              <button className="btn" type="button" onClick={() => selecionarTodos(false)}>Limpar seleção</button>
            </div>
          </div>

          <div className="document-review-list">
            {documentos.map((doc) => {
              const escolhidos = doc.questoes.filter((questao) => questao.selecionada !== false && String(questao.paraClassificar || '').trim()).length;
              return (
                <article className={`card document-review${doc.selecionado === false ? ' is-disabled' : ''}`} key={doc.hash}>
                  <div className="document-review-header">
                    <label className="selection-label">
                      <input
                        type="checkbox"
                        checked={doc.selecionado !== false}
                        disabled={Boolean(doc.erro)}
                        onChange={(event) => selecionarDocumento(doc.hash, event.target.checked)}
                      />
                      <span>
                        <strong>{doc.nome}</strong>
                        <small>{tamanho(doc.tamanho)} · {doc.totalPaginas} pág. · {escolhidos}/{doc.questoes.length} conteúdo(s)</small>
                      </span>
                    </label>
                    <button className="btn btn-danger-text" type="button" onClick={() => removerDocumento(doc.hash)}>Remover arquivo</button>
                  </div>

                  {doc.erro && <span className="form-error">{doc.erro}</span>}
                  {doc.avisos?.map((aviso) => <small className="document-warning" key={aviso}>{aviso}</small>)}

                  {!doc.erro && (
                    <details className="content-review" open={documentos.length === 1}>
                      <summary>Revisar e escolher conteúdos</summary>
                      <div className="button-row wrap compact-row">
                        <button className="btn" type="button" onClick={() => selecionarConteudos(doc.hash, true)}>Marcar todos</button>
                        <button className="btn" type="button" onClick={() => selecionarConteudos(doc.hash, false)}>Desmarcar todos</button>
                        <button className="btn" type="button" onClick={() => adicionarConteudo(doc.hash)}>+ Adicionar conteúdo</button>
                      </div>

                      <div className="content-items">
                        {doc.questoes.map((item, indice) => (
                          <div className={`content-item${item.selecionada === false ? ' is-disabled' : ''}`} key={item.id}>
                            <div className="content-item-header">
                              <label className="selection-label">
                                <input
                                  type="checkbox"
                                  checked={item.selecionada !== false}
                                  onChange={(event) => selecionarConteudo(doc.hash, item.id, event.target.checked)}
                                />
                                <strong>{rotuloConteudo(item, indice)}</strong>
                              </label>
                              <div className="content-badges">
                                {item.pagina && <span>Página {item.pagina}</span>}
                                {item.classificacao && (
                                  <span>
                                    {item.classificacao.materia_nome} · {item.classificacao.assunto_nome}
                                    {item.classificacao.origem === 'cabecalho_de_area' ? ' · do caderno' : ''}
                                  </span>
                                )}
                                {item.origem === 'conteudo_adicionado' && (
                                  <button className="text-button" type="button" onClick={() => removerConteudo(doc.hash, item.id)}>Excluir</button>
                                )}
                              </div>
                            </div>
                            <textarea
                              rows="5"
                              value={item.paraClassificar || ''}
                              placeholder="Informe ou ajuste o conteúdo que deverá ser considerado no cronograma."
                              onChange={(event) => atualizarConteudo(doc.hash, item.id, event.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>

          <div className="button-row wrap">
            <button className="btn btn-primary" onClick={classificar} disabled={processando || !semClassificacao}>
              {semClassificacao
                ? `Classificar ${semClassificacao} conteúdo(s) com IA`
                : 'Tudo já classificado'}
            </button>
            <button className="btn" onClick={salvar} disabled={processando || !selecao.conteudos}>
              Salvar conteúdos selecionados
            </button>
            <button className="btn" onClick={exportar} disabled={!selecao.conteudos}>Exportar seleção JSON</button>
          </div>

          {semClassificacao > 0 && (
            <p className="selection-help">
              {semClassificacao} conteúdo(s) ainda sem matéria. Você pode salvar e gerar o cronograma
              assim mesmo — eles entram agrupados como não classificados, e o cronograma sai mais grosseiro.
            </p>
          )}

          {frequencias.length > 0 && (
            <div className="card table-scroll">
              <table className="data-table">
                <thead><tr><th>Matéria</th><th>Assunto</th><th>Arquivos</th><th>Conteúdos</th><th>Frequência</th></tr></thead>
                <tbody>
                  {frequencias.map((item) => (
                    <tr key={`${item.materia}-${item.assunto}`}>
                      <td>{item.materia}</td>
                      <td>{item.assunto}</td>
                      <td>{item.documentos}/{selecao.documentos}</td>
                      <td>{item.questoes}</td>
                      <td>{(item.percentual * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {frequencias.length > 0 && (
        <PlanejarCronogramaPanel
          documentosSelecionados={documentosSelecionados}
          frequencias={frequencias}
          materias={materias}
          nomeSugerido={nome}
        />
      )}

      {analiseId && (
        <div className="card schedule-generator">
          <h3>Gerar cronograma com a seleção salva</h3>
          <p>Os assuntos recorrentes nos arquivos e conteúdos escolhidos receberão prioridade maior.</p>
          <div className="responsive-form-row">
            <label>Início<input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} /></label>
            <label>Fim<input type="date" value={dataFinal} onChange={(event) => setDataFinal(event.target.value)} /></label>
            <label>Horas/dia<input type="number" min="0.5" step="0.5" value={horas} onChange={(event) => setHoras(event.target.value)} /></label>
          </div>
          <button className="btn btn-primary" disabled={!dataInicio || !dataFinal || processando} onClick={gerarCronograma}>
            Criar cronograma automático
          </button>
          {!dataFinal && <p className="selection-help">Informe a data final para liberar a geração.</p>}
        </div>
      )}
    </div>
  );
}