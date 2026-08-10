const TIPOS = [
  { value: 'titulo1', label: 'Título 1' },
  { value: 'titulo2', label: 'Título 2' },
  { value: 'paragrafo', label: 'Texto' },
  { value: 'lista', label: 'Lista' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'citacao', label: 'Citação' },
  { value: 'codigo', label: 'Código' },
];

function novoBloco(tipo = 'paragrafo') {
  return { id: crypto.randomUUID(), tipo, texto: '', marcado: false };
}

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export default function BlockEditor({ blocos, onChange }) {
  const lista = blocos.length ? blocos : [novoBloco()];

  function atualizar(novaLista) {
    onChange(novaLista);
  }

  function setTexto(i, texto) {
    const nova = [...lista];
    nova[i] = { ...nova[i], texto };
    atualizar(nova);
  }

  function setTipo(i, tipo) {
    const nova = [...lista];
    nova[i] = { ...nova[i], tipo };
    atualizar(nova);
  }

  function toggleMarcado(i) {
    const nova = [...lista];
    nova[i] = { ...nova[i], marcado: !nova[i].marcado };
    atualizar(nova);
  }

  function adicionarApos(i) {
    const nova = [...lista];
    nova.splice(i + 1, 0, novoBloco());
    atualizar(nova);
  }

  function excluir(i) {
    if (lista.length === 1) { atualizar([novoBloco()]); return; }
    const nova = lista.filter((_, idx) => idx !== i);
    atualizar(nova);
  }

  function mover(i, direcao) {
    const alvo = i + direcao;
    if (alvo < 0 || alvo >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    atualizar(nova);
  }

  return (
    <div className="block-editor">
      {lista.map((b, i) => (
        <div className="block-row" key={b.id}>
          <div className="block-controls">
            <select value={b.tipo} onChange={(e) => setTipo(i, e.target.value)}>
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <button title="Subir" onClick={() => mover(i, -1)}>↑</button>
            <button title="Descer" onClick={() => mover(i, 1)}>↓</button>
            <button title="Excluir bloco" onClick={() => excluir(i)}>×</button>
          </div>

          <div className={`block-content block-${b.tipo}`}>
            {b.tipo === 'checklist' && (
              <input type="checkbox" checked={!!b.marcado} onChange={() => toggleMarcado(i)} style={{ marginTop: 6 }} />
            )}
            {b.tipo === 'lista' && <span style={{ marginTop: 4 }}>•</span>}
            <textarea
              ref={(el) => autoResize(el)}
              rows={1}
              value={b.texto}
              placeholder={
                b.tipo === 'titulo1' ? 'Título grande' :
                b.tipo === 'titulo2' ? 'Título médio' :
                b.tipo === 'codigo' ? 'Trecho de código' :
                b.tipo === 'citacao' ? 'Citação' : 'Escreva algo…'
              }
              onChange={(e) => { setTexto(i, e.target.value); autoResize(e.target); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && b.tipo !== 'codigo') {
                  e.preventDefault();
                  adicionarApos(i);
                }
              }}
              style={{ textDecoration: b.tipo === 'checklist' && b.marcado ? 'line-through' : 'none', opacity: b.tipo === 'checklist' && b.marcado ? 0.55 : 1 }}
            />
          </div>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 6 }} onClick={() => adicionarApos(lista.length - 1)}>+ Bloco</button>
    </div>
  );
}
