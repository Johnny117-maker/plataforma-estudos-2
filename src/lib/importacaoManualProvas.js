import { supabase } from '../supabaseClient';
import { extrairDeArquivo } from './extrairTexto';
import { limparLinhas, segmentarQuestoes } from './segmentarProva';
import { religarCabecalhos } from './areasProva';
import {
  aplicarGabaritoNaProva,
  detectarIdentidadeProva,
  extrairItensGabarito,
  prepararProvasParaBanco,
  validarQuestaoParaBanco,
} from './bancoQuestoes';
import {
  capturarImagensQuestoesPdf,
  salvarCapturasQuestoes,
} from './questaoImagem';
import { seedMateriasPadrao } from './materiasSeed';
import { publicarBancoQuestoes } from './transactionService';
import {
  corrigirQuestoesFatecParaImportacao,
  organizarParesFatec,
  resumirFalhasQuestoes,
} from './importacaoManualFatec';

const MAX_BYTES = 25 * 1024 * 1024;

function emitir(onProgresso, percentual, mensagem, extras = {}) {
  onProgresso?.({
    percentual: Math.max(0, Math.min(100, Math.round(percentual))),
    mensagem,
    ...extras,
  });
}

async function sha256Arquivo(arquivo) {
  const digest = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function chaveMateria(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function validarIdentidade(metadados, par, nomeArquivo) {
  if (metadados.ano && metadados.ano !== par.ano) {
    throw new Error(`${nomeArquivo}: o ano detectado (${metadados.ano}) não corresponde a ${par.ano}.`);
  }
  if (metadados.semestre && metadados.semestre !== par.semestre) {
    throw new Error(`${nomeArquivo}: o semestre detectado não corresponde ao par ${par.chave}.`);
  }
}

function validarNumeracao(itens, total, rotulo) {
  const numeros = new Set((itens || []).map((item) => Number(item.numero)));
  const faltando = [];
  for (let numero = 1; numero <= total; numero += 1) {
    if (!numeros.has(numero)) faltando.push(numero);
  }
  if ((itens || []).length !== total || faltando.length) {
    const detalhe = faltando.length ? ` Faltando: ${faltando.join(', ')}.` : '';
    throw new Error(`${rotulo}: foram reconhecidos ${itens?.length || 0} de ${total} itens.${detalhe}`);
  }
}

async function extrairPar(par, indice, totalPares, onProgresso) {
  const base = (indice / totalPares) * 45;
  const faixa = 45 / totalPares;
  emitir(onProgresso, base, `Lendo a prova ${par.ano}/${par.semestre}…`, { chave: par.chave });

  const hashProva = await sha256Arquivo(par.prova);
  const extracaoProva = await extrairDeArquivo(par.prova, (pagina, paginas) => {
    emitir(
      onProgresso,
      base + faixa * 0.42 * (pagina / Math.max(1, paginas)),
      `${par.prova.name}: página ${pagina}/${paginas}`,
      { chave: par.chave }
    );
  });
  if (extracaoProva.tipo !== 'pdf' || extracaoProva.provavelDigitalizado) {
    throw new Error(`${par.prova.name}: é necessário um PDF com camada de texto.`);
  }

  const textoProva = extracaoProva.linhas.map((linha) => linha.texto).join('\n');
  const metadadosProva = detectarIdentidadeProva(textoProva, par.prova.name);
  validarIdentidade(metadadosProva, par, par.prova.name);
  const { linhas: linhasLimpas } = limparLinhas(extracaoProva.linhas);
  const { linhas } = religarCabecalhos(linhasLimpas);
  const segmentacao = segmentarQuestoes(linhas, 'fatec');
  let questoes = corrigirQuestoesFatecParaImportacao(linhas, segmentacao.questoes);
  validarNumeracao(questoes, par.totalQuestoes, par.prova.name);
  const falhasAlternativas = resumirFalhasQuestoes(questoes);
  if (falhasAlternativas.length) {
    throw new Error(`${par.prova.name}: ${falhasAlternativas.join('; ')}.`);
  }

  emitir(onProgresso, base + faixa * 0.48, `Lendo o gabarito ${par.ano}/${par.semestre}…`, { chave: par.chave });
  const hashGabarito = await sha256Arquivo(par.gabarito);
  const extracaoGabarito = await extrairDeArquivo(par.gabarito, (pagina, paginas) => {
    emitir(
      onProgresso,
      base + faixa * (0.48 + 0.32 * (pagina / Math.max(1, paginas))),
      `${par.gabarito.name}: página ${pagina}/${paginas}`,
      { chave: par.chave }
    );
  });
  const textoGabarito = extracaoGabarito.linhas.map((linha) => linha.texto).join('\n');
  const metadadosGabarito = detectarIdentidadeProva(textoGabarito, par.gabarito.name);
  validarIdentidade(metadadosGabarito, par, par.gabarito.name);
  const gabaritoExtraido = extrairItensGabarito(extracaoGabarito.linhas);
  validarNumeracao(gabaritoExtraido.itens, par.totalQuestoes, par.gabarito.name);
  const semDisciplina = gabaritoExtraido.itens.filter((item) => !item.disciplina).map((item) => item.numero);
  if (semDisciplina.length) {
    throw new Error(`${par.gabarito.name}: questões sem disciplina: ${semDisciplina.join(', ')}.`);
  }

  const prefixo = hashProva.slice(0, 12);
  questoes = questoes.map((questao, posicao) => ({
    ...questao,
    id: `${prefixo}-questao-${questao.numero}-${posicao}`,
    origem: 'importacao_manual_fatec',
    selecionada: true,
    incluirBanco: true,
    visualAnalisado: Boolean(questao.dependeDeVisual),
  }));

  const gabarito = {
    nome: par.gabarito.name,
    tipo: 'pdf',
    papel: 'gabarito',
    tamanho: par.gabarito.size,
    totalPaginas: extracaoGabarito.totalPaginas,
    hash: hashGabarito,
    metadadosProva: metadadosGabarito,
    gabaritoItens: gabaritoExtraido.itens,
    gabaritoRetificado: gabaritoExtraido.retificado,
    questoes: [],
    selecionado: false,
  };
  const prova = aplicarGabaritoNaProva({
    nome: par.prova.name,
    tipo: 'pdf',
    papel: 'prova',
    tamanho: par.prova.size,
    totalPaginas: extracaoProva.totalPaginas,
    hash: hashProva,
    perfil: segmentacao.perfilUsado,
    metadadosProva: {
      instituicao: metadadosProva.instituicao || 'FATEC',
      ano: par.ano,
      semestre: par.semestre,
    },
    tituloProva: `FATEC — ${par.semestre}º semestre de ${par.ano}`,
    selecionado: true,
    questoes,
  }, gabarito);

  emitir(onProgresso, base + faixa, `${par.chave}: ${questoes.length} questões e gabarito conferidos.`, {
    chave: par.chave,
  });
  return { ...par, provaDocumento: prova, gabaritoDocumento: gabarito };
}

function aplicarClassificacaoOficial(prova, materias) {
  const porNome = new Map((materias || []).map((materia) => [chaveMateria(materia.nome), materia]));
  const faltando = new Set();
  const questoes = prova.questoes.map((questao) => {
    const materia = porNome.get(chaveMateria(questao.disciplinaGabarito));
    if (!materia) faltando.add(questao.disciplinaGabarito || 'sem disciplina');
    return {
      ...questao,
      materiaConhecida: questao.disciplinaGabarito,
      classificacao: materia ? {
        id: questao.id,
        materia_id: materia.id,
        subgenero_id: null,
        materia_nome: materia.nome,
        assunto_nome: null,
        dificuldade: 'media',
        confianca: 1,
        origem: 'gabarito_oficial',
      } : null,
    };
  });
  if (faltando.size) {
    throw new Error(`Crie ou importe estas matérias antes de continuar: ${[...faltando].join(', ')}.`);
  }
  return { ...prova, questoes };
}

function falhasDePublicacao(prova, materias) {
  return prova.questoes.flatMap((questao) => {
    const validacao = validarQuestaoParaBanco(questao, materias);
    return validacao.pronta
      ? []
      : [`Q${questao.numero}: ${validacao.pendencias.join(', ')}`];
  });
}

/**
 * Importa um ou mais pares completos sem IA. A disciplina vem do gabarito;
 * questões já existentes são deduplicadas pelo RPC e recebem a imagem pelo
 * vínculo prova + número.
 */
export async function importarProvasFatecManualmente(arquivos, userId, onProgresso) {
  if (!userId) throw new Error('Entre na sua conta antes de iniciar a importação.');
  const lista = [...(arquivos || [])];
  if (lista.some((arquivo) => arquivo.size > MAX_BYTES)) {
    throw new Error('Cada PDF deve ter no máximo 25 MB.');
  }
  const pares = organizarParesFatec(lista);
  emitir(onProgresso, 0, 'Conferindo matérias e pares selecionados…');
  await seedMateriasPadrao(userId);
  const { data: materias, error: materiasError } = await supabase
    .from('materias')
    .select('id,nome,subgeneros(id,nome)')
    .order('ordem');
  if (materiasError) throw new Error(`Não foi possível carregar as matérias: ${materiasError.message}`);

  // Toda a estrutura textual é validada antes da primeira gravação. Assim um
  // PDF trocado ou incompleto não produz uma importação parcial evitável.
  const preparados = [];
  for (let indice = 0; indice < pares.length; indice += 1) {
    preparados.push(await extrairPar(pares[indice], indice, pares.length, onProgresso));
  }

  const resultadoFinal = {
    pares: [],
    provasProcessadas: preparados.length,
    questoesProcessadas: preparados.reduce((soma, par) => soma + par.totalQuestoes, 0),
    questoesInseridas: 0,
    questoesDuplicadas: 0,
    questoesIgnoradas: 0,
    imagensVinculadas: 0,
  };

  for (let indice = 0; indice < preparados.length; indice += 1) {
    const preparado = preparados[indice];
    const base = 45 + (indice / preparados.length) * 55;
    const faixa = 55 / preparados.length;
    let prova = aplicarClassificacaoOficial(preparado.provaDocumento, materias || []);
    const visuais = prova.questoes.filter((questao) => questao.dependeDeVisual);

    emitir(onProgresso, base, `${preparado.chave}: recortando ${visuais.length} recurso(s) visual(is)…`, {
      chave: preparado.chave,
    });
    const capturas = await capturarImagensQuestoesPdf(
      preparado.prova,
      prova.questoes,
      (pagina, totalPaginas) => emitir(
        onProgresso,
        base + faixa * 0.32 * (pagina / Math.max(1, totalPaginas)),
        `${preparado.chave}: recortando página visual ${pagina}/${totalPaginas}…`,
        { chave: preparado.chave }
      ),
      { preferirPainelCompleto: true, fallbackQuestaoCompleta: true }
    );
    const capturadas = new Set(capturas.map((captura) => String(captura.id)));
    const imagensFaltando = visuais
      .filter((questao) => !capturadas.has(String(questao.id)))
      .map((questao) => questao.numero);
    if (imagensFaltando.length) {
      throw new Error(`${preparado.chave}: não foi possível recortar o recurso visual das questões ${imagensFaltando.join(', ')}.`);
    }

    emitir(onProgresso, base + faixa * 0.34, `${preparado.chave}: enviando ${capturas.length} imagem(ns)…`, {
      chave: preparado.chave,
    });
    const imagens = await salvarCapturasQuestoes(
      prova.hash,
      capturas,
      (atual, total) => emitir(
        onProgresso,
        base + faixa * (0.34 + 0.36 * (atual / Math.max(1, total))),
        `${preparado.chave}: enviando imagem ${atual}/${total}…`,
        { chave: preparado.chave }
      )
    );
    prova = {
      ...prova,
      questoes: prova.questoes.map((questao) => ({
        ...questao,
        ...(imagens.get(String(questao.id)) || {}),
      })),
    };

    const payload = prepararProvasParaBanco(
      [prova],
      materias || [],
      `Importação manual FATEC ${preparado.chave}`
    );
    if (payload.prontas !== preparado.totalQuestoes || payload.revisar) {
      const falhas = falhasDePublicacao(prova, materias || []);
      throw new Error(`${preparado.chave}: a validação bloqueou ${falhas.length} questão(ões): ${falhas.slice(0, 12).join('; ')}.`);
    }

    emitir(onProgresso, base + faixa * 0.74, `${preparado.chave}: publicando ${payload.prontas} questões…`, {
      chave: preparado.chave,
    });
    const publicado = await publicarBancoQuestoes(
      `Importação manual FATEC ${preparado.chave}`,
      payload.provas
    );
    const detalhe = {
      chave: preparado.chave,
      total: preparado.totalQuestoes,
      inseridas: Number(publicado.questoes_inseridas || 0),
      duplicadas: Number(publicado.questoes_duplicadas || 0),
      ignoradas: Number(publicado.questoes_ignoradas || 0),
      imagens: Number(publicado.imagens_vinculadas || 0),
    };
    resultadoFinal.pares.push(detalhe);
    resultadoFinal.questoesInseridas += detalhe.inseridas;
    resultadoFinal.questoesDuplicadas += detalhe.duplicadas;
    resultadoFinal.questoesIgnoradas += detalhe.ignoradas;
    resultadoFinal.imagensVinculadas += detalhe.imagens;
    emitir(onProgresso, base + faixa, `${preparado.chave}: concluído.`, { chave: preparado.chave });
  }

  emitir(onProgresso, 100, 'Importação manual concluída.');
  return resultadoFinal;
}
