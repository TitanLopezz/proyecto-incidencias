// frontend/src/components/Login.jsx
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api/accounts'
import useAuth from '../auth/useAuth'
import { STAFF_ROLES } from '../auth/session'

function Login({ staffMode = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { session, isRestoringSession, acceptSession, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = staffMode ? '/staff/dashboard' : '/dashboard'

  if (isRestoringSession) {
    return <main className="auth-page"><p role="status">Verificando sesión…</p></main>
  }

  if (session) {
    const isStaff = STAFF_ROLES.has(session.user.role)
    const currentDashboard = isStaff ? '/staff/dashboard' : '/dashboard'
    if (isStaff === staffMode) return <Navigate to={currentDashboard} replace />

    return (
      <main className="auth-page">
        <section aria-labelledby="switch-account-title" className="auth-card">
          <h1 id="switch-account-title">{staffMode ? 'Acceso de personal' : 'Acceso ciudadano'}</h1>
          <p className="auth-description">
            {isStaff
              ? 'Tienes una sesión de personal abierta. Cámbiala para entrar con tu cuenta ciudadana.'
              : 'Tienes una sesión ciudadana abierta. Cámbiala para entrar con tu cuenta de personal.'}
          </p>
          <div className="citizen-header-actions">
            <button className="button button-primary" onClick={logout} type="button">
              {staffMode ? 'Cambiar a cuenta de personal' : 'Cambiar a cuenta ciudadana'}
            </button>
            <Link className="text-button" to={currentDashboard}>Volver a mi panel</Link>
          </div>
        </section>
      </main>
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await login({ email, password }, staffMode)

      if (
        !result
        || typeof result.token !== 'string'
        || !result.user
        || typeof result.user.role !== 'string'
      ) {
        const invalidResponseError = new Error('El backend devolvió datos de sesión incompletos.')
        invalidResponseError.code = 'INVALID_API_RESPONSE'
        throw invalidResponseError
      }

      if (staffMode && !STAFF_ROLES.has(result.user.role)) {
        throw new Error('Esta cuenta no tiene acceso al portal de administración.')
      }

      acceptSession(result)
      const returnTo = location.state?.from?.pathname
      navigate(returnTo && returnTo !== '/login' ? returnTo : destination, { replace: true })
    } catch (requestError) {
      if (requestError.status === 401) {
        setError('Correo o contraseña incorrectos.')
      } else if (requestError.code === 'API_UNAVAILABLE') {
        setError('No se puede conectar con el backend. Verifica su estado y vuelve a intentarlo.')
      } else if (requestError.code === 'API_CONFIGURATION') {
        setError('VITE_API_URL no está configurada. Revisa el archivo .env de la raíz.')
      } else if (requestError.code === 'INVALID_API_RESPONSE') {
        setError('El backend devolvió una respuesta inválida. Revisa sus logs y la configuración de VITE_API_URL.')
      } else {
        setError(requestError.message || 'No se pudo iniciar sesión.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="auth-title" className="auth-card">
        <div className="brand-mark" aria-hidden="true">I</div>
        <p className="eyebrow">{staffMode ? 'PORTAL DE PERSONAL' : 'SISTEMA DE GESTIÓN'}</p>
        <h1 id="auth-title">{staffMode ? 'Acceso de administración' : 'Bienvenido'}</h1>
        <p className="auth-description">
          {staffMode
            ? 'Portal exclusivo para administradores y superadministradores.'
            : 'Inicia sesión para consultar y registrar incidencias.'}
        </p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="auth-email">Correo electrónico</label>
          <input
            autoComplete="email"
            id="auth-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="auth-password">Contraseña</label>
          <input
            autoComplete="current-password"
            id="auth-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="feedback feedback-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Procesando…' : 'Iniciar sesión'}
          </button>
        </form>
        {staffMode ? (
          <p className="auth-switch">
            ¿Eres ciudadano? <Link className="text-button" to="/login">Acceso ciudadano</Link>
          </p>
        ) : (
          <>
            <p className="auth-switch">
              ¿Aún no tienes cuenta? <Link className="text-button" to="/register">Regístrate</Link>
            </p>
            <p className="auth-switch auth-staff-link">
              <Link className="text-button" to="/staff">Acceso de personal</Link>
            </p>
          </>
        )}
      </section>
    </main>
  )
}

export default Login
