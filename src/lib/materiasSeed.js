import { supabase } from '../supabaseClient';
import { DEFAULT_MATERIAS } from './materiasData';

/**
 * Cria as 9 matérias padrão (só as que ainda não existem, pelo nome).
 * Pode chamar de novo sem medo — não duplica.
 */
export async function seedMateriasPadrao(userId) {
  const { data: existentes } = await supabase.from('materias').select('nome');
  const nomesExistentes = new Set((existentes || []).map((m) => m.nome));

  const faltando = DEFAULT_MATERIAS.filter((m) => !nomesExistentes.has(m.nome));
  if (faltando.length === 0) return { criadas: 0 };

  const { error } = await supabase
    .from('materias')
    .insert(faltando.map((m) => ({ ...m, user_id: userId })));

  if (error) throw error;
  return { criadas: faltando.length };
}

/**
 * Importa uma lista de nomes de assuntos pra dentro de uma matéria.
 * Usa upsert com "ignora duplicado" — se um assunto com o mesmo nome já
 * existir naquela matéria, ele é pulado (não duplica, não dá erro).
 */
export async function importarSubgeneros(materiaId, userId, nomes) {
  const linhas = nomes
    .map((n) => n.trim())
    .filter(Boolean)
    .map((nome) => ({ materia_id: materiaId, user_id: userId, nome }));

  if (linhas.length === 0) return { inseridos: 0 };

  const { data, error } = await supabase
    .from('subgeneros')
    .upsert(linhas, { onConflict: 'materia_id,nome', ignoreDuplicates: true })
    .select();

  if (error) throw error;
  return { inseridos: data?.length || 0 };
}
