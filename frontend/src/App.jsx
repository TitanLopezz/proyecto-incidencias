import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './auth/SessionProvider'
import useAuth from './auth/useAuth'
import ProtectedRoute from './auth/ProtectedRoute'
import Login from './components/Login'
import Register from './components/Register'
import './App.css'

const Dashboard = lazy(() => import('./components/Dashboard'))
const AdminDashboard = lazy(() => import('./components/AdminDashboard'))

function HomeRedirect() {
  const { session, isRestoringSession } = useAuth()
  if (isRestoringSession) {
    return <main className="auth-page"><p role="status">Verificando sesión…</p></main>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Navigate to={session.user?.role === 'citizen' ? '/dashboard' : '/staff/dashboard'} replace />
}

function CitizenDashboard() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <Dashboard onLogout={handleLogout} token={session.token} user={session.user} />
}

function StaffDashboard() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/staff', { replace: true })
  }

  if (!session) {
    return <Navigate to="/staff" replace />
  }

  return <AdminDashboard onLogout={handleLogout} token={session.token} user={session.user} />
}

function AppRoutes() {
  const { isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <main className="auth-page"><p role="status">Verificando sesión…</p></main>
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/staff" element={<Login staffMode />} />
      <Route
        element={(
          <ProtectedRoute roles={['citizen']}>
            <CitizenDashboard />
          </ProtectedRoute>
        )}
        path="/dashboard"
      />
      <Route
        element={(
          <ProtectedRoute roles={['admin', 'superadmin']}>
            <StaffDashboard />
          </ProtectedRoute>
        )}
        path="/staff/dashboard"
      />
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<main className="auth-page"><p role="status">Cargando…</p></main>}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
