// Planejador de cronograma a partir do conteúdo das provas.
//
// Divisão de trabalho deliberada:
//
//   IA (UMA chamada)  ordem de pré-requisitos, quebra dos assuntos em tópicos
//                     de estudo e estimativa relativa de esforço. É o que ela
//                     faz bem e o que código não faz.
//
//   Código            peso por recorrência, normalização das horas para caber
//                     no prazo, distribuição no calendário e revisões
//                     espaçadas. É aritmética; IA erra e não é auditável.
//
// Se a IA falhar ou vier malformada, planejarDeterministico() assume. O
// cronograma sai mais grosseiro, mas sai — nada aqui depende de a IA responder.

import { perguntarIAJson } from './iaService';

const HORAS_MIN_TAREFA = 0.5;
const HORAS_MAX_TAREFA = 4;
const MAX_TOPICOS = 60;
const MAX_AMOSTRAS_POR_MATERIA = 12;
const TAMANHO_AMOSTRA = 160;

const CORES_FASE = ['#C9963F', '#4FB6AE', '#A371F7', '#2F81F7', '#5B6B3F', '#D96C82', '#B85450'];

function diasEntre(inicio, fim) {
  const a = new Date(`${inicio}T00:00:00`);
  const b = new Date(`${fim}T00:00:00`);
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

function somarDias(iso, dias) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function arredondarMeia(h) {
  return Math.round(h * 2) / 2;
}

/**
 * Monta o retrato do que as provas cobraram: por matéria, quais assuntos, com
 * quantas questões, em quantos documentos, e uma amostra curta dos enunciados
 * reais. É isso que dá o "personalizado" — o plano nasce do texto das provas,
 * não de um currículo genérico.
 */
export function montarRetrato(documentosSelecionados, frequencias) {
  const porMateria = new Map();

  for (const item of frequencias) {
    if (!porMateria.has(item.materia)) {
      porMateria.set(item.materia, { materia: item.materia, assuntos: [], amostras: [], questoes: 0 });
    }
    const bloco = porMateria.get(item.materia);
    bloco.assuntos.push({
      assunto: item.assunto,
      questoes: item.questoes,
      documentos: item.documentos,
      peso: Number(item.peso.toFixed(2)),
    });
    bloco.questoes += item.questoes;
  }

  for (const doc of documentosSelecionados) {
    for (const questao of doc.questoes) {
      const materia = questao.classificacao?.materia_nome || 'Não classificada';
      const bloco = porMateria.get(materia);
      if (!bloco || bloco.amostras.length >= MAX_AMOSTRAS_POR_MATERIA) continue;
      const texto = String(questao.enunciado || questao.paraClassificar || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, TAMANHO_AMOSTRA);
      if (texto.length > 40) bloco.amostras.push(texto);
    }
  }

  return [...porMateria.values()].sort((a, b) => b.questoes - a.questoes);
}

function promptDoPlano(retrato, contexto) {
  const { dias, horasPorDia, horasDisponiveis, totalQuestoes, totalProvas } = contexto;
  return `Monte um plano de estudos a partir do que estas provas realmente cobraram.

CONTEXTO
- ${totalProvas} prova(s) analisada(s), ${totalQuestoes} questões.
- Período: ${dias} dias, ${horasPorDia}h por dia, ${horasDisponiveis}h no total.

O QUE AS PROVAS COBRARAM
${JSON.stringify(retrato, null, 1)}

REGRAS
1. Quebre cada assunto em tópicos de estudo concretos e estudáveis. "Estudar Matemática" não serve; "Função quadrática: vértice, raízes e gráfico" serve. Use as amostras de enunciado para descobrir o que de fato foi cobrado.
2. Ordene respeitando pré-requisitos. Nada de logaritmo antes de exponencial, nem estequiometria antes de mol.
3. Agrupe em 3 a 6 fases sequenciais. Cada fase é uma etapa do preparo (ex.: "Fundamentos", "Aprofundamento", "Simulados e revisão"), não uma matéria isolada.
4. Dê mais tópicos e mais horas ao que tem peso maior. Peso alto = apareceu muito e em provas diferentes.
5. Máximo de ${MAX_TOPICOS} tópicos no total. Some ~${horasDisponiveis} horas, mas não precisa ser exato — as horas serão normalizadas depois.
6. Cada tópico entre ${HORAS_MIN_TAREFA} e ${HORAS_MAX_TAREFA} horas.
7. A última fase deve conter simulados e revisão dirigida.

Responda SOMENTE com JSON válido, sem markdown:
{"fases":[{"nome":"...","objetivo":"uma frase","topicos":[{"titulo":"...","materia":"...","porque":"uma frase citando o que a prova cobrou","horas":2}]}]}`;
}

function validarPlano(plano) {
  if (!plano || !Array.isArray(plano.fases) || !plano.fases.length) {
    throw new Error('A IA não devolveu fases.');
  }
  const fases = plano.fases
    .map((fase) => ({
      nome: String(fase.nome || 'Fase').slice(0, 120),
      objetivo: String(fase.objetivo || '').slice(0, 300),
      topicos: (Array.isArray(fase.topicos) ? fase.topicos : [])
        .filter((t) => t && String(t.titulo || '').trim())
        .map((t) => ({
          titulo: String(t.titulo).trim().slice(0, 280),
          materia: String(t.materia || '').trim().slice(0, 120),
          porque: String(t.porque || '').trim().slice(0, 300),
          horas: Math.min(HORAS_MAX_TAREFA, Math.max(HORAS_MIN_TAREFA, Number(t.horas) || 1)),
        })),
    }))
    .filter((fase) => fase.topicos.length);

  if (!fases.length) throw new Error('A IA devolveu fases sem tópicos.');
  const total = fases.reduce((s, f) => s + f.topicos.length, 0);
  if (total > MAX_TOPICOS * 1.5) throw new Error('A IA devolveu tópicos demais.');
  return fases;
}

/**
 * Plano sem IA: uma fase por matéria, ordenada por peso, um tópico por
 * assunto. Não sabe pré-requisito nem quebra assunto em subtópicos, mas
 * respeita a recorrência e cabe no prazo.
 */
export function planejarDeterministico(retrato) {
  const fases = retrato.map((bloco) => ({
    nome: bloco.materia,
    objetivo: `${bloco.questoes} questão(ões) nas provas analisadas.`,
    topicos: bloco.assuntos
      .slice()
      .sort((a, b) => b.peso - a.peso)
      .map((a) => ({
        titulo: a.assunto === bloco.materia ? `Revisar ${a.assunto}` : `${a.assunto} — ${bloco.materia}`,
        materia: bloco.materia,
        porque: `${a.questoes} questão(ões) em ${a.documentos} prova(s).`,
        horas: Math.min(HORAS_MAX_TAREFA, Math.max(HORAS_MIN_TAREFA, a.questoes / 2)),
      })),
  }));
  fases.push({
    nome: 'Simulados e revisão final',
    objetivo: 'Fechar o ciclo com prova cronometrada e correção dirigida.',
    topicos: [
      { titulo: 'Simulado completo cronometrado', materia: '', porque: 'Testar ritmo e resistência.', horas: 4 },
      { titulo: 'Corrigir o simulado e listar erros por tipo', materia: '', porque: 'O erro repetido é o que mais rende revisar.', horas: 2 },
      { titulo: 'Revisão dirigida nos pontos que falharam', materia: '', porque: 'Fechar as lacunas encontradas.', horas: 3 },
    ],
  });
  return fases;
}

/**
 * Normaliza as horas para caber exatamente no tempo disponível e distribui as
 * tarefas no calendário, respeitando o limite diário.
 */
function alocar(fases, { dataInicio, dataFinal, horasPorDia }) {
  const dias = diasEntre(dataInicio, dataFinal);
  const disponiveis = dias * horasPorDia;
  const somaBruta = fases.reduce((s, f) => s + f.topicos.reduce((x, t) => x + t.horas, 0), 0);

  // Deixa ~15% de folga para imprevisto e revisão espontânea.
  const alvo = disponiveis * 0.85;
  const fator = somaBruta > 0 ? alvo / somaBruta : 1;

  let cursor = dataInicio;
  let horasNoDia = 0;
  let horasTotais = 0;

  const fasesAlocadas = fases.map((fase, ordemFase) => {
    let ordem = 0;
    const tarefas = fase.topicos.map((topico) => {
      const horas = Math.min(HORAS_MAX_TAREFA, Math.max(HORAS_MIN_TAREFA, arredondarMeia(topico.horas * fator)));

      if (horasNoDia > 0 && horasNoDia + horas > horasPorDia) {
        cursor = somarDias(cursor, 1);
        horasNoDia = 0;
      }
      const data = cursor > dataFinal ? dataFinal : cursor;
      horasNoDia += horas;
      horasTotais += horas;
      if (horasNoDia >= horasPorDia) {
        cursor = somarDias(cursor, 1);
        horasNoDia = 0;
      }

      return {
        titulo: topico.titulo,
        descricao: topico.porque || null,
        status: 'nao_iniciado',
        prioridade: horas >= 3 ? 'alta' : horas >= 1.5 ? 'media' : 'baixa',
        data_prazo: data,
        horas_estimadas: horas,
        ordem: ordem++,
        _materia: topico.materia,
      };
    });

    return {
      nome: fase.nome,
      descricao: fase.objetivo || null,
      cor: CORES_FASE[ordemFase % CORES_FASE.length],
      peso: fases.length - ordemFase,
      ordem: ordemFase,
      data_inicio: tarefas[0]?.data_prazo || dataInicio,
      data_prazo: tarefas[tarefas.length - 1]?.data_prazo || dataFinal,
      tarefas,
    };
  });

  return { fases: fasesAlocadas, horasTotais, horasDisponiveis: disponiveis, dias };
}

/**
 * Acrescenta revisões espaçadas dos tópicos de maior carga, no último terço do
 * período. Repetição espaçada é o que separa um cronograma que ensina de um
 * que só cobre conteúdo uma vez.
 */
function acrescentarRevisoes(resultado, { dataInicio, dataFinal, horasPorDia }) {
  const todas = resultado.fases.flatMap((f) => f.tarefas);
  const candidatos = todas
    .filter((t) => t.horas_estimadas >= 1.5)
    .sort((a, b) => b.horas_estimadas - a.horas_estimadas)
    .slice(0, 12);
  if (!candidatos.length) return resultado;

  const dias = diasEntre(dataInicio, dataFinal);
  const inicioRevisao = Math.floor(dias * 0.7);
  const folga = resultado.horasDisponiveis - resultado.horasTotais;
  if (folga < 2) return resultado;

  let cursor = somarDias(dataInicio, inicioRevisao);
  let horasNoDia = 0;
  const tarefas = candidatos.map((t, i) => {
    const horas = Math.max(HORAS_MIN_TAREFA, arredondarMeia(t.horas_estimadas * 0.4));
    if (horasNoDia > 0 && horasNoDia + horas > horasPorDia) {
      cursor = somarDias(cursor, 1);
      horasNoDia = 0;
    }
    const data = cursor > dataFinal ? dataFinal : cursor;
    horasNoDia += horas;
    if (horasNoDia >= horasPorDia) {
      cursor = somarDias(cursor, 1);
      horasNoDia = 0;
    }
    return {
      titulo: `Revisar: ${t.titulo}`,
      descricao: 'Revisão espaçada de um tópico de alta carga.',
      status: 'nao_iniciado',
      prioridade: 'media',
      data_prazo: data,
      horas_estimadas: horas,
      ordem: i,
    };
  });

  resultado.fases.push({
    nome: 'Revisão espaçada',
    descricao: 'Retomada dos tópicos mais pesados no último terço do período.',
    cor: '#3FB950',
    peso: 1,
    ordem: resultado.fases.length,
    data_inicio: tarefas[0].data_prazo,
    data_prazo: tarefas[tarefas.length - 1].data_prazo,
    tarefas,
  });
  resultado.horasTotais += tarefas.reduce((s, t) => s + t.horas_estimadas, 0);
  return resultado;
}

/** Liga cada tarefa à matéria cadastrada, quando o nome bate. */
function vincularMaterias(fases, materias) {
  const porNome = new Map(
    materias.map((m) => [m.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), m.id])
  );
  for (const fase of fases) {
    for (const tarefa of fase.tarefas) {
      const chave = String(tarefa._materia || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const id = porNome.get(chave);
      if (id) tarefa.materia_id = id;
      delete tarefa._materia;
    }
  }
  return fases;
}

/**
 * Ponto de entrada. Devolve o plano pronto para `criarCronogramaCompleto`,
 * mais os números para mostrar ao usuário antes de confirmar.
 *
 * opcoes: { documentosSelecionados, frequencias, dataInicio, dataFinal,
 *           horasPorDia, materias, usarIA, onProgresso }
 */
export async function planejarCronograma(opcoes) {
  const {
    documentosSelecionados, frequencias, dataInicio, dataFinal,
    horasPorDia, materias = [], usarIA = true, onProgresso,
  } = opcoes;

  if (!dataInicio || !dataFinal) throw new Error('Informe a data de início e a data final.');
  if (!(horasPorDia > 0)) throw new Error('Informe quantas horas por dia você tem disponíveis.');
  if (!frequencias.length) throw new Error('Nenhum conteúdo classificado para planejar.');

  const retrato = montarRetrato(documentosSelecionados, frequencias);
  const dias = diasEntre(dataInicio, dataFinal);
  const contexto = {
    dias,
    horasPorDia,
    horasDisponiveis: Math.round(dias * horasPorDia),
    totalQuestoes: frequencias.reduce((s, f) => s + f.questoes, 0),
    totalProvas: documentosSelecionados.length,
  };

  let fases;
  let origem = 'deterministico';
  let aviso = null;

  if (usarIA) {
    try {
      onProgresso?.('Montando o plano a partir do conteúdo das provas…');
      const bruto = await perguntarIAJson(
        promptDoPlano(retrato, contexto),
        'Você é um especialista em pedagogia e planejamento de estudos. Responda somente com JSON válido, sem markdown e sem texto adicional.',
        4000,
      );
      fases = validarPlano(bruto);
      origem = 'ia';
    } catch (error) {
      fases = planejarDeterministico(retrato);
      aviso = `A IA não conseguiu montar o plano (${error.message}). Gerado pela recorrência dos assuntos.`;
    }
  } else {
    fases = planejarDeterministico(retrato);
  }

  onProgresso?.('Distribuindo no calendário…');
  let resultado = alocar(fases, { dataInicio, dataFinal, horasPorDia });
  resultado = acrescentarRevisoes(resultado, { dataInicio, dataFinal, horasPorDia });
  vincularMaterias(resultado.fases, materias);

  return {
    origem,
    aviso,
    contexto,
    horasTotais: Math.round(resultado.horasTotais * 10) / 10,
    horasDisponiveis: resultado.horasDisponiveis,
    totalTarefas: resultado.fases.reduce((s, f) => s + f.tarefas.length, 0),
    fases: resultado.fases,
  };
}

/** Converte o plano no payload da RPC criar_cronograma_completo. */
export function planoParaCronograma(plano, { nome, cor, dataFinal, horasPorDia }) {
  return {
    nome: String(nome || 'Cronograma das provas').slice(0, 160),
    cor: cor || '#C9963F',
    categoria: 'estudos',
    data_final: dataFinal,
    horas_por_dia: horasPorDia,
    fases: plano.fases.map((fase) => ({
      nome: fase.nome,
      descricao: fase.descricao,
      cor: fase.cor,
      peso: fase.peso,
      ordem: fase.ordem,
      data_inicio: fase.data_inicio,
      data_prazo: fase.data_prazo,
      tarefas: fase.tarefas,
    })),
  };
}