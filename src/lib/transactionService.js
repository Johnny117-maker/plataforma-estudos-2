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

export function criarCronogramaAdaptativo(payload) {
  return rpc('criar_cronograma_adaptativo', { p_payload: payload });
}

export function registrarDesempenhoTarefa(tarefaId, desempenho) {
  return rpc('registrar_desempenho_tarefa', {
    p_tarefa_id: tarefaId,
    p_tempo_realizado_minutos: desempenho.tempo_realizado_minutos ?? null,
    p_questoes_realizadas: desempenho.questoes_realizadas ?? 0,
    p_acertos: desempenho.acertos ?? 0,
    p_nivel_confianca: desempenho.nivel_confianca ?? null,
    p_dificuldade_percebida: desempenho.dificuldade_percebida ?? null,
    p_energia: desempenho.energia ?? null,
    p_observacoes: desempenho.observacoes || null,
  });
}

export function aplicarReorganizacaoAdaptativa(cronogramaId, atualizacoes, resumo = {}) {
  return rpc('aplicar_reorganizacao_adaptativa', {
    p_cronograma_id: cronogramaId,
    p_atualizacoes: atualizacoes,
    p_resumo: resumo,
  });
}
