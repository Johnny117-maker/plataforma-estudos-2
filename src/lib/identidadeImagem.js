export function nomeSeguro(valor) {
  return String(valor || 'questao').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
}

async function hashBlob(blob) {
  const dados = await blob.arrayBuffer();
  const resumo = await globalThis.crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(resumo)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * O identificador do conteúdo muda quando o recorte muda. Assim, uma imagem
 * corrigida nunca reutiliza o mesmo caminho da versão antiga no cache/CDN.
 */
export async function criarCaminhoImagemQuestao(usuarioId, hashDocumento, captura) {
  const numero = Number.isFinite(Number(captura.numero))
    ? `questao-${String(captura.numero).padStart(3, '0')}`
    : nomeSeguro(captura.id);
  const identidadeConteudo = (await hashBlob(captura.blob)).slice(0, 16);
  return `${usuarioId}/${nomeSeguro(hashDocumento)}/${numero}-${identidadeConteudo}.webp`;
}
