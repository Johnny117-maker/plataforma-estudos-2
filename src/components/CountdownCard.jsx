function diasRestantes(dataStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(dataStr + 'T00:00:00');
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

export default function CountdownCard({ item, contextoNome, onClick }) {
  const dias = diasRestantes(item.data);
  const passou = dias < 0;

  return (
    <div
      className="card"
      style={{
        cursor: 'pointer',
        borderLeft: `4px solid ${item.cor || '#F2C811'}`,
        opacity: passou ? 0.55 : 1,
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{item.titulo}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
            {new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            })}
            {contextoNome ? ` · ${contextoNome}` : ''}
          </div>
          {item.observacao && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{item.observacao}</div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'Oswald, sans-serif', fontSize: 26,
            color: passou ? 'var(--muted)' : (item.cor || 'var(--gold)'),
          }}>
            {passou ? '—' : Math.abs(dias)}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase' }}>
            {passou ? `há ${Math.abs(dias)} dia(s)` : dias === 0 ? 'é hoje!' : dias === 1 ? 'dia' : 'dias'}
          </div>
        </div>
      </div>
    </div>
  );
}
