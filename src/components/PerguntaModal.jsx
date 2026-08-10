import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { payloadPergunta } from '../lib/quizUtils';

const LETRAS = ['a', 'b', 'c', 'd', 'e', 'f'];

export default function PerguntaModal({ materias, userId, pergunta, onClose, onSaved }) {
  const [materiaId, setMateriaId] = useState(pergunta?.materia_id || materias[0]?.id || '');
  const [subgeneroId, setSubgeneroId] = useState(pergunta?.subgenero_id || '');
  const [tipo, setTipo] = useState(pergunta?.tipo || 'multipla_escolha');
  const [enunciado, setEnunciado] = useState(pergunta?.enunciado || '');
  const [alternativas, setAlternativas] = useState(pergunta?.alternativas || ['', '', '', '']);
  const [respostaCorreta, setRespostaCorreta] = useState(pergunta?.resposta_correta ?? '0');
  const [respostaModelo, setRespostaModelo] = useState(pergunta?.tipo === 'dissertativa' ? pergunta.resposta_correta : '');
  const [explicacao, setExplicacao] = useState(pergunta?.explicacao || '');
  const [dificuldade, setDificuldade] = useState(pergunta?.dificuldade || 'media');
  const [fonte, setFonte] = useState(pergunta?.fonte || '');
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const subgenerosDisponiveis = materias.find((m) => m.id === materiaId)?.subgeneros || [];

  function setAlternativa(i, valor) {
    const nova = [...alternativas];
    nova[i] = valor;
    setAlternativas(nova);
  }

  function adicionarAlternativa() {
    setAlternativas([...alternativas, '']);
  }

  function removerAlternativa(i) {
    const nova = alternativas.filter((_, idx) => idx !== i);
    setAlternativas(nova);
    if (Number(respostaCorreta) === i) setRespostaCorreta('0');
  }

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSaving(true);

    const formato = payloadPergunta({ tipo, alternativas, respostaCorreta, respostaModelo });
    if (tipo === 'dissertativa' && !formato.resposta_correta) {
      setSaving(false); setErro('Informe uma resposta-modelo.'); return;
    }
    if (tipo === 'multipla_escolha' && (formato.alternativas.length < 2 || Number(respostaCorreta) >= formato.alternativas.length)) {
      setSaving(false); setErro('Informe pelo menos duas alternativas e marque uma opção válida.'); return;
    }
    const payload = {
      user_id: userId,
      materia_id: materiaId,
      subgenero_id: subgeneroId || null,
      tipo,
      enunciado,
      ...formato,
      explicacao: explicacao || null,
      dificuldade,
      fonte: fonte || null,
    };

    const { error } = pergunta
      ? await supabase.from('perguntas').update(payload).eq('id', pergunta.id)
      : await supabase.from('perguntas').insert(payload);

    setSaving(false);
    if (error) { setErro(error.message); return; }
    onSaved(); onClose();
  }

  async function excluir() {
    if (!confirm('Excluir esta pergunta?')) return;
    await supabase.from('perguntas').delete().eq('id', pergunta.id);
    onSaved(); onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>{pergunta ? 'Editar pergunta' : 'Nova pergunta'}</h3>

        <div style={{ display: 'flex', gap: 8 }}>
          <select value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setSubgeneroId(''); }} style={{ flex: 1 }} required>
            {materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <select value={subgeneroId} onChange={(e) => setSubgeneroId(e.target.value)} style={{ flex: 1 }}>
            <option value="">Sem assunto específico</option>
            {subgenerosDisponiveis.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>

        <select value={tipo} onChange={(e) => { const novoTipo = e.target.value; setTipo(novoTipo); if (novoTipo !== 'dissertativa' && !['0', '1', '2', '3', '4', '5'].includes(String(respostaCorreta))) setRespostaCorreta('0'); }}>
          <option value="multipla_escolha">Múltipla escolha</option>
          <option value="verdadeiro_falso">Verdadeiro ou falso</option>
          <option value="dissertativa">Dissertativa</option>
        </select>

        <textarea rows={3} placeholder="Enunciado da questão" value={enunciado} onChange={(e) => setEnunciado(e.target.value)} required />

        {tipo === 'dissertativa' && (
          <textarea rows={4} placeholder="Resposta-modelo para comparação" value={respostaModelo} onChange={(e) => setRespostaModelo(e.target.value)} required />
        )}

        {tipo !== 'dissertativa' && (
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
              Alternativas (marque a correta)
            </div>
            {(tipo === 'verdadeiro_falso' ? ['Verdadeiro', 'Falso'] : alternativas).map((alt, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input
                  type="radio"
                  name="correta"
                  checked={Number(respostaCorreta) === i}
                  onChange={() => setRespostaCorreta(String(i))}
                />
                <span style={{ fontSize: 11.5, color: 'var(--muted)', width: 14 }}>{LETRAS[i]})</span>
                {tipo === 'verdadeiro_falso' ? (
                  <span style={{ flex: 1, fontSize: 13.5 }}>{alt}</span>
                ) : (
                  <>
                    <input type="text" value={alt} onChange={(e) => setAlternativa(i, e.target.value)} style={{ flex: 1 }} required />
                    {alternativas.length > 2 && (
                      <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: 10.5 }} onClick={() => removerAlternativa(i)}>×</button>
                    )}
                  </>
                )}
              </div>
            ))}
            {tipo === 'multipla_escolha' && (
              <button type="button" className="btn" style={{ fontSize: 10.5 }} onClick={adicionarAlternativa}>+ Alternativa</button>
            )}
          </div>
        )}

        <textarea rows={2} placeholder="Explicação (mostrada depois de responder)" value={explicacao} onChange={(e) => setExplicacao(e.target.value)} />

        <div style={{ display: 'flex', gap: 8 }}>
          <select value={dificuldade} onChange={(e) => setDificuldade(e.target.value)} style={{ flex: 1 }}>
            <option value="facil">Fácil</option>
            <option value="media">Média</option>
            <option value="dificil">Difícil</option>
          </select>
          <input type="text" placeholder="Fonte (opcional)" value={fonte} onChange={(e) => setFonte(e.target.value)} style={{ flex: 1 }} />
        </div>

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
          {pergunta && <button className="btn" type="button" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={excluir}>Excluir</button>}
        </div>
      </form>
    </div>
  );
}
