export const TAMANHO_LOTE_GROQ = 8;
export const TAMANHO_LOTE_GEMINI = 24;
export const ORCAMENTO_TOKENS_GROQ = 1_800;
export const ORCAMENTO_TOKENS_GEMINI = 12_000;

export function normalizarEstrategia(estrategia) {
  return estrategia === 'gemini' ? 'gemini' : 'hibrida';
}

export function escolherRota({ estrategia, groqDisponivel }) {
  const somenteGemini = normalizarEstrategia(estrategia) === 'gemini';
  const usarGemini = somenteGemini || !groqDisponivel;
  return usarGemini
    ? {
      provedorPreferido: 'gemini',
      tamanhoLote: TAMANHO_LOTE_GEMINI,
      orcamentoTokens: ORCAMENTO_TOKENS_GEMINI,
    }
    : {
      provedorPreferido: 'auto',
      tamanhoLote: TAMANHO_LOTE_GROQ,
      orcamentoTokens: ORCAMENTO_TOKENS_GROQ,
    };
}

export function calcularIndisponibilidadeGroq(meta, agora = Date.now()) {
  if (meta?.provedor !== 'gemini' || meta?.motivoFallback !== 'groq_rate_limit') return null;
  const segundos = Math.max(15, Math.min(120, Number(meta.groqRetryAfter) || 60));
  return agora + segundos * 1_000;
}

export function somarUsoProvedor(contadores, meta, quantidade) {
  const provedor = meta?.provedor === 'groq' ? 'groq' : 'gemini';
  return {
    groq: Number(contadores?.groq || 0) + (provedor === 'groq' ? quantidade : 0),
    gemini: Number(contadores?.gemini || 0) + (provedor === 'gemini' ? quantidade : 0),
  };
}
