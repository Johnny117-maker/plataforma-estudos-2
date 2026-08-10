import { duplicarCronogramaAtomico } from './transactionService';

// Duplica um cronograma inteiro: o cronograma em si, suas fases, suas
// tarefas (remapeando fase_id pra apontar pra fase correspondente na cópia)
// e as datas importantes associadas a ele.
export async function duplicarCronograma(cronogramaId, _userId, novoNome) {
  try {
    const id = await duplicarCronogramaAtomico(cronogramaId, novoNome);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, erro: error.message };
  }
}
