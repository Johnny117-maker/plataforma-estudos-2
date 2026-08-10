// datasImportantes é opcional — telas que não usam a feature continuam
// funcionando exatamente como antes.
export default function TimelineView({ fases, datasImportantes = [] }) {
  const comDatas = fases.filter((f) => f.data_inicio && f.data_prazo);
  const marcos = datasImportantes.filter((d) => d.data);

  if (comDatas.length === 0) {
    return <div className="empty-state">Nenhuma fase com data de início/prazo definida ainda. Edite as fases no Supabase (ou na tela de edição, quando construirmos) pra ver a timeline aqui.</div>;
  }

  const todasAsDatas = [
    ...comDatas.map((f) => new Date(f.data_inicio).getTime()),
    ...comDatas.map((f) => new Date(f.data_prazo).getTime()),
    ...marcos.map((d) => new Date(d.data).getTime()),
  ];
  const min = Math.min(...todasAsDatas);
  const max = Math.max(...todasAsDatas);
  const span = max - min || 1;
  const hoje = Date.now();
  const hojePct = Math.min(100, Math.max(0, ((hoje - min) / span) * 100));
  const alturaExtra = marcos.length > 0 ? 22 : 0;

  return (
    <div className="card">
      <div style={{ position: 'relative', paddingBottom: alturaExtra }}>
        {comDatas.map((f) => {
          const inicioPct = ((new Date(f.data_inicio).getTime() - min) / span) * 100;
          const larguraPct = ((new Date(f.data_prazo).getTime() - new Date(f.data_inicio).getTime()) / span) * 100;
          return (
            <div key={f.id} className="timeline-row">
              <span style={{ fontSize: 13 }}>{f.nome}</span>
              <div className="timeline-track">
                <div
                  className="timeline-bar"
                  style={{ left: `${inicioPct}%`, width: `${Math.max(larguraPct, 2)}%`, background: f.cor || '#8B949E' }}
                  title={`${f.data_inicio} → ${f.data_prazo}`}
                />
              </div>
            </div>
          );
        })}

        {marcos.map((d) => {
          const pct = ((new Date(d.data).getTime() - min) / span) * 100;
          return (
            <div
              key={'marco-' + d.id}
              style={{
                position: 'absolute', top: 0, bottom: alturaExtra,
                left: `calc(140px + ${pct}% * (100% - 140px) / 100)`,
                width: 2, background: d.cor || '#F2C811', zIndex: 2,
              }}
              title={d.titulo}
            >
              <div
                style={{
                  position: 'absolute', bottom: -alturaExtra, left: '50%', transform: 'translateX(-50%)',
                  fontSize: 10, whiteSpace: 'nowrap', color: d.cor || '#F2C811',
                }}
              >
                {'\u{1F6A9}'} {d.titulo}
              </div>
            </div>
          );
        })}

        {hoje >= min && hoje <= max && (
          <div
            style={{
              position: 'absolute', top: 0, bottom: alturaExtra, left: `calc(140px + ${hojePct}% * (100% - 140px) / 100)`,
              width: 2, background: 'var(--text)',
            }}
            title="Hoje"
          />
        )}
      </div>
    </div>
  );
}
