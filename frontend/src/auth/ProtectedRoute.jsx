// frontend/src/auth/ProtectedRoute.jsx
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { STAFF_ROLES } from './session'
import useAuth from './useAuth'

function ProtectedRoute({ roles, children }) {
  const location = useLocation()
  const { session, isRestoringSession } = useAuth()

  if (isRestoringSession) {
    return <main className="auth-page"><p role="status">Verificando sesión…</p></main>
  }

  if (!session) {
    const isStaffRoute = location.pathname.startsWith('/staff')
    return <Navigate to={isStaffRoute ? '/staff' : '/login'} replace state={{ from: location }} />
  }

  if (roles && !roles.includes(session.user?.role)) {
    return <Navigate to={STAFF_ROLES.has(session.user?.role) ? '/staff/dashboard' : '/dashboard'} replace />
  }

  return children || <Outlet />
}

export default ProtectedRoute
