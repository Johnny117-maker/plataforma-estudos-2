const LETRAS = 'ABCDE';
const RE_CABECALHO = /^\s*Quest[ãa]o\s+(\d{1,3})\s*$/i;
const RE_ALTERNATIVA = /^\s*\(([A-E])\)\s*(.*)$/;
const RE_FONTE = /(?:https?:\/\/|www\.|tinyurl|acesso\s+em|original\s+colorido|\bfonte\s*:|\bvestibular\b)/i;

export const CADERNOS_FATEC_SUPORTADOS = Object.freeze({
  '2024-1': Object.freeze({ ano: 2024, semestre: 1, totalQuestoes: 54 }),
  '2025-2': Object.freeze({ ano: 2025, semestre: 2, totalQuestoes: 64 }),
  '2026-1': Object.freeze({ ano: 2026, semestre: 1, totalQuestoes: 60 }),
  '2026-2': Object.freeze({ ano: 2026, semestre: 2, totalQuestoes: 60 }),
});

export const TOTAL_QUESTOES_CADERNOS_FATEC = Object.values(CADERNOS_FATEC_SUPORTADOS)
  .reduce((soma, caderno) => soma + caderno.totalQuestoes, 0);

function semAcentos(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function identificarArquivoFatec(nomeArquivo) {
  const normalizado = semAcentos(nomeArquivo).replace(/[^a-z0-9]+/g, ' ').trim();
  const ano = Number(/\b(20\d{2})\b/.exec(normalizado)?.[1] || 0);
  const semestre = Number(/\b([12])\s*(?:o\s*)?semestre\b/.exec(normalizado)?.[1] || 0);
  const papel = /\bgabarito\b/.test(normalizado)
    ? 'gabarito'
    : /\bprova\b/.test(normalizado) ? 'prova' : null;
  const chave = ano && semestre ? `${ano}-${semestre}` : null;
  return {
    ano: ano || null,
    semestre: semestre || null,
    papel,
    chave,
    suportado: Boolean(chave && papel && CADERNOS_FATEC_SUPORTADOS[chave]),
  };
}

export function organizarParesFatec(arquivos) {
  const pares = new Map();
  for (const arquivo of arquivos || []) {
    const identidade = identificarArquivoFatec(arquivo?.name);
    if (!identidade.suportado) {
      throw new Error(`Arquivo não reconhecido para esta importação: ${arquivo?.name || 'sem nome'}.`);
    }
    const par = pares.get(identidade.chave) || {
      ...CADERNOS_FATEC_SUPORTADOS[identidade.chave],
      chave: identidade.chave,
      prova: null,
      gabarito: null,
    };
    if (par[identidade.papel]) {
      throw new Error(`Há dois arquivos definidos como ${identidade.papel} para ${identidade.chave}.`);
    }
    par[identidade.papel] = arquivo;
    pares.set(identidade.chave, par);
  }

  if (!pares.size) throw new Error('Selecione ao menos uma prova e o gabarito correspondente.');
  for (const par of pares.values()) {
    if (!par.prova || !par.gabarito) {
      throw new Error(`O par ${par.chave} está incompleto: selecione a prova e o gabarito.`);
    }
  }
  return [...pares.values()].sort((a, b) => a.ano - b.ano || a.semestre - b.semestre);
}

export function maiorLacunaVisual(questao) {
  return [...(questao?.lacunasVisuaisOrigem || [])]
    .sort((a, b) => (b.area || 0) - (a.area || 0))[0] || null;
}

export function deveTerRecursoVisual(questao) {
  if (questao?.dependeDeVisual) return true;
  const lacuna = maiorLacunaVisual(questao);
  if (!lacuna) return false;
  const altura = Number(lacuna.y1) - Number(lacuna.y0);
  return altura >= 70 && Number(lacuna.area || 0) >= 18_000;
}

function linhaComCoordenadas(linha) {
  return Number.isFinite(linha?.pagina)
    && Number.isFinite(linha?.x0)
    && Number.isFinite(linha?.y0)
    && Number.isFinite(linha?.y1);
}

function cabecalhosComCoordenadas(linhas) {
  return (linhas || []).flatMap((linha, indice) => {
    const match = RE_CABECALHO.exec(String(linha?.texto || ''));
    return match && linhaComCoordenadas(linha)
      ? [{ ...linha, indice, numero: Number(match[1]) }]
      : [];
  });
}

function linhasAbaixoDoCabecalho(linhas, numero) {
  const cabecalhos = cabecalhosComCoordenadas(linhas);
  const atual = cabecalhos.find((cabecalho) => cabecalho.numero === Number(numero));
  if (!atual) return [];

  const proximoNaPagina = cabecalhos
    .filter((cabecalho) => cabecalho.pagina === atual.pagina && cabecalho.y0 < atual.y0 - 2)
    .sort((a, b) => b.y0 - a.y0)[0] || null;
  const limiteInferior = proximoNaPagina?.y1 ?? -Infinity;

  return (linhas || [])
    .filter((linha) => linhaComCoordenadas(linha)
      && linha.pagina === atual.pagina
      && linha.y0 < atual.y0 - 1
      && linha.y1 > limiteInferior + 1
      && linha !== atual)
    .sort((a, b) => b.y0 - a.y0 || a.x0 - b.x0);
}

/**
 * Reconstitui uma questão cuja imagem divide a página em duas colunas. A
 * camada textual pode colocar o cabeçalho seguinte antes das alternativas da
 * coluna direita; a faixa física entre os cabeçalhos não sofre desse erro.
 */
export function reconstruirQuestaoPelaGeometria(linhas, numero) {
  const candidatas = linhasAbaixoDoCabecalho(linhas, numero);
  const enunciado = [];
  const alternativas = [];
  let atual = null;
  let iniciouAlternativas = false;

  for (const linha of candidatas) {
    const texto = String(linha.texto || '').replace(/\s+/g, ' ').trim();
    if (!texto || RE_FONTE.test(texto)) continue;
    const marcador = RE_ALTERNATIVA.exec(texto);
    if (marcador) {
      iniciouAlternativas = true;
      atual = {
        letra: marcador[1],
        x0: linha.x0,
        partes: [`(${marcador[1]}) ${marcador[2]}`.trim()],
      };
      alternativas.push(atual);
      continue;
    }
    if (!iniciouAlternativas) {
      enunciado.push(texto);
      continue;
    }
    // Continuação da alternativa na mesma coluna. Créditos posicionados sob
    // uma figura da coluna vizinha ficam de fora.
    if (atual && linha.x0 >= atual.x0 - 18) atual.partes.push(texto);
  }

  if (alternativas.map((item) => item.letra).join('') !== LETRAS) return null;
  return {
    enunciado: enunciado.join('\n').trim(),
    alternativas: alternativas.map((item) => item.partes.join(' ').replace(/\s+/g, ' ').trim()),
    letras: [...LETRAS],
  };
}

export function criarAlternativasVisuais() {
  return [...LETRAS].map((letra) => `(${letra}) Alternativa ${letra}, conforme o recurso visual.`);
}

function quantidadeAlternativasComTexto(questao) {
  return (questao?.alternativas || [])
    .map((alternativa) => String(alternativa || '')
      .replace(/^\s*\(?[A-Ea-e]\s*[).:-]?\s*/, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .length;
}

/** Corrige somente inconsistências objetivas; nunca inventa enunciados. */
export function corrigirQuestoesFatecParaImportacao(linhas, questoes) {
  const corrigidas = (questoes || []).map((questao) => ({
    ...questao,
    alternativas: [...(questao.alternativas || [])],
    letras: [...(questao.letras || [])],
  }));

  // Caso real de página com imagem à esquerda e alternativas à direita: uma
  // questão fica com zero opções e a seguinte recebe dois conjuntos A–E.
  for (let indice = 0; indice + 1 < corrigidas.length; indice += 1) {
    const atual = corrigidas[indice];
    const proxima = corrigidas[indice + 1];
    if (atual.alternativas.length !== 0 || proxima.alternativas.length < 10) continue;
    const reconstruidaAtual = reconstruirQuestaoPelaGeometria(linhas, atual.numero);
    const reconstruidaProxima = reconstruirQuestaoPelaGeometria(linhas, proxima.numero);
    if (!reconstruidaAtual || !reconstruidaProxima) continue;
    Object.assign(atual, reconstruidaAtual, {
      caracteres: reconstruidaAtual.enunciado.length,
      paraClassificar: reconstruidaAtual.enunciado,
      corrigidaPorGeometria: true,
    });
    Object.assign(proxima, reconstruidaProxima, {
      caracteres: reconstruidaProxima.enunciado.length,
      paraClassificar: reconstruidaProxima.enunciado,
      corrigidaPorGeometria: true,
    });
  }

  for (const questao of corrigidas) {
    const visual = deveTerRecursoVisual(questao);
    questao.dependeDeVisual = visual;
    if (visual && (questao.alternativas.length !== 5 || quantidadeAlternativasComTexto(questao) !== 5)) {
      // Em algumas questões, A–E são cinco desenhos/gráficos. O texto das
      // opções é deliberadamente posicional; o conteúdo está no recorte.
      questao.alternativas = criarAlternativasVisuais();
      questao.letras = [...LETRAS];
      questao.alternativasRepresentadasNaImagem = true;
    }
  }
  return corrigidas;
}

export function resumirFalhasQuestoes(questoes) {
  return (questoes || [])
    .filter((questao) => questao.alternativas?.length !== 5)
    .map((questao) => `Q${questao.numero}: ${questao.alternativas?.length || 0}/5 alternativas`);
}
