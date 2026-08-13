// Detecção expandida de dependência visual.
//
// O RE_VISUAL original só marcava `dependeDeVisual=true` quando o enunciado
// citava explicitamente uma palavra como "figura", "gráfico" ou "tabela". A
// FATEC 2026 quebrou essa premissa em três lugares:
//
//   1. "O QUADRO relaciona compostos..." (Q24, Q26) — o vocabulário oficial
//      da banca usa "quadro" como sinônimo de tabela, mas essa palavra não
//      estava na regex.
//   2. "Concentração = massa / volume" (Q25) — a fórmula é uma imagem no PDF,
//      mas o enunciado só diz "Dados:" e nada de "fórmula".
//   3. "O café da manhã... foi composto, entre outros itens, por:" (Q6) — a
//      tabela vem logo abaixo, mas sem nenhuma palavra-chave.
//
// Este módulo combina três sinais:
//
//   • um vocabulário maior (RE_VISUAL_EXPANDIDO), que cobre "quadro", "fórmula",
//     "estrutura" e uma dúzia de outros termos que a FATEC usa recorrentemente;
//   • um sinal geométrico: se a questão tem uma "lacuna vetorial" grande entre
//     as linhas de texto (ver criarLacunasVisuaisOrigem), quase certamente é
//     um gráfico ou uma tabela desenhados com vetores;
//   • um sinal textual: enunciados anômalos que terminam em ":", "conforme",
//     "veja" ou similares e são muito curtos costumam introduzir uma imagem.
//
// A função aplica esses testes DEPOIS da segmentação, sem tocar em nada mais
// da questão. Só o campo `dependeDeVisual` pode mudar (sempre de false → true,
// nunca o contrário).

const RE_VISUAL_EXPANDIDO =
  /\b(figura|gr[áa]fico|imagem|tabela|quadro|mapa|tirinha|quadrinho|infogr[áa]fico|esquema|diagrama|charge|heredograma|fluxograma|placa|desenho|fotografia|ilustra[çc][ãa]o|f[óo]rmulas?|estrutur[a-z]{0,4}|equa[çc][ãa]o|radar|bandeira|logotipo|emblema|mascote|cartaz|painel|molde|planta|croqui|reproduc[ãa]o|composi[çc][ãa]o|receita|c[óo]digo|s[íi]mbolo|selo|cartum|infogr[áa]fico|termograma|espectrograma|cardapio|card[áa]pio|hist[óo]rico)\b/i;

// Uma "lacuna" vetorial é o espaço em branco entre dois blocos de texto na
// mesma coluna. Quando esse espaço é grande e não corresponde a uma quebra de
// parágrafo trivial, o mais provável é que haja um gráfico ou uma tabela
// desenhados como vetor bem ali. O limiar foi calibrado empiricamente com o
// próprio conjunto de provas da FATEC (o teste em importacaoManualFatec.test
// usa 22_000; 20_000 dá uma margem de segurança sem produzir falsos positivos).
const AREA_LACUNA_SUSPEITA = 20_000;

// Terminações que sugerem que o enunciado remete a algo que vem logo abaixo
// (uma tabela, uma imagem, uma fórmula em bloco). O acento pode ou não estar
// presente na camada textual do PDF, por isso está tudo normalizado.
const RE_FINAL_INTRODUTORIO = /(?:conforme|veja|observe|analise|considere|abaixo|a seguir|apresenta[- ]?se|foi composto|por:)\s*[.:;]?\s*$/i;

const TAMANHO_ENUNCIADO_CURTO = 220;

function textoRelevante(questao) {
  const apoio = (questao?.apoio || [])
    .map((item) => String(item?.texto || item || ''))
    .join('\n');
  return `${apoio}\n${String(questao?.enunciado || '')}`.trim();
}

function maiorLacunaDaQuestao(questao) {
  const lacunas = questao?.lacunasVisuaisOrigem || [];
  if (!lacunas.length) return 0;
  return Math.max(...lacunas.map((lacuna) => Number(lacuna.area) || 0));
}

function alternativasSaoDesenhos(questao) {
  const alternativas = questao?.alternativas || [];
  if (alternativas.length < 3) return false;
  // Alternativas do tipo "(A)", "(B) " (só o marcador) indicam que o conteúdo
  // está desenhado ao lado; as opções em si não têm texto.
  const somenteMarcador = alternativas.filter((alternativa) => (
    /^\s*\(?[A-Ea-e]\)?\s*$/.test(String(alternativa || ''))
  )).length;
  return somenteMarcador >= 3;
}

function terminaComIntroducao(questao) {
  const enunciado = String(questao?.enunciado || '').trim();
  if (!enunciado) return false;
  if (enunciado.length > TAMANHO_ENUNCIADO_CURTO) return false;
  return RE_FINAL_INTRODUTORIO.test(enunciado);
}

/**
 * Retorna true quando a questão tem indícios (léxicos, geométricos ou
 * estruturais) de conter um recurso visual, mesmo que a palavra-chave clássica
 * ("figura", "gráfico"...) não apareça no enunciado.
 */
export function deveTerRecursoVisual(questao) {
  if (!questao) return false;
  if (questao.dependeDeVisual) return true;

  const texto = textoRelevante(questao);
  if (RE_VISUAL_EXPANDIDO.test(texto)) return true;

  if (alternativasSaoDesenhos(questao)) return true;

  const lacuna = maiorLacunaDaQuestao(questao);
  if (lacuna >= AREA_LACUNA_SUSPEITA) return true;

  if (terminaComIntroducao(questao) && lacuna >= AREA_LACUNA_SUSPEITA * 0.5) return true;

  return false;
}

/**
 * Devolve uma nova lista de questões com `dependeDeVisual` reavaliado pela
 * heurística expandida. Nunca desliga a flag: só pode passar de false para
 * true. As demais propriedades da questão são preservadas por referência.
 */
export function aplicarDependenciaVisualExpandida(questoes) {
  return (questoes || []).map((questao) => {
    if (!questao || questao.dependeDeVisual) return questao;
    if (!deveTerRecursoVisual(questao)) return questao;
    return { ...questao, dependeDeVisual: true, dependeDeVisualInferido: true };
  });
}