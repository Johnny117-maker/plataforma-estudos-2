import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { criarLinhasDeTexto, extrairDeArquivo } from '../lib/extrairTexto';
import {
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
import {
  aplicarGabaritoNaProva,
  detectarIdentidadeProva,
  extrairItensGabarito,
  prepararProvasParaBanco,
  validarQuestaoParaBanco,
  vincularGabaritosAutomaticamente,
} from '../lib/bancoQuestoes';
import {
  acordarWorkerAnalise,
  aplicarResultadosAoSnapshot,
  cancelarJobClassificacao,
  criarJobClassificacao,
  listarJobsClassificacao,
  obterJobClassificacao,
  percentualJob,
  rotuloStatusJob,
  STATUS_JOB_ATIVOS,
  STATUS_JOB_FINAIS,
} from '../lib/analiseAssincrona';
import { publicarBancoQuestoes, salvarAnaliseProvas } from '../lib/transactionService';
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
  const resultadoCarregadoRef = useRef(null);
  const [perfil, setPerfil] = useState('auto');
  const [tipoUpload, setTipoUpload] = useState('prova');
  const [modoProcessamento, setModoProcessamento] = useState('auto');
  const [usarGroq, setUsarGroq] = useState(false);
  const [documentos, setDocumentos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobAtivo, setJobAtivo] = useState(null);
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
    listarJobsClassificacao().then((lista) => {
      setJobs(lista);
      const ativo = lista.find((job) => STATUS_JOB_ATIVOS.includes(job.status));
      if (ativo) setJobAtivo(ativo.id);
    }).catch(() => {
      // A migration pode ainda não ter sido aplicada. O erro real aparecerá
      // quando o usuário tentar iniciar um job, sem bloquear a extração local.
    });
  }, []);

  useEffect(() => {
    if (!jobAtivo) return undefined;
    let desmontado = false;

    async function sincronizar() {
      try {
        const { job, lotes } = await obterJobClassificacao(jobAtivo);
        if (desmontado) return;
        setJobs((atuais) => [job, ...atuais.filter((item) => item.id !== job.id)].slice(0, 6));
        if (STATUS_JOB_FINAIS.includes(job.status) && resultadoCarregadoRef.current !== job.id) {
          resultadoCarregadoRef.current = job.id;
          setDocumentos(aplicarResultadosAoSnapshot(job.documentos_snapshot, lotes));
          setNome(job.nome);
          const concluidos = Number(job.itens_concluidos || 0);
          const falhos = Number(job.itens_falhos || 0);
          setAviso(falhos
            ? `${concluidos} conteúdos classificados e ${falhos} pendentes. O resultado disponível foi restaurado.`
            : `${concluidos} conteúdos classificados em segundo plano. Resultado restaurado.`);
        }
      } catch (pollError) {
        if (!desmontado) setErro(`Não foi possível atualizar o job: ${pollError.message}`);
      }
    }

    sincronizar();
    const timer = setInterval(sincronizar, 5_000);
    return () => {
      desmontado = true;
      clearInterval(timer);
    };
  }, [jobAtivo]);

  const documentosSelecionados = useMemo(() => filtrarSelecao(documentos), [documentos]);
  const selecao = useMemo(() => resumirSelecao(documentos), [documentos]);
  const frequencias = useMemo(() => cruzarFrequencias(documentosSelecionados), [documentosSelecionados]);
  const totalExtraido = documentos.reduce((soma, doc) => soma + (doc.questoes?.length || 0), 0);
  const gabaritos = documentos.filter((doc) => doc.papel === 'gabarito');
  const resumoBanco = useMemo(
    () => prepararProvasParaBanco(documentos, materias, nome, analiseId),
    [documentos, materias, nome, analiseId]
  );
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
    const papelUpload = tipoUpload;
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

          const textoDocumento = linhasFonte.map((linha) => linha.texto).join('\n');
          const metadadosProva = detectarIdentidadeProva(textoDocumento, file.name);

          if (papelUpload === 'gabarito') {
            const gabarito = extrairItensGabarito(linhasFonte);
            saida.push({
              nome: file.name,
              tipo: extracao.tipo,
              papel: 'gabarito',
              tamanho: file.size,
              totalPaginas: extracao.totalPaginas,
              hash,
              texto: textoDocumento,
              perfil: 'gabarito',
              metadadosProva,
              selecionado: false,
              avisos: [
                ...(usouGeminiOcr ? [`OCR do gabarito realizado com ${modeloVisual}.`] : []),
                ...gabarito.avisos,
              ],
              gabaritoItens: gabarito.itens,
              gabaritoRetificado: gabarito.retificado,
              questoes: [],
              modeloVisual,
            });
            continue;
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
            incluirBanco: true,
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
            papel: 'prova',
            tamanho: file.size,
            totalPaginas: extracao.totalPaginas,
            hash,
            texto: linhas.map((linha) => linha.texto).join('\n'),
            perfil: seg.perfilUsado,
            contexto,
            metadadosProva,
            gabaritoHash: null,
            gabaritoVinculado: null,
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
              papel: papelUpload,
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
      else setDocumentos((atuais) => vincularGabaritosAutomaticamente([...atuais, ...saida]));
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

  function associarGabarito(hashProva, hashGabarito) {
    invalidarAnalise();
    setDocumentos((atuais) => {
      const gabarito = atuais.find((doc) => doc.hash === hashGabarito && doc.papel === 'gabarito') || null;
      return atuais.map((doc) => (doc.hash === hashProva ? aplicarGabaritoNaProva(doc, gabarito) : doc));
    });
  }

  function atualizarItemGabarito(hashGabarito, numero, resposta) {
    invalidarAnalise();
    setDocumentos((atuais) => {
      const original = atuais.find((doc) => doc.hash === hashGabarito && doc.papel === 'gabarito');
      if (!original) return atuais;
      const atualizado = {
        ...original,
        gabaritoItens: original.gabaritoItens.map((item) => (
          item.numero === numero ? { ...item, resposta, retificada: true } : item
        )),
        gabaritoRetificado: true,
      };
      return atuais.map((doc) => {
        if (doc.hash === hashGabarito) return atualizado;
        return doc.gabaritoHash === hashGabarito ? aplicarGabaritoNaProva(doc, atualizado) : doc;
      });
    });
  }

  function corrigirRespostaQuestao(hashProva, numero, resposta) {
    invalidarAnalise();
    setDocumentos((atuais) => {
      const prova = atuais.find((doc) => doc.hash === hashProva);
      const hashGabarito = prova?.gabaritoHash;
      const original = atuais.find((doc) => doc.hash === hashGabarito && doc.papel === 'gabarito');
      if (original) {
        const atualizado = {
          ...original,
          gabaritoItens: original.gabaritoItens.map((item) => (
            item.numero === numero ? { ...item, resposta, retificada: true } : item
          )),
          gabaritoRetificado: true,
        };
        return atuais.map((doc) => {
          if (doc.hash === hashGabarito) return atualizado;
          return doc.gabaritoHash === hashGabarito ? aplicarGabaritoNaProva(doc, atualizado) : doc;
        });
      }
      return atuais.map((doc) => {
        if (doc.hash !== hashProva) return doc;
        return {
          ...doc,
          gabaritoVinculado: doc.gabaritoVinculado ? {
            ...doc.gabaritoVinculado,
            retificado: true,
            itens: doc.gabaritoVinculado.itens.map((item) => (
              item.numero === numero ? { ...item, resposta, retificada: true } : item
            )),
          } : null,
          questoes: doc.questoes.map((questao) => (
            questao.numero === numero ? { ...questao, gabarito: resposta, gabaritoRetificado: true } : questao
          )),
        };
      });
    });
  }

  function alternarInclusaoBanco(hash, id, incluirBanco) {
    alterarDocumento(hash, (doc) => ({
      ...doc,
      questoes: doc.questoes.map((questao) => (questao.id === id ? { ...questao, incluirBanco } : questao)),
    }));
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
    setDocumentos((atuais) => atuais
      .filter((doc) => doc.hash !== hash)
      .map((doc) => (doc.gabaritoHash === hash ? aplicarGabaritoNaProva(doc, null) : doc)));
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

      setProgresso(`Criando fila persistente para ${itens.length} conteúdo(s)…`);
      const jobId = await criarJobClassificacao({
        nome,
        documentos: documentosSelecionados,
        modo: modoProcessamento,
        usarGroq,
      });
      resultadoCarregadoRef.current = null;
      setJobAtivo(jobId);
      const lista = await listarJobsClassificacao();
      setJobs(lista);

      const partes = [`${itens.length} conteúdos colocados na fila`];
      if (cache.aplicadas) partes.push(`${cache.aplicadas} reaproveitados do cache`);
      partes.push('você pode fechar o navegador');
      setAviso(`${partes.join(', ')}.`);

      try {
        await acordarWorkerAnalise();
      } catch (workerError) {
        setAviso(`${partes.join(', ')}. O acionamento imediato falhou (${workerError.message}), `
          + 'mas o job continua salvo e o agendador tentará novamente.');
      }
    } catch (error) {
      setErro(error.message);
    } finally {
      setProcessando(false);
      setProgresso('');
    }
  }

  async function abrirResultadoJob(jobId) {
    setErro('');
    try {
      const { job, lotes } = await obterJobClassificacao(jobId);
      resultadoCarregadoRef.current = STATUS_JOB_FINAIS.includes(job.status) ? job.id : null;
      setDocumentos(aplicarResultadosAoSnapshot(job.documentos_snapshot, lotes));
      setNome(job.nome);
      setJobAtivo(job.id);
      setAviso(STATUS_JOB_FINAIS.includes(job.status)
        ? 'Resultado restaurado. Revise as classificações e salve a análise quando desejar.'
        : 'O snapshot e os resultados já concluídos foram restaurados; o restante continua em segundo plano.');
    } catch (error) {
      setErro(error.message);
    }
  }

  async function cancelarJob(jobId) {
    setErro('');
    try {
      await cancelarJobClassificacao(jobId);
      setJobs(await listarJobsClassificacao());
      if (jobAtivo === jobId) setJobAtivo(null);
    } catch (error) {
      setErro(error.message);
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

  async function publicarNoBanco() {
    setErro('');
    setProcessando(true);
    setProgresso('Publicando questões aprovadas no banco…');
    try {
      const payload = prepararProvasParaBanco(documentos, materias, nome, analiseId);
      if (!payload.prontas) {
        throw new Error('Nenhuma questão está pronta. Vincule o gabarito, classifique e resolva as pendências marcadas.');
      }
      const resultado = await publicarBancoQuestoes(nome, payload.provas);
      setAviso(
        `${resultado.questoes_inseridas || 0} questão(ões) adicionadas ao banco. `
        + `${resultado.questoes_duplicadas || 0} duplicada(s) foram preservadas sem nova cópia. `
        + `${payload.revisar || 0} continuam aguardando revisão.`
      );
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
      <h2>Analisar provas e criar banco de questões</h2>
      <p className="page-description">
        Envie provas e seus gabaritos, confira cada associação e publique as questões aprovadas para simulados
        futuros. A mesma análise também continua gerando um cronograma pelos assuntos mais frequentes.
      </p>

      <div className="toolbar responsive-toolbar">
        <select value={tipoUpload} onChange={(event) => setTipoUpload(event.target.value)} aria-label="Tipo do próximo arquivo">
          <option value="prova">Próximo arquivo: prova</option>
          <option value="gabarito">Próximo arquivo: gabarito</option>
        </select>
        <select value={perfil} onChange={(event) => setPerfil(event.target.value)} aria-label="Modelo de prova">
          {Object.entries(PERFIS).map(([id, item]) => <option key={id} value={id}>{item.rotulo}</option>)}
        </select>
        <select
          value={modoProcessamento}
          onChange={(event) => setModoProcessamento(event.target.value)}
          aria-label="Modo de processamento"
        >
          <option value="auto">Automático: fila rápida ou Batch</option>
          <option value="fila">Fila rápida com Gemini</option>
          <option value="batch">Gemini Batch econômico</option>
        </select>
        <label className="toggle-inline">
          <input
            type="checkbox"
            checked={usarGroq}
            onChange={(event) => setUsarGroq(event.target.checked)}
          />
          <span>Usar Groq como acelerador opcional</span>
        </label>
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
        <strong>
          {tipoUpload === 'gabarito'
            ? 'Clique ou arraste um ou vários gabaritos'
            : 'Clique ou arraste uma ou várias provas'}
        </strong>
        <span>PDF, DOCX, TXT, Markdown ou imagem · até {MAX_ARQUIVOS} arquivos · 25 MB por arquivo</span>
      </div>

      <p className="selection-help">
        Escolha acima se o próximo arquivo é uma prova ou um gabarito. O sistema tenta relacionar os pares por
        instituição, ano e semestre; você pode corrigir a associação antes de publicar.
      </p>

      <p className="selection-help">
        O Flash-Lite classifica os lotes textuais; o Flash assume questões visuais e classificações ambíguas.
        No modo automático, análises com 800 ou mais conteúdos usam o Gemini Batch. A Groq nunca é obrigatória:
        se o acelerador falhar, o mesmo lote segue pelo Gemini.
      </p>

      {processando && <div className="empty-state">{progresso || 'Processando…'}</div>}
      {erro && <div className="form-error card">{erro}</div>}
      {aviso && !erro && <div className="card selection-help">{aviso}</div>}

      {jobs.length > 0 && (
        <section className="analysis-jobs">
          <div className="section-heading">
            <div>
              <h3>Processamentos em segundo plano</h3>
              <p>O progresso fica salvo mesmo se esta página ou o navegador forem fechados.</p>
            </div>
          </div>
          <div className="analysis-job-list">
            {jobs.map((job) => {
              const percentual = percentualJob(job);
              const ativo = STATUS_JOB_ATIVOS.includes(job.status);
              const provedores = job.provedores || {};
              return (
                <article className={`card analysis-job${job.id === jobAtivo ? ' is-active' : ''}`} key={job.id}>
                  <div className="analysis-job-header">
                    <div>
                      <strong>{job.nome}</strong>
                      <span>{rotuloStatusJob(job.status)} · {job.modo_efetivo === 'batch' ? 'Gemini Batch' : 'Fila rápida'}</span>
                    </div>
                    <strong>{percentual}%</strong>
                  </div>
                  <progress max="100" value={percentual}>{percentual}%</progress>
                  <div className="analysis-job-meta">
                    <span>{job.itens_concluidos}/{job.total_itens} classificados</span>
                    {job.itens_falhos > 0 && <span>{job.itens_falhos} pendentes</span>}
                    {provedores.gemini_flash_lite > 0 && <span>{provedores.gemini_flash_lite} Flash-Lite</span>}
                    {provedores.gemini_flash > 0 && <span>{provedores.gemini_flash} Flash</span>}
                    {provedores.groq > 0 && <span>{provedores.groq} Groq</span>}
                  </div>
                  {job.erro && <small className="document-warning">{job.erro}</small>}
                  <div className="button-row wrap compact-row">
                    <button className="btn" type="button" onClick={() => abrirResultadoJob(job.id)}>
                      {ativo ? 'Abrir progresso' : 'Abrir resultado'}
                    </button>
                    {ativo && (
                      <button className="btn btn-danger-text" type="button" onClick={() => cancelarJob(job.id)}>
                        Cancelar
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

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
              if (doc.papel === 'gabarito') {
                const identidade = [
                  doc.metadadosProva?.instituicao,
                  doc.metadadosProva?.ano,
                  doc.metadadosProva?.semestre ? `${doc.metadadosProva.semestre}º semestre` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <article className="card document-review answer-key-document" key={doc.hash}>
                    <div className="document-review-header">
                      <div>
                        <strong>{doc.nome}</strong>
                        <small className="document-warning">
                          Gabarito · {tamanho(doc.tamanho)} · {doc.gabaritoItens?.length || 0} resposta(s)
                          {identidade ? ` · ${identidade}` : ''}
                        </small>
                      </div>
                      <button className="btn btn-danger-text" type="button" onClick={() => removerDocumento(doc.hash)}>
                        Remover arquivo
                      </button>
                    </div>
                    {doc.erro && <span className="form-error">{doc.erro}</span>}
                    {doc.avisos?.map((texto) => <small className="document-warning" key={texto}>{texto}</small>)}
                    {!doc.erro && doc.gabaritoItens?.length > 0 && (
                      <details className="content-review">
                        <summary>Conferir respostas detectadas</summary>
                        <div className="answer-key-grid">
                          {doc.gabaritoItens.map((item) => (
                            <label key={item.numero}>
                              <span>{item.numero}</span>
                              <select
                                value={item.resposta}
                                aria-label={`Resposta da questão ${item.numero}`}
                                onChange={(event) => atualizarItemGabarito(doc.hash, item.numero, event.target.value)}
                              >
                                {['A', 'B', 'C', 'D', 'E'].map((letra) => <option key={letra}>{letra}</option>)}
                              </select>
                              {item.disciplina && <small>{item.disciplina}</small>}
                            </label>
                          ))}
                        </div>
                      </details>
                    )}
                  </article>
                );
              }
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
                    <div className="answer-key-link">
                      <label>
                        <span>Gabarito desta prova</span>
                        <select value={doc.gabaritoHash || ''} onChange={(event) => associarGabarito(doc.hash, event.target.value)}>
                          <option value="">Ainda não vinculado</option>
                          {gabaritos.map((gabarito) => (
                            <option key={gabarito.hash} value={gabarito.hash}>
                              {gabarito.nome} ({gabarito.gabaritoItens?.length || 0} respostas)
                            </option>
                          ))}
                          {doc.gabaritoVinculado && !gabaritos.some((gabarito) => gabarito.hash === doc.gabaritoHash) && (
                            <option value={doc.gabaritoHash}>{doc.gabaritoVinculado.nome} (restaurado)</option>
                          )}
                        </select>
                      </label>
                      {doc.gabaritoVinculado && (
                        <small>
                          {doc.questoes.filter((questao) => questao.gabarito).length}/{doc.questoes.length} questão(ões) receberam resposta.
                        </small>
                      )}
                    </div>
                  )}

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
                          const validacaoBanco = validarQuestaoParaBanco(item, materias);
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
                                  {item.gabarito && <span>Gabarito {item.gabarito}{item.gabaritoRetificado ? ' · retificado' : ''}</span>}
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
                                  {item.incluirBanco !== false && (
                                    <span style={validacaoBanco.pronta ? { color: 'var(--success)' } : { color: 'var(--danger)' }}>
                                      {validacaoBanco.pronta ? 'pronta para o banco' : validacaoBanco.pendencias.join(' · ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="question-bank-controls">
                                <label>
                                  <span>Resposta correta</span>
                                  <select
                                    value={item.gabarito || ''}
                                    onChange={(event) => corrigirRespostaQuestao(doc.hash, item.numero, event.target.value)}
                                  >
                                    <option value="">Não encontrada</option>
                                    {['A', 'B', 'C', 'D', 'E'].map((letra) => <option key={letra}>{letra}</option>)}
                                  </select>
                                </label>
                                <label className="toggle-inline">
                                  <input
                                    type="checkbox"
                                    checked={item.incluirBanco !== false}
                                    onChange={(event) => alternarInclusaoBanco(doc.hash, item.id, event.target.checked)}
                                  />
                                  <span>Incluir no banco de questões</span>
                                </label>
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

          <div className="selection-summary card bank-summary">
            <div>
              <strong>Banco de questões</strong>
              <span>
                {resumoBanco.prontas} pronta(s) para simulados · {resumoBanco.revisar} aguardando gabarito,
                classificação ou revisão visual.
              </span>
            </div>
            <span>{resumoBanco.provas.length} prova(s) com questões aprováveis</span>
          </div>

          <div className="button-row wrap">
            <button className="btn btn-primary" onClick={classificar} disabled={processando || !selecao.conteudos}>
              {semClassificacao
                ? `Classificar ${semClassificacao} em segundo plano`
                : 'Reconferir classificações'}
            </button>
            <button className="btn" onClick={salvar} disabled={processando || !selecao.conteudos}>
              Salvar conteúdos selecionados
            </button>
            <button className="btn btn-primary" onClick={publicarNoBanco} disabled={processando || !resumoBanco.prontas}>
              Publicar {resumoBanco.prontas} no banco de questões
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
