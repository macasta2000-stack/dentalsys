// ============================================================
// Hook: usePlanFeatures
// Expone las features del plan del tenant actual
// ============================================================
import { useAuth } from '../contexts/AuthContext'

// Features por defecto para cuentas sin plan asignado (trial)
// Durante el trial, acceso completo para que el usuario vea el valor
const TRIAL_FEATURES = {
  max_profesionales: 999,
  max_secretarios: 999,
  firma_digital: true,
  crm: true,
  reportes_avanzados: true,
  insumos: true,
  recetas_completas: true,
  recordatorios: true,
  exportar: true,
  api_access: true,
  ia_creditos: true,
}

// Shorthand hook: returns true when trial has expired
export function useIsExpired() {
  const { user } = useAuth()
  const hoy = new Date()
  const trialHasta = user?.trial_hasta ? new Date(user.trial_hasta) : null
  const isTrial = user?.estado === 'trial'
  return isTrial && trialHasta != null && hoy > trialHasta
}

export function usePlanFeatures() {
  const { user, suscripcion, configuracion } = useAuth()

  // Superadmin: acceso total sin restricciones
  if (user?.rol === 'superadmin') {
    return {
      hasFeature: () => true,
      getLimit: () => Infinity,
      features: TRIAL_FEATURES,
      planId: 'superadmin',
      isTrial: false,
      isExpired: false,
    }
  }

  // Calcular si el trial expiró
  const hoy = new Date()
  const trialHasta = user?.trial_hasta ? new Date(user.trial_hasta) : null
  const isTrial = user?.estado === 'trial'
  const isExpired = isTrial && trialHasta && hoy > trialHasta

  // Durante trial activo → acceso completo
  if (isTrial && !isExpired) {
    return {
      hasFeature: () => true,
      getLimit: () => Infinity,
      features: TRIAL_FEATURES,
      planId: 'trial',
      isTrial: true,
      isExpired: false,
      diasRestantes: trialHasta ? Math.max(0, Math.ceil((trialHasta - hoy) / 86400000)) : 30,
    }
  }

  // Con suscripción activa → respetar features del plan
  const rawFeatures = suscripcion?.plan_features
  let planFeatures = {}
  if (rawFeatures) {
    try { planFeatures = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : rawFeatures } catch {}
  }

  // Capa 2: el superadmin puede otorgar features extra al tenant
  const rawOverride = configuracion?.features_override
  let override = {}
  if (rawOverride) {
    try { override = typeof rawOverride === 'string' ? JSON.parse(rawOverride) : rawOverride } catch {}
  }

  // Override gana sobre features del plan (solo puede agregar, no quitar)
  const features = { ...planFeatures, ...override }

  function hasFeature(name) {
    // Layer 2: features_override del superadmin siempre gana — ignora el plan
    if (override[name] === true) return true
    // Si no hay plan asignado, negar features premium
    if (!suscripcion?.plan_id) return false
    const val = features[name]
    if (val === undefined) return true // no especificado = permitido
    return val !== false
  }

  function getLimit(name) {
    const val = features[name]
    if (typeof val === 'number') return val
    return Infinity
  }

  return {
    hasFeature,
    getLimit,
    features,
    planId: suscripcion?.plan_id ?? null,
    isTrial,
    isExpired,
    diasRestantes: 0,
  }
}
