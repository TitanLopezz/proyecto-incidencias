import { useContext } from 'react'
import AuthContext from './AuthContext'

function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) {
    throw new Error('useAuth debe usarse dentro de AuthProvider.')
  }

  return auth
}

export default useAuth
