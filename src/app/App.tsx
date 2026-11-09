import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { LoginPage } from '../features/auth/LoginPage'
import { AccountPage } from '../features/auth/AccountPage'
import { AppShell } from '../components/layout/AppShell'
import { HomePage } from '../features/home/HomePage'
import { ProjectsPage } from '../features/projects/ProjectsPage'
import { ProjectDetailPage } from '../features/projects/ProjectDetailPage'
import { LocalDatasetPage } from '../features/datasets/LocalDatasetPage'
import { TrainingHistoryPage } from '../features/evaluation/TrainingHistoryPage'
import { ModelRegistryPage } from '../features/models/ModelRegistryPage'
import { PageState } from '../components/ui/PageState'
import { AdminUsersPage } from '../features/administration/AdminUsersPage'
import { ProjectReportPage } from '../features/reports/ProjectReportPage'
import { AuditEventsPage } from '../features/administration/AuditEventsPage'

function PrivateRoute() {
  const { state, refresh, signOut } = useAuth()
  if (state.status === 'loading') return <PageState kind="loading" />
  if (state.status === 'configured_missing') return <PageState kind="config" />
  if (state.status === 'blocked') return <PageState kind="blocked" onRetry={() => void refresh()} onSignOut={signOut} />
  if (state.status === 'unavailable') return <PageState kind="error" onRetry={() => void refresh()} />
  if (state.status === 'guest') return <Navigate to="/acceder" replace />
  return <Outlet />
}

// La ruta visual complementa, pero no sustituye, la autorización en Edge Function.
function AdminRoute() {
  const { state } = useAuth()
  if (state.status !== 'ready' || !state.profile.is_platform_admin) return <Navigate to="/inicio" replace />
  return <Outlet />
}

function LoginRoute() {
  const { state, refresh, signOut } = useAuth()
  if (state.status === 'loading') return <PageState kind="loading" />
  if (state.status === 'unavailable') return <PageState kind="error" onRetry={() => void refresh()} />
  if (state.status === 'blocked') return <PageState kind="blocked" onRetry={() => void refresh()} onSignOut={signOut} />
  if (state.status === 'ready') return <Navigate to="/inicio" replace />
  return <LoginPage />
}

export function App() {
  return (
    <Routes>
      <Route path="/acceder" element={<LoginRoute />} />
      <Route element={<PrivateRoute />}>
        <Route element={<AppShell />}>
          <Route path="/inicio" element={<HomePage />} />
          <Route path="/cuenta" element={<AccountPage />} />
          <Route path="/proyectos" element={<ProjectsPage />} />
          <Route path="/proyectos/:projectId" element={<ProjectDetailPage />} />
          <Route path="/proyectos/:projectId/datos" element={<LocalDatasetPage />} />
          <Route path="/proyectos/:projectId/historial" element={<TrainingHistoryPage />} />
          <Route path="/proyectos/:projectId/modelos" element={<ModelRegistryPage />} />
          <Route path="/proyectos/:projectId/reportes" element={<ProjectReportPage />} />
          <Route path="/proyectos/:projectId/auditoria" element={<AuditEventsPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/administracion/usuarios" element={<AdminUsersPage />} />
            <Route path="/administracion/auditoria" element={<AuditEventsPage />} />
          </Route>
          <Route path="/" element={<Navigate to="/inicio" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/inicio" replace />} />
    </Routes>
  )
}
