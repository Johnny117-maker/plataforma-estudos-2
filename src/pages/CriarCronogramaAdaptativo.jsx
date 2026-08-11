import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import PlanejarCronogramaPanel from '../components/PlanejarCronogramaPanel';

export default function CriarCronogramaAdaptativo() {
  const [analises, setAnalises] = useState([]);
  const [analiseId, setAnaliseId] = useState('');
  const [materias, setMaterias] = useState([]);
  const [frequencias, setFrequencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([
      supabase.from('analises_provas').select('*').eq('status', 'concluida').order('created_at', { ascending: false }),
      supabase.from('materias').select('id,nome,subgeneros(id,nome)').order('ordem'),
    ]).then(([analisesResult, materiasResult]) => {
      if (analisesResult.error) setErro(analisesResult.error.message);
      const lista = analisesResult.data || [];
      setAnalises(lista);
      setAnaliseId(lista[0]?.id || '');
      setMaterias(materiasResult.data || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!analiseId) { setFrequencias([]); return; }
    setLoading(true);
    supabase.from('frequencias_assuntos').select('*').eq('analise_id', analiseId).order('peso', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        setFrequencias((data || []).map((item) => ({
          materia: item.materia_nome,
          assunto: item.assunto_nome,
          documentos: item.total_documentos,
          questoes: item.total_questoes,
          percentual: Number(item.percentual),
          peso: Number(item.peso),
        })));
        setLoading(false);
      });
  }, [analiseId]);

  const selecionada = useMemo(() => analises.find((item) => item.id === analiseId), [analises, analiseId]);
  const documentos = useMemo(
    () => Array.from({ length: selecionada?.total_documentos || 0 }, (_, indice) => ({ id: indice })),
    [selecionada],
  );

  if (loading && !analises.length) return <div className="empty-state">Carregando análises…</div>;

  return (
    <div>
      <h2>Novo cronograma adaptativo</h2>
      <p className="page-description">Escolha uma análise salva. O gerador usa as frequências reais das provas e deixa você ajustar o diagnóstico antes de criar.</p>
      {erro && <div className="form-error card">{erro}</div>}
      {!analises.length ? (
        <div className="empty-state">
          Nenhuma análise salva. <Link to="/provas">Analise e salve as provas primeiro.</Link>
        </div>
      ) : (
        <>
          <label className="card analysis-selector">
            Análise de provas
            <select value={analiseId} onChange={(e) => setAnaliseId(e.target.value)}>
              {analises.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.total_documentos} arquivo(s) · {item.total_questoes} conteúdo(s)</option>)}
            </select>
          </label>
          {loading && <div className="empty-state">Carregando assuntos…</div>}
          {!loading && frequencias.length > 0 && (
            <PlanejarCronogramaPanel
              key={analiseId}
              documentosSelecionados={documentos}
              frequencias={frequencias}
              materias={materias}
              nomeSugerido={`Cronograma — ${selecionada?.nome || 'provas'}`}
              analiseId={analiseId}
            />
          )}
          {!loading && !frequencias.length && <div className="empty-state">Essa análise não possui assuntos classificados.</div>}
        </>
      )}
    </div>
  );
}
