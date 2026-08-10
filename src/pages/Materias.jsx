import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import { seedMateriasPadrao, importarSubgeneros } from '../lib/materiasSeed';
import { SUBGENEROS_PADRAO_POR_MATERIA } from '../lib/materiasData';
import MateriaModal from '../components/MateriaModal.jsx';

export default function Materias() {
  const { user } = useAuth();
  const [materias, setMaterias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState('gerenciar');
  const [selecionada, setSelecionada] = useState(null);
  const [novoAssunto, setNovoAssunto] = useState('');
  const [textoLote, setTextoLote] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [dragOverMateria, setDragOverMateria] = useState(null);
  const [modalMateria, setModalMateria] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('materias')
      .select('*, subgeneros(*)')
      .order('ordem', { ascending: true });
    setMaterias(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criarPadrao() {
    const r = await seedMateriasPadrao(user.id);
    setMensagem(r.criadas > 0 ? `${r.criadas} matéria(s) criada(s).` : 'As 9 matérias padrão já existiam.');
    carregar();
  }

  async function adicionarAssunto(e) {
    e.preventDefault();
    if (!selecionada || !novoAssunto.trim()) return;
    await supabase.from('subgeneros').insert({ user_id: user.id, materia_id: selecionada.id, nome: novoAssunto.trim() });
    setNovoAssunto('');
    carregar();
  }

  async function importarLote() {
    if (!selecionada || !textoLote.trim()) return;
    const linhas = textoLote.split('\n');
    const r = await importarSubgeneros(selecionada.id, user.id, linhas);
    setMensagem(`${r.inseridos} assunto(s) importado(s).`);
    setTextoLote('');
    carregar();
  }

  async function importarPadraoDaMateria() {
    if (!selecionada) return;
    const lista = SUBGENEROS_PADRAO_POR_MATERIA[selecionada.nome];
    if (!lista) return;
    const r = await importarSubgeneros(selecionada.id, user.id, lista);
    setMensagem(`${r.inseridos} assunto(s) importado(s) de ${selecionada.nome}.`);
    carregar();
  }

  async function excluirAssunto(id) {
    await supabase.from('subgeneros').delete().eq('id', id);
    carregar();
  }

  async function excluirMateria(id) {
    if (!confirm('Excluir esta matéria e todos os seus assuntos?')) return;
    await supabase.from('materias').delete().eq('id', id);
    if (selecionada?.id === id) setSelecionada(null);
    carregar();
  }

  async function moverAssuntoParaMateria(subgeneroId, novaMateriaId) {
    await supabase.from('subgeneros').update({ materia_id: novaMateriaId }).eq('id', subgeneroId);
    carregar();
  }

  const materiaAtual = materias.find((m) => m.id === selecionada?.id);
  const temImportacaoPadrao = materiaAtual && SUBGENEROS_PADRAO_POR_MATERIA[materiaAtual.nome];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Matérias e Assuntos</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={criarPadrao}>Configurar as 9 matérias padrão</button>
          <button className="btn btn-primary" onClick={() => setModalMateria(true)}>+ Nova matéria</button>
        </div>
      </div>

      {mensagem && <div style={{ fontSize: 12.5, color: 'var(--gold)', marginBottom: 14 }}>{mensagem}</div>}

      <div className="tabbar">
        <button className={'tab-btn' + (aba === 'gerenciar' ? ' active' : '')} onClick={() => setAba('gerenciar')}>Gerenciar</button>
        <button className={'tab-btn' + (aba === 'kanban' ? ' active' : '')} onClick={() => setAba('kanban')}>Kanban de Assuntos</button>
      </div>

      {loading ? (
        <div className="empty-state">Carregando…</div>
      ) : materias.length === 0 ? (
        <div className="empty-state">
          Nenhuma matéria ainda. Clique em "Configurar as 9 matérias padrão" ou em "+ Nova matéria" acima.
        </div>
      ) : aba === 'gerenciar' ? (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {materias.map((m) => (
              <div
                key={m.id}
                className={'subject-btn' + (selecionada?.id === m.id ? ' active' : '')}
                style={{ borderLeftColor: m.cor, cursor: 'pointer' }}
                onClick={() => setSelecionada(m)}
              >
                <span>{m.nome}</span>
                <span className="prio" style={{ color: m.cor }}>{m.subgeneros?.length || 0}</span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!materiaAtual ? (
              <div className="empty-state">Selecione uma matéria à esquerda.</div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ color: materiaAtual.cor }}>{materiaAtual.nome}</h3>
                  <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => excluirMateria(materiaAtual.id)}>Excluir matéria</button>
                </div>

                {temImportacaoPadrao && (
                  <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={importarPadraoDaMateria}>
                    Importar os {SUBGENEROS_PADRAO_POR_MATERIA[materiaAtual.nome].length} assuntos padrão de {materiaAtual.nome}
                  </button>
                )}

                <form onSubmit={adicionarAssunto} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input type="text" placeholder="Novo assunto" value={novoAssunto} onChange={(e) => setNovoAssunto(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn" type="submit">Adicionar</button>
                </form>

                <details style={{ marginBottom: 14 }}>
                  <summary style={{ fontSize: 12.5, color: 'var(--muted)', cursor: 'pointer' }}>Importar vários assuntos de uma vez (um por linha)</summary>
                  <textarea
                    rows={5}
                    value={textoLote}
                    onChange={(e) => setTextoLote(e.target.value)}
                    placeholder={'Assunto 1\nAssunto 2\nAssunto 3'}
                    style={{ width: '100%', marginTop: 8 }}
                  />
                  <button className="btn btn-primary" style={{ marginTop: 6 }} onClick={importarLote}>Importar lista</button>
                </details>

                <div className="card">
                  {(materiaAtual.subgeneros || []).length === 0 && (
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Nenhum assunto ainda.</div>
                  )}
                  {(materiaAtual.subgeneros || []).map((s) => (
                    <div key={s.id} className="list-row">
                      <span style={{ flex: 1 }}>{s.nome}</span>
                      <button className="btn" style={{ color: 'var(--danger)', fontSize: 10.5, padding: '4px 8px' }} onClick={() => excluirAssunto(s.id)}>Excluir</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
          {materias.map((m) => (
            <div key={m.id} style={{ width: 240, flexShrink: 0 }}>
              <div className="kanban-col-title">
                <span style={{ color: m.cor }}>{m.nome}</span>
                <span>{m.subgeneros?.length || 0}</span>
              </div>
              <div
                className={'kanban-col-body' + (dragOverMateria === m.id ? ' dragover' : '')}
                onDragOver={(e) => { e.preventDefault(); setDragOverMateria(m.id); }}
                onDragLeave={() => setDragOverMateria(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  const subgeneroId = e.dataTransfer.getData('text/plain');
                  setDragOverMateria(null);
                  moverAssuntoParaMateria(subgeneroId, m.id);
                }}
              >
                {(m.subgeneros || []).length === 0 && <div style={{ fontSize: 12, color: 'var(--muted)', padding: 8 }}>Vazio</div>}
                {(m.subgeneros || []).map((s) => (
                  <div
                    key={s.id}
                    className="task-card"
                    style={{ borderLeftColor: m.cor }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
                  >
                    {s.nome}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalMateria && (
        <MateriaModal
          userId={user.id}
          proximaOrdem={materias.length}
          onClose={() => setModalMateria(false)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
