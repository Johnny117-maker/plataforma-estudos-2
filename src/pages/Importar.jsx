import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';
import { PL300_PLAN, UNICAMP_PLAN, TRILHA_DEV_PLAN } from '../lib/importData.js';
import { importarPlano } from '../lib/importer.js';

const PLANOS = [
  { plan: PL300_PLAN, descricao: '12 semanas, 5 fases, 33 tarefas.' },
  { plan: UNICAMP_PLAN, descricao: '18 semanas, 5 fases, 51 tarefas.' },
  {
    plan: TRILHA_DEV_PLAN,
    descricao: '6 meses (fase comum), 6 fases, 15 tarefas. As 4 trilhas de especialização e os links de curso ficam de fora por enquanto.',
  },
];

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
      <h2 style={{ marginBottom: 6 }}>Importar cronogramas</h2>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20, maxWidth: 560 }}>
        Recria os planos que você já tinha nos painéis HTML como cronogramas de verdade no banco.
        As datas de cada fase/tarefa são recalculadas a partir de hoje, contando semana a semana
        (ou mês a mês, no caso da Trilha Dev).
      </p>

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
