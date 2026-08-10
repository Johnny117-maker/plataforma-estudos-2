import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import PageTree from '../components/PageTree.jsx';
import BlockEditor from '../components/BlockEditor.jsx';

export default function Notas() {
  const { user } = useAuth();
  const [paginas, setPaginas] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [titulo, setTitulo] = useState('');
  const saveTimer = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('paginas')
      .select('*')
      .order('ordem', { ascending: true });
    setPaginas(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const paginaAtual = paginas.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    setTitulo(paginaAtual?.titulo || '');
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function criarPagina(parentId = null) {
    const { data, error } = await supabase
      .from('paginas')
      .insert({ user_id: user.id, titulo: 'Sem título', parent_id: parentId, blocos: [] })
      .select()
      .single();
    if (!error) {
      setPaginas((prev) => [...prev, data]);
      setSelectedId(data.id);
    }
  }

  async function excluirPagina(id) {
    if (!confirm('Excluir esta página (e subpáginas)?')) return;
    await supabase.from('paginas').delete().eq('id', id);
    if (selectedId === id) setSelectedId(null);
    carregar();
  }

  function salvarComDelay(campos) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from('paginas').update(campos).eq('id', selectedId);
    }, 500);
  }

  function onChangeTitulo(novo) {
    setTitulo(novo);
    setPaginas((prev) => prev.map((p) => (p.id === selectedId ? { ...p, titulo: novo } : p)));
    salvarComDelay({ titulo: novo });
  }

  function onChangeBlocos(novosBlocos) {
    setPaginas((prev) => prev.map((p) => (p.id === selectedId ? { ...p, blocos: novosBlocos } : p)));
    salvarComDelay({ blocos: novosBlocos });
  }

  return (
    <div style={{ display: 'flex', gap: 24 }}>
      <div style={{ width: 220, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ fontSize: 13 }}>Páginas</h3>
          <button className="btn" onClick={() => criarPagina(null)}>+ Nova</button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Carregando…</div>
        ) : (
          <PageTree
            paginas={paginas}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAddSub={criarPagina}
            onDelete={excluirPagina}
          />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {!paginaAtual ? (
          <div className="empty-state">Selecione uma página à esquerda, ou crie uma nova.</div>
        ) : (
          <div>
            <input
              type="text"
              value={titulo}
              onChange={(e) => onChangeTitulo(e.target.value)}
              placeholder="Sem título"
              style={{
                background: 'transparent', border: 'none', fontFamily: 'Oswald, sans-serif',
                fontSize: 24, textTransform: 'uppercase', color: 'var(--text)', padding: 0,
                marginBottom: 18, width: '100%',
              }}
            />
            <BlockEditor blocos={paginaAtual.blocos || []} onChange={onChangeBlocos} />
          </div>
        )}
      </div>
    </div>
  );
}
