// Dexie IndexedDB — offline cache stub
// TODO: Implement offline-first sync when needed
import Dexie from 'dexie'

export const db = new Dexie('dentalsys')

db.version(1).stores({
  pacientes: 'id, tenant_id, apellido',
  turnos: 'id, tenant_id, fecha_hora',
  pagos: 'id, tenant_id, fecha',
  evoluciones: 'id, tenant_id, paciente_id',
  prestaciones: 'id, tenant_id',
  insumos: 'id, tenant_id',
})
