// frontend/src/components/Register.jsx
import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { register } from '../api/accounts'
import useAuth from '../auth/useAuth'

function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { session, isRestoringSession, acceptSession } = useAuth()
  const navigate = useNavigate()

  if (isRestoringSession) {
    return <main className="auth-page"><p role="status">Verificando sesión…</p></main>
  }

  if (session) {
    return <Navigate to={session.user.role === 'citizen' ? '/dashboard' : '/staff/dashboard'} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const result = await register({ name, email, password })
      acceptSession(result)
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="register-title" className="auth-card">
        <div className="brand-mark" aria-hidden="true">I</div>
        <p className="eyebrow">SISTEMA DE GESTIÓN</p>
        <h1 id="register-title">Crea tu cuenta</h1>
        <p className="auth-description">Regístrate para comenzar a reportar incidencias.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="register-name">Nombre</label>
          <input
            autoComplete="name"
            id="register-name"
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <label htmlFor="register-email">Correo electrónico</label>
          <input
            autoComplete="email"
            id="register-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="register-password">Contraseña</label>
          <input
            autoComplete="new-password"
            id="register-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <p className="field-hint">Usa entre 8 y 72 bytes.</p>
          {error && <p className="feedback feedback-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Procesando…' : 'Crear cuenta'}
          </button>
        </form>
        <p className="auth-switch">
          ¿Ya tienes una cuenta? <Link className="text-button" to="/login">Inicia sesión</Link>
        </p>
      </section>
    </main>
  )
}

export default Register
