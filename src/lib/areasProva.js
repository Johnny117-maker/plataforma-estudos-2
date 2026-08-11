// Classificação determinística por cabeçalho de área.
//
// Duas coisas que os cadernos da Fatec entregam de graça e que estavam sendo
// jogadas fora:
//
//   1. O rótulo "Questão NN" é desenhado como DOIS fragmentos separados por um
//      vão de ~13pt ("Questão" numa caixa cinza, "40" numa caixa preta). Na
//      maioria das páginas o corte XY mantém os dois no mesmo bloco e a linha
//      sai inteira. Mas quando o corte cai no vão — aconteceu com a questão 40
//      da prova de 2020, numa página de duas colunas — saem as linhas
//      "Questão" e "40" separadas, nenhuma casa o regex de abertura, e a
//      questão desaparece sem erro nenhum. religarCabecalhos() recompõe.
//
//   2. O caderno declara a matéria de cada bloco ("MULTIDISCIPLINAR",
//      "HISTÓRIA", "QUÍMICA"...). Medido nas provas reais: 53 das 54 questões
//      da prova de 2020 ficam classificadas por matéria sem gastar um token.
//      Nem toda prova tem esses cabeçalhos — a de 2022 é temática (tudo em
//      volta da Agenda 2030) e não separa por disciplina; nessa a IA continua
//      necessária. Por isso isto é um complemento à classificação, não um
//      substituto.

const RE_SO_ROTULO = /^\s*quest[ãa]o\s*$/i;
const RE_SO_NUMERO = /^\s*(\d{1,3})\s*$/;

/**
 * Junta "Questão" + "40" em "Questão 40" quando saíram como linhas separadas.
 * Roda ANTES de segmentarQuestoes, sobre as linhas já limpas.
 */
export function religarCabecalhos(linhas) {
  const saida = [];
  let religadas = 0;
  for (let i = 0; i < linhas.length; i += 1) {
    const atual = linhas[i];
    const proxima = linhas[i + 1];
    if (proxima && RE_SO_ROTULO.test(atual.texto) && RE_SO_NUMERO.test(proxima.texto)) {
      saida.push({ texto: `Questão ${proxima.texto.trim()}`, pagina: atual.pagina });
      religadas += 1;
      i += 1;
      continue;
    }
    saida.push(atual);
  }
  return { linhas: saida, religadas };
}

// Cabeçalho de área -> nome de matéria. As chaves são comparadas em maiúsculas
// e sem acento, então "Historia" e "HISTÓRIA" caem no mesmo lugar.
export const AREAS_CONHECIDAS = {
  MULTIDISCIPLINAR: 'Multidisciplinar',
  'RACIOCINIO LOGICO': 'Raciocínio Lógico',
  MATEMATICA: 'Matemática',
  'MATEMATICA E LOGICA': 'Matemática',
  PORTUGUES: 'Português',
  'LINGUA PORTUGUESA': 'Português',
  LITERATURA: 'Literatura',
  REDACAO: 'Redação',
  INGLES: 'Inglês',
  ESPANHOL: 'Espanhol',
  HISTORIA: 'História Geral',
  'HISTORIA DO BRASIL': 'História Brasileira',
  GEOGRAFIA: 'Geografia',
  FILOSOFIA: 'Filosofia',
  SOCIOLOGIA: 'Sociologia',
  FISICA: 'Física',
  QUIMICA: 'Química',
  BIOLOGIA: 'Biologia',
  'CIENCIAS DA NATUREZA': 'Ciências da Natureza',
  'CIENCIAS HUMANAS': 'Ciências Humanas',
  LINGUAGENS: 'Linguagens',
};

function chaveDeArea(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Reconhece uma linha que é só um cabeçalho de área.
 * Exige linha curta e sem pontuação de frase, para não confundir com um
 * enunciado que por acaso cite "MATEMÁTICA".
 */
export function areaDaLinha(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto || bruto.length > 40) return null;
  if (/[.:;?!,]$/.test(bruto)) return null;
  // Precisa ser predominantemente maiúscula — é assim que a banca diagrama.
  const letras = bruto.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letras) return null;
  const maiusculas = letras.replace(/[^A-ZÀ-Þ]/g, '').length;
  if (maiusculas / letras.length < 0.8) return null;
  return AREAS_CONHECIDAS[chaveDeArea(bruto)] || null;
}

/**
 * Percorre as linhas na ordem e devolve, para cada número de questão, a última
 * área declarada antes dela.
 *
 * Devolve { porNumero: Map<number,string>, areas: [{ nome, indice, pagina }] }
 */
export function mapearAreas(linhas, questoes) {
  const areas = [];
  linhas.forEach((linha, indice) => {
    const nome = areaDaLinha(linha.texto);
    if (nome) areas.push({ nome, indice, pagina: linha.pagina });
  });

  const porNumero = new Map();
  if (!areas.length) return { porNumero, areas };

  // As questões trazem a página; o índice da linha de abertura não vem no
  // objeto devolvido por segmentarQuestoes, então reencontro pela página e
  // pela ordem — as questões já vêm em ordem crescente.
  const eventos = [
    ...areas.map((a) => ({ indice: a.indice, tipo: 'area', valor: a.nome })),
    ...questoes.map((q, i) => ({ indice: q.indiceLinha ?? i, tipo: 'questao', valor: q.numero })),
  ].sort((a, b) => a.indice - b.indice || (a.tipo === 'area' ? -1 : 1));

  let atual = null;
  for (const evento of eventos) {
    if (evento.tipo === 'area') atual = evento.valor;
    else if (atual) porNumero.set(evento.valor, atual);
  }
  return { porNumero, areas };
}

/**
 * Aplica as áreas às questões, preenchendo `classificacao` para as que ainda
 * não têm. Nunca sobrescreve uma classificação vinda da IA ou editada à mão.
 *
 * Devolve o número de questões que ganharam matéria aqui.
 */
export function aplicarAreas(questoes, porNumero, materias = []) {
  const porNome = new Map(
    materias.map((m) => [chaveDeArea(m.nome), m])
  );
  let aplicadas = 0;
  for (const questao of questoes) {
    if (questao.classificacao?.materia_nome) continue;
    const nome = porNumero.get(questao.numero);
    if (!nome) continue;
    const materia = porNome.get(chaveDeArea(nome));
    questao.classificacao = {
      id: questao.id,
      materia_id: materia?.id || null,
      subgenero_id: null,
      materia_nome: nome,
      // Sem IA não há assunto; o tópico minerado entra quando existir.
      assunto_nome: questao.topico || nome,
      dificuldade: 'media',
      confianca: 0.95,
      origem: 'cabecalho_de_area',
    };
    aplicadas += 1;
  }
  return aplicadas;
}