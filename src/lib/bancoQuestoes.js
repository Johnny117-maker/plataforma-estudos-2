const LETRAS = 'ABCDE';

// Uma alternativa não pode carregar o cabeçalho de outra questão nem uma
// instrução que abre um bloco compartilhado. Isso é uma defesa adicional à
// segmentação: se um PDF novo tiver diagramação inesperada, a questão fica em
// revisão em vez de contaminar o banco e os simulados.
const RE_TEXTO_DE_OUTRA_QUESTAO = /\bquest[ãa]o\s+\d{1,3}\b|\b(?:leia|texto|considere|observe|analise)\b.{0,220}\bquest[õo]es?\s+\d{1,3}\b|\bVESTIBULAR\b/is;

const MATERIAS_GABARITO = [
  ['História Brasileira', ['historia brasileira', 'historia do brasil']],
  ['História Geral', ['historia geral']],
  ['Raciocínio Lógico', ['raciocinio logico', 'logica']],
  ['Português', ['lingua portuguesa', 'portugues']],
  ['Matemática', ['matematica']],
  ['Física', ['fisica']],
  ['Química', ['quimica']],
  ['Biologia', ['biologia']],
  ['Geografia', ['geografia']],
  ['Literatura', ['literatura']],
  ['Inglês', ['lingua inglesa', 'ingles']],
  ['Sociologia', ['sociologia']],
  ['Filosofia', ['filosofia']],
];

function semAcentos(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizarLetra(valor) {
  const letra = String(valor || '').trim().toUpperCase();
  return LETRAS.includes(letra) ? letra : null;
}

export function letraParaIndice(letra) {
  const normalizada = normalizarLetra(letra);
  return normalizada ? LETRAS.indexOf(normalizada) : -1;
}

export function limparAlternativa(texto) {
  return String(texto || '')
    .replace(/^\s*\(?[A-Ea-e]\s*[).:-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectarMateriaGabarito(texto) {
  const normalizado = semAcentos(texto);
  for (const [nome, apelidos] of MATERIAS_GABARITO) {
    if (apelidos.some((apelido) => normalizado.includes(apelido))) return nome;
  }
  return null;
}

export function detectarIdentidadeProva(texto = '', nomeArquivo = '') {
  const fonte = `${nomeArquivo}\n${String(texto).slice(0, 12_000)}`;
  const normalizada = semAcentos(fonte);
  const anos = [...fonte.matchAll(/\b(20\d{2})\b/g)].map((item) => Number(item[1]));
  const ano = anos.find((item) => item >= 2000 && item <= 2100) || null;

  let semestre = null;
  const semestreExplicito = /\b([12])\s*[ºo°.]?\s*(?:semestre|sem\.?)(?:\b|\/)/i.exec(fonte);
  const semestreCompacto = /\b(?:semestre|sem\.?)\s*([12])\b/i.exec(fonte);
  if (semestreExplicito) semestre = Number(semestreExplicito[1]);
  else if (semestreCompacto) semestre = Number(semestreCompacto[1]);

  let instituicao = null;
  if (/\bfatec\b|faculdade de tecnologia/i.test(normalizada)) instituicao = 'FATEC';
  else if (/\bunicamp\b|comvest/i.test(normalizada)) instituicao = 'UNICAMP';
  else if (/\bfuvest\b|universidade de sao paulo/i.test(normalizada)) instituicao = 'FUVEST';
  else if (/\benem\b|exame nacional do ensino medio/i.test(normalizada)) instituicao = 'ENEM';

  return { instituicao, ano, semestre };
}

function numerosValidos(texto) {
  return (String(texto).match(/\b\d{1,3}\b/g) || [])
    .map(Number)
    .filter((numero) => numero >= 1 && numero <= 300);
}

function letrasIsoladas(texto) {
  return (String(texto).match(/(?:^|\s|[|;,:-])\(?([A-E])\)?(?=$|\s|[|;,:-])/gi) || [])
    .map((trecho) => trecho.replace(/[^A-E]/gi, '').toUpperCase())
    .filter(Boolean);
}

function adicionarItem(mapa, item) {
  const anterior = mapa.get(item.numero);
  mapa.set(item.numero, {
    ...anterior,
    ...item,
    retificada: Boolean(item.retificada || anterior?.retificada || (anterior && anterior.resposta !== item.resposta)),
  });
}

/**
 * Extrai pares número/resposta de gabaritos em lista ou tabela. Aceita linhas
 * como "01 A Matemática", "1-A 2-B" e tabelas com números em uma linha e
 * letras na linha seguinte. Se uma questão reaparecer, a última resposta vence
 * e a versão fica marcada como retificada.
 */
export function extrairItensGabarito(linhas) {
  const fonte = (linhas || [])
    .map((linha) => ({ texto: String(linha?.texto || '').replace(/\s+/g, ' ').trim(), pagina: linha?.pagina || 1 }))
    .filter((linha) => linha.texto);
  const itens = new Map();
  const avisos = [];
  let materiaAtual = null;
  let encontrouRetificacao = false;

  for (let indice = 0; indice < fonte.length; indice += 1) {
    const linha = fonte[indice];
    const materiaLinha = detectarMateriaGabarito(linha.texto);
    if (materiaLinha) materiaAtual = materiaLinha;
    const retificada = /retific|corrigid|substitu[ií]d/i.test(linha.texto);
    if (retificada) encontrouRetificacao = true;

    const pares = [];
    const regex = /(?:quest(?:[ãa]o|ao)\s*)?(\d{1,3})\s*(?:[-–—:.)]|\s)\s*(?:alternativa\s*)?(?:\(|\[)?([A-E])(?:\)|\])?(?=$|\s|[|;,:-])/gi;
    let match;
    while ((match = regex.exec(linha.texto)) !== null) {
      const numero = Number(match[1]);
      if (numero >= 1 && numero <= 300) pares.push({ numero, resposta: match[2].toUpperCase() });
    }

    if (pares.length) {
      for (const par of pares) {
        adicionarItem(itens, {
          ...par,
          disciplina: materiaLinha || materiaAtual,
          pagina: linha.pagina,
          retificada,
        });
      }
      continue;
    }

    const numeros = numerosValidos(linha.texto);
    const proxima = fonte[indice + 1];
    if (numeros.length >= 2 && proxima) {
      const letras = letrasIsoladas(proxima.texto);
      if (letras.length === numeros.length) {
        const materiaProxima = detectarMateriaGabarito(proxima.texto) || materiaAtual;
        numeros.forEach((numero, posicao) => adicionarItem(itens, {
          numero,
          resposta: letras[posicao],
          disciplina: materiaProxima,
          pagina: linha.pagina,
          retificada: retificada || /retific|corrigid/i.test(proxima.texto),
        }));
        indice += 1;
      }
    }
  }

  const ordenados = [...itens.values()].sort((a, b) => a.numero - b.numero);
  if (!ordenados.length) avisos.push('Nenhum par questão/resposta foi reconhecido no gabarito.');
  else {
    const faltando = [];
    for (let numero = ordenados[0].numero; numero <= ordenados[ordenados.length - 1].numero; numero += 1) {
      if (!itens.has(numero)) faltando.push(numero);
    }
    if (faltando.length) avisos.push(`Numeração ausente no gabarito: ${faltando.join(', ')}.`);
  }
  if (encontrouRetificacao || ordenados.some((item) => item.retificada)) {
    avisos.push('O arquivo contém indicação de retificação; a última resposta encontrada para cada questão foi preservada.');
  }

  return { itens: ordenados, avisos, retificado: encontrouRetificacao || ordenados.some((item) => item.retificada) };
}

function mesmaIdentidade(a, b) {
  if (!a || !b) return false;
  const campos = ['instituicao', 'ano', 'semestre'];
  let comparados = 0;
  for (const campo of campos) {
    if (a[campo] == null || b[campo] == null) continue;
    comparados += 1;
    if (String(a[campo]).toLowerCase() !== String(b[campo]).toLowerCase()) return false;
  }
  return comparados >= 2;
}

export function aplicarGabaritoNaProva(prova, gabarito) {
  if (!prova || prova.papel === 'gabarito') return prova;
  const porNumero = new Map((gabarito?.gabaritoItens || []).map((item) => [Number(item.numero), item]));
  return {
    ...prova,
    gabaritoHash: gabarito?.hash || null,
    gabaritoVinculado: gabarito ? {
      hash: gabarito.hash,
      nome: gabarito.nome,
      itens: gabarito.gabaritoItens || [],
      retificado: Boolean(gabarito.gabaritoRetificado),
      metadadosProva: gabarito.metadadosProva || null,
    } : null,
    questoes: (prova.questoes || []).map((questao) => {
      const item = porNumero.get(Number(questao.numero));
      const materiaBase = questao.materiaConhecidaBase ?? questao.materiaConhecida ?? null;
      return {
        ...questao,
        materiaConhecidaBase: materiaBase,
        gabarito: item?.resposta || null,
        disciplinaGabarito: item?.disciplina || null,
        materiaConhecida: item?.disciplina || materiaBase,
        gabaritoRetificado: Boolean(item?.retificada),
        incluirBanco: questao.incluirBanco !== false,
      };
    }),
  };
}

export function vincularGabaritosAutomaticamente(documentos) {
  const gabaritos = documentos.filter((doc) => doc.papel === 'gabarito' && doc.gabaritoItens?.length);
  const provas = documentos.filter((doc) => doc.papel !== 'gabarito');
  return documentos.map((doc) => {
    if (doc.papel === 'gabarito' || doc.gabaritoHash) return doc;
    let candidato = gabaritos.find((gabarito) => mesmaIdentidade(doc.metadadosProva, gabarito.metadadosProva));
    if (!candidato && provas.length === 1 && gabaritos.length === 1) candidato = gabaritos[0];
    return candidato ? aplicarGabaritoNaProva(doc, candidato) : doc;
  });
}

function resolverMateria(classificacao, materias) {
  const nome = classificacao?.materia_nome;
  if (!nome) return null;
  const alvo = semAcentos(nome);
  return (materias || []).find((materia) => semAcentos(materia.nome) === alvo) || null;
}

function resolverSubgenero(classificacao, materia) {
  const nome = classificacao?.assunto_nome;
  if (!nome || !materia) return null;
  const alvo = semAcentos(nome);
  return (materia.subgeneros || []).find((assunto) => semAcentos(assunto.nome) === alvo) || null;
}

export function validarQuestaoParaBanco(questao, materias = []) {
  const pendencias = [];
  const alternativasOriginais = questao?.alternativas || [];
  const alternativas = alternativasOriginais.map(limparAlternativa).filter(Boolean);
  const materia = resolverMateria(questao?.classificacao, materias);
  const letra = normalizarLetra(questao?.gabarito);

  if (!Number.isInteger(Number(questao?.numero)) || Number(questao.numero) < 1) pendencias.push('sem número');
  if (String(questao?.enunciado || '').trim().length < 40) pendencias.push('enunciado incompleto');
  if (alternativas.length !== 5) pendencias.push(`${alternativas.length}/5 alternativas`);
  if (Array.isArray(questao?.letras) && questao.letras.join('').toUpperCase() !== 'ABCDE') {
    pendencias.push('ordem das alternativas inválida');
  }
  if (alternativasOriginais.some((alternativa) => RE_TEXTO_DE_OUTRA_QUESTAO.test(String(alternativa)))) {
    pendencias.push('alternativa contém texto de outra questão');
  }
  if (!letra) pendencias.push('sem resposta do gabarito');
  if (!materia) pendencias.push('matéria ainda não classificada');
  if (questao?.dependeDeVisual && !questao?.visualAnalisado && !questao?.descricaoVisual) {
    pendencias.push('elemento visual não revisado');
  }
  if (questao?.dependeDeVisual && !questao?.imagemStoragePath) {
    pendencias.push('recurso visual ainda não extraído');
  }

  return { pronta: pendencias.length === 0, pendencias, alternativas, letra, materia };
}

export function prepararProvasParaBanco(documentos, materias, nomeAnalise = 'Banco de questões', analiseId = null) {
  const provas = [];
  let prontas = 0;
  let revisar = 0;

  for (const documento of documentos || []) {
    if (documento.papel === 'gabarito' || documento.selecionado === false) continue;
    const gabarito = documento.gabaritoVinculado;
    if (!gabarito?.itens?.length) {
      revisar += (documento.questoes || []).filter((questao) => questao.incluirBanco !== false).length;
      continue;
    }

    const questoes = [];
    for (const questao of documento.questoes || []) {
      if (questao.incluirBanco === false || questao.selecionada === false) continue;
      const validacao = validarQuestaoParaBanco(questao, materias);
      if (!validacao.pronta) {
        revisar += 1;
        continue;
      }
      const subgenero = resolverSubgenero(questao.classificacao, validacao.materia);
      questoes.push({
        numero: Number(questao.numero),
        pagina: questao.pagina || null,
        enunciado: String(questao.enunciado || '').trim(),
        alternativas: validacao.alternativas,
        resposta: validacao.letra,
        materia_id: validacao.materia.id,
        materia_nome: validacao.materia.nome,
        subgenero_id: subgenero?.id || null,
        assunto_nome: questao.classificacao?.assunto_nome || null,
        dificuldade: questao.classificacao?.dificuldade || 'media',
        confianca: questao.classificacao?.confianca ?? null,
        depende_de_visual: Boolean(questao.dependeDeVisual),
        descricao_visual: questao.descricaoVisual || null,
        imagem_url: questao.imagemStoragePath || null,
        gabarito_retificado: Boolean(questao.gabaritoRetificado),
      });
      prontas += 1;
    }

    if (questoes.length) {
      provas.push({
        titulo: documento.tituloProva || `${documento.metadadosProva?.instituicao || 'Prova'} ${documento.metadadosProva?.ano || ''}${documento.metadadosProva?.semestre ? `/${documento.metadadosProva.semestre}` : ''}`.trim(),
        instituicao: documento.metadadosProva?.instituicao || null,
        ano: documento.metadadosProva?.ano || null,
        semestre: documento.metadadosProva?.semestre || null,
        nome_arquivo: documento.nome,
        hash_sha256: documento.hash,
        analise_id: analiseId,
        gabarito_nome_arquivo: gabarito.nome,
        gabarito_retificado: Boolean(gabarito.retificado),
        gabarito_itens: gabarito.itens,
        total_questoes_origem: documento.questoes?.length || questoes.length,
        questoes,
      });
    }
  }

  return { nome: nomeAnalise, provas, prontas, revisar };
}

export function embaralharQuestoes(perguntas, historico = [], estrategia = 'aleatorio', quantidade = 20) {
  const desempenho = new Map();
  for (const resposta of historico || []) {
    const atual = desempenho.get(resposta.pergunta_id) || { tentativas: 0, erros: 0 };
    atual.tentativas += 1;
    if (!resposta.correta) atual.erros += 1;
    desempenho.set(resposta.pergunta_id, atual);
  }

  const aleatorio = [...(perguntas || [])].map((pergunta) => ({ pergunta, sorteio: Math.random() }));
  aleatorio.sort((a, b) => {
    const da = desempenho.get(a.pergunta.id) || { tentativas: 0, erros: 0 };
    const db = desempenho.get(b.pergunta.id) || { tentativas: 0, erros: 0 };
    if (estrategia === 'mais_erradas') {
      const taxaA = da.tentativas ? da.erros / da.tentativas : -1;
      const taxaB = db.tentativas ? db.erros / db.tentativas : -1;
      return taxaB - taxaA || b.sorteio - a.sorteio;
    }
    if (estrategia === 'nao_respondidas') {
      return da.tentativas - db.tentativas || b.sorteio - a.sorteio;
    }
    return b.sorteio - a.sorteio;
  });

  const limite = Math.max(1, Math.min(Number(quantidade) || 20, aleatorio.length));
  return aleatorio.slice(0, limite).map((item) => item.pergunta);
}
