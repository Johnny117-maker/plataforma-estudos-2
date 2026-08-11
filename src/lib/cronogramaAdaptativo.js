const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;
const MARGEM_PADRAO = 0.85;

export const DIAS_SEMANA = [
  { dia_semana: 1, nome: 'Segunda' },
  { dia_semana: 2, nome: 'Terça' },
  { dia_semana: 3, nome: 'Quarta' },
  { dia_semana: 4, nome: 'Quinta' },
  { dia_semana: 5, nome: 'Sexta' },
  { dia_semana: 6, nome: 'Sábado' },
  { dia_semana: 0, nome: 'Domingo' },
];

export const DISPONIBILIDADE_PADRAO = DIAS_SEMANA.map((dia) => ({
  ...dia,
  ativo: dia.dia_semana !== 0,
  minutos_disponiveis: dia.dia_semana === 6 ? 240 : dia.dia_semana === 0 ? 0 : 150,
  horario_inicio: dia.dia_semana === 6 ? '09:00' : '19:00',
}));

function dataLocal(iso) {
  return new Date(`${iso}T12:00:00`);
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}

export function somarDias(isoData, quantidade) {
  const data = dataLocal(isoData);
  data.setDate(data.getDate() + quantidade);
  return iso(data);
}

export function diferencaDias(inicio, fim) {
  return Math.round((dataLocal(fim) - dataLocal(inicio)) / DIA);
}

function limitar(valor, minimo = 0, maximo = 100) {
  return Math.min(maximo, Math.max(minimo, Number(valor) || 0));
}

function normalizarNome(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function faixaPrioridade(score) {
  if (score >= 75) return 'alta';
  if (score >= 45) return 'media';
  return 'baixa';
}

/**
 * Fórmula auditável definida para o produto. A IA classifica o conteúdo, mas
 * não decide as datas nem a carga diária.
 */
export function calcularPrioridades(assuntos) {
  const incluidos = assuntos.filter((item) => item.incluir !== false);
  const maxQuestoes = Math.max(1, ...incluidos.map((item) => Number(item.questoes) || 0));
  const maxDocumentos = Math.max(1, ...incluidos.map((item) => Number(item.documentos) || 0));

  return incluidos.map((item) => {
    const frequenciaQuestoes = ((Number(item.questoes) || 0) / maxQuestoes) * 100;
    const recorrenciaDocumentos = ((Number(item.documentos) || 0) / maxDocumentos) * 100;
    const frequencia = frequenciaQuestoes * 0.7 + recorrenciaDocumentos * 0.3;
    const desempenho = limitar(item.desempenho_percentual ?? 50);
    const lacuna = 100 - desempenho;
    const importancia = limitar(item.importancia ?? 70);
    const tempoRevisao = limitar(item.tempo_sem_revisao ?? 50);
    const prerequisito = limitar(item.prerequisito ?? 50);
    const ajuste = Math.min(20, Math.max(-20, Number(item.ajuste_usuario) || 0));
    const score = limitar(
      frequencia * 0.4
      + lacuna * 0.3
      + importancia * 0.15
      + tempoRevisao * 0.1
      + prerequisito * 0.05
      + ajuste,
    );

    return {
      ...item,
      desempenho_percentual: desempenho,
      frequencia_score: Math.round(frequencia * 10) / 10,
      lacuna_score: Math.round(lacuna * 10) / 10,
      prioridade_score: Math.round(score * 10) / 10,
      prioridade: faixaPrioridade(score),
    };
  }).sort((a, b) => b.prioridade_score - a.prioridade_score);
}

export function calcularFases(dataInicio, dataProva) {
  const fimEstudo = diferencaDias(dataInicio, dataProva) > 0 ? somarDias(dataProva, -1) : dataProva;
  const totalDias = Math.max(1, diferencaDias(dataInicio, fimEstudo) + 1);
  const tamanhos = [0.15, 0.35, 0.35, 0.15].map((p) => Math.max(1, Math.floor(totalDias * p)));
  while (tamanhos.reduce((s, n) => s + n, 0) > totalDias) {
    const indice = tamanhos.findIndex((n) => n > 1);
    if (indice < 0) break;
    tamanhos[indice] -= 1;
  }
  while (tamanhos.reduce((s, n) => s + n, 0) < totalDias) tamanhos[1] += 1;

  const definicoes = [
    ['Diagnóstico e base', 'Corrigir fundamentos e atacar as maiores lacunas.', '#C9963F'],
    ['Consolidação', 'Aprofundar os assuntos recorrentes com teoria e questões.', '#4FB6AE'],
    ['Provas anteriores', 'Treinar tempo de prova, redação e corrigir padrões de erro.', '#A371F7'],
    ['Reta final', 'Revisar o caderno de erros e estabilizar o desempenho.', '#2F81F7'],
  ];

  let cursor = dataInicio;
  return definicoes.map(([nome, descricao, cor], indice) => {
    const dataFim = indice === definicoes.length - 1
      ? fimEstudo
      : somarDias(cursor, tamanhos[indice] - 1);
    const fase = { nome, descricao, cor, ordem: indice, peso: 4 - indice, data_inicio: cursor, data_prazo: dataFim, tarefas: [] };
    cursor = somarDias(dataFim, 1);
    return fase;
  });
}

function criarAgenda(dataInicio, dataFim, disponibilidade, margem = MARGEM_PADRAO) {
  const porDia = new Map(disponibilidade.map((item) => [Number(item.dia_semana), item]));
  const agenda = [];
  const total = Math.max(0, diferencaDias(dataInicio, dataFim));
  for (let i = 0; i <= total; i += 1) {
    const data = somarDias(dataInicio, i);
    const config = porDia.get(dataLocal(data).getDay());
    const bruto = config?.ativo === false ? 0 : Number(config?.minutos_disponiveis) || 0;
    const capacidade = Math.max(0, Math.floor((bruto * margem) / 5) * 5);
    agenda.push({ data, capacidade, usado: 0, restante: capacidade });
  }
  return agenda;
}

function agendar(agenda, duracao, inicio, fim, preferida = inicio) {
  const comEspaco = agenda.find((dia) => (
    dia.data >= inicio && dia.data <= fim && dia.data >= preferida && dia.restante >= duracao
  ));
  if (!comEspaco) return null;
  comEspaco.usado += duracao;
  comEspaco.restante -= duracao;
  return comEspaco.data;
}

function faseDaData(fases, data) {
  return fases.find((fase) => data >= fase.data_inicio && data <= fase.data_prazo) || fases[fases.length - 1];
}

function maiorCapacidade(disponibilidade) {
  return Math.max(0, ...disponibilidade.filter((d) => d.ativo !== false).map((d) => Math.floor((Number(d.minutos_disponiveis) || 0) * MARGEM_PADRAO)));
}

function criarConstrutor(fases, agenda, avisos) {
  let sequencia = 0;
  const revisoes = [];

  function adicionar(config, intervalo = null) {
    const duracao = Math.max(15, Math.round(Number(config.duracao_minutos) || 30));
    let data = agendar(agenda, duracao, config.inicio, config.fim, config.preferida || config.inicio);
    if (!data && config.fallbackAte) {
      data = agendar(agenda, duracao, config.inicio, config.fallbackAte, config.preferida || config.inicio);
    }
    if (!data) {
      avisos.push(`Sem espaço para “${config.titulo}”. Aumente a disponibilidade ou reduza os conteúdos.`);
      return null;
    }

    const localId = `tarefa-${++sequencia}`;
    const fase = config.fase || faseDaData(fases, data);
    const tarefa = {
      local_id: localId,
      materia_id: config.materia_id || null,
      materia_nome: config.materia_nome || null,
      assunto_nome: config.assunto_nome || null,
      titulo: config.titulo,
      descricao: config.descricao || null,
      tipo: config.tipo || 'teoria',
      status: 'nao_iniciado',
      prioridade: config.prioridade || 'media',
      prioridade_score: Number(config.prioridade_score) || 50,
      data_inicio: data,
      data_prazo: data,
      data_original: data,
      duracao_minutos: duracao,
      horas_estimadas: Math.round((duracao / 60) * 100) / 100,
      questoes_meta: Number(config.questoes_meta) || 0,
      fixa: Boolean(config.fixa),
      ordem: fase.tarefas.length,
    };
    fase.tarefas.push(tarefa);

    if (intervalo && config.origem) {
      tarefa.origem_local_id = config.origem.local_id;
      revisoes.push({
        tarefa_origem_local_id: config.origem.local_id,
        tarefa_revisao_local_id: localId,
        intervalo_dias: intervalo,
        data_prevista: data,
        status: 'pendente',
      });
    }
    return tarefa;
  }

  return { adicionar, revisoes };
}

function distribuirSessoes(topicos, minutosConteudo) {
  if (!topicos.length || minutosConteudo < 30) return [];
  const soma = topicos.reduce((total, item) => total + Math.max(10, item.prioridade_score), 0);
  return topicos.map((item) => {
    const alvo = (minutosConteudo * Math.max(10, item.prioridade_score)) / soma;
    return { ...item, sessoes: Math.max(1, Math.min(5, Math.round(alvo / 55))) };
  });
}

function resumoPlano(fases, agenda, prioridades, avisos) {
  const tarefas = fases.flatMap((fase) => fase.tarefas);
  const porMateria = new Map();
  tarefas.forEach((tarefa) => {
    const nome = tarefa.materia_nome || tarefa.assunto_nome?.split(' — ').at(-1) || 'Geral';
    porMateria.set(nome, (porMateria.get(nome) || 0) + tarefa.duracao_minutos);
  });
  const porSemana = new Map();
  agenda.filter((dia) => dia.usado > 0).forEach((dia) => {
    const data = dataLocal(dia.data);
    const segunda = new Date(data);
    const ajuste = (data.getDay() + 6) % 7;
    segunda.setDate(data.getDate() - ajuste);
    const chave = iso(segunda);
    porSemana.set(chave, (porSemana.get(chave) || 0) + dia.usado);
  });
  const capacidade = agenda.reduce((s, dia) => s + dia.capacidade, 0);
  const planejado = agenda.reduce((s, dia) => s + dia.usado, 0);
  return {
    total_tarefas: tarefas.length,
    total_minutos: planejado,
    horas_planejadas: Math.round((planejado / 60) * 10) / 10,
    horas_disponiveis: Math.round((capacidade / 60) * 10) / 10,
    ocupacao_percentual: capacidade ? Math.round((planejado / capacidade) * 100) : 0,
    questoes_meta: tarefas.reduce((s, tarefa) => s + tarefa.questoes_meta, 0),
    dias_estudo: agenda.filter((dia) => dia.usado > 0).length,
    dias_livres: agenda.filter((dia) => dia.capacidade > 0 && dia.usado === 0).length,
    assuntos: prioridades.length,
    por_materia: [...porMateria].map(([materia, minutos]) => ({ materia, minutos })).sort((a, b) => b.minutos - a.minutos),
    por_semana: [...porSemana].map(([semana, minutos]) => ({ semana, minutos })),
    avisos: [...new Set(avisos)],
  };
}

/**
 * Gera um calendário completo sem depender da resposta da IA. As entradas já
 * classificadas por Groq/Gemini viram prioridade, sessões, revisões e provas.
 */
export function gerarCronogramaAdaptativo(configuracao) {
  const {
    objetivo,
    disponibilidade = DISPONIBILIDADE_PADRAO,
    assuntos = [],
    totalProvas = 0,
  } = configuracao;
  if (!objetivo?.data_inicio || !objetivo?.data_prova) throw new Error('Informe a data de início e a data da prova.');
  if (objetivo.data_inicio > objetivo.data_prova) throw new Error('A data de início deve ser anterior à prova.');
  if (diferencaDias(objetivo.data_inicio, objetivo.data_prova) < 7) throw new Error('O gerador adaptativo precisa de pelo menos sete dias até a prova.');

  const prioridades = calcularPrioridades(assuntos);
  if (!prioridades.length) throw new Error('Selecione pelo menos um assunto para o cronograma.');
  const fases = calcularFases(objetivo.data_inicio, objetivo.data_prova);
  const fimEstudo = fases.at(-1).data_prazo;
  const agenda = criarAgenda(objetivo.data_inicio, fimEstudo, disponibilidade);
  const capacidade = agenda.reduce((s, dia) => s + dia.capacidade, 0);
  if (capacidade < 60) throw new Error('A disponibilidade informada não possui pelo menos 1 hora útil até a prova.');

  const avisos = [];
  const construtor = criarConstrutor(fases, agenda, avisos);
  const topicos = distribuirSessoes(prioridades, capacidade * 0.48);
  const maximoDiario = maiorCapacidade(disponibilidade);
  const duracaoPadrao = Math.max(30, Math.min(60, maximoDiario));

  topicos.forEach((topico, indice) => {
    let origem = null;
    for (let sessao = 0; sessao < topico.sessoes; sessao += 1) {
      const primeira = sessao === 0;
      const fasePreferida = primeira && indice < Math.ceil(topicos.length * 0.4) ? fases[0] : fases[1];
      const tarefa = construtor.adicionar({
        titulo: primeira
          ? `${topico.assunto} — teoria essencial e exemplos`
          : `${topico.assunto} — lista dirigida ${sessao}`,
        descricao: `${topico.questoes || 0} questão(ões) em ${topico.documentos || 0} prova(s). Prioridade ${topico.prioridade_score}/100.`,
        tipo: primeira ? 'teoria' : 'questoes',
        materia_id: topico.materia_id,
        materia_nome: topico.materia,
        assunto_nome: topico.assunto,
        prioridade: topico.prioridade,
        prioridade_score: topico.prioridade_score,
        duracao_minutos: duracaoPadrao,
        questoes_meta: primeira ? 6 : Math.max(10, Math.round(topico.prioridade_score / 5)),
        inicio: fasePreferida.data_inicio,
        fim: fasePreferida.data_prazo,
        fallbackAte: fases[1].data_prazo,
      });
      if (primeira) origem = tarefa;
    }

    if (origem) {
      [1, 7, 30].forEach((intervalo) => {
        const alvo = somarDias(origem.data_prazo, intervalo);
        if (alvo > fimEstudo) return;
        construtor.adicionar({
          titulo: `Revisão D+${intervalo}: ${topico.assunto}`,
          descricao: 'Revisão espaçada com recuperação ativa e questões do caderno de erros.',
          tipo: intervalo === 1 ? 'revisao_d1' : intervalo === 7 ? 'revisao_d7' : 'revisao_d30',
          materia_id: topico.materia_id,
          materia_nome: topico.materia,
          assunto_nome: topico.assunto,
          prioridade: topico.prioridade,
          prioridade_score: topico.prioridade_score,
          duracao_minutos: 30,
          questoes_meta: intervalo === 1 ? 5 : 8,
          inicio: alvo,
          preferida: alvo,
          fim: fimEstudo,
          origem,
        }, intervalo);
      });
    }
  });

  const semanasProvas = Math.max(1, Math.floor((diferencaDias(fases[2].data_inicio, fases[2].data_prazo) + 1) / 7));
  const simulados = Math.min(Math.max(2, Number(totalProvas) || 2), semanasProvas);
  for (let i = 0; i < simulados; i += 1) {
    const preferida = somarDias(fases[2].data_inicio, Math.floor((i * Math.max(1, diferencaDias(fases[2].data_inicio, fases[2].data_prazo))) / simulados));
    construtor.adicionar({
      titulo: `Prova anterior cronometrada ${i + 1}`,
      descricao: 'Resolver em condições de prova, sem consultar material.',
      tipo: 'prova_anterior', prioridade: 'alta', prioridade_score: 90,
      duracao_minutos: Math.max(60, Math.min(180, maximoDiario)), questoes_meta: Number(objetivo.total_questoes) || 60,
      inicio: fases[2].data_inicio, preferida, fim: fases[2].data_prazo, fixa: true,
    });
    construtor.adicionar({
      titulo: `Correção dirigida da prova ${i + 1}`,
      descricao: 'Classificar erros por conteúdo, interpretação, cálculo ou tempo.',
      tipo: 'correcao_erros', prioridade: 'alta', prioridade_score: 88,
      duracao_minutos: 60, inicio: preferida, preferida: somarDias(preferida, 1), fim: fases[2].data_prazo,
    });
  }

  const redacoes = Math.max(1, Math.min(4, Math.floor(diferencaDias(objetivo.data_inicio, objetivo.data_prova) / 28)));
  for (let i = 0; i < redacoes; i += 1) {
    const preferida = somarDias(fases[1].data_inicio, Math.floor((i * Math.max(1, diferencaDias(fases[1].data_inicio, fases[2].data_prazo))) / redacoes));
    construtor.adicionar({
      titulo: `Redação FATEC ${i + 1}: planejamento, escrita e revisão`,
      descricao: 'Produzir uma redação completa e registrar os pontos de melhoria.',
      tipo: 'redacao', prioridade: 'alta', prioridade_score: 82,
      duracao_minutos: Math.min(90, maximoDiario), inicio: fases[1].data_inicio,
      preferida, fim: fases[2].data_prazo, questoes_meta: 0,
    });
  }

  construtor.adicionar({
    titulo: 'Simulado final de 60 questões',
    descricao: `Meta: ${objetivo.meta_acertos || 48} acertos de ${objetivo.total_questoes || 60}.`,
    tipo: 'simulado', prioridade: 'alta', prioridade_score: 100,
    duracao_minutos: Math.max(60, Math.min(180, maximoDiario)), questoes_meta: Number(objetivo.total_questoes) || 60,
    inicio: fases[3].data_inicio, preferida: somarDias(objetivo.data_prova, -7), fim: fases[3].data_prazo, fixa: true,
  });
  construtor.adicionar({
    titulo: 'Revisão final do caderno de erros',
    descricao: 'Revisar somente erros recorrentes, fórmulas e pontos de baixa confiança.',
    tipo: 'correcao_erros', prioridade: 'alta', prioridade_score: 100,
    duracao_minutos: 60, inicio: fases[3].data_inicio, preferida: somarDias(objetivo.data_prova, -3), fim: fases[3].data_prazo, fixa: true,
  });

  fases.forEach((fase) => fase.tarefas.sort((a, b) => a.data_prazo.localeCompare(b.data_prazo) || b.prioridade_score - a.prioridade_score)
    .forEach((tarefa, ordem) => { tarefa.ordem = ordem; }));

  return {
    versao_gerador: 'adaptativo-v1',
    objetivo,
    disponibilidade,
    prioridades,
    fases,
    revisoes: construtor.revisoes,
    resumo: resumoPlano(fases, agenda, prioridades, avisos),
  };
}

export function planoParaPayloadAdaptativo(plano) {
  return {
    cronograma: {
      nome: plano.objetivo.nome,
      descricao: plano.objetivo.objetivo,
      objetivo: plano.objetivo.objetivo,
      vestibular: plano.objetivo.vestibular || 'FATEC',
      cor: plano.objetivo.cor || '#C9963F',
      categoria: 'estudos',
      ativo: false,
      status: 'rascunho',
      data_inicio: plano.objetivo.data_inicio,
      data_final: plano.objetivo.data_prova,
      meta_acertos: Number(plano.objetivo.meta_acertos) || null,
      total_questoes_meta: Number(plano.objetivo.total_questoes) || 60,
      analise_id: plano.objetivo.analise_id || null,
      versao_gerador: plano.versao_gerador,
      configuracao: { resumo: plano.resumo },
    },
    disponibilidade: plano.disponibilidade,
    prioridades: plano.prioridades,
    fases: plano.fases,
    revisoes: plano.revisoes,
  };
}

/** Reagenda apenas tarefas pendentes; concluídas e fixas permanecem intactas. */
export function sugerirReorganizacaoAdaptativa({ tarefas, desempenhos = [], disponibilidade, dataInicio, dataFinal }) {
  const desempenhoPorTarefa = new Map(desempenhos.map((item) => [item.tarefa_id, Number(item.percentual_acerto)]));
  const agenda = criarAgenda(dataInicio, dataFinal, disponibilidade);
  const fixas = tarefas.filter((t) => t.fixa && t.status !== 'concluido');
  fixas.forEach((tarefa) => {
    const dia = agenda.find((item) => item.data === tarefa.data_prazo);
    if (dia) {
      const minutos = Number(tarefa.duracao_minutos) || Math.round((Number(tarefa.horas_estimadas) || 1) * 60);
      dia.usado += minutos;
      dia.restante = Math.max(0, dia.restante - minutos);
    }
  });

  const atrasadas = tarefas.filter((t) => t.status !== 'concluido' && !t.fixa).map((tarefa) => {
    const acerto = desempenhoPorTarefa.get(tarefa.id);
    const atraso = tarefa.data_prazo < dataInicio ? Math.min(20, diferencaDias(tarefa.data_prazo, dataInicio)) : 0;
    const reforco = Number.isFinite(acerto) ? Math.max(0, 80 - acerto) * 0.35 : 0;
    const bonusTipo = String(tarefa.tipo || '').startsWith('revisao') ? 10 : tarefa.tipo === 'correcao_erros' ? 8 : 0;
    return { ...tarefa, score_adaptativo: (Number(tarefa.prioridade_score) || 50) + atraso + reforco + bonusTipo };
  }).sort((a, b) => b.score_adaptativo - a.score_adaptativo || String(a.data_prazo).localeCompare(String(b.data_prazo)));

  const atualizacoes = [];
  const naoAlocadas = [];
  atrasadas.forEach((tarefa, ordem) => {
    const minutos = Number(tarefa.duracao_minutos) || Math.round((Number(tarefa.horas_estimadas) || 1) * 60);
    const novaData = agendar(agenda, minutos, dataInicio, dataFinal, dataInicio);
    if (!novaData) naoAlocadas.push(tarefa.id);
    else atualizacoes.push({ tarefa_id: tarefa.id, data_prazo: novaData, ordem, prioridade_score: Math.round(tarefa.score_adaptativo * 10) / 10 });
  });
  return { atualizacoes, nao_alocadas: naoAlocadas, total_reorganizadas: atualizacoes.length };
}

export function assuntosDasFrequencias(frequencias, materias = []) {
  const materiaPorNome = new Map(materias.map((m) => [normalizarNome(m.nome), m]));
  return frequencias.map((item) => {
    const materia = materiaPorNome.get(normalizarNome(item.materia));
    const subgenero = materia?.subgeneros?.find((s) => normalizarNome(s.nome) === normalizarNome(item.assunto));
    return {
      materia: item.materia,
      assunto: item.assunto,
      materia_id: materia?.id || null,
      subgenero_id: subgenero?.id || null,
      questoes: Number(item.questoes) || 0,
      documentos: Number(item.documentos) || 0,
      peso: Number(item.peso) || 0,
      desempenho_percentual: 50,
      importancia: 70,
      tempo_sem_revisao: 50,
      prerequisito: 50,
      ajuste_usuario: 0,
      incluir: true,
    };
  });
}
