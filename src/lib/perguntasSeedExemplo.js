import { supabase } from '../supabaseClient';

/**
 * Insere a questão de exemplo de Teoria dos Conjuntos que você mandou no chat,
 * já com a resposta certa e a explicação preenchidas por mim.
 * Precisa que a matéria "Matemática" e o assunto "Teoria dos conjuntos"
 * já existam (ambos vêm do botão "Importar os 46 assuntos padrão").
 */
export async function importarQuestaoExemplo(userId) {
  const { data: materia } = await supabase.from('materias').select('id').eq('nome', 'Matemática').single();
  if (!materia) return { ok: false, erro: 'Crie a matéria "Matemática" antes (aba Matérias e Assuntos).' };

  const { data: subgenero } = await supabase
    .from('subgeneros')
    .select('id')
    .eq('materia_id', materia.id)
    .eq('nome', 'Teoria dos conjuntos')
    .single();
  if (!subgenero) return { ok: false, erro: 'Importe os assuntos padrão de Matemática antes (assunto "Teoria dos conjuntos" não encontrado).' };

  const ENUNCIADO = 'Num grupo de 87 pessoas, 51 possuem automóvel, 42 possuem moto e 5 pessoas não possuem nenhum dos dois veículos. O número de pessoas desse grupo que possuem automóvel e moto é:';

  const { data: jaExiste } = await supabase.from('perguntas').select('id').eq('enunciado', ENUNCIADO).maybeSingle();
  if (jaExiste) return { ok: false, erro: 'Essa questão já foi importada.' };

  const { error } = await supabase.from('perguntas').insert({
    user_id: userId,
    materia_id: materia.id,
    subgenero_id: subgenero.id,
    tipo: 'multipla_escolha',
    enunciado: ENUNCIADO,
    alternativas: ['4', '11', '17', '19'],
    resposta_correta: '1',
    explicacao: 'União (têm carro ou moto) = 87 − 5 = 82. Pela fórmula |A∪M| = |A| + |M| − |A∩M|: 82 = 51 + 42 − |A∩M|, logo |A∩M| = 93 − 82 = 11.',
    dificuldade: 'facil',
    fonte: 'Enviada pelo usuário',
  });

  if (error) return { ok: false, erro: error.message };
  return { ok: true };
}
