// Cache de classificação por hash de conteúdo.
//
// O gargalo de escalar para muitas provas não é classificar rápido — é não
// reclassificar. Cada questão passa pela IA uma vez; daí em diante o resultado
// vem do banco, de graça e instantaneamente.
//
// O hash é do texto NORMALIZADO (minúsculas, espaços colapsados) porque duas
// extrações do mesmo PDF podem diferir em espaçamento sem que o conteúdo mude.
// Isso também faz enunciados reciclados entre edições de prova baterem.

import { supabase } from '../supabaseClient';

const MIN_CHARS = 40;
const LOTE_CONSULTA = 300;

function normalizar(texto) {
  return String(texto || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** SHA-256 hex do conteúdo normalizado. Devolve null para texto curto demais. */
export async function hashConteudo(texto) {
  const limpo = normalizar(texto);
  if (limpo.length < MIN_CHARS) return null;
  const dados = new TextEncoder().encode(limpo);
  const digest = await crypto.subtle.digest('SHA-256', dados);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Calcula e anexa `hashConteudo` a cada questão, no lugar. */
export async function anexarHashes(questoes) {
  for (const questao of questoes) {
    if (questao.hashConteudo !== undefined) continue;
    questao.hashConteudo = await hashConteudo(questao.paraClassificar || questao.enunciado);
  }
  return questoes;
}

/**
 * Consulta o cache e aplica o que encontrar. Não sobrescreve classificação
 * existente — o que veio de cabeçalho de área ou foi corrigido à mão vale mais
 * que o cache.
 *
 * Devolve { aplicadas, consultados, restantes }.
 */
export async function aplicarCache(questoes) {
  await anexarHashes(questoes);

  const pendentes = questoes.filter((q) => !q.classificacao && q.hashConteudo);
  const hashes = [...new Set(pendentes.map((q) => q.hashConteudo))];
  if (!hashes.length) {
    return { aplicadas: 0, consultados: 0, restantes: questoes.filter((q) => !q.classificacao).length };
  }

  const porHash = new Map();
  for (let i = 0; i < hashes.length; i += LOTE_CONSULTA) {
    const fatia = hashes.slice(i, i + LOTE_CONSULTA);
    const { data, error } = await supabase.rpc('buscar_classificacoes_cache', { p_hashes: fatia });
    if (error) throw new Error(`Falha ao consultar o cache: ${error.message}`);
    for (const linha of data || []) porHash.set(linha.hash_conteudo, linha);
  }

  let aplicadas = 0;
  for (const questao of pendentes) {
    const achado = porHash.get(questao.hashConteudo);
    if (!achado) continue;
    questao.classificacao = {
      id: questao.id,
      materia_id: achado.materia_id,
      subgenero_id: achado.subgenero_id,
      materia_nome: achado.materia_nome,
      assunto_nome: achado.assunto_nome,
      dificuldade: achado.dificuldade || 'media',
      confianca: achado.confianca,
      origem: 'cache',
    };
    aplicadas += 1;
  }

  return {
    aplicadas,
    consultados: hashes.length,
    restantes: questoes.filter((q) => !q.classificacao).length,
  };
}