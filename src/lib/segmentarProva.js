// Segmentação da prova em questões — tudo determinístico, sem IA.
//
// O corte acontece em dois níveis:
//
//   Nível 1  quebra o documento em blocos, um por questão, pelo cabeçalho
//            ("QUESTÃO 12" ou "Questão 12").
//   Nível 2  quebra cada bloco em partes: enunciado, alternativas, gabarito e
//            comentário.
//
// O nível 2 é o que faz a diferença numa prova comentada. Na prova da Unicamp
// o comentário é cerca de 70% do texto; separando-o, a IA recebe depois só o
// enunciado e as alternativas. E o comentário não é jogado fora: dele saem de
// graça o gabarito, o tópico do programa e o índice de facilidade.

import { criarLacunasVisuaisOrigem, criarRecortesOrigem } from './recortesQuestao.js';
import { aplicarDependenciaVisualExpandida } from './inferirDependenciaVisual.js';

const RE_SO_SIMBOLOS = /^[\s\-–—_.·•=]*$/;
const RE_FIM_DOCUMENTO = /^\s*(?:gabarito\s+oficial|folha\s+de\s+respostas|rascunho(?:\s+da\s+reda[çc][ãa]o)?|proposta\s+de\s+reda[çc][ãa]o)\s*$/i;
// Os cadernos recentes usam rodapés como "VESTIBULAR 2o SEM | 2026 • 5";
// os antigos usam "14 VESTIBULAR · Fatec". Todos devem desaparecer antes
// da divisão das alternativas.
const RE_RODAPE_FATEC = /^\s*(?:\d{1,3}\s+)?VESTIBULAR\b.{0,60}?(?:\d{1,3}\s*)?[∙·•]?\s*$/i;

// Marcadores que abrem a parte comentada de uma questão.
const RE_COMENTARIO =
  /^\s*(?:Objetivo da Quest[ãa]o|Alternativa Correta|Desempenho dos candidatos|Coment[áa]rios Gerais|Item do programa|Solu[çc][ãa]o\s*:)/i;

const RE_GABARITO = /^\s*Alternativa\s+Correta\s*:\s*([A-E])\b/i;
const RE_PROGRAMA = /(?:iten?s?|pontos?|t[óo]picos?)\s+do\s+programa\b(.*)$/i;
const RE_FACILIDADE = /[ÍI]ndice\s+de\s+[Ff]acilidade[^\d]{0,15}([01][,.]\d+)/;
const RE_ACERTOS = /(\d{1,2}(?:[,.]\d+)?)\s*%\s*de\s+acertos/i;

// Só conta como texto compartilhado a linha que ABRE um bloco de apoio. Sem a
// âncora no início, a mesma expressão casaria dentro do comentário, que repete
// coisas como "(texto comum para as questões 13 e 14)".
const RE_COMPARTILHADO = /^\s*(?:Texto|Leia|Considere|Observe|Analise)\b.{0,220}?quest[õo]es?\s+((?:de\s+)?\d{1,3}(?:\s*(?:,|e|a)\s*\d{1,3})*)/i;

// Palavras que indicam que a questão depende de algo que não é texto. Esta é a
// primeira das duas passagens de detecção: capta os casos óbvios em que o
// enunciado nomeia o recurso. A segunda passagem, geométrica, roda depois via
// aplicarDependenciaVisualExpandida e pega os casos em que o vocabulário não
// bate (por exemplo, "O quadro relaciona..." ou uma tabela sem palavra-chave).
//
// A regex foi ampliada para cobrir o vocabulário oficial da FATEC 2026: além
// dos termos clássicos, agora reconhece "quadro" (sinônimo de tabela na banca),
// "fórmula" isolada, "estrutura", "radar", "bandeira", "cartaz", "mascote",
// "logotipo", "emblema" e afins. Isso resolve os falsos negativos em Q6, Q24,
// Q25 e Q26 sem depender só da heurística geométrica.
const RE_VISUAL =
  /\b(figura|gr[áa]fico|imagem|tabela|quadro|mapa|tirinha|quadrinho|infogr[áa]fico|esquema|diagrama|charge|heredograma|fluxograma|placa|desenho|fotografia|ilustra[çc][ãa]o|f[óo]rmulas?|estrutur[a-z]{0,4}|equa[çc][ãa]o|radar|bandeira|logotipo|emblema|mascote|cartaz|painel|molde|planta|croqui|reproduc[ãa]o|composi[çc][ãa]o|receita|c[óo]digo|s[íi]mbolo|selo|cartum)\b/i;

export const PERFIS = {
  auto: { rotulo: 'Detectar automaticamente' },
  unicamp: {
    rotulo: 'Unicamp (QUESTÃO N, alternativas a–d)',
    abre: /^\s*QUEST[ÃA]O\s+(\d{1,3})\s*$/,
    alternativa: /^\s*([a-e])\)\s*\S/,
    letras: 'abcd',
    comentada: true,
  },
  fatec: {
    rotulo: 'Fatec / Enem (Questão N, alternativas A–E)',
    abre: /^\s*Quest[ãa]o\s+(\d{1,3})\s*$/i,
    alternativa: /^\s*\(([A-E])\)(?:\s*\S.*)?$/,
    letras: 'ABCDE',
    comentada: false,
  },
  generico: {
    rotulo: 'Genérico (numeração solta)',
    abre: /^\s*(?:Quest[ãa]o\s+)?(\d{1,3})\s*[.)\u2013\u2014-]?\s*$/i,
    alternativa: /^\s*\(?([a-eA-E])[).]\s*\S/,
    letras: null,
    comentada: false,
  },
};

const RE_MARCADOR_ALTERNATIVA_SOZINHO = /^\s*\(([A-E])\)\s*$/;
const RE_TERMO_FRACAO = /^\s*[−–—-]?\d+(?:[,.]\d+)?\s*$/;

// Em algumas provas da Fatec, a camada textual entrega uma fração vertical na
// ordem "numerador, (A), denominador". Reorganizar esse trio antes de procurar
// as alternativas evita que todo o bloco seja incorporado ao enunciado.
function normalizarAlternativasDiagramadas(corpo) {
  const anotadas = (corpo || []).map((linha, indice) => ({
    ...linha,
    indiceOriginalInicio: indice,
    indiceOriginalFim: indice,
  }));
  const saida = [];
  for (let indice = 0; indice < anotadas.length; indice += 1) {
    const linha = anotadas[indice];
    const marcador = RE_MARCADOR_ALTERNATIVA_SOZINHO.exec(linha.texto);
    const numerador = saida[saida.length - 1];
    const denominador = anotadas[indice + 1];
    if (
      marcador
      && numerador
      && denominador
      && RE_TERMO_FRACAO.test(numerador.texto)
      && RE_TERMO_FRACAO.test(denominador.texto)
    ) {
      saida.pop();
      saida.push({
        ...linha,
        texto: `(${marcador[1]}) ${numerador.texto.trim()}/${denominador.texto.trim()}`,
        indiceOriginalInicio: numerador.indiceOriginalInicio,
        indiceOriginalFim: denominador.indiceOriginalFim,
      });
      indice += 1;
      continue;
    }
    saida.push(linha);
  }
  return saida;
}

function normalizar(texto) {
  const limpo = texto
    .replace(/\u00A0/g, ' ')
    .replace(/\u00AD/g, '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  // Alguns PDFs possuem a mesma camada textual duas vezes exatamente sobre a
  // mesma posição. O pdf.js então devolve "Leia...07.Leia...07." em uma única
  // linha. Remover a metade repetida restaura a instrução original.
  if (limpo.length >= 24 && limpo.length % 2 === 0) {
    const metade = limpo.length / 2;
    if (limpo.slice(0, metade) === limpo.slice(metade)) return limpo.slice(0, metade);
  }
  return limpo;
}

/** Descarta linhas vazias e corta o rabo do documento (gabarito, redação). */
export function limparLinhas(linhas) {
  const limpas = [];
  const descartadas = [];
  for (const l of linhas) {
    const texto = normalizar(l.texto);
    if (!texto || RE_SO_SIMBOLOS.test(texto)) continue;
    if (RE_RODAPE_FATEC.test(texto)) {
      descartadas.push({ ...l, texto });
      continue;
    }
    // Mantém as coordenadas da linha: elas serão usadas depois para associar
    // objetos gráficos e faixas vetoriais à questão correta.
    limpas.push({ ...l, texto, pagina: l.pagina });
  }
  const inicio = Math.floor(limpas.length * 0.6);
  for (let i = inicio; i < limpas.length; i++) {
    if (RE_FIM_DOCUMENTO.test(limpas[i].texto)) {
      descartadas.push(...limpas.slice(i));
      limpas.length = i;
      break;
    }
  }
  return { linhas: limpas, descartadas };
}

function contarAberturas(linhas, perfil) {
  let n = 0;
  for (const l of linhas) if (perfil.abre.test(l.texto)) n++;
  return n;
}

/** Escolhe o perfil que reconhece mais cabeçalhos de questão. */
export function detectarPerfil(linhas) {
  let melhor = 'generico';
  let placar = 0;
  for (const nome of ['unicamp', 'fatec']) {
    const n = contarAberturas(linhas, PERFIS[nome]);
    if (n > placar) {
      placar = n;
      melhor = nome;
    }
  }
  return placar >= 4 ? melhor : 'generico';
}

// Aceita só os cabeçalhos que formam uma sequência crescente. É isso que
// impede que uma lista numerada dentro de um enunciado seja confundida com
// início de questão: estando na 17, um "1." qualquer não é aceito.
function encadear(candidatos) {
  const aceitos = [];
  let ultimo = null;
  for (const c of candidatos) {
    if (c.numero < 1 || c.numero > 300) continue;
    if (ultimo === null) {
      if (c.numero > 3) continue;
      aceitos.push(c);
      ultimo = c.numero;
    } else if (c.numero > ultimo && c.numero <= ultimo + 3) {
      aceitos.push(c);
      ultimo = c.numero;
    }
  }
  return aceitos;
}

function numerosDoTrecho(trecho) {
  const t = trecho.trim();
  const nums = (t.match(/\d{1,3}/g) || []).map(Number);
  if (!nums.length) return [];
  // "de 46 a 48" e "46 a 48" descrevem um intervalo; o resto é lista.
  if (/\ba\b/.test(t) && nums.length === 2 && nums[1] > nums[0]) {
    const saida = [];
    for (let n = nums[0]; n <= nums[1]; n++) saida.push(n);
    return saida;
  }
  return [...new Set(nums)].sort((a, b) => a - b);
}

function detectarCompartilhado(linhas, indice) {
  for (let quantidade = 1; quantidade <= 3 && indice + quantidade <= linhas.length; quantidade += 1) {
    const texto = linhas.slice(indice, indice + quantidade).map((linha) => linha.texto).join(' ');
    const match = RE_COMPARTILHADO.exec(texto);
    if (match) return { match, texto, quantidade };
  }
  return null;
}

function extrairPartes(corpo, perfil) {
  const linhasCorpo = normalizarAlternativasDiagramadas(corpo);
  let iAlt = null;
  let iCom = null;
  for (let k = 0; k < linhasCorpo.length; k++) {
    if (iAlt === null && perfil.alternativa.test(linhasCorpo[k].texto)) iAlt = k;
    if (iCom === null && RE_COMENTARIO.test(linhasCorpo[k].texto)) iCom = k;
  }
  // Alternativa que aparece depois do comentário é citação, não alternativa.
  if (iCom !== null && iAlt !== null && iAlt > iCom) iAlt = null;

  const fimEnunciado = iAlt !== null ? iAlt : iCom !== null ? iCom : linhasCorpo.length;
  const fimAlternativas = iCom !== null ? iCom : linhasCorpo.length;

  const enunciado = linhasCorpo.slice(0, fimEnunciado).map((l) => l.texto).join('\n');
  const linhasAlternativas = iAlt !== null ? linhasCorpo.slice(iAlt, fimAlternativas) : [];
  const alternativas = [];
  for (const linha of linhasAlternativas) {
    // Se um cabeçalho não entrou na sequência principal por causa da ordem de
    // leitura do PDF, ele ainda deve encerrar a alternativa anterior. Perder
    // uma questão e sinalizá-la para revisão é melhor do que misturar duas.
    if (alternativas.length && perfil.abre.test(linha.texto)) break;
    if (alternativas.length && RE_COMPARTILHADO.test(linha.texto)) break;
    const inicio = perfil.alternativa.exec(linha.texto);
    if (inicio) alternativas.push(linha.texto);
    else if (alternativas.length) alternativas[alternativas.length - 1] += `\n${linha.texto}`;
  }
  const comentario = iCom !== null ? linhasCorpo.slice(iCom).map((l) => l.texto).join('\n') : '';

  const letras = [];
  for (const alternativa of alternativas) {
    // A alternativa pode ter quebrado em várias linhas; o marcador "(A)" está
    // sempre na primeira. Testar a string inteira falharia pela âncora `$` da
    // regex (o `.` não cruza `\n`), descartando a letra e disparando o aviso de
    // "conjunto incompleto" mesmo com as cinco alternativas corretas.
    const m = perfil.alternativa.exec(alternativa.split('\n', 1)[0]);
    if (m) letras.push(m[1]);
  }

  return {
    enunciado,
    alternativas,
    comentario,
    letras,
    indiceComentario: iCom !== null ? linhasCorpo[iCom].indiceOriginalInicio : null,
  };
}

function minerarComentario(comentario, corpo) {
  const dados = { gabarito: null, topico: null, facilidade: null };
  if (!comentario) return dados;

  for (const l of corpo) {
    const g = RE_GABARITO.exec(l.texto);
    if (g) {
      dados.gabarito = g[1].toUpperCase();
      break;
    }
  }

  for (let k = 0; k < corpo.length; k++) {
    const m = RE_PROGRAMA.exec(corpo[k].texto);
    if (!m) continue;
    // O tópico às vezes está no resto da linha, às vezes nas linhas seguintes.
    let texto = (m[1] || '').replace(/^[\s:,–—-]+/, '').trim();
    if (texto.length < 12) {
      texto = corpo
        .slice(k + 1, k + 5)
        .map((l) => l.texto)
        .filter((t) => !RE_COMENTARIO.test(t))
        .join(' ');
    }
    texto = texto.replace(/\s+/g, ' ').trim();
    if (texto.length >= 8) dados.topico = texto.slice(0, 300);
    break;
  }

  for (const l of corpo) {
    const f = RE_FACILIDADE.exec(l.texto);
    if (f) {
      dados.facilidade = Number(f[1].replace(',', '.'));
      break;
    }
    const a = RE_ACERTOS.exec(l.texto);
    if (a) {
      dados.facilidade = Number(a[1].replace(',', '.')) / 100;
      break;
    }
  }

  return dados;
}

/**
 * Quebra as linhas limpas em questões.
 *
 * Devolve { questoes, avisos, perfilUsado, compartilhados }.
 */
export function segmentarQuestoes(linhas, perfilNome = 'auto') {
  const avisos = [];
  const usado = perfilNome === 'auto' ? detectarPerfil(linhas) : perfilNome;
  const perfil = PERFIS[usado];

  const candidatos = [];
  linhas.forEach((l, i) => {
    const m = perfil.abre.exec(l.texto);
    if (m) candidatos.push({ indice: i, numero: Number(m[1]) });
  });
  const aceitos = encadear(candidatos);

  if (!aceitos.length) {
    return {
      questoes: [],
      compartilhados: [],
      perfilUsado: usado,
      avisos: [
        'Nenhuma questão foi reconhecida. Confira o texto extraído: o padrão de numeração pode ser diferente, ou o PDF pode ser digitalizado.',
      ],
    };
  }

  // Textos de apoio que valem para várias questões. Só interessam os que
  // aparecem antes do bloco da primeira questão que citam.
  const compartilhados = [];
  linhas.forEach((l, i) => {
    const detectado = detectarCompartilhado(linhas, i);
    if (!detectado) return;
    const alvos = numerosDoTrecho(detectado.match[1]);
    if (alvos.length < 2) return;
    const primeiro = aceitos.find((a) => a.numero === alvos[0]);
    if (!primeiro || i > primeiro.indice) return;
    const fim = primeiro.indice;
    compartilhados.push({
      alvos,
      rotulo: detectado.texto,
      texto: linhas.slice(i, fim).map((x) => x.texto).join('\n'),
      // Estes índices também funcionam como fronteira da questão anterior.
      // Sem esse corte, tudo entre a alternativa E e o próximo cabeçalho era
      // anexado à última alternativa, mesmo quando já era o texto de apoio das
      // questões seguintes (caso real: Fatec 2026, questões 40 a 42).
      indiceInicio: i,
      indiceFim: fim,
    });
  });

  const questoesBrutas = aceitos.map((c, i) => {
    const fimNatural = i + 1 < aceitos.length ? aceitos[i + 1].indice : linhas.length;
    const proximoApoio = compartilhados
      .filter((apoio) => apoio.indiceInicio > c.indice && apoio.indiceInicio < fimNatural)
      .sort((a, b) => a.indiceInicio - b.indiceInicio)[0];
    const fim = proximoApoio?.indiceInicio ?? fimNatural;
    const corpo = linhas.slice(c.indice + 1, fim);
    const partesExtraidas = extrairPartes(corpo, perfil);
    const { indiceComentario, ...partes } = partesExtraidas;
    const minerado = minerarComentario(partes.comentario, corpo);
    const apoio = compartilhados.filter((s) => s.alvos.includes(c.numero));
    const fimConteudoQuestao = c.indice + 1 + (indiceComentario ?? corpo.length);
    const intervalosImagem = [
      ...apoio.map((item) => ({ inicio: item.indiceInicio, fim: item.indiceFim })),
      { inicio: c.indice, fim: fimConteudoQuestao },
    ];

    return {
      numero: c.numero,
      indiceLinha: c.indice,
      pagina: linhas[c.indice].pagina,
      ...partes,
      ...minerado,
      apoio,
      caracteres: partes.enunciado.length,
      dependeDeVisual: RE_VISUAL.test([
        apoio.map((item) => item.texto).join('\n'),
        partes.enunciado,
      ].filter(Boolean).join('\n')),
      recortesOrigem: criarRecortesOrigem(linhas, intervalosImagem),
      lacunasVisuaisOrigem: criarLacunasVisuaisOrigem(linhas, intervalosImagem),

      paraClassificar: [apoio.map((s) => s.texto).join('\n'), partes.enunciado]
        .filter(Boolean)
        .join('\n'),
    };
  });

  // Segunda passagem: a heurística geométrica marca `dependeDeVisual` em
  // questões cujo enunciado não cita o recurso mas que têm uma lacuna vetorial
  // grande ou alternativas em forma de desenho. Só liga a flag, nunca desliga.
  const questoes = aplicarDependenciaVisualExpandida(questoesBrutas);

  const faltando = [];
  for (let n = questoes[0].numero; n <= questoes[questoes.length - 1].numero; n++) {
    if (!questoes.some((q) => q.numero === n)) faltando.push(n);
  }
  if (faltando.length) avisos.push(`Números fora da sequência: ${faltando.join(', ')}.`);

  if (perfil.letras) {
    const irregulares = questoes.filter((q) => q.letras.join('').toLowerCase() !== perfil.letras.toLowerCase());
    if (irregulares.length) {
      avisos.push(
        `${irregulares.length} questão(ões) sem o conjunto completo de alternativas — normalmente são alternativas diagramadas lado a lado: ${irregulares
          .map((q) => q.numero)
          .join(', ')}.`
      );
    }
  }

  const curtas = questoes.filter((q) => q.caracteres < 80 && !q.apoio.length);
  if (curtas.length) {
    avisos.push(
      `${curtas.length} questão(ões) com enunciado muito curto e sem texto de apoio: ${curtas
        .map((q) => q.numero)
        .join(', ')}.`
    );
  }

  const visuais = questoes.filter((q) => q.dependeDeVisual).length;
  if (visuais) {
    avisos.push(
      `${visuais} questão(ões) citam figura, gráfico ou tabela. O texto sozinho pode não bastar para classificar essas.`
    );
  }

  const inferidas = questoes.filter((q) => q.dependeDeVisualInferido).map((q) => q.numero);
  if (inferidas.length) {
    avisos.push(
      `${inferidas.length} questão(ões) foram marcadas com recurso visual pela análise geométrica (sem palavra-chave no enunciado): ${inferidas.join(', ')}.`
    );
  }

  return { questoes, avisos, perfilUsado: usado, compartilhados };
}

/** Atalho para texto colado ou editado à mão. */
export function segmentarTextoBruto(texto, perfilNome = 'auto') {
  const brutas = texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((t) => ({ texto: normalizar(t), pagina: 1 }))
    .filter((l) => l.texto);
  const { linhas } = limparLinhas(brutas);
  return segmentarQuestoes(linhas, perfilNome);
}