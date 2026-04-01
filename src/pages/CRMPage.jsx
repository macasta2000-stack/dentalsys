import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { usePlanFeatures } from '../hooks/usePlanFeatures'
import UpgradePrompt from '../components/UpgradePrompt'

const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)

function normalizeTel(tel) {
  if (!tel) return null
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('549')) return digits
  if (digits.startsWith('54')) return '549' + digits.slice(2)
  if (digits.startsWith('9')) return '54' + digits
  if (digits.length === 10) return '549' + digits
  if (digits.length === 8) return '5491154' + digits
  return '549' + digits
}

function waUrl(tel, texto) {
  const num = normalizeTel(tel)
  if (!num) return null
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`
}

function CRMPageInner() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('inactivos')
  const [stats, setStats] = useState(null)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [diasInactividad, setDiasInactividad] = useState(90)
  const ENVIADOS_KEY = `crm_enviados_${new Date().toISOString().slice(0, 10)}`
  const [enviados, setEnviados] = useState(() => {
    try {
      const saved = localStorage.getItem(ENVIADOS_KEY)
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })

  useEffect(() => {
    loadStats()
  }, [])

  useEffect(() => {
    loadTab(tab)
  }, [tab, diasInactividad])

  async function loadStats() {
    const s = await api.crm.estadisticas().catch(() => null)
    setStats(s)
  }

  async function loadTab(t) {
    setLoading(true)
    setData([])
    try {
      let result
      if (t === 'inactivos') result = await api.crm.inactivos(diasInactividad)
      else if (t === 'cumpleanos') result = await api.crm.cumpleanos()
      else if (t === 'recordatorios') result = await api.crm.recordatorios()
      else if (t === 'deudores') result = await api.crm.deudores()
      setData(result ?? [])
    } catch {
      setData([])
    } finally {
      setLoading(false)
    }
  }

  function markSent(id) {
    setEnviados(prev => {
      const next = new Set([...prev, id])
      try { localStorage.setItem(ENVIADOS_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function mensajeInactivo(p) {
    return `Hola ${p.nombre}! 👋 Te escribimos desde el consultorio. Hace un tiempo que no te vemos y queremos saber cómo estás. ¿Te gustaría agendar una consulta de control? Escribinos y te conseguimos un turno 😊`
  }

  function mensajeCumple(p) {
    const edad = p.fecha_nacimiento
      ? Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
      : null
    return `Hola ${p.nombre}! 🎂 Todo el equipo del consultorio te desea un muy feliz cumpleaños${edad ? ` en tus ${edad} años` : ''}! Que lo pases genial y que tengas un año lleno de sonrisas 😁`
  }

  function mensajeRecordatorio(t) {
    const fecha = t.fecha_hora ? format(parseISO(t.fecha_hora), "EEEE d 'de' MMMM", { locale: es }) : ''
    const hora = t.fecha_hora ? format(parseISO(t.fecha_hora), 'HH:mm') : ''
    return `Hola ${t.nombre}! 👋 Te recordamos tu turno en el consultorio *${fecha}* a las *${hora} hs*${t.prestacion_nombre ? ` — ${t.prestacion_nombre}` : ''}. Por favor confirmá tu asistencia respondiendo este mensaje. ¡Muchas gracias! 😊`
  }

  function mensajeDeuda(p) {
    const monto = Math.abs(p.saldo ?? 0)
    return `Hola ${p.nombre}! Te contactamos desde el consultorio para recordarte que tenés un saldo pendiente de ${fmt(monto)}. Si querés regularizar la situación o acordar una forma de pago, respondé este mensaje y te ayudamos. Gracias! 😊`
  }

  const TABS = [
    { id: 'inactivos', label: 'Pacientes inactivos', icon: '😴' },
    { id: 'cumpleanos', label: 'Cumpleaños', icon: '🎂' },
    { id: 'recordatorios', label: 'Recordatorios mañana', icon: '📬' },
    { id: 'deudores', label: 'Con deuda', icon: '💸' },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">CRM — Gestión de Pacientes</div>
          <div className="page-sub">Recuperá pacientes, recordatorios y seguimiento</div>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          {[
            { label: 'Total pacientes', value: stats.total_pacientes, icon: '👥' },
            { label: 'Activos', value: stats.activos, icon: '✅' },
            { label: 'Nuevos este mes', value: stats.nuevos_mes, icon: '🆕' },
            { label: 'Con deuda', value: stats.con_deuda, icon: '⚠️', danger: stats.con_deuda > 0 },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-icon">{s.icon}</div>
              <div className="stat-body">
                <div className="stat-value" style={s.danger ? { color: 'var(--c-danger)' } : {}}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
            {!loading && tab === t.id && data.length > 0 && (
              <span className="badge badge-info" style={{ marginLeft: 6, fontSize: '.7rem' }}>{data.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filtro inactividad */}
      {tab === 'inactivos' && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '.88rem', color: 'var(--c-text-2)' }}>Pacientes sin turno completado en más de:</span>
            {[30, 60, 90, 180, 365].map(d => (
              <button key={d}
                className={`btn btn-sm ${diasInactividad === d ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setDiasInactividad(d)}>
                {d} días
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="card">
        {loading ? (
          <div className="card-body" style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /></div>
        ) : data.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--c-text-3)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>
              {tab === 'inactivos' ? '😴' : tab === 'cumpleanos' ? '🎂' : tab === 'recordatorios' ? '📬' : '💸'}
            </div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {tab === 'inactivos' ? `Sin pacientes inactivos por más de ${diasInactividad} días` :
               tab === 'cumpleanos' ? 'Sin cumpleaños en los próximos 30 días' :
               tab === 'recordatorios' ? 'Sin turnos para mañana con teléfono disponible' :
               'Sin pacientes con deuda registrada'}
            </div>
            <div style={{ fontSize: '.85rem' }}>
              {tab === 'inactivos' ? 'Los pacientes aparecerán aquí una vez que los registres.' :
               tab === 'cumpleanos' ? 'Los pacientes con fecha de nacimiento cargada aparecerán aquí.' :
               tab === 'recordatorios' ? 'Los turnos con teléfono registrado aparecerán aquí.' :
               'Los pacientes con saldo negativo aparecerán aquí.'}
            </div>
          </div>
        ) : tab === 'inactivos' ? (
          <InactivosTable data={data} enviados={enviados} onSent={markSent} getMensaje={mensajeInactivo} navigate={navigate} />
        ) : tab === 'cumpleanos' ? (
          <CumpleanosTable data={data} enviados={enviados} onSent={markSent} getMensaje={mensajeCumple} navigate={navigate} />
        ) : tab === 'recordatorios' ? (
          <RecordatoriosTable data={data} enviados={enviados} onSent={markSent} getMensaje={mensajeRecordatorio} navigate={navigate} />
        ) : (
          <DeudoresTable data={data} enviados={enviados} onSent={markSent} getMensaje={mensajeDeuda} navigate={navigate} fmt={fmt} />
        )}
      </div>
    </div>
  )
}

function WAButton({ tel, texto, id, enviados, onSent }) {
  const url = waUrl(tel, texto)
  if (!url) return <span className="text-muted text-sm">Sin teléfono</span>
  const sent = enviados.has(id)
  return (
    <a href={url} target="_blank" rel="noreferrer"
      onClick={() => onSent(id)}
      className={`btn btn-sm ${sent ? 'btn-secondary' : 'btn-success'}`}
      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {sent ? '✓ Enviado' : '📲 WhatsApp'}
    </a>
  )
}

function InactivosTable({ data, enviados, onSent, getMensaje, navigate }) {
  return (
    <div>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.85rem', color: 'var(--c-text-2)' }}>
          {data.length} pacientes inactivos — hacé clic en WhatsApp para enviar mensaje de reactivación
        </span>
        <button className="btn btn-sm btn-secondary" onClick={() => {
          data.filter(p => p.telefono).forEach((p, i) => {
            setTimeout(() => { window.open(waUrl(p.telefono, getMensaje(p)), '_blank'); onSent(p.id) }, i * 400)
          })
        }}>
          📲 Enviar a todos ({data.filter(p => p.telefono).length})
        </button>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr>
            <th>Paciente</th>
            <th>Días sin venir</th>
            <th>Último turno</th>
            <th>Obra social</th>
            <th>Saldo</th>
            <th>Acción</th>
          </tr></thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: 'var(--c-primary-light)', color: 'var(--c-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.75rem', flexShrink: 0 }}>
                      {(p.apellido?.[0] ?? '?')}{(p.nombre?.[0] ?? '?')}
                    </div>
                    <div>
                      <div className="td-main" style={{ cursor: 'pointer' }} onClick={() => navigate(`/pacientes/${p.id}`)}>
                        {p.apellido}, {p.nombre}
                      </div>
                      <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>{p.telefono || 'Sin teléfono'}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`badge ${(p.dias_sin_venir ?? 999) > 180 ? 'badge-danger' : (p.dias_sin_venir ?? 999) > 90 ? 'badge-warning' : 'badge-info'}`}>
                    {p.dias_sin_venir != null ? `${p.dias_sin_venir} días` : 'Nunca'}
                  </span>
                </td>
                <td className="text-sm text-muted">
                  {p.ultimo_turno ? format(parseISO(p.ultimo_turno), 'dd/MM/yyyy') : '—'}
                </td>
                <td className="text-sm">{p.obra_social || '—'}</td>
                <td className="text-sm" style={{ color: (p.saldo ?? 0) < 0 ? 'var(--c-danger)' : '' }}>
                  {(p.saldo ?? 0) !== 0 ? fmt(p.saldo) : '—'}
                </td>
                <td><WAButton tel={p.telefono} texto={getMensaje(p)} id={p.id} enviados={enviados} onSent={onSent} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CumpleanosTable({ data, enviados, onSent, getMensaje, navigate }) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead><tr>
          <th>Paciente</th>
          <th>Cumpleaños</th>
          <th>Días restantes</th>
          <th>Teléfono</th>
          <th>Acción</th>
        </tr></thead>
        <tbody>
          {data.map(p => (
            <tr key={p.id}>
              <td>
                <div className="td-main" style={{ cursor: 'pointer' }} onClick={() => navigate(`/pacientes/${p.id}`)}>
                  {p.apellido}, {p.nombre}
                </div>
              </td>
              <td className="text-sm">
                {p.fecha_nacimiento ? format(parseISO(p.fecha_nacimiento), "d 'de' MMMM", { locale: es }) : '—'}
              </td>
              <td>
                {p.dias_para_cumple === 0 ? (
                  <span className="badge badge-success">¡Hoy!</span>
                ) : p.dias_para_cumple === 1 ? (
                  <span className="badge badge-warning">Mañana</span>
                ) : (
                  <span className="badge badge-info">En {p.dias_para_cumple} días</span>
                )}
              </td>
              <td className="text-sm text-muted">{p.telefono || '—'}</td>
              <td><WAButton tel={p.telefono} texto={getMensaje(p)} id={p.id} enviados={enviados} onSent={onSent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RecordatoriosTable({ data, enviados, onSent, getMensaje, navigate }) {
  return (
    <div>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '.85rem', color: 'var(--c-text-2)' }}>
          Turnos de mañana — enviá recordatorio por WhatsApp a todos
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => {
          data.forEach((t, i) => {
            setTimeout(() => { window.open(waUrl(t.telefono, getMensaje(t)), '_blank'); onSent(t.id) }, i * 400)
          })
        }}>
          📲 Enviar todos los recordatorios ({data.length})
        </button>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr>
            <th>Paciente</th>
            <th>Hora</th>
            <th>Prestación</th>
            <th>Teléfono</th>
            <th>Recordatorio</th>
          </tr></thead>
          <tbody>
            {data.map(t => (
              <tr key={t.id}>
                <td>
                  <div className="td-main">{t.apellido}, {t.nombre}</div>
                </td>
                <td className="text-sm">
                  {t.fecha_hora ? format(parseISO(t.fecha_hora), 'HH:mm') : '—'}
                </td>
                <td className="text-sm text-muted">{t.prestacion_nombre || t.motivo || '—'}</td>
                <td className="text-sm">{t.telefono}</td>
                <td>
                  <WAButton tel={t.telefono} texto={getMensaje(t)} id={t.id} enviados={enviados} onSent={onSent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DeudoresTable({ data, enviados, onSent, getMensaje, navigate, fmt }) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead><tr>
          <th>Paciente</th>
          <th>Deuda</th>
          <th>Último turno</th>
          <th>Obra social</th>
          <th>Acción</th>
        </tr></thead>
        <tbody>
          {data.map(p => (
            <tr key={p.id}>
              <td>
                <div className="td-main" style={{ cursor: 'pointer' }} onClick={() => navigate(`/pacientes/${p.id}`)}>
                  {p.apellido}, {p.nombre}
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--c-text-3)' }}>{p.telefono || 'Sin teléfono'}</div>
              </td>
              <td>
                <span style={{ color: 'var(--c-danger)', fontWeight: 700 }}>{fmt(Math.abs(p.saldo ?? 0))}</span>
              </td>
              <td className="text-sm text-muted">
                {p.ultimo_turno ? format(parseISO(p.ultimo_turno), 'dd/MM/yyyy') : '—'}
              </td>
              <td className="text-sm">{p.obra_social || '—'}</td>
              <td><WAButton tel={p.telefono} texto={getMensaje(p)} id={p.id} enviados={enviados} onSent={onSent} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CRMPage() {
  const { hasFeature } = usePlanFeatures()
  if (!hasFeature('crm')) return <UpgradePrompt feature="crm" />
  return <CRMPageInner />
}
