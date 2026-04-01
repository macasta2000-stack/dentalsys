import { createContext, useContext, useEffect, useReducer } from 'react'
import { api, ApiError } from '../lib/api'

const AuthContext = createContext(null)

const initialState = {
  user: null,
  configuracion: null,
  suscripcion: null,
  loading: true,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, user: action.user, configuracion: action.configuracion, suscripcion: action.suscripcion ?? null, loading: false, error: null }
    case 'SET_CONFIG':
      return { ...state, configuracion: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'LOGOUT':
      return { ...initialState, loading: false }
    default:
      return state
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    const token = localStorage.getItem('ds_token')
    if (!token) {
      dispatch({ type: 'LOGOUT' })
      return
    }
    api.auth.me()
      .then(({ user, configuracion, suscripcion }) => {
        dispatch({ type: 'SET_AUTH', user, configuracion, suscripcion })
      })
      .catch(() => {
        localStorage.removeItem('ds_token')
        dispatch({ type: 'LOGOUT' })
      })
  }, [])

  async function login(email, password) {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      let result
      try {
        result = await api.auth.login(email, password)
      } catch (e) {
        // Retry once on 500 (D1 cold-start)
        if (e.status === 500) {
          await new Promise(r => setTimeout(r, 800))
          result = await api.auth.login(email, password)
        } else throw e
      }
      const { token, user, configuracion, suscripcion } = result
      localStorage.setItem('ds_token', token)
      dispatch({ type: 'SET_AUTH', user, configuracion, suscripcion })
      return { error: null }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', payload: e.message })
      return { error: e.message }
    }
  }

  async function register({ nombre, email, password }) {
    try {
      const res = await fetch('/api/auth/register-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, password }),
      })
      const d = await res.json()
      if (!d.ok) return { error: d.error || 'No se pudo registrar' }
      const token = d.data?.token || d.token
      const user = d.data?.user || d.user
      const configuracion = d.data?.configuracion || d.configuracion || null
      const suscripcion = d.data?.suscripcion || d.suscripcion || null
      if (token) localStorage.setItem('ds_token', token)
      dispatch({ type: 'SET_AUTH', user, configuracion, suscripcion })
      return { error: null }
    } catch (e) {
      return { error: e.message }
    }
  }

  function logout() {
    localStorage.removeItem('ds_token')
    dispatch({ type: 'LOGOUT' })
  }

  async function updateConfiguracion(updates) {
    try {
      const config = await api.config.update(updates)
      dispatch({ type: 'SET_CONFIG', payload: config })
      return { error: null }
    } catch (e) {
      return { error: e.message }
    }
  }

  async function refreshUser() {
    try {
      const { user, configuracion, suscripcion } = await api.auth.me()
      dispatch({ type: 'SET_AUTH', user, configuracion, suscripcion })
    } catch {}
  }

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateConfiguracion, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
