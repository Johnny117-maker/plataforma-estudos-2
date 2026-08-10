import { supabase } from '../supabaseClient';

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invocarIA(body, tentativa = 0) {
  const { data, error } = await supabase.functions.invoke('ia', { body });
  const mensagem = data?.erro || error?.message;
  if (mensagem) {
    const limite = /limite|429|rate/i.test(mensagem);
    if (limite && tentativa < 2) {
      await esperar((tentativa + 1) * 2_000);
      return invocarIA(body, tentativa + 1);
    }
    throw new Error(mensagem || 'Falha ao chamar o serviço de IA.');
  }
  if (data?.resultado === undefined) throw new Error('A IA não retornou um resultado válido.');
  return data.resultado;
}

export function perguntarIAJson(prompt, system, maxTokens) {
  return invocarIA({ acao: 'gerar_json', prompt, system, maxTokens });
}

export async function classificarQuestoesIA(questoes, materias = [], onProgress) {
  const lotes = [];
  for (let i = 0; i < questoes.length; i += 6) lotes.push(questoes.slice(i, i + 6));
  const resultado = [];
  const catalogo = materias.map((m) => ({
    id: m.id,
    nome: m.nome,
    assuntos: (m.subgeneros || []).map((s) => ({ id: s.id, nome: s.nome })),
  }));
  for (let i = 0; i < lotes.length; i += 1) {
    onProgress?.(i + 1, lotes.length);
    const resposta = await invocarIA({
      acao: 'classificar_questoes',
      materias: catalogo,
      questoes: lotes[i].map((q) => ({ id: q.id, texto: q.paraClassificar, topico: q.topico })),
    });
    if (!Array.isArray(resposta?.classificacoes)) throw new Error('Formato de classificação inválido.');
    resultado.push(...resposta.classificacoes);
  }
  return resultado;
}
