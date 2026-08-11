import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/AuthContext.jsx';
import Sidebar from './components/Sidebar.jsx';

const Login = lazy(() => import('./pages/Login.jsx'));
const Cronogramas = lazy(() => import('./pages/Cronogramas.jsx'));
const CronogramaDetail = lazy(() => import('./pages/CronogramaDetail.jsx'));
const Notas = lazy(() => import('./pages/Notas.jsx'));
const Tarefas = lazy(() => import('./pages/Tarefas.jsx'));
const Importar = lazy(() => import('./pages/Importar.jsx'));
const Materias = lazy(() => import('./pages/Materias.jsx'));
const Perguntas = lazy(() => import('./pages/Perguntas.jsx'));
const DatasImportantes = lazy(() => import('./pages/DatasImportantes.jsx'));
const CriarCronogramaIA = lazy(() => import('./pages/CriarCronogramaIA.jsx'));
const AnalisarProva = lazy(() => import('./pages/AnalisarProva.jsx'));
const CriarCronogramaAdaptativo = lazy(() => import('./pages/CriarCronogramaAdaptativo.jsx'));

function Loading() { return <div className="empty-state">Carregando…</div>; }

function Protected({ children }) {
  const { session, loading } = useAuth();
  if (loading) return <Loading />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<Protected><div className="app-shell"><Sidebar /><main className="main-content"><Routes>
          <Route path="/" element={<Cronogramas />} />
          <Route path="/cronogramas/:id" element={<CronogramaDetail />} />
          <Route path="/datas" element={<DatasImportantes />} />
          <Route path="/ia/novo-cronograma" element={<CriarCronogramaIA />} />
          <Route path="/cronogramas/novo-adaptativo" element={<CriarCronogramaAdaptativo />} />
          <Route path="/provas" element={<AnalisarProva />} />
          <Route path="/notas" element={<Notas />} />
          <Route path="/tarefas" element={<Tarefas />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/materias" element={<Materias />} />
          <Route path="/perguntas" element={<Perguntas />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></main></div></Protected>} />
      </Routes>
    </Suspense>
  );
}
