import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { PL300_PLAN, UNICAMP_PLAN, TRILHA_DEV_PLAN } from '../lib/importData.js';
import { importarPlano } from '../lib/importer.js';
import { importarProvasFatecManualmente } from '../lib/importacaoManualProvas.js';
import { TOTAL_QUESTOES_CADERNOS_FATEC } from '../lib/importacaoManualFatec.js';

const PLANOS = [
  { plan: PL300_PLAN, descricao: '12 semanas, 5 fases, 33 tarefas.' },
  { plan: UNICAMP_PLAN, descricao: '18 semanas, 5 fases, 51 tarefas.' },
  {
    plan: TRILHA_DEV_PLAN,
    descricao: '6 meses (fase comum), 6 fases, 15 tarefas. As 4 trilhas de especialização e os links de curso ficam de fora por enquanto.',
  },
];

function ImportacaoManualFatec({ userId, onAbrirBanco }) {
  const [arquivos, setArquivos] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ percentual: 0, mensagem: '' });
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  async function executar() {
    setErro('');
    setResultado(null);
    setProcessando(true);
    try {
      const importado = await importarProvasFatecManualmente(
        arquivos,
        userId,
        (evento) => setProgresso(evento)
      );
      setResultado(importado);
    } catch (error) {
      setErro(error.message);
    } finally {
      setProcessando(false);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 28, borderColor: 'var(--yellow)' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 480px' }}>
          <h3 style={{ margin: '0 0 7px' }}>Importar provas FATEC manualmente</h3>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.55 }}>
            Selecione um ou mais pares completos de prova + gabarito. Esta rota não usa a fila de IA:
            cruza as respostas e disciplinas do gabarito, corrige alternativas diagramadas e recorta
            gráficos, tabelas, mapas e figuras diretamente do PDF. O painel visual completo é priorizado.
          </p>
        </div>
        <div style={{ minWidth: 150, textAlign: 'right' }}>
          <strong style={{ color: 'var(--yellow)', fontSize: 22 }}>{TOTAL_QUESTOES_CADERNOS_FATEC}</strong>
          <div style={{ color: 'var(--muted)', fontSize: 11 }}>questões nos 4 pares</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={processando}
          onChange={(event) => {
            setArquivos([...event.target.files]);
            setErro('');
            setResultado(null);
            setProgresso({ percentual: 0, mensagem: '' });
          }}
        />
        <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 7 }}>
          Para importar tudo agora, escolha os 8 PDFs: 2024/1, 2025/2, 2026/1 e 2026/2.
          Arquivos já publicados serão reconhecidos como duplicados, sem criar outra cópia.
        </div>
      </div>

      {arquivos.length > 0 && !processando && !resultado && (
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <strong>{arquivos.length} arquivo(s) selecionado(s):</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{arquivos.map((arquivo) => arquivo.name).join(' · ')}</span>
        </div>
      )}

      {(processando || progresso.mensagem) && !resultado && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
            <span>{progresso.mensagem || 'Preparando…'}</span>
            <strong>{progresso.percentual || 0}%</strong>
          </div>
          <div
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={progresso.percentual || 0}
            style={{ height: 8, background: 'var(--surface-2)', borderRadius: 999, overflow: 'hidden', marginTop: 7 }}
          >
            <div style={{ width: `${progresso.percentual || 0}%`, height: '100%', background: 'var(--yellow)' }} />
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 6 }}>
            Mantenha esta página aberta enquanto as imagens são enviadas.
          </div>
        </div>
      )}

      {erro && (
        <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 14 }}>{erro}</div>
      )}

      {resultado && (
        <div style={{ marginTop: 16, padding: 13, borderRadius: 8, background: 'var(--surface-2)' }}>
          <div style={{ fontWeight: 700, color: 'var(--success, #3fb950)' }}>Importação concluída</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.65, marginTop: 5 }}>
            {resultado.questoesProcessadas} processadas · {resultado.questoesInseridas} novas ·{' '}
            {resultado.questoesDuplicadas} já existentes · {resultado.imagensVinculadas} imagens vinculadas ·{' '}
            {resultado.questoesIgnoradas} ignoradas.
          </div>
          <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={onAbrirBanco}>
            Abrir banco de questões
          </button>
        </div>
      )}

      {!processando && !resultado && (
        <button
          className="btn btn-primary"
          style={{ marginTop: 16 }}
          disabled={!arquivos.length}
          onClick={executar}
        >
          Conferir e importar os PDFs
        </button>
      )}
    </section>
  );
}

export default function Importar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [estado, setEstado] = useState({}); // { [nome]: 'carregando' | 'ok' | { erro } }

  async function importar(plan) {
    setEstado((s) => ({ ...s, [plan.nome]: 'carregando' }));
    const resultado = await importarPlano(plan, user.id);
    if (resultado.ok) {
      setEstado((s) => ({ ...s, [plan.nome]: { ok: true, id: resultado.cronogramaId } }));
    } else {
      setEstado((s) => ({ ...s, [plan.nome]: { erro: resultado.erro } }));
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 6 }}>Importar dados</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, maxWidth: 560 }}>
        Importe os cadernos de prova diretamente para o banco ou recrie os cronogramas dos painéis HTML.
      </p>

      <ImportacaoManualFatec userId={user.id} onAbrirBanco={() => navigate('/perguntas')} />

      <h3 style={{ margin: '0 0 12px' }}>Importar cronogramas</h3>

      <div className="cronograma-list">
        {PLANOS.map(({ plan, descricao }) => {
          const st = estado[plan.nome];
          return (
            <div key={plan.nome} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="dot" style={{ width: 10, height: 10, borderRadius: '50%', background: plan.cor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="name">{plan.nome}</div>
                <div className="meta">{descricao}</div>
                {st?.erro && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{st.erro}</div>}
              </div>

              {st === 'carregando' && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Importando…</span>}

              {st?.ok && (
                <button className="btn btn-primary" onClick={() => navigate(`/cronogramas/${st.id}`)}>
                  Abrir cronograma
                </button>
              )}

              {!st?.ok && st !== 'carregando' && (
                <button className="btn btn-primary" onClick={() => importar(plan)}>Importar</button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 20 }}>
        A Rotina Semanal (academia + estudo) não entrou aqui porque tem uma natureza diferente —
        ela se repete toda semana, em vez de ter um prazo final. Ela fica melhor como uma página
        de Notas com uma checklist recorrente; posso montar isso separado quando você quiser.
      </div>
    </div>
  );
}
