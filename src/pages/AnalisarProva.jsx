import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { criarLinhasDeTexto, extrairDeArquivo } from '../lib/extrairTexto';
import {
  classificarQuestoesIA,
  descreverQuestoesVisuaisGemini,
  extrairDocumentoVisualGemini,
} from '../lib/iaService';
import {
  criarBlocosDeConteudo,
  cruzarFrequencias,
  filtrarSelecao,
  resumirSelecao,
  serializarDocumentos,
} from '../lib/analiseProvas';
import { limparLinhas, segmentarQuestoes, PERFIS } from '../lib/segmentarProva';
import { religarCabecalhos, mapearAreas, aplicarAreas } from '../lib/areasProva';
import { aplicarCache } from '../lib/cacheClassificacao';
import { aplicarDescricoesVisuais } from '../lib/documentoVisual';
import { salvarAnaliseProvas } from '../lib/transactionService';
import PlanejarCronogramaPanel from '../components/PlanejarCronogramaPanel';

const MAX_ARQUIVOS = 20;
const MAX_BYTES = 25 * 1024 * 1024;

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function tamanho(bytes) {
  return bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

// As provas recentes da Fatec são temáticas: um fio condutor único costura as
// 54 questões. Saber o tema ajuda a IA a NÃO classificar pelo assunto do
// enunciado — numa prova sobre alimentação, a questão da cafeína é
// estequiometria, não biologia.
const RE_TEMA = /^\s*(?:prezado|caro)\(a\) candidato\(a\)/i;

function detectarContextoProva(linhas) {
  const indice = linhas.findIndex((linha) => RE_TEMA.test(linha.texto));
  if (indice < 0) return null;
  const trecho = linhas.slice(indice + 1, indice + 8).map((l) => l.texto).join(' ');
  const limpo = trecho.replace(/\s+/g, ' ').trim();
  return limpo.length > 60 ? limpo.slice(0, 300) : null;
}

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
  const [perfil, setPerfil] = useState('auto');
  const [documentos, setDocumentos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [analiseId, setAnaliseId] = useState(null);
  const [nome, setNome] = useState('Análise comparativa de provas');

  useEffect(() => {
    supabase
      .from('materias')
      .select('id,nome,subgeneros(id,nome)')
      .order('ordem')
      .then(({ data }) => setMaterias(data || []));
  }, []);

  const documentosSelecionados = useMemo(() => filtrarSelecao(documentos), [documentos]);
  const selecao = useMemo(() => resumirSelecao(documentos), [documentos]);
  const frequencias = useMemo(() => cruzarFrequencias(documentosSelecionados), [documentosSelecionados]);
  const totalExtraido = documentos.reduce((soma, doc) => soma + doc.questoes.length, 0);
  const semClassificacao = selecao.conteudos - selecao.classificados;
  const baixaConfianca = documentosSelecionados
    .flatMap((doc) => doc.questoes)
    .filter((q) => q.classificacao && Number(q.classificacao.confianca) < 0.6).length;

  function invalidarAnalise() {
    setAnaliseId(null);
    setErro('');
  }

  async function processar(files) {
    const lista = [...files];
    const vagas = MAX_ARQUIVOS - documentos.length;
    setErro('');
    setAviso('');
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

        try {
          const extracao = await extrairDeArquivo(
            file,
            (p, t) => setProgresso(`${file.name}: página ${p}/${t}`)
          );
          let linhasFonte = extracao.linhas;
          let usouGeminiOcr = false;
          let modeloVisual = null;

          if (extracao.provavelDigitalizado) {
            setProgresso(`${file.name}: executando OCR e leitura visual com Gemini…`);
            const ocr = await extrairDocumentoVisualGemini(file);
            linhasFonte = criarLinhasDeTexto(ocr.texto);
            usouGeminiOcr = true;
            modeloVisual = ocr.modelo;
          }

          // O rótulo "Questão NN" pode vir desenhado em fragmentos separados.
          const { linhas: linhasLimpas } = limparLinhas(linhasFonte);
          const { linhas, religadas } = religarCabecalhos(linhasLimpas);
          const seg = segmentarQuestoes(linhas, perfil);
          const prefixo = hash.slice(0, 12);
          let questoesDetectadas = seg.questoes.map((questao, indice) => ({
            ...questao,
            id: `${prefixo}-questao-${questao.numero}-${indice}`,
            origem: 'questao_detectada',
            selecionada: true,
            visualAnalisado: usouGeminiOcr && questao.dependeDeVisual,
            modeloVisual: usouGeminiOcr && questao.dependeDeVisual ? modeloVisual : null,
          }));
          let avisos = [...seg.avisos];

          const numerosVisuais = questoesDetectadas
            .filter((questao) => questao.dependeDeVisual && !questao.visualAnalisado)
            .map((questao) => questao.numero);
          if (extracao.tipo === 'pdf' && numerosVisuais.length) {
            try {
              setProgresso(`${file.name}: analisando ${numerosVisuais.length} figura(s) com Gemini…`);
              const descricoes = await descreverQuestoesVisuaisGemini(file, numerosVisuais);
              const enriquecido = aplicarDescricoesVisuais(questoesDetectadas, descricoes);
              questoesDetectadas = enriquecido.questoes;
              if (enriquecido.aplicadas) {
                avisos = avisos.filter((texto) => !texto.includes('O texto sozinho pode não bastar'));
                avisos.push(`${enriquecido.aplicadas} questão(ões) tiveram gráficos, tabelas ou figuras descritos pelo Gemini.`);
              }
            } catch (visualError) {
              avisos.push(`Análise visual indisponível: ${visualError.message}. O texto extraído foi mantido.`);
            }
          }

          const questoes = questoesDetectadas.length
            ? questoesDetectadas
            : criarBlocosDeConteudo(linhas, prefixo);
          if (usouGeminiOcr) {
            avisos.unshift(`OCR e leitura visual realizados com ${modeloVisual}.`);
          }
          if (religadas) {
            avisos.push(`${religadas} cabeçalho(s) de questão remontados a partir de fragmentos separados.`);
          }
          if (!questoesDetectadas.length && questoes.length) {
            avisos.push('A numeração não foi reconhecida; o texto foi dividido em trechos selecionáveis.');
          }

          // Cadernos antigos declaram a matéria de cada bloco. Onde existe, a
          // matéria é travada e a Groq classifica apenas o assunto granular.
          if (questoesDetectadas.length) {
            const { porNumero, areas } = mapearAreas(linhas, questoesDetectadas);
            if (areas.length) {
              const comArea = aplicarAreas(questoesDetectadas, porNumero, materias);
              for (const questao of questoesDetectadas) {
                if (questao.classificacao?.origem === 'cabecalho_de_area') {
                  questao.materiaConhecida = questao.classificacao.materia_nome;
                  questao.classificacao = null;
                }
              }
              avisos.push(`${comArea} de ${questoesDetectadas.length} questão(ões) tiveram a matéria confirmada pelos ${areas.length} cabeçalhos de área do caderno.`);
            }
          }

          const contexto = detectarContextoProva(linhas);
          if (contexto) avisos.push('Prova temática: o tema do caderno será informado à IA como contexto.');

          saida.push({
            nome: file.name,
            tipo: extracao.tipo,
            tamanho: file.size,
            totalPaginas: extracao.totalPaginas,
            hash,
            texto: linhas.map((linha) => linha.texto).join('\n'),
            perfil: seg.perfilUsado,
            contexto,
            selecionado: true,
            avisos,
            questoes,
            modeloVisual,
          });
        } catch (fileError) {
          // Um PDF corrompido ou uma cota temporariamente indisponível não
          // impede os demais arquivos do mesmo lote de serem processados.
          saida.push({
            nome: file.name,
            tipo: file.type || 'arquivo',
            tamanho: file.size,
            totalPaginas: 0,
            hash,
            texto: '',
            perfil,
            contexto: null,
            selecionado: false,
            avisos: [],
            questoes: [],
            erro: fileError.message,
          });
        }
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
        ? {
          ...questao,
          enunciado: texto,
          paraClassificar: texto,
          caracteres: texto.length,
          classificacao: null,
          hashConteudo: undefined,
        }
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
    alterarDocumento(hash, (doc) => ({
      ...doc,
      questoes: doc.questoes.filter((questao) => questao.id !== id),
    }));
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
    setAviso('');
    setAnaliseId(null);
    setProcessando(true);
    try {
      const todas = documentosSelecionados.flatMap((doc) => doc.questoes);

      // O cache vem primeiro. Se a migration ainda não estiver publicada, a
      // classificação continua funcionando e apenas deixa de reaproveitar
      // respostas anteriores.
      setProgresso('Consultando o que já foi classificado antes…');
      let cache = { aplicadas: 0, consultados: 0, restantes: todas.length };
      try {
        cache = await aplicarCache(todas);
      } catch (cacheError) {
        setAviso(`Cache temporariamente indisponível: ${cacheError.message}. A classificação seguirá com IA.`);
      }
      if (cache.aplicadas) setDocumentos((atuais) => [...atuais]);

      const itens = todas.filter((questao) => !questao.classificacao);
      if (!itens.length) {
        setAviso(cache.aplicadas
          ? `Tudo já estava classificado — ${cache.aplicadas} vieram do cache, sem chamar a IA.`
          : 'Todos os conteúdos selecionados já estão classificados.');
        return;
      }

      const aplicar = (lista) => {
        const porId = new Map(lista.map((item) => [String(item.id), item]));
        setDocumentos((atuais) => atuais.map((doc) => ({
          ...doc,
          questoes: doc.questoes.map((questao) => ({
            ...questao,
            classificacao: questao.classificacao || porId.get(String(questao.id)) || null,
          })),
        })));
      };

      // Cada documento é enviado com o próprio contexto temático. Antes, o
      // contexto da primeira prova era aplicado indevidamente a todas as outras.
      const grupos = documentosSelecionados
        .map((doc) => ({
          nome: doc.nome,
          contextoProva: doc.contexto || null,
          itens: doc.questoes.filter((questao) => !questao.classificacao),
        }))
        .filter((grupo) => grupo.itens.length);

      const resultado = {
        classificacoes: [],
        falhas: [],
        interrompido: false,
        erro: null,
      };

      for (let indice = 0; indice < grupos.length; indice += 1) {
        const grupo = grupos[indice];
        const parcial = await classificarQuestoesIA(
          grupo.itens,
          materias,
          (atual, total, mensagem) => setProgresso(
            `[${indice + 1}/${grupos.length}] ${grupo.nome}: ${mensagem || `Lote ${atual}/${total}`}`
          ),
          (lista) => aplicar([...resultado.classificacoes, ...lista]),
          { contextoProva: grupo.contextoProva },
        );

        resultado.classificacoes.push(...parcial.classificacoes);
        resultado.falhas.push(...parcial.falhas);
        resultado.interrompido = resultado.interrompido || parcial.interrompido;
        resultado.erro = parcial.erro || resultado.erro;
        aplicar(resultado.classificacoes);

        if (parcial.interrompido) break;
      }

      const naoCanonicas = resultado.classificacoes.filter((c) => c.canonico === false).length;
      if (resultado.interrompido) {
        setErro(`${resultado.classificacoes.length} de ${itens.length} classificados antes do limite da IA. `
          + 'Clique de novo em alguns minutos para continuar de onde parou — o que já foi feito está salvo.');
      } else if (resultado.falhas.length) {
        setErro(`${resultado.falhas.length} conteúdo(s) não foram classificados. ${resultado.erro || ''}`);
      } else {
        const partes = [`${resultado.classificacoes.length} classificados pela IA`];
        if (cache.aplicadas) partes.push(`${cache.aplicadas} reaproveitados do cache`);
        if (naoCanonicas) partes.push(`${naoCanonicas} fora da taxonomia (revise)`);
        setAviso(`${partes.join(', ')}.`);
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
        Envie um ou vários arquivos, escolha exatamente quais questões ou trechos devem entrar e gere um
        cronograma baseado somente no conteúdo selecionado. PDFs com texto são extraídos no navegador;
        somente arquivos digitalizados ou questões com elementos visuais são enviados ao Gemini.
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
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.heic,.heif"
          onChange={(event) => processar(event.target.files)}
        />
        <strong>Clique ou arraste uma ou várias provas</strong>
        <span>PDF, DOCX, TXT, Markdown ou imagem · até {MAX_ARQUIVOS} arquivos · 25 MB por arquivo</span>
      </div>

      {processando && <div className="empty-state">{progresso || 'Processando…'}</div>}
      {erro && <div className="form-error card">{erro}</div>}
      {aviso && !erro && <div className="card selection-help">{aviso}</div>}

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
              const escolhidos = doc.questoes.filter(
                (questao) => questao.selecionada !== false && String(questao.paraClassificar || '').trim()
              ).length;
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
                    <button className="btn btn-danger-text" type="button" onClick={() => removerDocumento(doc.hash)}>
                      Remover arquivo
                    </button>
                  </div>

                  {doc.erro && <span className="form-error">{doc.erro}</span>}
                  {doc.avisos?.map((texto) => <small className="document-warning" key={texto}>{texto}</small>)}

                  {!doc.erro && (
                    <details className="content-review" open={documentos.length === 1}>
                      <summary>Revisar e escolher conteúdos</summary>
                      <div className="button-row wrap compact-row">
                        <button className="btn" type="button" onClick={() => selecionarConteudos(doc.hash, true)}>Marcar todos</button>
                        <button className="btn" type="button" onClick={() => selecionarConteudos(doc.hash, false)}>Desmarcar todos</button>
                        <button className="btn" type="button" onClick={() => adicionarConteudo(doc.hash)}>+ Adicionar conteúdo</button>
                      </div>

                      <div className="content-items">
                        {doc.questoes.map((item, indice) => {
                          const conf = Number(item.classificacao?.confianca);
                          const duvidoso = item.classificacao && conf < 0.6;
                          return (
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
                                  {item.dependeDeVisual && !item.visualAnalisado && <span>depende de figura</span>}
                                  {item.visualAnalisado && <span>visual analisado pelo Gemini</span>}
                                  {item.materiaConhecida && !item.classificacao && (
                                    <span>{item.materiaConhecida} · do caderno</span>
                                  )}
                                  {item.classificacao && (
                                    <span style={duvidoso ? { color: '#F85149' } : undefined}>
                                      {item.classificacao.materia_nome} — {item.classificacao.assunto_nome}
                                      {item.classificacao.origem === 'cache' ? ' · cache' : ''}
                                      {duvidoso ? ` · confiança ${conf.toFixed(2)}, revise` : ''}
                                    </span>
                                  )}
                                  {item.origem === 'conteudo_adicionado' && (
                                    <button className="text-button" type="button" onClick={() => removerConteudo(doc.hash, item.id)}>
                                      Excluir
                                    </button>
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
                          );
                        })}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>

          <div className="button-row wrap">
            <button className="btn btn-primary" onClick={classificar} disabled={processando || !selecao.conteudos}>
              {semClassificacao
                ? `Classificar ${semClassificacao} conteúdo(s)`
                : 'Reconferir classificações'}
            </button>
            <button className="btn" onClick={salvar} disabled={processando || !selecao.conteudos}>
              Salvar conteúdos selecionados
            </button>
            <button className="btn" onClick={exportar} disabled={!selecao.conteudos}>Exportar seleção JSON</button>
          </div>

          {semClassificacao > 0 && (
            <p className="selection-help">
              {semClassificacao} conteúdo(s) ainda sem matéria. Você pode salvar e gerar o cronograma assim
              mesmo — eles entram agrupados como não classificados, e o cronograma sai mais grosseiro.
            </p>
          )}
          {baixaConfianca > 0 && (
            <p className="selection-help">
              {baixaConfianca} classificação(ões) com confiança abaixo de 0,6, marcadas em vermelho na lista.
              Costumam ser questões que dependem de figura — vale conferir antes de salvar.
            </p>
          )}

          {frequencias.length > 0 && (
            <div className="card table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Matéria</th><th>Assunto</th><th>Arquivos</th><th>Conteúdos</th><th>Frequência</th></tr>
                </thead>
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

          {frequencias.length > 0 && (
            <PlanejarCronogramaPanel
              key={frequencias.map((item) => `${item.materia}:${item.assunto}:${item.questoes}`).join('|')}
              documentosSelecionados={documentosSelecionados}
              frequencias={frequencias}
              materias={materias}
              nomeSugerido={nome}
              analiseId={analiseId}
            />
          )}
        </>
      )}

    </div>
  );
}
