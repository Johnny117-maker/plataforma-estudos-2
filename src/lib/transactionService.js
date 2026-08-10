import { supabase } from '../supabaseClient';

async function rpc(nome, parametros) {
  const { data, error } = await supabase.rpc(nome, parametros);
  if (error) throw new Error(error.message);
  return data;
}

export function criarCronogramaCompleto(cronograma) {
  return rpc('criar_cronograma_completo', { p_cronograma: cronograma });
}

export function duplicarCronogramaAtomico(cronogramaId, novoNome) {
  return rpc('duplicar_cronograma_atomico', { p_cronograma_id: cronogramaId, p_novo_nome: novoNome });
}

export function aplicarReorganizacao(cronogramaId, atualizacoes) {
  return rpc('aplicar_reorganizacao_cronograma', { p_cronograma_id: cronogramaId, p_atualizacoes: atualizacoes });
}

export function salvarAnaliseProvas(nome, documentos) {
  return rpc('salvar_analise_provas', { p_nome: nome, p_documentos: documentos });
}

export function gerarCronogramaDaAnalise(analiseId, dataInicio, dataFinal, horasPorDia) {
  return rpc('gerar_cronograma_da_analise', {
    p_analise_id: analiseId,
    p_data_inicio: dataInicio,
    p_data_final: dataFinal,
    p_horas_por_dia: horasPorDia,
  });
}
