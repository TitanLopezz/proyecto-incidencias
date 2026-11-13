import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { getCurrentUser } from '../api/accounts'
import { TOKEN_STORAGE_KEY, clearSession, readStoredUser, saveSession } from './session'
import AuthContext from './AuthContext'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    const user = readStoredUser()
    return token && user ? { token, user } : null
  })
  const [isRestoringSession, setIsRestoringSession] = useState(
    () => Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)),
  )

  useEffect(() => {
    let isActive = true
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)

    if (!token) {
      return () => {
        isActive = false
      }
    }

    getCurrentUser(token)
      .then((user) => {
        if (isActive) {
          saveSession({ token, user })
          setSession({ token, user })
        }
      })
      .catch((error) => {
        if (isActive && error.status === 401) {
          clearSession()
          setSession(null)
        }
      })
      .finally(() => {
        if (isActive) {
          setIsRestoringSession(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
    setIsRestoringSession(false)
  }, [])

  const acceptSession = useCallback((result) => {
    saveSession(result)
    setSession({ token: result.token, user: result.user })
    setIsRestoringSession(false)
  }, [])

  const updateUser = useCallback((user) => {
    setSession((current) => {
      if (!current) {
        return current
      }

      saveSession({ ...current, user })
      return { ...current, user }
    })
  }, [])

  const refreshSession = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY)
    if (!token) {
      logout()
      return null
    }

    const user = await getCurrentUser(token)
    const nextSession = { token, user }
    saveSession(nextSession)
    setSession(nextSession)
    return nextSession
  }, [logout])

  const value = useMemo(() => ({
    session,
    isRestoringSession,
    acceptSession,
    logout,
    updateUser,
    refreshSession,
  }), [acceptSession, isRestoringSession, logout, refreshSession, session, updateUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
