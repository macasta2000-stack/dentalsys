// ============================================================
// PÁGINA DE SUSCRIPCIÓN — Vista del cliente
// Gestión del plan activo, historial de pagos y upgrade
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { useToast } from '../contexts/ToastContext'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const PLAN_ICONS = { plan_starter: '🌱', plan_pro: '⭐', plan_clinica: '🏥' }
const PLAN_COLORS = { plan_starter: '#0891b2', plan_pro: '#7c3aed', plan_clinica: '#0369a1' }

function fmtARS(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}
function fmtDate(d) {
  if (!d) return '—'
  return format(new Date(d), "dd 'de' MMMM yyyy", { locale: es })
}

export default function SuscripcionPage() {
  const addToast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [ciclo, setCiclo] = useState('mensual')
  const [waNumero, setWaNumero] = useState('5491144755339')

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [res, cfg] = await Promise.all([
        api.get('/suscripcion'),
        api.get('/config/sistema').catch(() => ({})),
      ])
      setData(res)
      if (cfg?.whatsapp_numero) setWaNumero(cfg.whatsapp_numero)
    } catch (e) {
      addToast('No se pudo cargar la información de suscripción', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  function buildWaUrl(planNombre, accion = 'consultar') {
    const texto = accion === 'comprar'
      ? encodeURIComponent(`Hola! Quiero COMPRAR el plan ${planNombre} de Clingest (facturación ${ciclo}). ¿Me podés activar la cuenta?`)
      : encodeURIComponent(`Hola! Quiero consultar sobre el plan ${planNombre} de Clingest. ¿Me podés dar más info?`)
    return `https://wa.me/${waNumero}?text=${texto}`
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 80, color: 'var(--c-text-3)' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
      Cargando suscripción...
    </div>
  )

  if (!data) return null

  const { suscripcion, planes, transacciones, tenant } = data
  const planActual = planes?.find(p => p.id === suscripcion?.plan_id)

  // Días restantes trial — trial_hasta lives on the usuarios row (tenant), not tenant_subscriptions
  const hoy = new Date()
  const trialHasta = tenant?.trial_hasta ? new Date(tenant.trial_hasta) : null
  const diasTrial = trialHasta ? Math.max(0, Math.ceil((trialHasta - hoy) / 86400000)) : null

  const estadoColor = {
    activo: { color: '#16a34a', bg: '#dcfce7', label: 'Activo' },
    trial:  { color: '#d97706', bg: '#fef3c7', label: 'Trial' },
    suspendido: { color: '#dc2626', bg: '#fee2e2', label: 'Suspendido' },
  }[suscripcion?.estado] ?? { color: '#64748b', bg: '#f1f5f9', label: 'Sin plan' }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Mi Suscripción</h1>
        <p style={{ color: 'var(--c-text-3)', fontSize: '.875rem', marginTop: 4 }}>
          Gestioná tu plan y método de pago
        </p>
      </div>

      {/* ── Banner alerta si trial o suspendido ── */}
      {suscripcion?.estado === 'trial' && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #fbbf24', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '1.4rem' }}>⏳</span>
          <div>
            <div style={{ fontWeight: 700, color: '#92400e' }}>
              Tu prueba gratuita vence en {diasTrial} día{diasTrial !== 1 ? 's' : ''}
            </div>
            <div style={{ fontSize: '.84rem', color: '#92400e', marginTop: 2 }}>
              Elegí un plan para seguir usando Clingest sin interrupciones.
            </div>
          </div>
        </div>
      )}

      {suscripcion?.estado === 'suspendido' && (
        <div style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: '1.4rem' }}>🔒</span>
          <div>
            <div style={{ fontWeight: 700, color: '#7f1d1d' }}>Tu cuenta está suspendida</div>
            <div style={{ fontSize: '.84rem', color: '#7f1d1d', marginTop: 2 }}>
              Activá un plan para restablecer el acceso completo.
            </div>
          </div>
        </div>
      )}

      {/* ── Card plan actual ── */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: planActual ? (PLAN_COLORS[planActual.id] + '22') : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
          {PLAN_ICONS[planActual?.id] ?? '📋'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{planActual?.nombre ?? 'Sin plan activo'}</div>
            <span style={{ background: estadoColor.bg, color: estadoColor.color, padding: '2px 10px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700 }}>
              {estadoColor.label}
            </span>
          </div>
          <div style={{ fontSize: '.84rem', color: 'var(--c-text-3)', marginTop: 4 }}>
            {planActual ? (
              <>
                {fmtARS(suscripcion?.ciclo === 'anual' ? planActual.precio_anual : planActual.precio_mensual)} / {suscripcion?.ciclo === 'anual' ? 'año' : 'mes'}
                {suscripcion?.proximo_cobro && (
                  <> &nbsp;·&nbsp; Próximo cobro: <strong>{fmtDate(suscripcion.proximo_cobro)}</strong></>
                )}
              </>
            ) : (
              'Seleccioná un plan para comenzar'
            )}
          </div>
          {planActual?.descripcion && (
            <div style={{ fontSize: '.78rem', color: 'var(--c-text-3)', marginTop: 4 }}>{planActual.descripcion}</div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {planActual && (
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: PLAN_COLORS[planActual.id] ?? 'var(--c-primary)' }}>
              {fmtARS(suscripcion?.ciclo === 'anual' ? planActual.precio_anual : planActual.precio_mensual)}
            </div>
          )}
          {suscripcion?.ciclo && (
            <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>
              facturación {suscripcion.ciclo}
            </div>
          )}
        </div>
      </div>

      {/* ── Selector de planes ── */}
      <div className="card" style={{ padding: '24px 28px', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
            {planActual ? 'Cambiar plan' : 'Elegir plan'}
          </h2>
          {/* Toggle mensual/anual */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--c-surface-2)', borderRadius: 100, padding: '4px 8px' }}>
            <button
              style={{ padding: '5px 14px', borderRadius: 100, border: 'none', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer', background: ciclo === 'mensual' ? 'var(--c-surface)' : 'transparent', boxShadow: ciclo === 'mensual' ? 'var(--shadow-sm)' : 'none', color: 'var(--c-text)' }}
              onClick={() => setCiclo('mensual')}
            >Mensual</button>
            <button
              style={{ padding: '5px 14px', borderRadius: 100, border: 'none', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer', background: ciclo === 'anual' ? 'var(--c-surface)' : 'transparent', boxShadow: ciclo === 'anual' ? 'var(--shadow-sm)' : 'none', color: ciclo === 'anual' ? 'var(--c-primary)' : 'var(--c-text)' }}
              onClick={() => setCiclo('anual')}
            >Anual <span style={{ fontSize: '.7rem', background: '#dcfce7', color: '#16a34a', borderRadius: 100, padding: '1px 6px', marginLeft: 2 }}>-17%</span></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {(planes ?? []).filter(p => p.id !== 'plan_starter').map(plan => {
            const isActual = plan.id === suscripcion?.plan_id && suscripcion?.ciclo === ciclo
            const isSelected = selectedPlan === plan.id
            const precio = ciclo === 'anual' ? plan.precio_anual : plan.precio_mensual
            const color = PLAN_COLORS[plan.id] ?? 'var(--c-primary)'
            return (
              <div
                key={plan.id}
                onClick={() => !isActual && setSelectedPlan(plan.id === selectedPlan ? null : plan.id)}
                style={{
                  border: `2px solid ${isActual ? '#16a34a' : isSelected ? color : 'var(--c-border)'}`,
                  borderRadius: 14,
                  padding: '20px 18px',
                  cursor: isActual ? 'default' : 'pointer',
                  background: isActual ? '#f0fdf4' : isSelected ? (color + '0d') : 'var(--c-surface)',
                  transition: 'all .15s',
                  position: 'relative',
                }}
              >
                {isActual && (
                  <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: '#16a34a', color: '#fff', fontSize: '.68rem', fontWeight: 700, padding: '2px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                    PLAN ACTUAL
                  </div>
                )}
                <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{PLAN_ICONS[plan.id] ?? '📋'}</div>
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 4 }}>{plan.nombre}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color, marginBottom: 4 }}>
                  {fmtARS(precio)}
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--c-text-3)' }}>/ {ciclo === 'anual' ? 'año' : 'mes'}</div>
                {plan.descripcion && (
                  <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)', marginTop: 8, lineHeight: 1.4 }}>{plan.descripcion}</div>
                )}
              </div>
            )
          })}
        </div>

        {selectedPlan && selectedPlan !== suscripcion?.plan_id && (() => {
          const plan = (planes ?? []).find(p => p.id === selectedPlan)
          return (
            <div style={{ marginTop: 20, padding: '16px 20px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#15803d' }}>Plan {plan?.nombre} seleccionado</div>
                <div style={{ fontSize: '.8rem', color: '#166534', marginTop: 2 }}>Contactanos por WhatsApp y te activamos el plan de inmediato.</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPlan(null)}>Cancelar</button>
                <a
                  href={buildWaUrl(plan?.nombre ?? selectedPlan, 'consultar')}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', background: '#25d366', color: '#fff',
                    borderRadius: 10, fontWeight: 700, fontSize: '.875rem', textDecoration: 'none',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Consultar
                </a>
                <a
                  href={buildWaUrl(plan?.nombre ?? selectedPlan, 'comprar')}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 24px', background: 'var(--c-primary)', color: '#fff',
                    borderRadius: 10, fontWeight: 700, fontSize: '.875rem', textDecoration: 'none',
                  }}
                >
                  Comprar
                </a>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Historial de pagos ── */}
      <div className="card" style={{ padding: '24px 28px' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 16px' }}>Historial de pagos</h2>
        {!transacciones?.length ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--c-text-3)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
            <div>No hay pagos registrados aún</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--c-border)' }}>
                {['Fecha', 'Plan', 'Ciclo', 'Monto', 'Estado'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--c-text-3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transacciones.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '10px 12px', fontSize: '.85rem' }}>{fmtDate(t.created_at)}</td>
                  <td style={{ padding: '10px 12px', fontSize: '.85rem' }}>{t.plan_nombre ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '.85rem', textTransform: 'capitalize' }}>{t.ciclo ?? '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: '.85rem', fontWeight: 600 }}>{fmtARS(t.monto)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      background: t.estado === 'approved' ? '#dcfce7' : t.estado === 'pending' ? '#fef3c7' : '#fee2e2',
                      color: t.estado === 'approved' ? '#16a34a' : t.estado === 'pending' ? '#d97706' : '#dc2626',
                      padding: '2px 8px', borderRadius: 100, fontSize: '.72rem', fontWeight: 700
                    }}>
                      {t.estado === 'approved' ? 'Aprobado' : t.estado === 'pending' ? 'Pendiente' : t.estado ?? '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Info contacto ── */}
      <div style={{ marginTop: 20, textAlign: 'center', fontSize: '.8rem', color: 'var(--c-text-3)' }}>
        ¿Necesitás ayuda? Escribinos a{' '}
        <a href="mailto:soporte@clingest.app" style={{ color: 'var(--c-primary)' }}>soporte@clingest.app</a>
      </div>
    </div>
  )
}
