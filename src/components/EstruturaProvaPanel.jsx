import { useMemo, useState } from 'react';
import { analisarEstruturaProva, resumoEstruturaDeterministico } from '../lib/analiseEstrutura';

const ROTULO_TIPO = {
  por_disciplina: 'Separada por disciplina',
  tematica: 'Temática',
  mista: 'Mista',
  indefinido: 'Indefinida',
};

export default function EstruturaProvaPanel({ documentosSelecionados }) {
  const deterministico = useMemo(
    () => resumoEstruturaDeterministico(documentosSelecionados),
    [documentosSelecionados]
  );
  const [interpretacao, setInterpretacao] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [espera, setEspera] = useState(0);
  const [erro, setErro] = useState('');

  async function analisar() {
    setCarregando(true);
    setErro('');
    setEspera(0);
    setInterpretacao(null);
    try {
      const { interpretacao_ia: ia } = await analisarEstruturaProva(documentosSelecionados, {
        onEspera: setEspera,
      });
      setInterpretacao(ia);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
      setEspera(0);
    }
  }

  if (!deterministico.total_questoes) return null;
  const d = deterministico;

  return (
    <div className="card">
      <h3>Estrutura da prova</h3>
      <div className="stats-grid">
        <div className="card"><strong>{d.total_questoes}</strong><span>questões</span></div>
        <div className="card"><strong>{ROTULO_TIPO[d.tipo_prova]}</strong><span>tipo de caderno</span></div>
        <div className="card"><strong>{(d.percentual_visual * 100).toFixed(0)}%</strong><span>dependem de visual</span></div>
        <div className="card"><strong>{d.grupos_texto_apoio}</strong><span>textos de apoio</span></div>
      </div>

      {d.por_area.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Área</th><th>Questões</th><th>Frequência</th></tr></thead>
            <tbody>
              {d.por_area.map((area) => (
                <tr key={area.area}>
                  <td>{area.area}</td>
                  <td>{area.questoes}</td>
                  <td>{(area.percentual * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="selection-help">
        Dificuldade estimada: {d.por_dificuldade.facil} fácil · {d.por_dificuldade.media} média
        · {d.por_dificuldade.dificil} difícil.
        {d.tipo_prova === 'indefinido' && ' Classifique as questões para detectar o tipo do caderno.'}
      </p>

      <button className="btn btn-primary" onClick={analisar} disabled={carregando}>
        {carregando
          ? (espera ? `IA ocupada, retomando em ${espera}s…` : 'Interpretando contexto com IA…')
          : 'Interpretar contexto com IA'}
      </button>

      {erro && <p className="selection-help" style={{ color: 'var(--danger, crimson)' }}>{erro}</p>}

      {interpretacao && (
        <div className="card">
          {interpretacao.tema_central && (
            <p><strong>Tema central:</strong> {interpretacao.tema_central}</p>
          )}
          {interpretacao.resumo_contexto && <p>{interpretacao.resumo_contexto}</p>}

          {interpretacao.textos_apoio?.length > 0 && (
            <>
              <strong>Textos de apoio</strong>
              <ul>
                {interpretacao.textos_apoio.map((texto, indice) => (
                  <li key={`${(texto.alvos || []).join('-')}-${indice}`}>
                    <em>Q {Array.isArray(texto.alvos) ? texto.alvos.join(', ') : '?'}:</em> {texto.resumo}
                  </li>
                ))}
              </ul>
            </>
          )}

          {interpretacao.observacoes?.length > 0 && (
            <ul>
              {interpretacao.observacoes.map((obs, indice) => (
                <li key={indice}>{obs}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
