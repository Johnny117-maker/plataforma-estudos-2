import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { DIAS_SEMANA, DISPONIBILIDADE_PADRAO } from '../lib/cronogramaAdaptativo';

const CATEGORIAS = [
  { valor: 'estudos', label: 'Estudos' },
  { valor: 'tarefas', label: 'Tarefas' },
  { valor: 'viagem', label: 'Viagem' },
  { valor: 'projeto', label: 'Projeto' },
  { valor: 'outro', label: 'Outro' },
];

// Só essas categorias têm data final e horas por dia (fazem sentido de
// serem organizadas "até um prazo"; Tarefas e Outro ficam livres).
const CATEGORIAS_COM_PRAZO = ['estudos', 'viagem', 'projeto', 'tarefas'];

export default function ConfigurarCronogramaModal({ cronograma, disponibilidade = [], onClose, onSaved }) {
  const [categoria, setCategoria] = useState(cronograma.categoria || 'estudos');
  const [dataFinal, setDataFinal] = useState(cronograma.data_final || '');
  const [horasPorDia, setHorasPorDia] = useState(cronograma.horas_por_dia ?? '');
  const [dataInicio, setDataInicio] = useState(cronograma.data_inicio || '');
  const [metaAcertos, setMetaAcertos] = useState(cronograma.meta_acertos ?? '');
  const [status, setStatus] = useState(cronograma.status || 'ativo');
  const [dias, setDias] = useState(() => DIAS_SEMANA.map((rotulo) => {
    const salvo = disponibilidade.find((item) => Number(item.dia_semana) === rotulo.dia_semana);
    const padrao = DISPONIBILIDADE_PADRAO.find((item) => item.dia_semana === rotulo.dia_semana);
    return { ...rotulo, ...padrao, ...salvo };
  }));
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const temPrazo = CATEGORIAS_COM_PRAZO.includes(categoria);
  const adaptativo = cronograma.versao_gerador?.startsWith('adaptativo');

  function alterarDia(diaSemana, campo, valor) {
    setDias((atuais) => atuais.map((dia) => (dia.dia_semana === diaSemana ? { ...dia, [campo]: valor } : dia)));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSaving(true);
    const { error } = await supabase.from('cronogramas').update({
        categoria,
        data_final: temPrazo ? (dataFinal || null) : null,
        horas_por_dia: temPrazo && horasPorDia !== '' ? Number(horasPorDia) : null,
        data_inicio: adaptativo ? (dataInicio || null) : cronograma.data_inicio,
        meta_acertos: adaptativo && metaAcertos !== '' ? Number(metaAcertos) : cronograma.meta_acertos,
        status: adaptativo ? status : cronograma.status,
        ativo: adaptativo ? status === 'ativo' : cronograma.ativo,
      })
      .eq('id', cronograma.id);
    let disponibilidadeError = null;
    if (!error && adaptativo) {
      const { error: erroDias } = await supabase.from('cronograma_disponibilidade').upsert(
        dias.map((dia) => ({
          user_id: cronograma.user_id,
          cronograma_id: cronograma.id,
          dia_semana: dia.dia_semana,
          minutos_disponiveis: Number(dia.minutos_disponiveis) || 0,
          horario_inicio: dia.horario_inicio || null,
          ativo: Boolean(dia.ativo),
        })),
        { onConflict: 'cronograma_id,dia_semana' },
      );
      disponibilidadeError = erroDias;
    }
    setSaving(false);
    if (error || disponibilidadeError) { setErro((error || disponibilidadeError).message); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Configurar cronograma</h3>

        <div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Categoria</div>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>{c.label}</option>
            ))}
          </select>
        </div>

        {temPrazo && (
          <>
            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                Data final {categoria === 'estudos' ? '(prova, prazo do vestibular...)' : categoria === 'viagem' ? '(data da viagem)' : '(entrega do projeto)'}
              </div>
              <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>
                Horas disponíveis por dia (opcional)
              </div>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="Ex: 2"
                value={horasPorDia}
                onChange={(e) => setHorasPorDia(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </>
        )}

        {adaptativo && (
          <>
            <div className="adaptive-grid three">
              <label>Início<input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} /></label>
              <label>Meta de acertos<input type="number" min="0" max={cronograma.total_questoes_meta || 60} value={metaAcertos} onChange={(e) => setMetaAcertos(e.target.value)} /></label>
              <label>Status
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="ativo">Ativo</option><option value="pausado">Pausado</option>
                  <option value="concluido">Concluído</option><option value="arquivado">Arquivado</option>
                </select>
              </label>
            </div>
            <div className="availability-list compact-availability">
              <strong>Disponibilidade usada na próxima reorganização</strong>
              {dias.map((dia) => (
                <div className={`availability-row${dia.ativo ? '' : ' disabled'}`} key={dia.dia_semana}>
                  <label className="toggle-day"><input type="checkbox" checked={dia.ativo} onChange={(e) => alterarDia(dia.dia_semana, 'ativo', e.target.checked)} />{dia.nome}</label>
                  <label>Minutos<input type="number" min="0" step="15" disabled={!dia.ativo} value={dia.minutos_disponiveis} onChange={(e) => alterarDia(dia.dia_semana, 'minutos_disponiveis', e.target.value)} /></label>
                  <label>Horário<input type="time" disabled={!dia.ativo} value={dia.horario_inicio || ''} onChange={(e) => alterarDia(dia.dia_semana, 'horario_inicio', e.target.value)} /></label>
                </div>
              ))}
            </div>
          </>
        )}

        {!temPrazo && (
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            Essa categoria não usa data final nem horas por dia — fica livre, sem prazo fixo.
          </div>
        )}

        {erro && <div style={{ color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button className="btn" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
