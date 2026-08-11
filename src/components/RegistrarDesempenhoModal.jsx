import { useState } from 'react';
import { registrarDesempenhoTarefa } from '../lib/transactionService';

export default function RegistrarDesempenhoModal({ tarefa, onClose, onSaved }) {
  const [dados, setDados] = useState({
    tempo_realizado_minutos: tarefa.duracao_minutos || Math.round((Number(tarefa.horas_estimadas) || 1) * 60),
    questoes_realizadas: tarefa.questoes_meta || 0,
    acertos: 0,
    nivel_confianca: 3,
    dificuldade_percebida: 3,
    energia: 3,
    observacoes: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  function alterar(campo, valor) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(event) {
    event.preventDefault();
    setErro('');
    if (Number(dados.acertos) > Number(dados.questoes_realizadas)) {
      setErro('A quantidade de acertos não pode superar as questões realizadas.');
      return;
    }
    setSalvando(true);
    try {
      await registrarDesempenhoTarefa(tarefa.id, {
        ...dados,
        tempo_realizado_minutos: Number(dados.tempo_realizado_minutos) || 0,
        questoes_realizadas: Number(dados.questoes_realizadas) || 0,
        acertos: Number(dados.acertos) || 0,
        nivel_confianca: Number(dados.nivel_confianca),
        dificuldade_percebida: Number(dados.dificuldade_percebida),
        energia: Number(dados.energia),
      });
      await onSaved();
      onClose();
    } catch (error) {
      setErro(error.message);
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal performance-modal" onSubmit={salvar} onClick={(e) => e.stopPropagation()}>
        <h3>Concluir e registrar desempenho</h3>
        <p className="page-description">{tarefa.titulo}</p>
        <div className="adaptive-grid three">
          <label>Minutos realizados<input type="number" min="0" value={dados.tempo_realizado_minutos} onChange={(e) => alterar('tempo_realizado_minutos', e.target.value)} /></label>
          <label>Questões feitas<input type="number" min="0" value={dados.questoes_realizadas} onChange={(e) => alterar('questoes_realizadas', e.target.value)} /></label>
          <label>Acertos<input type="number" min="0" value={dados.acertos} onChange={(e) => alterar('acertos', e.target.value)} /></label>
        </div>
        <div className="adaptive-grid three">
          <label>Confiança (1–5)<input type="number" min="1" max="5" value={dados.nivel_confianca} onChange={(e) => alterar('nivel_confianca', e.target.value)} /></label>
          <label>Dificuldade (1–5)<input type="number" min="1" max="5" value={dados.dificuldade_percebida} onChange={(e) => alterar('dificuldade_percebida', e.target.value)} /></label>
          <label>Energia (1–5)<input type="number" min="1" max="5" value={dados.energia} onChange={(e) => alterar('energia', e.target.value)} /></label>
        </div>
        <label>Observações<textarea rows="3" value={dados.observacoes} onChange={(e) => alterar('observacoes', e.target.value)} placeholder="O que errou, onde travou e o que revisar" /></label>
        {Number(dados.questoes_realizadas) > 0 && (
          <div className="result-preview">
            Resultado: <strong>{Math.round((Number(dados.acertos) / Number(dados.questoes_realizadas)) * 100) || 0}%</strong>
            {Number(dados.acertos) / Number(dados.questoes_realizadas) < 0.6 && <span>Será criada uma revisão extra D+2.</span>}
          </div>
        )}
        {erro && <div className="form-error">{erro}</div>}
        <div className="button-row">
          <button className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Concluir tarefa'}</button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
