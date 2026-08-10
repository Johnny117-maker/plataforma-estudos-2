export const OPCOES_VERDADEIRO_FALSO = ['Verdadeiro', 'Falso'];

export function opcoesDaPergunta(pergunta) {
  if (pergunta.tipo === 'verdadeiro_falso') return OPCOES_VERDADEIRO_FALSO;
  return Array.isArray(pergunta.alternativas) ? pergunta.alternativas : [];
}

export function respostaObjetivaCorreta(pergunta, indice) {
  return String(indice) === String(pergunta.resposta_correta);
}

export function payloadPergunta({ tipo, alternativas, respostaCorreta, respostaModelo }) {
  if (tipo === 'dissertativa') {
    return { alternativas: null, resposta_correta: respostaModelo.trim() };
  }
  if (tipo === 'verdadeiro_falso') {
    return { alternativas: OPCOES_VERDADEIRO_FALSO, resposta_correta: String(respostaCorreta) };
  }
  const limpas = alternativas.map((a) => a.trim()).filter(Boolean);
  return { alternativas: limpas, resposta_correta: String(respostaCorreta) };
}
