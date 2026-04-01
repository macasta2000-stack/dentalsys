// ============================================================
// Hook: useRoleAccess
// Capa 3: el admin del consultorio configura qué módulos
// puede ver cada rol (profesional / recepcionista).
// Siempre restringido por el plan.
// ============================================================
import { useAuth } from '../contexts/AuthContext'

// Valores por defecto si el tenant no configuró permisos_roles
export const ROLE_DEFAULTS = {
  profesional:  { pacientes: true,  agenda: true,  caja: false, crm: false, reportes: false, insumos: false, configuracion: false, recetas: true  },
  recepcionista:{ pacientes: true,  agenda: true,  caja: true,  crm: false, reportes: false, insumos: false, configuracion: false, recetas: false },
  admin:        { pacientes: true,  agenda: true,  caja: true,  crm: true,  reportes: true,  insumos: true,  configuracion: true,  recetas: false },
}

export function useRoleAccess() {
  const { user, configuracion } = useAuth()

  // Owner y superadmin ven todo
  if (!user || user.rol === 'tenant' || user.rol === 'superadmin') {
    return { canAccess: () => true }
  }

  const rol = user.rol
  const rawPerms = configuracion?.permisos_roles
  let permisosRoles = {}
  if (rawPerms) {
    try { permisosRoles = typeof rawPerms === 'string' ? JSON.parse(rawPerms) : rawPerms } catch {}
  }

  const rolePerms = permisosRoles[rol] ?? ROLE_DEFAULTS[rol] ?? {}

  function canAccess(module) {
    if (module === null || module === undefined) return true
    const perm = rolePerms[module]
    if (perm === undefined) return ROLE_DEFAULTS[rol]?.[module] ?? true
    return perm === true
  }

  return { canAccess }
}
