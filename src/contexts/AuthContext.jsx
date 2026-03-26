import { createContext, useContext, useEffect, useReducer } from 'react'
import { api, ApiError } from '../lib/api'

const AuthContext = createContext(null)

const initialState = {
  user: null,
  configuracion: null,
  loading: true,
  error: null,
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_AUTH':
      return { ...state, user: action.user, configuracion: action.configuracion, loading: false, error: null }
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
      .then(({ user, configuracion }) => {
        dispatch({ type: 'SET_AUTH', user, configuracion })
      })
      .catch(() => {
        localStorage.removeItem('ds_token')
        dispatch({ type: 'LOGOUT' })
      })
  }, [])

  async function login(email, password) {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const { token, user, configuracion } = await api.auth.login(email, password)
      localStorage.setItem('ds_token', token)
      dispatch({ type: 'SET_AUTH', user, configuracion })
      return { error: null }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', payload: e.message })
      return { error: e.message }
    }
  }

  async function register(email, password, nombre) {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const { token, user } = await api.auth.register(email, password, nombre)
      localStorage.setItem('ds_token', token)
      dispatch({ type: 'SET_AUTH', user, configuracion: null })
      return { error: null }
    } catch (e) {
      dispatch({ type: 'SET_ERROR', payload: e.message })
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

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateConfiguracion }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
