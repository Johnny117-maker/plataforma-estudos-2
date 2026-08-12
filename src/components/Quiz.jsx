import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { opcoesDaPergunta, respostaObjetivaCorreta } from '../lib/quizUtils';

const LETRAS = ['a', 'b', 'c', 'd', 'e', 'f'];

export default function Quiz({ perguntas, userId, testeId = null, onFinalizar, onSair }) {
  const [indice, setIndice] = useState(0);
  const [respondida, setRespondida] = useState(null);
  const [texto, setTexto] = useState('');
  const [mostraModelo, setMostraModelo] = useState(false);
  const [acertos, setAcertos] = useState(0);
  const [erro, setErro] = useState('');
  const inicioQuestaoRef = useRef(Date.now());
  const finalizadoRef = useRef(false);
  const acabou = indice >= perguntas.length;
  const pergunta = perguntas[indice];

  useEffect(() => {
    if (!acabou || finalizadoRef.current) return;
    finalizadoRef.current = true;
    onFinalizar?.({ acertos, total: perguntas.length });
  }, [acabou, acertos, onFinalizar, perguntas.length]);

  async function registrar(resposta, correta) {
    const { error } = await supabase.from('historico_respostas').insert({
      user_id: userId,
      pergunta_id: pergunta.id,
      teste_id: testeId,
      resposta_dada: resposta,
      correta,
      tempo_segundos: Math.max(0, Math.round((Date.now() - inicioQuestaoRef.current) / 1000)),
    });
    if (error) throw new Error(error.message);
    if (correta) setAcertos((valor) => valor + 1);
  }

  async function responderObjetiva(i) {
    if (respondida !== null) return;
    setErro('');
    setRespondida(i);
    try {
      await registrar(String(i), respostaObjetivaCorreta(pergunta, i));
    } catch (error) {
      setErro(error.message);
    }
  }

  async function autoavaliar(correta) {
    setErro('');
    try {
      await registrar(texto.trim(), correta);
      setRespondida(correta ? 'correta' : 'revisar');
    } catch (error) {
      setErro(error.message);
    }
  }

  function proxima() {
    setRespondida(null);
    setTexto('');
    setMostraModelo(false);
    setErro('');
    inicioQuestaoRef.current = Date.now();
    setIndice((valor) => valor + 1);
  }

  if (perguntas.length === 0) return <div className="empty-state">Nenhuma pergunta encontrada.<div><button className="btn" onClick={onSair}>Voltar</button></div></div>;
  if (acabou) {
    const pct = Math.round((acertos / perguntas.length) * 100);
    return <div className="card quiz-result"><div className="quiz-score">{pct}%</div><div>{acertos} de {perguntas.length} corretas</div><button className="btn btn-primary" onClick={onSair}>Voltar</button></div>;
  }

  const opcoes = opcoesDaPergunta(pergunta);
  const dissertativa = pergunta.tipo === 'dissertativa';
  const correctIndex = Number(pergunta.resposta_correta);

  return (
    <div className="card quiz-card">
      <div className="quiz-meta">Questão {indice + 1} de {perguntas.length} · {acertos} acerto(s)</div>
      {(pergunta.fonte || pergunta.numero_original) && (
        <div className="quiz-source">
          {pergunta.fonte || 'Prova'}{pergunta.numero_original ? ` · questão ${pergunta.numero_original}` : ''}
        </div>
      )}
      <div className="quiz-question">{pergunta.enunciado}</div>
      {pergunta.imagem_assinada_url && (
        <figure className="quiz-original-figure">
          <img className="quiz-image" src={pergunta.imagem_assinada_url} alt="Figura associada à questão" />
          <figcaption>Figura extraída do documento original</figcaption>
        </figure>
      )}
      {pergunta.possui_elemento_visual && pergunta.metadados?.descricao_visual && (
        <div className="answer-review">Descrição do elemento visual: {pergunta.metadados.descricao_visual}</div>
      )}
      {dissertativa ? (
        <div className="quiz-dissertativa">
          <textarea rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva sua resposta…" disabled={mostraModelo} />
          {!mostraModelo && <button className="btn btn-primary" disabled={!texto.trim()} onClick={() => setMostraModelo(true)}>Comparar resposta</button>}
          {mostraModelo && (
            <div className="answer-review">
              <div><strong>Resposta-modelo</strong></div>
              <div>{pergunta.resposta_correta}</div>
              {respondida === null && <div className="button-row"><button className="btn btn-primary" onClick={() => autoavaliar(true)}>Minha resposta está correta</button><button className="btn" onClick={() => autoavaliar(false)}>Preciso revisar</button></div>}
            </div>
          )}
        </div>
      ) : (
        <div className="quiz-options">
          {opcoes.map((alt, i) => {
            let className = 'quiz-option';
            if (respondida !== null && i === correctIndex) className += ' correct';
            else if (respondida !== null && i === respondida) className += ' wrong';
            return <button key={`${alt}-${i}`} type="button" className={className} onClick={() => responderObjetiva(i)} disabled={respondida !== null}><strong>{LETRAS[i]})</strong> {alt}</button>;
          })}
        </div>
      )}
      {erro && <div className="form-error">{erro}</div>}
      {respondida !== null && (
        <div className="quiz-feedback">
          {pergunta.explicacao && <div className="answer-review">{pergunta.explicacao}</div>}
          <button className="btn btn-primary" onClick={proxima}>{indice + 1 < perguntas.length ? 'Próxima questão' : 'Ver resultado'}</button>
        </div>
      )}
    </div>
  );
}
