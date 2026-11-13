import { useEffect, useRef, useState } from 'react'
import { createTelegramLink, getTelegramNotifications, setTelegramNotifications, unlinkTelegram } from '../api/telegram'

function TelegramAccount({ token, onUnauthorized }) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [preference, setPreference] = useState(null)
  const requestVersion = useRef(0)

  useEffect(() => {
    let active = true
    function refresh() {
      const version = ++requestVersion.current
      getTelegramNotifications(token).then((value) => {
        if (active && version === requestVersion.current) setPreference(value)
      }).catch((error) => {
        if (active && version === requestVersion.current && error.status !== 404) {
          setFeedback('No se pudo consultar la configuración de Telegram.')
        }
      })
    }
    refresh()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [token])

  async function changeLink(unlink) {
    setBusy(true)
    setFeedback('')
    try {
      if (unlink) {
        await unlinkTelegram(token)
        requestVersion.current += 1
        setPreference(current => current ? { ...current, linked: false, enabled: false } : current)
        setFeedback('Telegram quedó desvinculado.')
      } else {
        const { code } = await createTelegramLink(token)
        window.location.assign(`https://t.me/TuxtlaSeguimientoBot?start=${encodeURIComponent(code)}`)
      }
    } catch (error) {
      if (error.status === 401) onUnauthorized()
      else setFeedback(error.status === 404 ? 'Telegram aún no está habilitado en este servidor.' : error.message)
    } finally {
      setBusy(false)
    }
  }

  async function changeNotifications(enabled) {
    setBusy(true)
    setFeedback('')
    try {
      const saved = await setTelegramNotifications(enabled, token)
      requestVersion.current += 1
      setPreference(saved)
      setFeedback(enabled ? 'Activaste los avisos de cambios de estado.' : 'Desactivaste los avisos por Telegram.')
    } catch (error) {
      if (error.status === 401) onUnauthorized()
      else setFeedback(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="telegram-title">
      <div className="panel-heading">
        <div>
          <h2 id="telegram-title">Seguimiento por Telegram</h2>
          <p>Abre Telegram y pulsa Iniciar para vincular tu cuenta y consultar tus reportes.</p>
        </div>
        <div className="citizen-header-actions">
          <button className="button button-primary" disabled={busy} onClick={() => changeLink(false)} type="button">
            Abrir Telegram
          </button>
          <button className="button button-secondary" disabled={busy} onClick={() => changeLink(true)} type="button">
            Desvincular
          </button>
        </div>
      </div>
      {preference?.linked && (
        <label>
          <input
            type="checkbox"
            checked={preference.enabled}
            disabled={busy || (!preference.available && !preference.enabled)}
            onChange={event => changeNotifications(event.target.checked)}
          />
          {' '}Recibir avisos de cambios de estado por Telegram
        </label>
      )}
      {preference?.linked && !preference.available && <p>El envío de avisos todavía no está habilitado en este servidor.</p>}
      {feedback && <p role="status">{feedback}</p>}
    </section>
  )
}

export default TelegramAccount
