import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { perguntarIAJson } from '../lib/iaService';
import { criarCronogramaCompleto } from '../lib/transactionService';

const CORES = ['#F2C811', '#2F81F7', '#238636', '#A371F7', '#F85149', '#3F8CB0', '#8B949E'];

const CATEGORIAS = [
  { valor: 'estudos', label: 'Estudos' },
  { valor: 'tarefas', label: 'Tarefas' },
  { valor: 'viagem', label: 'Viagem' },
  { valor: 'projeto', label: 'Projeto' },
  { valor: 'outro', label: 'Outro' },
];

// Só essas categorias são organizadas "até uma data final" e usam horas/dia.
const CATEGORIAS_COM_PRAZO = ['estudos', 'viagem', 'projeto', 'tarefas'];

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

// Anda dia a dia, empilhando tarefas até bater o limite de horas/dia, e só
// então pula pro próximo dia. Cada tarefa carrega sua data de prazo já
// calculada. Sem horasPorDia, ninguém recebe data — só a ordem é definida.
function agendarPorHoras(fases, dataInicioStr, horasPorDia) {
  if (!horasPorDia || horasPorDia <= 0) {
    return { fasesAgendadas: fases, horasTotais: null, diasNecessarios: null };
  }
  let cursor = new Date((dataInicioStr || hojeISO()) + 'T00:00:00');
  let horasHoje = 0;
  let horasTotais = 0;
  let diasUsados = 1;

  const fasesAgendadas = fases.map((fase) => {
    const tarefasComData = fase.tarefas.map((t) => {
      const horas = Number(t.horas) > 0 ? Number(t.horas) : 1;
      if (horasHoje > 0 && horasHoje + horas > horasPorDia) {
        cursor = new Date(cursor.getTime() + 86400000);
        horasHoje = 0;
        diasUsados += 1;
      }
      const dataTarefa = cursor.toISOString().slice(0, 10);
      horasHoje += horas;
      horasTotais += horas;
      if (horasHoje >= horasPorDia) {
        cursor = new Date(cursor.getTime() + 86400000);
        horasHoje = 0;
        diasUsados += 1;
      }
      return { ...t, data: dataTarefa };
    });
    return {
      ...fase,
      tarefas: tarefasComData,
      data_inicio: tarefasComData[0]?.data || null,
      data_prazo: tarefasComData[tarefasComData.length - 1]?.data || null,
    };
  });

  return { fasesAgendadas, horasTotais, diasNecessarios: diasUsados };
}

export default function CriarCronogramaIA() {
  const navigate = useNavigate();

  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES[0]);
  const [categoria, setCategoria] = useState('estudos');
  const [objetivo, setObjetivo] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [horasPorDia, setHorasPorDia] = useState('');

  const [gerando, setGerando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [plano, setPlano] = useState(null); // { fases: [{ nome, tarefas: [{titulo, horas}] }] }

  const temPrazo = CATEGORIAS_COM_PRAZO.includes(categoria);

  async function gerarPlano(e) {
    e.preventDefault();
    if (!objetivo.trim()) return;
    setErro('');
    setAviso('');
    setGerando(true);
    setPlano(null);
    try {
      const horas = temPrazo && horasPorDia !== '' ? Number(horasPorDia) : null;
      const diasDisponiveis = temPrazo && dataFinal
        ? Math.max(1, Math.round((new Date(dataFinal + 'T00:00:00') - new Date((dataInicio || hojeISO()) + 'T00:00:00')) / 86400000) + 1)
        : null;
      const horasDisponiveisTotais = horas && diasDisponiveis ? horas * diasDisponiveis : null;

      const prompt = `Você é um especialista em pedagogia e currículo. Monte um plano organizado em fases que respeitam a ordem correta de pré-requisitos — por exemplo, ensinar soma e subtração antes de multiplicação e divisão, ou fundamentos antes de tópicos avançados.

Objetivo:
"""
${objetivo.trim()}
"""
${temPrazo && dataInicio ? `Data de início: ${dataInicio}` : ''}
${temPrazo && dataFinal ? `Prazo final: ${dataFinal} (${diasDisponiveis} dias disponíveis)` : ''}
${horas ? `Tempo disponível: ${horas} horas por dia${horasDisponiveisTotais ? ` (${horasDisponiveisTotais.toFixed(1)}h no total até o prazo)` : ''}. Dimensione a QUANTIDADE de conteúdo do plano pra caber confortavelmente nesse tempo total — não faça um plano maior do que cabe.` : ''}

Responda APENAS com um JSON no formato exato abaixo, sem nenhum texto antes ou depois, sem blocos de markdown:
{
  "fases": [
    { "nome": "Nome curto da fase", "tarefas": [ { "titulo": "Título específico da tarefa", "horas": 1.5 } ] }
  ]
}

Regras:
- De 3 a 8 fases, cada uma com 2 a 8 tarefas.
- A ORDEM das fases e das tarefas importa: pré-requisitos sempre antes do que depende deles.
- "horas" é sua estimativa de quanto tempo de trabalho focado aquela tarefa específica exige (número, pode ser fracionário: 0.5, 1, 1.5, 2...).
- Títulos de tarefa específicos e práticos, não genéricos.
- Não inclua nada além do JSON.`;

      const resultado = await perguntarIAJson(prompt, undefined, 3500);
      if (!resultado?.fases?.length) throw new Error('A IA não retornou um plano válido. Tente de novo.');
      setPlano(resultado);

      if (horas && diasDisponiveis) {
        const horasTotaisPlano = resultado.fases
          .flatMap((f) => f.tarefas)
          .reduce((soma, t) => soma + (Number(t.horas) > 0 ? Number(t.horas) : 1), 0);
        const diasNecessarios = Math.ceil(horasTotaisPlano / horas);
        if (diasNecessarios > diasDisponiveis) {
          setAviso(`Esse plano precisa de aproximadamente ${horasTotaisPlano.toFixed(1)}h (${diasNecessarios} dias a ${horas}h/dia), mas você só tem ${diasDisponiveis} dias até o prazo. Considere aumentar as horas por dia, estender o prazo, ou remover alguma tarefa abaixo antes de criar.`);
        }
      }
    } catch (e2) {
      setErro(e2.message);
    }
    setGerando(false);
  }

  function removerTarefa(faseIdx, tarefaIdx) {
    setPlano((p) => ({
      ...p,
      fases: p.fases.map((f, i) => (
        i === faseIdx ? { ...f, tarefas: f.tarefas.filter((_, ti) => ti !== tarefaIdx) } : f
      )),
    }));
  }

  function removerFase(faseIdx) {
    setPlano((p) => ({ ...p, fases: p.fases.filter((_, i) => i !== faseIdx) }));
  }

  async function criarCronograma() {
    if (!plano?.fases?.length) return;
    setCriando(true);
    setErro('');
    try {
      const horas = temPrazo && horasPorDia !== '' ? Number(horasPorDia) : null;
      const { fasesAgendadas } = agendarPorHoras(plano.fases, dataInicio, horas);

      const novoId = await criarCronogramaCompleto({
        nome: nome.trim() || objetivo.trim().slice(0, 60),
        descricao: objetivo.trim(),
        cor,
        ativo: true,
        categoria,
        data_final: temPrazo ? (dataFinal || null) : null,
        horas_por_dia: horas,
        fases: fasesAgendadas.map((fase, i) => ({
          nome: fase.nome,
          cor: CORES[i % CORES.length],
          data_inicio: fase.data_inicio || null,
          data_prazo: fase.data_prazo || null,
          tarefas: fase.tarefas.map((t) => ({
            titulo: t.titulo,
            status: 'nao_iniciado',
            prioridade: 'media',
            data_prazo: t.data || null,
            horas_estimadas: Number(t.horas) > 0 ? Number(t.horas) : null,
          })),
        })),
      });
      navigate(`/cronogramas/${novoId}`);
    } catch (e2) {
      setErro(e2.message);
      setCriando(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 6 }}>Criar cronograma com IA</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, maxWidth: 620 }}>
        Descreva o que você quer fazer. A IA monta um plano em fases, já na ordem certa de
        pré-requisitos. Se a categoria tiver prazo, ela também estima quantas horas cada tarefa
        leva e distribui tudo dentro do seu limite diário de horas.
      </p>

      <form onSubmit={gerarPlano} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <input type="text" placeholder="Nome do cronograma (opcional)" value={nome} onChange={(e) => setNome(e.target.value)} />

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Categoria</div>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Cor</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {CORES.map((c) => (
              <div
                key={c}
                onClick={() => setCor(c)}
                style={{
                  width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                  outline: cor === c ? '2px solid var(--text)' : 'none', outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </div>

        <textarea
          rows={4}
          placeholder={
            categoria === 'viagem'
              ? 'Descreva a viagem: destino, o que precisa organizar, datas...'
              : categoria === 'projeto'
                ? 'Descreva o projeto: objetivo, entregas, marcos...'
                : 'O que você quer estudar? Ex: "Preciso aprender matemática básica do zero até equações do 2º grau, para o vestibular da Unicamp."'
          }
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          required
        />

        {temPrazo && (
          <>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Início (opcional)</div>
                <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                  {categoria === 'viagem' ? 'Data da viagem' : categoria === 'projeto' ? 'Data de entrega' : 'Prazo final'}
                </div>
                <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                Horas disponíveis por dia (opcional — ajuda a IA a dimensionar o plano certo)
              </div>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="Ex: 2"
                value={horasPorDia}
                onChange={(e) => setHorasPorDia(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}

        <button className="btn btn-primary" type="submit" disabled={gerando}>
          {gerando ? 'Montando o plano…' : 'Gerar plano com IA'}
        </button>
      </form>

      {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 14 }}>{erro}</div>}
      {aviso && <div style={{ color: 'var(--gold)', fontSize: 12.5, marginBottom: 14 }}>{aviso}</div>}

      {plano && (
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Plano sugerido — revise antes de criar</h3>
          {plano.fases.map((fase, fi) => (
            <div key={fi} className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{fi + 1}. {fase.nome}</div>
                <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }} onClick={() => removerFase(fi)}>
                  Remover fase
                </button>
              </div>
              {fase.tarefas.map((t, ti) => (
                <div key={ti} className="list-row">
                  <span style={{ flex: 1 }}>{t.titulo}</span>
                  {t.horas ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.horas}h</span> : null}
                  <button className="btn" style={{ padding: '1px 8px', fontSize: 12, color: 'var(--danger)' }} onClick={() => removerTarefa(fi, ti)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ))}

          <button className="btn btn-primary" onClick={criarCronograma} disabled={criando}>
            {criando ? 'Criando…' : 'Criar este cronograma'}
          </button>
        </div>
      )}
    </div>
  );
}
