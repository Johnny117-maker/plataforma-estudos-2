import { useState } from 'react';
import { perguntarIAJson } from '../lib/iaService';
import { aplicarReorganizacao } from '../lib/transactionService';

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

// Garante que 'ordem' seja uma permutação válida de 0..n-1: remove índices
// inválidos/repetidos e completa no final com os que faltaram, na ordem
// original. Isso corrige pequenos erros da IA sem precisar gerar de novo.
function repararOrdem(ordem, n) {
  const vistos = new Set();
  const resultado = [];
  (Array.isArray(ordem) ? ordem : []).forEach((valor) => {
    const i = Number(valor);
    if (Number.isInteger(i) && i >= 0 && i < n && !vistos.has(i)) {
      vistos.add(i);
      resultado.push(i);
    }
  });
  for (let i = 0; i < n; i++) {
    if (!vistos.has(i)) resultado.push(i);
  }
  return resultado;
}

function horasDe(tarefa) {
  return Number(tarefa.horas_estimadas) > 0 ? Number(tarefa.horas_estimadas) : 1;
}

// Agenda a lista de tarefas (já na ordem final, cruzando todas as fases) a
// partir de dataInicioStr:
// - com horasPorDia: empilha por horas, só passa pro próximo dia quando
//   bate o limite diário — pode levar além da data final, o que dispara um aviso.
// - sem horasPorDia mas com dataFinalStr: divide os dias igualmente entre
//   as tarefas, do início até a data final.
// - sem nenhum dos dois: não atribui datas, só a ordem é aplicada.
function agendarTarefas(tarefasOrdenadas, dataInicioStr, dataFinalStr, horasPorDia) {
  const inicio = new Date((dataInicioStr || hojeISO()) + 'T00:00:00');

  if (horasPorDia && horasPorDia > 0) {
    let cursor = new Date(inicio);
    let horasHoje = 0;
    return tarefasOrdenadas.map((t) => {
      const horas = horasDe(t);
      if (horasHoje > 0 && horasHoje + horas > horasPorDia) {
        cursor = new Date(cursor.getTime() + 86400000);
        horasHoje = 0;
      }
      const novaData = cursor.toISOString().slice(0, 10);
      horasHoje += horas;
      if (horasHoje >= horasPorDia) {
        cursor = new Date(cursor.getTime() + 86400000);
        horasHoje = 0;
      }
      return { ...t, novaData };
    });
  }

  if (dataFinalStr) {
    const fim = new Date(dataFinalStr + 'T00:00:00');
    const totalDias = Math.max(1, Math.round((fim - inicio) / 86400000)) + 1;
    const n = tarefasOrdenadas.length;
    return tarefasOrdenadas.map((t, i) => {
      const diaIndex = Math.min(totalDias - 1, Math.floor((i * totalDias) / n));
      const novaData = new Date(inicio.getTime() + diaIndex * 86400000).toISOString().slice(0, 10);
      return { ...t, novaData };
    });
  }

  return tarefasOrdenadas.map((t) => ({ ...t, novaData: null }));
}

// Reordena as tarefas de todas as fases (uma fase por vez na chamada à IA,
// pra não estourar limite de tokens) e depois agenda todas elas em sequência
// até a data final do cronograma, respeitando as horas/dia se configuradas.
// Não cria, não apaga, não muda tarefa de fase.
export default function ReorganizarIAModal({ cronograma, fases, tarefas, onClose, onAplicado }) {
  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState(null); // { atual, total, nomeFase }
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [sugestao, setSugestao] = useState(null); // { [nomeFase]: [{...tarefa, novaData}] }

  const tarefasPorFase = {};
  fases.forEach((f) => { tarefasPorFase[f.nome] = tarefas.filter((t) => t.fase_id === f.id); });
  const fasesElegiveis = fases.filter((f) => (tarefasPorFase[f.nome] || []).length > 1);
  const fasesComUmaSo = fases.filter((f) => (tarefasPorFase[f.nome] || []).length === 1);

  const horasPorDia = cronograma?.horas_por_dia || null;
  const dataFinal = cronograma?.data_final || null;

  let descricaoAgendamento;
  if (horasPorDia) {
    descricaoAgendamento = `Vou distribuir as tarefas respeitando seu limite de ${horasPorDia}h/dia, a partir de hoje.`;
  } else if (dataFinal) {
    descricaoAgendamento = `Vou distribuir as tarefas igualmente entre hoje e ${new Date(dataFinal + 'T00:00:00').toLocaleDateString('pt-BR')} (sua data final).`;
  } else {
    descricaoAgendamento = 'Esse cronograma não tem data final nem horas/dia configuradas — vou só reordenar, sem mexer nas datas. Clique no badge de categoria ao lado do nome do cronograma pra configurar isso.';
  }

  async function gerar() {
    setErro('');
    setAviso('');
    setSugestao(null);
    setGerando(true);

    if (fases.length === 0) {
      setErro('Esse cronograma não tem fases ainda.');
      setGerando(false);
      return;
    }

    // ordem final = respeitando a ordem das fases; dentro de cada fase com
    // 2+ tarefas, pergunta pra IA; fases com 0-1 tarefa não precisam de IA.
    const ordemPorFase = {};
    try {
      for (let i = 0; i < fasesElegiveis.length; i++) {
        const fase = fasesElegiveis[i];
        setProgresso({ atual: i + 1, total: fasesElegiveis.length, nomeFase: fase.nome });

        const tarefasDaFase = tarefasPorFase[fase.nome];
        const linhas = tarefasDaFase.map((t, idx) => `${idx}: ${t.titulo}`).join('\n');
        const tokensNecessarios = Math.min(4000, Math.max(500, tarefasDaFase.length * 8));

        const prompt = `Você vai reordenar tarefas de estudo, colocando pré-requisitos antes do que depende deles (ex: soma e subtração antes de multiplicação e divisão; conceitos básicos antes dos avançados).

Cada tarefa tem um número. NÃO invente tarefas novas. Cada número de 0 a ${tarefasDaFase.length - 1} precisa aparecer exatamente uma vez na resposta.

Fase "${fase.nome}":
${linhas}

Responda APENAS com um JSON no formato exato (sem texto extra, sem markdown), com os NÚMEROS na melhor ordem:
{ "ordem": [0, 1, 2] }`;

         
        const resposta = await perguntarIAJson(prompt, undefined, tokensNecessarios);
        const indicesReparados = repararOrdem(resposta?.ordem, tarefasDaFase.length);
        ordemPorFase[fase.nome] = indicesReparados.map((idx) => tarefasDaFase[idx]);

        // pequena pausa entre fases pra dar folga no limite de tokens/minuto
        if (i < fasesElegiveis.length - 1) {
           
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }
      fasesComUmaSo.forEach((f) => { ordemPorFase[f.nome] = tarefasPorFase[f.nome]; });

      // monta a lista final cruzando todas as fases, na ordem em que elas
      // aparecem no cronograma, e agenda tudo de uma vez.
      const faseIdParaNome = Object.fromEntries(fases.map((f) => [f.id, f.nome]));
      const tarefasNaOrdemFinal = fases.flatMap((f) => ordemPorFase[f.nome] || []);
      const tarefasAgendadas = agendarTarefas(tarefasNaOrdemFinal, hojeISO(), dataFinal, horasPorDia);

      const resultado = {};
      fases.forEach((f) => { resultado[f.nome] = []; });
      tarefasAgendadas.forEach((t) => {
        const nomeFase = faseIdParaNome[t.fase_id] || '(sem fase)';
        if (!resultado[nomeFase]) resultado[nomeFase] = [];
        resultado[nomeFase].push(t);
      });

      setSugestao(resultado);

      if (dataFinal) {
        const ultima = tarefasAgendadas[tarefasAgendadas.length - 1]?.novaData;
        if (ultima && ultima > dataFinal) {
          setAviso(`Pra caber tudo, a última tarefa ficaria em ${new Date(ultima + 'T00:00:00').toLocaleDateString('pt-BR')}, depois da sua data final (${new Date(dataFinal + 'T00:00:00').toLocaleDateString('pt-BR')}). Considere aumentar as horas/dia, estender o prazo, ou remover tarefas.`);
        }
      }
    } catch (e) {
      setErro(e.message);
    }
    setProgresso(null);
    setGerando(false);
  }

  async function aplicar() {
    if (!sugestao) return;
    setAplicando(true);
    setErro('');
    const atualizacoes = [];
    Object.entries(sugestao).forEach(([, itens]) => {
      itens.forEach((t, i) => {
        atualizacoes.push({ tarefa_id: t.id, ordem: i, data_prazo: t.novaData || null });
      });
    });
    try {
      await aplicarReorganizacao(cronograma.id, atualizacoes);
      onAplicado();
      onClose();
    } catch (error) {
      setErro(error.message);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Reorganizar com IA</h3>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>
          A IA sugere uma ordem mais coerente pras suas tarefas, colocando pré-requisitos antes
          do que depende deles. Ela não cria nem apaga nada — só reordena.
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--gold)', marginBottom: 10 }}>{descricaoAgendamento}</div>

        {!sugestao && (
          <button className="btn btn-primary" type="button" onClick={gerar} disabled={gerando}>
            {gerando
              ? (progresso ? `Analisando "${progresso.nomeFase}" (${progresso.atual}/${progresso.total})…` : 'Pensando…')
              : 'Gerar sugestão'}
          </button>
        )}

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }}>{erro}</div>}
        {aviso && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 8 }}>{aviso}</div>}

        {sugestao && (
          <div style={{ marginTop: 10, maxHeight: 320, overflowY: 'auto' }}>
            {Object.entries(sugestao).filter(([, itens]) => itens.length > 0).map(([nomeFase, itens]) => (
              <div key={nomeFase} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{nomeFase}</div>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--muted)' }}>
                  {itens.map((t) => (
                    <li key={t.id}>
                      {t.titulo}
                      {t.novaData ? ` — ${new Date(t.novaData + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}
                      {t.horas_estimadas ? ` (${t.horas_estimadas}h)` : ''}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {sugestao && (
            <button className="btn btn-primary" type="button" onClick={aplicar} disabled={aplicando}>
              {aplicando ? 'Aplicando…' : 'Aplicar essa ordem'}
            </button>
          )}
          {sugestao && (
            <button className="btn" type="button" onClick={gerar} disabled={gerando}>
              Gerar outra sugestão
            </button>
          )}
          <button className="btn" type="button" style={{ marginLeft: 'auto' }} onClick={onClose}>
            {sugestao ? 'Cancelar' : 'Fechar'}
          </button>
        </div>
      </div>
    </div>
  );
}
