function construirArvore(paginas, parentId = null) {
  return paginas
    .filter((p) => p.parent_id === parentId)
    .sort((a, b) => a.ordem - b.ordem)
    .map((p) => ({ ...p, filhos: construirArvore(paginas, p.id) }));
}

function Node({ node, nivel, selectedId, onSelect, onAddSub, onDelete }) {
  return (
    <div>
      <div
        className={'page-node' + (node.id === selectedId ? ' active' : '')}
        style={{ paddingLeft: 10 + nivel * 16 }}
        onClick={() => onSelect(node.id)}
      >
        <span style={{ marginRight: 6 }}>{node.icone || '📄'}</span>
        <span className="page-node-title">{node.titulo || 'Sem título'}</span>
        <span className="page-node-actions">
          <button title="Nova subpágina" onClick={(e) => { e.stopPropagation(); onAddSub(node.id); }}>+</button>
          <button title="Excluir" onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}>×</button>
        </span>
      </div>
      {node.filhos.map((filho) => (
        <Node key={filho.id} node={filho} nivel={nivel + 1} selectedId={selectedId} onSelect={onSelect} onAddSub={onAddSub} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default function PageTree({ paginas, selectedId, onSelect, onAddSub, onDelete }) {
  const arvore = construirArvore(paginas, null);
  if (arvore.length === 0) return <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '8px 10px' }}>Nenhuma página ainda.</div>;
  return (
    <div>
      {arvore.map((node) => (
        <Node key={node.id} node={node} nivel={0} selectedId={selectedId} onSelect={onSelect} onAddSub={onAddSub} onDelete={onDelete} />
      ))}
    </div>
  );
}
