import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext.jsx';

export default function Sidebar() {
  const { signOut, user } = useAuth();

  return (
    <div className="sidebar">
      <div className="brand">Plataforma de Estudos</div>
      <NavLink to="/" end className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Cronogramas
      </NavLink>
      <NavLink to="/datas" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Datas Importantes
      </NavLink>
      <NavLink to="/ia/novo-cronograma" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Criar cronograma com IA
      </NavLink>
      <NavLink to="/provas" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Analisar Prova
      </NavLink>
      <NavLink to="/tarefas" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Tarefas
      </NavLink>
      <NavLink to="/materias" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Matérias e Assuntos
      </NavLink>
      <NavLink to="/perguntas" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Perguntas e Respostas
      </NavLink>
      <NavLink to="/notas" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Notas
      </NavLink>
      <NavLink to="/importar" className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}>
        Importar HTMLs
      </NavLink>
      <div className="signout">
        <div style={{ marginBottom: 6, wordBreak: 'break-all' }}>{user?.email}</div>
        <button className="nav-item" onClick={signOut}>Sair</button>
      </div>
    </div>
  );
}
