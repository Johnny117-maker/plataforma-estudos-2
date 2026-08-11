import { useState } from 'react';
import { sugerirReorganizacaoAdaptativa } from '../lib/cronogramaAdaptativo';
import { aplicarReorganizacaoAdaptativa } from '../lib/transactionService';

function hoje() { return new Date().toISOString().slice(0, 10); }
function dataPt(data) { return new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR'); }

export default function ReorganizarAdaptativoModal({
  cronograma, tarefas, desempenhos, disponibilidade, onClose, onAplicado,
}) {
  const [sugestao, setSugestao] = useState(null);
  const [erro, setErro] = useState('');
  const [aplicando, setAplicando] = useState(false);

  function gerar() {
    setErro('');
    try {
      if (!cronograma.data_final || hoje() > cronograma.data_final) throw new Error('A data final do cronograma já passou ou não foi configurada.');
      const resultado = sugerirReorganizacaoAdaptativa({
        tarefas,
        desempenhos,
        disponibilidade,
        dataInicio: hoje(),
        dataFinal: cronograma.data_final,
      });
      setSugestao(resultado);
    } catch (error) {
      setErro(error.message);
    }
  }

  async function aplicar() {
    if (!sugestao) return;
    setAplicando(true);
    setErro('');
    try {
      await aplicarReorganizacaoAdaptativa(cronograma.id, sugestao.atualizacoes, {
        total_reorganizadas: sugestao.total_reorganizadas,
        nao_alocadas: sugestao.nao_alocadas,
        executada_em: new Date().toISOString(),
      });
      await onAplicado();
      onClose();
    } catch (error) {
      setErro(error.message);
      setAplicando(false);
    }
  }

  const porId = Object.fromEntries(tarefas.map((t) => [t.id, t]));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal adaptive-reorder-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Reorganização adaptativa</h3>
        <p className="page-description">
          Reprioriza tarefas atrasadas e de baixo desempenho dentro da disponibilidade atual.
          Tarefas concluídas, simulados fixos e a data da prova não são alterados.
        </p>
        {!sugestao && <button className="btn btn-primary" onClick={gerar}>Gerar prévia</button>}
        {sugestao && (
          <>
            <div className="stats-grid compact-stats">
              <div className="card"><strong>{sugestao.total_reorganizadas}</strong><span>reorganizadas</span></div>
              <div className="card"><strong>{sugestao.nao_alocadas.length}</strong><span>sem espaço</span></div>
            </div>
            <div className="reorder-list">
              {sugestao.atualizacoes.slice(0, 30).map((item) => (
                <div key={item.tarefa_id}><span>{dataPt(item.data_prazo)}</span><strong>{porId[item.tarefa_id]?.titulo}</strong><small>prioridade {item.prioridade_score}</small></div>
              ))}
            </div>
            {sugestao.nao_alocadas.length > 0 && <p className="form-error">{sugestao.nao_alocadas.length} tarefa(s) não cabem até a prova. Aumente a disponibilidade ou remova conteúdo.</p>}
          </>
        )}
        {erro && <div className="form-error">{erro}</div>}
        <div className="button-row">
          {sugestao && <button className="btn btn-primary" disabled={aplicando || !sugestao.atualizacoes.length} onClick={aplicar}>{aplicando ? 'Aplicando…' : 'Aplicar reorganização'}</button>}
          {sugestao && <button className="btn" disabled={aplicando} onClick={gerar}>Recalcular</button>}
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
