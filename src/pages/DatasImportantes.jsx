import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../lib/AuthContext.jsx';
import CountdownCard from '../components/CountdownCard.jsx';
import DataImportanteModal from '../components/DataImportanteModal.jsx';

export default function DatasImportantes() {
  const { user } = useAuth();
  const [datas, setDatas] = useState([]);
  const [cronogramas, setCronogramas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(undefined);
  const [mostrarPassadas, setMostrarPassadas] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [{ data: dData }, { data: cData }] = await Promise.all([
      supabase.from('datas_importantes').select('*').order('data', { ascending: true }),
      supabase.from('cronogramas').select('id, nome').eq('ativo', true),
    ]);
    setDatas(dData || []);
    setCronogramas(cData || []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const cronogramasById = Object.fromEntries(cronogramas.map((c) => [c.id, c]));
  const hojeStr = new Date().toISOString().slice(0, 10);
  const futuras = datas.filter((d) => d.data >= hojeStr);
  const passadas = [...datas.filter((d) => d.data < hojeStr)].reverse();

  if (loading) return <div className="empty-state">Carregando…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Datas Importantes</h2>
        <button className="btn btn-primary" onClick={() => setModal(null)}>+ Nova data</button>
      </div>

      {futuras.length === 0 && passadas.length === 0 && (
        <div className="empty-state">
          Nenhuma data marcada ainda. Clique em "+ Nova data" pra marcar provas, entregas e outros prazos importantes.
        </div>
      )}

      {futuras.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {futuras.map((d) => (
            <CountdownCard
              key={d.id}
              item={d}
              contextoNome={cronogramasById[d.cronograma_id]?.nome}
              onClick={() => setModal(d)}
            />
          ))}
        </div>
      )}

      {passadas.length > 0 && (
        <div>
          <button
            className="btn"
            style={{ fontSize: 12, marginBottom: 10 }}
            onClick={() => setMostrarPassadas((v) => !v)}
          >
            {mostrarPassadas ? 'Ocultar' : 'Mostrar'} datas passadas ({passadas.length})
          </button>
          {mostrarPassadas && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {passadas.map((d) => (
                <CountdownCard
                  key={d.id}
                  item={d}
                  contextoNome={cronogramasById[d.cronograma_id]?.nome}
                  onClick={() => setModal(d)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {modal !== undefined && (
        <DataImportanteModal
          userId={user.id}
          cronogramas={cronogramas}
          dataImportante={modal}
          onClose={() => setModal(undefined)}
          onSaved={carregar}
        />
      )}
    </div>
  );
}
