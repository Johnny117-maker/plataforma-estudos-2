import { criarCronogramaCompleto } from './transactionService';

function addDias(data, dias) {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function importarPlano(plan, _userId) {
  try {
    const hoje = new Date();
    const passoDias = plan.diasPorMes || 7;
    const dataFinal = plan.dataAlvo || (plan.diasAteAlvo ? toISODate(addDias(hoje, plan.diasAteAlvo)) : null);
    let passoAcumulado = 0;
    const fases = plan.fases.map((fase, ordemFase) => {
      const inicioFase = toISODate(addDias(hoje, passoAcumulado * passoDias));
      const fimFase = toISODate(addDias(hoje, (passoAcumulado + fase.semanas.length) * passoDias));
      let ordem = 0;
      const tarefas = fase.semanas.flatMap((semana, i) => {
        const dataPrazo = toISODate(addDias(hoje, (passoAcumulado + i + 1) * passoDias));
        return semana.tarefas.map((titulo) => ({
          titulo,
          status: 'nao_iniciado',
          prioridade: 'media',
          data_prazo: dataPrazo,
          ordem: ordem++,
        }));
      });
      passoAcumulado += fase.semanas.length;
      return {
        nome: fase.nome,
        cor: fase.cor,
        peso: fase.peso || 1,
        ordem: ordemFase,
        data_inicio: inicioFase,
        data_prazo: fimFase,
        tarefas,
      };
    });
    const cronogramaId = await criarCronogramaCompleto({
      nome: plan.nome,
      cor: plan.cor,
      categoria: 'estudos',
      data_final: dataFinal,
      horas_por_dia: plan.ritmoHorasDia || 1,
      fases,
    });
    return { ok: true, cronogramaId };
  } catch (error) {
    return { ok: false, erro: error.message };
  }
}
