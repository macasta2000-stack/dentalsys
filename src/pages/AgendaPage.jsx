import React, { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import ConsultaPanel from '../components/ConsultaPanel'

// HOURS se calcula dinámicamente desde la configuración del consultorio (ver componente)

const ESTADO_STYLE = {
  programado:  { bg: '#F0F9FF', border: '#38BDF8', text: '#0369A1', label: 'Programado' },
  confirmado:  { bg: '#F0FDF4', border: '#4ADE80', text: '#15803D', label: 'Confirmado' },
  presente:    { bg: '#ECFDF5', border: '#10B981', text: '#065F46', label: 'Presente' },
  completado:  { bg: '#F8FAFC', border: '#94A3B8', text: '#475569', label: 'Completado' },
  ausente:     { bg: '#FFF7ED', border: '#F97316', text: '#C2410C', label: 'Ausente' },
  cancelado:   { bg: '#FEF2F2', border: '#F87171', text: '#B91C1C', label: 'Cancelado' },
}

// Color palette for professionals (assigned by index, cycles if >8)
const PROF_PALETTE = [
  { bg: '#EFF6FF', border: '#3B82F6', text: '#1D4ED8', dot: '#3B82F6', light: '#DBEAFE' },
  { bg: '#F0FDF4', border: '#22C55E', text: '#15803D', dot: '#22C55E', light: '#DCFCE7' },
  { bg: '#FAF5FF', border: '#A855F7', text: '#7E22CE', dot: '#A855F7', light: '#F3E8FF' },
  { bg: '#FFF7ED', border: '#F97316', text: '#C2410C', dot: '#F97316', light: '#FED7AA' },
  { bg: '#FDF4FF', border: '#EC4899', text: '#9D174D', dot: '#EC4899', light: '#FCE7F3' },
  { bg: '#ECFDF5', border: '#14B8A6', text: '#115E59', dot: '#14B8A6', light: '#CCFBF1' },
  { bg: '#FEFCE8', border: '#EAB308', text: '#854D0E', dot: '#EAB308', light: '#FEF9C3' },
  { bg: '#FFF1F2', border: '#F43F5E', text: '#9F1239', dot: '#F43F5E', light: '#FFE4E6' },
]

const SERVICIO_PALETTE = [
  { bg:'#EEF2FF', border:'#6366F1', text:'#3730A3' },
  { bg:'#F0F9FF', border:'#0EA5E9', text:'#0369A1' },
  { bg:'#ECFDF5', border:'#10B981', text:'#065F46' },
  { bg:'#FFFBEB', border:'#F59E0B', text:'#92400E' },
  { bg:'#FEF2F2', border:'#EF4444', text:'#991B1B' },
  { bg:'#FAF5FF', border:'#A855F7', text:'#6B21A8' },
  { bg:'#F0FDFA', border:'#14B8A6', text:'#134E4A' },
  { bg:'#FFF7ED', border:'#F97316', text:'#9A3412' },
  { bg:'#FDF4FF', border:'#EC4899', text:'#831843' },
  { bg:'#F7FEE7', border:'#84CC16', text:'#3F6212' },
]

export default function AgendaPage() {
  const navigate = useNavigate()
  const addToast = useToast()
  const { user, configuracion } = useAuth()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // Horas de la grilla: respetar horario_inicio y horario_fin de la configuración
  const HOURS = useMemo(() => {
    const start = parseInt(configuracion?.horario_inicio ?? '8', 10) || 8
    const end = parseInt(configuracion?.horario_fin ?? '20', 10) || 20
    const s = Math.min(start, end - 1)
    const e = Math.max(end, s + 1)
    return Array.from({ length: e - s + 1 }, (_, i) => i + s)
  }, [configuracion?.horario_inicio, configuracion?.horario_fin])

  const [vista, setVista] = useState('dia') // 'dia' | 'semana' | 'lista'
  const [diaActual, setDiaActual] = useState(new Date())
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [refreshKey, setRefreshKey] = useState(0)

  function changeVista(v) {
    // Sync weekStart with diaActual so the week/list view shows the same date
    setWeekStart(startOfWeek(diaActual, { weekStartsOn: 1 }))
    setVista(v)
    setRefreshKey(k => k + 1) // forzar reload al cambiar de vista
  }
  const [turnos, setTurnos] = useState([])
  const [loading, setLoading] = useState(true)
  const [pacientes, setPacientes] = useState([])
  const [pacientesLoaded, setPacientesLoaded] = useState(false)
  const [prestaciones, setPrestaciones] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [filtroProfesional, setFiltroProfesional] = useState(null)
  const [modoProfPanel, setModoProfPanel] = useState(false)
  const [now, setNow] = useState(new Date())

  // Modal turno
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ paciente_id: '', fecha_hora: '', duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '', sesiones_autorizadas: '', profesional_id: '', monto: null })
  const [pacienteSearch, setPacienteSearch] = useState('')
  const [pacienteSelNombre, setPacienteSelNombre] = useState('')
  const [showPacienteSugerencias, setShowPacienteSugerencias] = useState(false)
  const pacienteSearchRef = useRef(null)
  const blurTimerRef = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conveniosOS, setConveniosOS] = useState([])
  const [pacienteSelOS, setPacienteSelOS] = useState('')

  // Context menu & actions
  const [ctxMenu, setCtxMenu] = useState(null)
  const [modalReagendar, setModalReagendar] = useState(false)
  const [turnoReagendar, setTurnoReagendar] = useState(null)
  const [reagendarFecha, setReagendarFecha] = useState('')
  const [modalAusenteConfirm, setModalAusenteConfirm] = useState(false)
  const [turnoAusente, setTurnoAusente] = useState(null)
  const [modalConfirm, setModalConfirm] = useState(null)

  // New patient sub-modal
  const [modalNuevoPac, setModalNuevoPac] = useState(false)
  const [nuevoPacForm, setNuevoPacForm] = useState({ nombre: '', apellido: '', telefono: '', obra_social: '' })
  const [nuevoPacSaving, setNuevoPacSaving] = useState(false)
  const [nuevoPacError, setNuevoPacError] = useState('')

  // Conflict detection
  const [conflicto, setConflicto] = useState(null)
  const [horariosLibres, setHorariosLibres] = useState([])

  // Cobro modal
  const [modalCobro, setModalCobro] = useState(false)
  const [turnoACobrar, setTurnoACobrar] = useState(null)
  const [cobroForm, setCobroForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })
  const [cobroSaving, setCobroSaving] = useState(false)
  const [cobroError, setCobroError] = useState('')

  // Consulta panel (slide-in)
  const [consultaOpen, setConsultaOpen] = useState(false)
  const [consultaTurno, setConsultaTurno] = useState(null)

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  // Map profesional_id → color
  const profColorMap = useMemo(() => {
    const map = {}
    colaboradores.forEach((c, i) => { map[c.id] = PROF_PALETTE[i % PROF_PALETTE.length] })
    return map
  }, [colaboradores])

  const getProfColor = (profesional_id) =>
    profesional_id ? (profColorMap[profesional_id] ?? null) : null

  const servicioColorMap = useMemo(() => {
    const map = {}
    prestaciones.forEach((p, i) => {
      map[p.id] = SERVICIO_PALETTE[i % SERVICIO_PALETTE.length]
    })
    return map
  }, [prestaciones])

  const activeProfs = useMemo(() => colaboradores.filter(c => c.activo !== 0), [colaboradores])

  // Clock tick for "now" line
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  // Limpiar timeout del blur de búsqueda de pacientes al desmontar
  useEffect(() => {
    return () => clearTimeout(blurTimerRef.current)
  }, [])

  useEffect(() => { load() }, [weekStart, vista, diaActual, refreshKey])

  async function load() {
    setLoading(true)
    const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const from = vista === 'dia' ? fmtDate(diaActual) : fmtDate(weekStart)
    const to   = vista === 'dia' ? fmtDate(diaActual) : fmtDate(weekEnd)
    try {
      const [ts, prests, colab] = await Promise.all([
        api.turnos.list({ from, to }),
        api.prestaciones.list(),
        api.colaboradores.list().catch(() => []),
      ])
      setTurnos(ts ?? [])
      setPrestaciones(prests ?? [])
      setColaboradores(colab ?? [])
    } catch {
      setTurnos([])
    } finally {
      setLoading(false)
    }
  }

  // Lazy-load patients only when modal opens
  async function ensurePacientes() {
    if (pacientesLoaded) return
    try {
      const ps = await api.pacientes.list()
      setPacientes(ps ?? [])
      setPacientesLoaded(true)
    } catch {}
  }

  const turnosFiltrados = useMemo(() =>
    filtroProfesional ? turnos.filter(t => t.profesional_id === filtroProfesional) : turnos
  , [turnos, filtroProfesional])

  const getTurnosForSlot = (day, hour) =>
    turnosFiltrados.filter(t => {
      const d = parseISO(t.fecha_hora)
      return isSameDay(d, day) && d.getHours() === hour
    })

  // Today's quick stats
  const statsHoy = useMemo(() => {
    const ref = vista === 'dia' ? diaActual : new Date()
    const hoy = turnos.filter(t => isSameDay(parseISO(t.fecha_hora), ref))
    return {
      total: hoy.length,
      pendientes: hoy.filter(t => ['programado','confirmado'].includes(t.estado)).length,
      presentes:  hoy.filter(t => t.estado === 'presente').length,
      completados:hoy.filter(t => t.estado === 'completado').length,
      ausentes:   hoy.filter(t => t.estado === 'ausente').length,
    }
  }, [turnos, diaActual, vista])

  // Lista view: group by day
  const listaAgrupada = useMemo(() => {
    const sorted = [...turnosFiltrados].sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))
    const groups = {}
    sorted.forEach(t => {
      const k = format(parseISO(t.fecha_hora), 'yyyy-MM-dd')
      if (!groups[k]) groups[k] = []
      groups[k].push(t)
    })
    return Object.entries(groups)
  }, [turnosFiltrados])

  // ── Open modals ──────────────────────────────────────────────────────────────
  function openNew(day, hour) {
    const dt = new Date(day); dt.setHours(hour, 0, 0, 0)
    setSelected(null)
    setForm({ paciente_id: '', fecha_hora: format(dt, "yyyy-MM-dd'T'HH:mm"), duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '', sesiones_autorizadas: '', profesional_id: filtroProfesional ?? '', monto: null })
    setPacienteSearch(''); setPacienteSelNombre(''); setShowPacienteSugerencias(false)
    setConveniosOS([]); setPacienteSelOS(''); setConflicto(null); setHorariosLibres([]); setError('')
    ensurePacientes()
    setModal(true)
  }

  function openEdit(t) {
    // Open quick consultation panel for all turno clicks (primary workflow)
    openConsulta(t)
  }

  function openEditModal(t) {
    if (t.estado === 'completado') { openCobro(t); return }
    setSelected(t)
    setForm({ paciente_id: t.paciente_id, fecha_hora: format(parseISO(t.fecha_hora), "yyyy-MM-dd'T'HH:mm"), duracion_minutos: t.duracion_minutos ?? 60, motivo: t.motivo ?? '', prestacion_id: t.prestacion_id ?? '', estado: t.estado, notas: t.notas ?? '', sesiones_autorizadas: t.sesiones_autorizadas ?? '', profesional_id: t.profesional_id ?? '', monto: t.monto ?? null })
    setPacienteSearch(''); setPacienteSelNombre(t.paciente_nombre ?? ''); setShowPacienteSugerencias(false)
    setConveniosOS([]); setPacienteSelOS(''); setConflicto(null); setHorariosLibres([]); setError('')
    ensurePacientes()
    setModal(true)
  }

  function openCobro(t) {
    const prestacion = prestaciones.find(p => p.id === t.prestacion_id)
    setTurnoACobrar(t)
    setCobroForm({ monto: String(prestacion?.precio ?? ''), metodo_pago: 'efectivo', concepto: prestacion?.nombre ?? (t.motivo || 'Consulta'), monto_os: 0, monto_copago: 0 })
    setCobroError('')
    setModalCobro(true)
  }

  function openConsulta(t) {
    if (!t.paciente_id) {
      addToast('Este turno no tiene paciente asociado', 'warning')
      return
    }
    setConsultaTurno(t)
    setConsultaOpen(true)
  }

  function closeConsulta() {
    setConsultaOpen(false)
    setConsultaTurno(null)
  }

  function handleConsultaUpdated() {
    load()
    addToast('Consulta guardada', 'success')
  }

  // ── Context menu actions ─────────────────────────────────────────────────────
  async function handleCtxAction(action, turno) {
    setCtxMenu(null)
    if (action === 'ver_ficha') { navigate(`/pacientes/${turno.paciente_id}`); return }
    if (action === 'whatsapp') {
      const tel = turno.paciente_telefono || pacientes.find(p => p.id === turno.paciente_id)?.telefono
      if (!tel) { addToast('El paciente no tiene teléfono registrado', 'warning'); return }
      const num = tel.replace(/\D/g, '')
      const normalized = num.startsWith('549') ? num : num.startsWith('54') ? `549${num.slice(2)}` : `549${num}`
      const fecha = new Date(turno.fecha_hora).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
      const hora  = new Date(turno.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      const nombre = turno.paciente_nombre?.split(' ')[0] ?? ''
      const texto = `Hola ${nombre}! Te recordamos tu turno en el consultorio el *${fecha}* a las *${hora} hs*${turno.motivo ? ` (${turno.motivo})` : ''}.\n¡Te esperamos!`
      window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(texto)}`, '_blank')
      return
    }
    if (action === 'completar') {
      const updated = await api.turnos.update(turno.id, { estado: 'completado' })
      setTurnos(prev => prev.map(t => t.id === turno.id ? { ...t, ...updated } : t))
      openCobro({ ...turno, ...updated }); return
    }
    if (action === 'presente') {
      const updated = await api.turnos.update(turno.id, { estado: 'presente' })
      setTurnos(prev => prev.map(t => t.id === turno.id ? { ...t, ...updated } : t))
      openCobro({ ...turno, ...updated }); return
    }
    if (action === 'ausente') { setTurnoAusente(turno); setModalAusenteConfirm(true); return }
    if (action === 'reagendar') {
      setTurnoReagendar(turno)
      setReagendarFecha(format(parseISO(turno.fecha_hora), "yyyy-MM-dd'T'HH:mm"))
      setModalReagendar(true); return
    }
    if (action === 'cancelar') {
      setModalConfirm({ msg: `¿Cancelar el turno de ${turno.paciente_nombre || 'este paciente'}?`, onConfirm: async () => { await api.turnos.cancel(turno.id); setTurnos(prev => prev.filter(t => t.id !== turno.id)); addToast('Turno cancelado', 'info') } })
      return
    }
    const updated = await api.turnos.update(turno.id, { estado: action })
    setTurnos(prev => prev.map(t => t.id === turno.id ? { ...t, ...updated } : t))
  }

  async function handleAusenteConfirm(reagendar) {
    setModalAusenteConfirm(false)
    if (turnoAusente) {
      await api.turnos.update(turnoAusente.id, { estado: 'ausente' })
      setTurnos(prev => prev.map(t => t.id === turnoAusente.id ? { ...t, estado: 'ausente' } : t))
    }
    if (reagendar && turnoAusente) {
      setTurnoReagendar(turnoAusente)
      const nueva = new Date(turnoAusente.fecha_hora); nueva.setDate(nueva.getDate() + 7)
      setReagendarFecha(format(nueva, "yyyy-MM-dd'T'HH:mm"))
      setModalReagendar(true)
    }
    setTurnoAusente(null)
  }

  async function handleReagendar(e) {
    e.preventDefault()
    if (!reagendarFecha || !turnoReagendar || saving) return
    setSaving(true)
    try {
      const updated = await api.turnos.update(turnoReagendar.id, { fecha_hora: reagendarFecha })
      setTurnos(prev => prev.map(t => t.id === turnoReagendar.id ? { ...t, ...updated } : t))
      setModalReagendar(false); setTurnoReagendar(null)
      addToast('Turno reagendado correctamente', 'success')
    } catch (e) {
      addToast(e.message || 'Error al reagendar el turno', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function loadConveniosOS(paciente) {
    if (!paciente?.obra_social) { setConveniosOS([]); setPacienteSelOS(''); return }
    setPacienteSelOS(paciente.obra_social)
    try { const cvs = await api.convenios.list(paciente.obra_social); setConveniosOS(cvs ?? []) }
    catch { setConveniosOS([]) }
  }

  async function handleNuevoPaciente(e) {
    e.preventDefault()
    if (!nuevoPacForm.nombre || !nuevoPacForm.apellido) { setNuevoPacError('Nombre y apellido son obligatorios'); return }
    setNuevoPacSaving(true); setNuevoPacError('')
    try {
      const p = await api.pacientes.create(nuevoPacForm)
      setPacientes(prev => [...prev, p])
      setForm(f => ({ ...f, paciente_id: p.id }))
      setPacienteSelNombre(`${p.apellido}, ${p.nombre}`)
      setPacienteSearch(''); setShowPacienteSugerencias(false)
      loadConveniosOS(p)
      setModalNuevoPac(false)
      setNuevoPacForm({ nombre: '', apellido: '', telefono: '', obra_social: '' })
    } catch { setNuevoPacError('No se pudo crear el paciente.') }
    finally { setNuevoPacSaving(false) }
  }

  function checkConflicto(fechaHora) {
    if (!fechaHora) { setConflicto(null); setHorariosLibres([]); return }
    const dt = new Date(fechaHora)
    const conflictivo = turnos.find(t => {
      if (selected && t.id === selected.id) return false
      return Math.abs(parseISO(t.fecha_hora) - dt) / 60000 < 30 && t.estado !== 'cancelado'
    })
    setConflicto(conflictivo ?? null)
    if (conflictivo) {
      const libres = []; let candidato = new Date(dt); candidato.setMinutes(0,0,0); candidato.setHours(candidato.getHours()+1)
      while (libres.length < 3) {
        const hay = turnos.some(t => { if (selected && t.id === selected.id) return false; return Math.abs(parseISO(t.fecha_hora) - candidato) / 60000 < 30 && t.estado !== 'cancelado' })
        if (!hay) libres.push(new Date(candidato))
        candidato = new Date(candidato.getTime() + 30 * 60000)
        if (libres.length >= 3) break
      }
      setHorariosLibres(libres)
    } else { setHorariosLibres([]) }
  }

  const setField = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSave(e) {
    e.preventDefault()
    if (!form.paciente_id || !form.fecha_hora) { setError('Paciente y fecha/hora son requeridos'); return }
    // Advertir si la fecha es pasada (más de 1 hora atrás) — no bloquear para permitir carga de historial
    if (!selected) {
      const turnoDate = new Date(form.fecha_hora)
      const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000)
      if (turnoDate < unaHoraAtras) {
        const confirmar = window.confirm('La fecha/hora seleccionada es en el pasado. ¿Querés continuar de todas formas? (Útil para cargar historial de turnos)')
        if (!confirmar) return
      }
    }
    setSaving(true); setError('')
    try {
      const payload = { ...form, duracion_minutos: Number(form.duracion_minutos) || 60 }
      if (!payload.prestacion_id) delete payload.prestacion_id
      if (!payload.profesional_id) delete payload.profesional_id
      if (selected && payload.estado === 'completado' && selected.estado !== 'completado') {
        const updated = await api.turnos.update(selected.id, payload)
        setTurnos(prev => prev.map(t => t.id === selected.id ? { ...t, ...updated } : t))
        setModal(false); openCobro({ ...selected, ...updated }); return
      }
      if (selected) {
        const updated = await api.turnos.update(selected.id, payload)
        setTurnos(prev => prev.map(t => t.id === selected.id ? { ...t, ...updated } : t))
      } else {
        const created = await api.turnos.create(payload)
        setTurnos(prev => [...prev, created])
      }
      setModal(false)
    } catch (err) {
      const msg = err?.message ?? ''
      setError(msg && !msg.startsWith('Error ') ? msg : 'No se pudo guardar el turno. Verificá los datos ingresados.')
    } finally { setSaving(false) }
  }

  async function handleCobro(e) {
    e.preventDefault()
    if (!cobroForm.monto || Number(cobroForm.monto) <= 0) { setCobroError('Ingresá un monto válido'); return }
    setCobroSaving(true); setCobroError('')
    try {
      const pagoData = { paciente_id: turnoACobrar.paciente_id, monto: Number(cobroForm.monto), metodo_pago: cobroForm.metodo_pago, concepto: cobroForm.concepto || 'Consulta', turno_id: turnoACobrar.id }
      if (cobroForm.metodo_pago === 'obra_social') { pagoData.monto_os = Number(cobroForm.monto_os)||0; pagoData.monto_copago = Number(cobroForm.monto_copago)||0 }
      await api.pagos.create(pagoData)
      addToast('Pago registrado correctamente', 'success')
      if (turnoACobrar.estado === 'presente') {
        const upd = await api.turnos.update(turnoACobrar.id, { estado: 'completado' }).catch(() => null)
        if (upd) setTurnos(prev => prev.map(t => t.id === turnoACobrar.id ? { ...t, ...upd } : t))
      }
      setModalCobro(false); setTurnoACobrar(null)
    } catch (err) { setCobroError(err.message) }
    finally { setCobroSaving(false) }
  }

  async function handleCancel(id) {
    setModalConfirm({ msg: '¿Cancelar este turno?', onConfirm: async () => { await api.turnos.cancel(id); setTurnos(prev => prev.filter(t => t.id !== id)); setModal(false); addToast('Turno cancelado', 'info') } })
  }

  const nowHour = now.getHours()
  const nowMinutes = now.getMinutes()
  const displayDays = vista === 'dia' ? [diaActual] : days

  const fmt$ = (n) => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n)

  // ── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div onClick={() => ctxMenu && setCtxMenu(null)}>

      {/* Offline warning — agenda requires internet for write ops */}
      {!isOnline && (
        <div style={{
          background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8,
          padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 14, color: '#92400E',
        }}>
          <span style={{ fontSize: 18 }}>📡</span>
          <div>
            <strong>Modo sin conexión</strong> — Podés ver la agenda guardada, pero para agregar, modificar o cancelar turnos necesitás WiFi.
            <br /><span style={{ opacity: 0.8, fontSize: 12 }}>Esto evita que dos turnos se pisen al mismo horario.</span>
          </div>
        </div>
      )}

      {/* Page header */}
      <div className="page-header">
        <div>
          <div className="page-title">Agenda</div>
          <div className="page-sub">
            {vista === 'dia'
              ? format(diaActual, "EEEE d 'de' MMMM yyyy", { locale: es })
              : `${format(weekStart, "d 'de' MMMM", { locale: es })} — ${format(weekEnd, "d 'de' MMMM, yyyy", { locale: es })}`}
          </div>
        </div>
        <div className="page-actions">
          <div className="agenda-view-toggle">
            {[['dia','Día'],['semana','Semana'],['lista','Lista']].map(([v,lbl]) => (
              <button key={v} className={`avt-btn${vista===v?' active':''}`} onClick={() => changeVista(v)}>{lbl}</button>
            ))}
          </div>
          {vista === 'dia' ? <>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiaActual(d => addDays(d,-1))}>← Ant.</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiaActual(new Date())}>Hoy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setDiaActual(d => addDays(d,1))}>Sig. →</button>
          </> : <>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(w => subWeeks(w,1))}>← Ant.</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(startOfWeek(new Date(),{weekStartsOn:1}))}>Hoy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setWeekStart(w => addWeeks(w,1))}>Sig. →</button>
          </>}
          {activeProfs.length > 1 && vista === 'dia' && (
            <button
              className={`btn btn-sm ${modoProfPanel ? 'btn-primary' : 'btn-ghost'}`}
              title="Vista por profesional"
              onClick={() => setModoProfPanel(p => !p)}>
              👥 Panel
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => openNew(vista==='dia'?diaActual:new Date(), new Date().getHours()||9)}>+ Turno</button>
        </div>
      </div>

      {/* Quick stats bar */}
      {!loading && statsHoy.total > 0 && (
        <div className="agenda-stats-bar">
          <span className="asb-item"><span className="asb-num">{statsHoy.total}</span> hoy</span>
          {statsHoy.pendientes > 0 && <span className="asb-item info"><span className="asb-num">{statsHoy.pendientes}</span> pendientes</span>}
          {statsHoy.presentes  > 0 && <span className="asb-item success"><span className="asb-num">{statsHoy.presentes}</span> presentes</span>}
          {statsHoy.completados> 0 && <span className="asb-item neutral"><span className="asb-num">{statsHoy.completados}</span> completados</span>}
          {statsHoy.ausentes   > 0 && <span className="asb-item danger"><span className="asb-num">{statsHoy.ausentes}</span> ausentes</span>}
        </div>
      )}

      {/* Professional filter pills */}
      {colaboradores.filter(c => c.activo !== 0).length > 0 && (
        <div className="agenda-prof-filter">
          <span className="apf-label">Ver:</span>
          <button className={`apf-btn${!filtroProfesional?' active':''}`} onClick={() => setFiltroProfesional(null)}>
            <span className="apf-dot" style={{background:'#94A3B8'}} />Todos
          </button>
          {colaboradores.filter(c => c.activo !== 0).map((c,i) => {
            const col = PROF_PALETTE[i % PROF_PALETTE.length]
            const isActive = filtroProfesional === c.id
            return (
              <button key={c.id}
                className={`apf-btn${isActive?' active':''}`}
                style={isActive ? {'--apf-bg':col.light,'--apf-border':col.border,'--apf-text':col.text} : {}}
                onClick={() => setFiltroProfesional(prev => prev===c.id ? null : c.id)}>
                <span className="apf-dot" style={{background:col.dot}} />
                {c.nombre} {c.apellido}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',paddingTop:60}}><span className="spinner" /></div>
      ) : (
        <>
          {/* ── VISTA LISTA ───────────────────────────────────────────────── */}
          {vista === 'lista' && (
            <div className="agenda-lista">
              {listaAgrupada.length === 0 ? (
                <div className="empty-state" style={{paddingTop:60}}>
                  <div className="empty-icon">📅</div>
                  <div className="empty-title">No hay turnos en este período</div>
                  <button className="btn btn-primary btn-sm mt-2" onClick={() => openNew(new Date(),9)}>+ Crear turno</button>
                </div>
              ) : listaAgrupada.map(([dayKey, dayTurnos]) => {
                const dayDate = parseISO(dayKey)
                const esHoy = isSameDay(dayDate, new Date())
                return (
                  <div key={dayKey} className="al-group">
                    <div className={`al-day-header${esHoy?' today':''}`}>
                      <span className="al-day-name">{format(dayDate,"EEEE d 'de' MMMM",{locale:es})}</span>
                      <span className="al-day-count">{dayTurnos.length} {dayTurnos.length===1?'turno':'turnos'}</span>
                    </div>
                    <div className="al-rows">
                      {dayTurnos.map(t => {
                        const estilo = ESTADO_STYLE[t.estado] ?? ESTADO_STYLE.programado
                        const profColor = getProfColor(t.profesional_id)
                        const servColor = t.prestacion_id ? servicioColorMap[t.prestacion_id] : null
                        const prof = colaboradores.find(c => c.id === t.profesional_id)
                        const tieneDeuda = (t.paciente_saldo ?? 0) < 0
                        return (
                          <div key={t.id} className="al-row"
                            style={{borderLeft: `4px solid ${servColor ? servColor.border : (profColor ? profColor.border : 'transparent')}`}}
                            onClick={() => openEdit(t)}
                            onContextMenu={e => { e.preventDefault(); setCtxMenu({x:e.clientX,y:e.clientY,turno:t}) }}>
                            <div className="al-time">{format(parseISO(t.fecha_hora),'HH:mm')}</div>
                            {profColor && <div className="al-prof-bar" style={{background:profColor.border}} />}
                            <div className="al-main">
                              <div className="al-patient">
                                {t.paciente_nombre ?? 'Paciente'}
                                {tieneDeuda && <span className="al-debt" title="Deuda pendiente"> 💰</span>}
                              </div>
                              <div className="al-detail">
                                {t.motivo && <span>{t.motivo}</span>}
                                {t.paciente_obra_social && <span className="al-os"> · {t.paciente_obra_social}</span>}
                                {prof && <span className="al-profname"> · {prof.nombre} {prof.apellido}</span>}
                                {t.duracion_minutos && <span className="al-dur"> · {t.duracion_minutos}min</span>}
                              </div>
                            </div>
                            <div className="al-badge" style={{background:estilo.bg,color:estilo.text,border:`1px solid ${estilo.border}`}}>
                              {estilo.label}
                            </div>
                            <div className="al-actions" onClick={e => e.stopPropagation()}>
                              {(t.estado==='programado'||t.estado==='confirmado') && <>
                                <button className="btn btn-success btn-sm" onClick={() => handleCtxAction('presente',t)}>Presente</button>
                                <button className="btn btn-ghost btn-sm" style={{color:'var(--c-warning)'}} onClick={() => handleCtxAction('ausente',t)}>Ausente</button>
                              </>}
                              {t.estado==='presente' && <button className="btn btn-success btn-sm" onClick={() => handleCtxAction('completar',t)}>💰 Cobrar</button>}
                              <button className="btn btn-ghost btn-sm" style={{padding:'5px 8px',fontSize:'1rem'}} onClick={e => { e.stopPropagation(); setCtxMenu({x:e.clientX,y:e.clientY,turno:t}) }}>⋮</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── VISTA DÍA / SEMANA ────────────────────────────────────────── */}
          {(vista==='dia'||vista==='semana') && (
            <div className="card" style={{overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                {modoProfPanel && vista === 'dia' && activeProfs.length > 0 ? (
                  // ── MODO PANEL POR PROFESIONAL ─────────────────────────────
                  <div className="agenda-grid-new" style={{gridTemplateColumns:`64px repeat(${activeProfs.length},1fr)`,minWidth:Math.max(320,activeProfs.length*200)}}>
                    <div className="agn-corner" />
                    {activeProfs.map((prof, i) => {
                      const col = PROF_PALETTE[i % PROF_PALETTE.length]
                      return (
                        <div key={prof.id} className="agn-day-header" style={{borderBottom:`3px solid ${col.border}`,background:col.bg}}>
                          <div className="adh-name" style={{color:col.text,fontWeight:600}}>{prof.nombre} {prof.apellido}</div>
                          <div className="adh-num" style={{color:col.text,fontSize:'0.75rem'}}>{prof.especialidad||prof.rol}</div>
                        </div>
                      )
                    })}
                    {HOURS.map(hour => (
                      <React.Fragment key={hour}>
                        <div className="agn-time">{String(hour).padStart(2,'0')}:00</div>
                        {activeProfs.map((prof, di) => {
                          const slots = turnos.filter(t => {
                            const d = parseISO(t.fecha_hora)
                            return t.profesional_id === prof.id && isSameDay(d, diaActual) && d.getHours() === hour
                          })
                          const showNowLine = hour === nowHour && isSameDay(diaActual, now)
                          return (
                            <div key={`${di}-${hour}`}
                              className={`agn-cell${slots.length===0?' empty':''}`}
                              onClick={() => slots.length===0 && openNew(diaActual, hour)}>
                              {showNowLine && (
                                <div className="agn-now-line" style={{top:`${(nowMinutes/60)*100}%`}}>
                                  <div className="agn-now-dot" />
                                </div>
                              )}
                              {slots.map(t => {
                                const servColor = t.prestacion_id ? servicioColorMap[t.prestacion_id] : null
                                const estilo = ESTADO_STYLE[t.estado] ?? ESTADO_STYLE.programado
                                const chipBg     = servColor ? servColor.bg     : estilo.bg
                                const chipBorder = servColor ? servColor.border : estilo.border
                                const chipText   = servColor ? servColor.text   : estilo.text
                                const tieneDeuda = (t.paciente_saldo ?? 0) < 0
                                return (
                                  <div key={t.id} className="agn-chip"
                                    style={{'--chip-bg':chipBg,'--chip-border':chipBorder,'--chip-text':chipText}}
                                    onClick={e => { e.stopPropagation(); openEdit(t) }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({x:e.clientX,y:e.clientY,turno:t}) }}>
                                    <div className="agn-chip-time">
                                      {format(parseISO(t.fecha_hora),'HH:mm')}
                                      {tieneDeuda && <span style={{color:'#DC2626',marginLeft:3}} title="Deuda">●</span>}
                                    </div>
                                    <div className="agn-chip-name">{t.paciente_nombre ?? 'Paciente'}</div>
                                    {t.motivo && <div className="agn-chip-motivo">{t.motivo}</div>}
                                    {servColor && prestaciones.find(p=>p.id===t.prestacion_id) && (
                                      <div className="agn-chip-motivo" style={{color:chipBorder,fontWeight:600}}>
                                        {prestaciones.find(p=>p.id===t.prestacion_id)?.nombre}
                                      </div>
                                    )}
                                    {!['programado','confirmado'].includes(t.estado) && (
                                      <div className="agn-chip-estado" style={{background:estilo.border}}>
                                        {t.estado==='completado'?'✓':t.estado==='ausente'?'✗':t.estado==='presente'?'●':''}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                ) : (
                  // ── MODO NORMAL ────────────────────────────────────────────
                  <div className="agenda-grid-new" style={{gridTemplateColumns:`64px repeat(${displayDays.length},1fr)`,minWidth:vista==='dia'?320:760}}>

                    {/* Column headers */}
                    <div className="agn-corner" />
                    {displayDays.map((d,i) => {
                      const isT = isSameDay(d, new Date())
                      return (
                        <div key={i} className={`agn-day-header${isT?' today':''}`}>
                          <div className="adh-name">{format(d,'EEE',{locale:es})}</div>
                          <div className="adh-num">{format(d,'d')}</div>
                          {isT && <div className="adh-today-dot" />}
                        </div>
                      )
                    })}

                    {/* Time rows */}
                    {HOURS.map(hour => (
                      <React.Fragment key={hour}>
                        <div className="agn-time">{String(hour).padStart(2,'0')}:00</div>
                        {displayDays.map((day, di) => {
                          const slots = getTurnosForSlot(day, hour)
                          const showNowLine = isSameDay(day, now) && hour === nowHour
                          return (
                            <div key={`${di}-${hour}`}
                              className={`agn-cell${slots.length===0?' empty':''}`}
                              onClick={() => slots.length===0 && openNew(day, hour)}>

                              {showNowLine && (
                                <div className="agn-now-line" style={{top:`${(nowMinutes/60)*100}%`}}>
                                  <div className="agn-now-dot" />
                                </div>
                              )}

                              {slots.map(t => {
                                const estilo = ESTADO_STYLE[t.estado] ?? ESTADO_STYLE.programado
                                const profColor = getProfColor(t.profesional_id)
                                const servColor  = t.prestacion_id ? servicioColorMap[t.prestacion_id] : null
                                const tieneDeuda = (t.paciente_saldo ?? 0) < 0
                                const prof = colaboradores.find(c => c.id === t.profesional_id)
                                const chipBg     = servColor ? servColor.bg     : (profColor ? profColor.bg     : estilo.bg)
                                const chipBorder = servColor ? servColor.border : (profColor ? profColor.border : estilo.border)
                                const chipText   = servColor ? servColor.text   : (profColor ? profColor.text   : estilo.text)
                                return (
                                  <div key={t.id} className="agn-chip"
                                    style={{'--chip-bg':chipBg,'--chip-border':chipBorder,'--chip-text':chipText}}
                                    onClick={e => { e.stopPropagation(); openEdit(t) }}
                                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({x:e.clientX,y:e.clientY,turno:t}) }}>
                                    <div className="agn-chip-time">
                                      {format(parseISO(t.fecha_hora),'HH:mm')}
                                      {tieneDeuda && <span style={{color:'#DC2626',marginLeft:3}} title="Deuda">●</span>}
                                    </div>
                                    <div className="agn-chip-name">{t.paciente_nombre ?? 'Paciente'}</div>
                                    {servColor && prestaciones.find(p=>p.id===t.prestacion_id) && (
                                      <div className="agn-chip-motivo" style={{color:chipBorder,fontWeight:600,fontSize:'0.65rem'}}>
                                        {prestaciones.find(p=>p.id===t.prestacion_id)?.nombre}
                                      </div>
                                    )}
                                    {vista==='dia' && t.motivo && <div className="agn-chip-motivo">{t.motivo}</div>}
                                    {vista==='dia' && prof && <div className="agn-chip-prof">{prof.nombre} {prof.apellido}</div>}
                                    {t.sesiones_autorizadas && <div className="agn-chip-ses">Ses.{t.sesion_numero??'?'}/{t.sesiones_autorizadas}</div>}
                                    {!['programado','confirmado'].includes(t.estado) && (
                                      <div className="agn-chip-estado" style={{background:estilo.border}}>
                                        {t.estado==='completado'?'✓':t.estado==='ausente'?'✗':t.estado==='presente'?'●':''}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Leyenda */}
          <div className="agenda-leyenda">
            {Object.entries(ESTADO_STYLE).filter(([k])=>k!=='no_asistio').map(([estado, style]) => (
              <span key={estado} className="al-leyenda-item">
                <span style={{width:10,height:10,borderRadius:3,background:style.bg,border:`1.5px solid ${style.border}`,display:'inline-block'}} />
                {style.label}
              </span>
            ))}
            {colaboradores.filter(c=>c.activo!==0).map((c,i) => {
              const col = PROF_PALETTE[i % PROF_PALETTE.length]
              return (
                <span key={c.id} className="al-leyenda-item">
                  <span style={{width:10,height:10,borderRadius:'50%',background:col.dot,display:'inline-block'}} />
                  {c.nombre} {c.apellido}
                </span>
              )
            })}
          </div>
        </>
      )}

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && (
        <div className="ctx-menu" style={{top:ctxMenu.y,left:ctxMenu.x}} onClick={e => e.stopPropagation()}>
          {[
            ['consulta_rapida','⚡ Consulta rápida',false],
            ['confirmado','✓ Confirmar',false],
            ['presente','◉ Marcar presente',false],
            ['completar','💰 Completar + Cobrar',false],
            ['ausente','✗ Ausente',false],
            ['whatsapp','📱 Recordatorio WhatsApp',false],
            ['video','📹 Iniciar videollamada',false],
            ['reagendar','📅 Reagendar',false],
            ['editar_turno','✏ Editar turno',false],
            ['ver_ficha','👤 Ver ficha',false],
            ['cancelar','🗑 Cancelar turno',true],
          ].filter(([action]) => action!=='whatsapp' || !!(ctxMenu.turno.paciente_telefono||pacientes.find(p=>p.id===ctxMenu.turno.paciente_id)?.telefono))
           .map(([action,label,isDanger]) => (
            <button key={action} className={`ctx-item${isDanger?' danger':''}`}
              onClick={() => {
                if (action === 'consulta_rapida') { setCtxMenu(null); openConsulta(ctxMenu.turno); return }
                if (action === 'editar_turno') { setCtxMenu(null); openEditModal(ctxMenu.turno); return }
                if (action === 'video') {
                  setCtxMenu(null)
                  api.videoSessions.create({ turno_id: ctxMenu.turno.id, paciente_id: ctxMenu.turno.paciente_id, send_email_paciente: true })
                    .then(s => window.open(s.link_paciente, '_blank'))
                    .catch(e => addToast(e.message || 'Error al crear videollamada', 'error'))
                  return
                }
                handleCtxAction(action, ctxMenu.turno)
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Modal ausente ───────────────────────────────────────────────── */}
      {modalAusenteConfirm && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">Paciente ausente</span></div>
            <div className="modal-body"><p style={{fontSize:'.9rem',margin:0}}>¿Querés reagendar este turno para otra fecha?</p></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => handleAusenteConfirm(false)}>Solo marcar ausente</button>
              <button className="btn btn-primary" onClick={() => handleAusenteConfirm(true)}>Sí, reagendar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal reagendar ─────────────────────────────────────────────── */}
      {modalReagendar && turnoReagendar && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reagendar — {turnoReagendar.paciente_nombre}</span>
              <button className="btn-close" onClick={() => setModalReagendar(false)}>✕</button>
            </div>
            <form onSubmit={handleReagendar}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nueva fecha y hora</label>
                  <input className="form-input" type="datetime-local" required value={reagendarFecha} onChange={e => setReagendarFecha(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalReagendar(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Reagendar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal turno (crear / editar) ────────────────────────────────── */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{selected ? 'Editar turno' : 'Nuevo turno'}</span>
              <button className="btn-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:14}}>

                {/* Paciente search */}
                <div className="form-group" style={{position:'relative'}}>
                  <label className="form-label">Paciente <span className="req">*</span></label>
                  {form.paciente_id && pacienteSelNombre ? (
                    <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',border:'1.5px solid var(--c-primary)',borderRadius:'var(--radius-sm)',background:'var(--c-primary-light)'}}>
                      <span style={{flex:1,fontSize:'.88rem',fontWeight:600,color:'var(--c-primary-dark)'}}>{pacienteSelNombre}</span>
                      <button type="button" className="btn-close" onClick={() => { setForm(f=>({...f,paciente_id:''})); setPacienteSelNombre(''); setPacienteSearch(''); setConveniosOS([]); setPacienteSelOS(''); setTimeout(()=>pacienteSearchRef.current?.focus(),50) }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input ref={pacienteSearchRef} className="form-input" type="text" placeholder="Buscar por nombre o DNI..." value={pacienteSearch}
                        onChange={e => { setPacienteSearch(e.target.value); setShowPacienteSugerencias(true) }}
                        onFocus={() => setShowPacienteSugerencias(true)}
                        onBlur={() => { blurTimerRef.current = setTimeout(() => setShowPacienteSugerencias(false), 150) }}
                        autoComplete="off" />
                      {showPacienteSugerencias && (() => {
                        const q = pacienteSearch.toLowerCase()
                        const filtrados = pacienteSearch
                          ? pacientes.filter(p => p.nombre.toLowerCase().includes(q)||p.apellido.toLowerCase().includes(q)||(p.dni??'').toLowerCase().includes(q)).slice(0,8)
                          : pacientes.slice(0,8)
                        return (
                          <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:300,background:'var(--c-surface)',border:'1.5px solid var(--c-border)',borderRadius:'var(--radius-sm)',boxShadow:'var(--shadow-md)',maxHeight:240,overflowY:'auto'}}>
                            {pacienteSearch && filtrados.length===0 ? (
                              <div style={{padding:'10px 14px',fontSize:'.86rem',color:'var(--c-text-3)'}}>Sin resultados para "{pacienteSearch}"</div>
                            ) : filtrados.map(p => (
                              <div key={p.id} style={{padding:'9px 14px',cursor:'pointer',borderBottom:'1px solid var(--c-border)',fontSize:'.86rem'}}
                                onMouseDown={() => { setForm(f=>({...f,paciente_id:p.id})); setPacienteSelNombre(`${p.apellido}, ${p.nombre}`); setPacienteSearch(''); setShowPacienteSugerencias(false); loadConveniosOS(p) }}
                                onMouseEnter={e => e.currentTarget.style.background='var(--c-surface-2)'}
                                onMouseLeave={e => e.currentTarget.style.background=''}>
                                <span style={{fontWeight:600,color:'var(--c-text)'}}>{p.apellido}, {p.nombre}</span>
                                {p.dni && <span style={{marginLeft:8,fontSize:'.78rem',color:'var(--c-text-3)'}}>DNI {p.dni}</span>}
                                {p.obra_social && <span style={{marginLeft:8,fontSize:'.75rem',color:'var(--c-primary)'}}>{p.obra_social}</span>}
                              </div>
                            ))}
                            <div style={{borderTop:'1px solid var(--c-border)'}}>
                              <div style={{padding:'9px 14px',cursor:'pointer',fontSize:'.84rem',fontWeight:600,color:'var(--c-primary)'}}
                                onMouseDown={() => { setShowPacienteSugerencias(false); setNuevoPacForm({nombre:pacienteSearch,apellido:'',telefono:'',obra_social:''}); setNuevoPacError(''); setModalNuevoPac(true) }}
                                onMouseEnter={e => e.currentTarget.style.background='var(--c-primary-light)'}
                                onMouseLeave={e => e.currentTarget.style.background=''}>
                                + Crear paciente nuevo
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {!form.paciente_id && <input type="text" required value="" onChange={()=>{}} style={{position:'absolute',opacity:0,pointerEvents:'none',width:1,height:1}} tabIndex={-1} />}
                    </>
                  )}
                  {pacienteSelOS && (
                    <div style={{marginTop:6,padding:'6px 10px',background:'var(--c-surface-2)',borderRadius:'var(--radius-sm)',fontSize:'.78rem',color:'var(--c-text-2)'}}>
                      <strong>OS:</strong> {pacienteSelOS}
                      {conveniosOS.length>0 ? <span> — Cubre {conveniosOS.map(c=>`${fmt$(c.monto_os)}, copago ${fmt$(c.monto_copago)}`).join(' / ')}</span>
                       : <span style={{color:'var(--c-text-3)'}}> — Sin convenios</span>}
                    </div>
                  )}
                </div>

                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Fecha y hora <span className="req">*</span></label>
                    <input className="form-input" type="datetime-local" required value={form.fecha_hora}
                      onChange={e => { setField('fecha_hora')(e); checkConflicto(e.target.value) }} />
                    {conflicto && (
                      <div style={{marginTop:6,padding:'8px 10px',background:'#FFF7ED',border:'1px solid #F97316',borderRadius:'var(--radius-sm)',fontSize:'.78rem',color:'#C2410C'}}>
                        <strong>Conflicto:</strong> ya hay un turno con {conflicto.paciente_nombre} a las {format(parseISO(conflicto.fecha_hora),'HH:mm')}.
                        {horariosLibres.length>0 && <div style={{marginTop:5}}>Horarios libres:{horariosLibres.map(h=>(
                          <button key={h.toISOString()} type="button" style={{marginLeft:6,padding:'2px 8px',background:'var(--c-primary)',color:'#FFF',border:'none',borderRadius:4,fontSize:'.75rem',cursor:'pointer'}}
                            onClick={() => { const v=format(h,"yyyy-MM-dd'T'HH:mm"); setForm(f=>({...f,fecha_hora:v})); checkConflicto(v) }}>{format(h,'HH:mm')}</button>
                        ))}</div>}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración</label>
                    <select className="form-input" value={form.duracion_minutos} onChange={setField('duracion_minutos')}>
                      {[15,20,30,45,60,90,120].map(d=><option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Motivo / Servicio</label>
                  <input className="form-input" value={form.motivo} onChange={setField('motivo')} placeholder="" />
                </div>

                <div className="form-group">
                  <label className="form-label">Monto (opcional)</label>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="Dejar vacío para usar precio de prestaciones"
                    value={form.monto ?? ''}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value ? parseFloat(e.target.value) : null }))}
                    min="0"
                    step="100"
                  />
                  <div className="form-hint">Si no se completa, se usará el precio configurado en Prestaciones</div>
                </div>

                <div className="form-row cols-2">
                  {selected && (
                    <div className="form-group">
                      <label className="form-label">Estado</label>
                      <select className="form-input" value={form.estado} onChange={setField('estado')}>
                        <option value="programado">Programado</option>
                        <option value="confirmado">Confirmado</option>
                        <option value="presente">Presente</option>
                        <option value="completado">Completado</option>
                        <option value="ausente">Ausente</option>
                      </select>
                      {form.estado==='completado'&&selected.estado!=='completado'&&<span className="form-hint" style={{color:'var(--c-success)'}}>Al guardar se abrirá el modal de cobro</span>}
                    </div>
                  )}
                  {colaboradores.filter(c=>c.activo!==0).length > 0 && (
                    <div className="form-group">
                      <label className="form-label">Profesional</label>
                      <select className="form-input" value={form.profesional_id} onChange={e => {
                        const profesionalId = e.target.value
                        const prof = colaboradores.find(c => c.id === profesionalId)
                        setForm(f => ({
                          ...f,
                          profesional_id: profesionalId,
                          duracion_minutos: prof?.duracion_default || f.duracion_minutos
                        }))
                      }}>
                        <option value="">Sin asignar</option>
                        {colaboradores.filter(c=>c.activo!==0).map(c=>(
                          <option key={c.id} value={c.id}>{c.nombre} {c.apellido}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Notas internas</label>
                    <textarea className="form-input" rows={2} value={form.notas} onChange={setField('notas')} placeholder="" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sesiones autorizadas</label>
                    <input className="form-input" type="number" min="1" max="999" placeholder=""
                      value={form.sesiones_autorizadas}
                      onChange={e => setForm(f=>({...f,sesiones_autorizadas:e.target.value?Number(e.target.value):''}))} />
                    <div className="form-hint">Muestra "Sesión X/Y" al cobrar</div>
                  </div>
                </div>

                {error && <div className="alert alert-danger">{error}</div>}
              </div>
              <div className="modal-footer">
                {selected && <button type="button" className="btn btn-danger btn-sm" onClick={() => handleCancel(selected.id)}>Cancelar turno</button>}
                {selected && selected.estado!=='completado' && <button type="button" className="btn btn-success btn-sm" onClick={() => { setModal(false); openCobro(selected) }}>💰 Cobrar</button>}
                <div style={{flex:1}} />
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cerrar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Guardando...':selected?'Actualizar':'Crear turno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Sub-modal: nuevo paciente ────────────────────────────────────── */}
      {modalNuevoPac && (
        <div className="modal-overlay" style={{zIndex:9999}}>
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">👤 Alta rápida de paciente</span>
              <button className="btn-close" onClick={() => setModalNuevoPac(false)}>✕</button>
            </div>
            <form onSubmit={handleNuevoPaciente}>
              <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" required value={nuevoPacForm.nombre} onChange={e => setNuevoPacForm(f=>({...f,nombre:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido <span className="req">*</span></label>
                    <input className="form-input" required value={nuevoPacForm.apellido} onChange={e => setNuevoPacForm(f=>({...f,apellido:e.target.value}))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={nuevoPacForm.telefono} onChange={e => setNuevoPacForm(f=>({...f,telefono:e.target.value}))} placeholder="" />
                </div>
                <div className="form-group">
                  <label className="form-label">Obra social</label>
                  <input className="form-input" value={nuevoPacForm.obra_social} onChange={e => setNuevoPacForm(f=>({...f,obra_social:e.target.value}))} placeholder="" />
                </div>
                {nuevoPacError && <div className="alert alert-danger">{nuevoPacError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalNuevoPac(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={nuevoPacSaving}>{nuevoPacSaving?'Guardando...':'Crear y seleccionar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal cobro ─────────────────────────────────────────────────── */}
      {modalCobro && turnoACobrar && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">💰 Cobrar turno</span>
              <button className="btn-close" onClick={() => { setModalCobro(false); setTurnoACobrar(null) }}>✕</button>
            </div>
            <form onSubmit={handleCobro}>
              <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="alert alert-info" style={{fontSize:'.82rem'}}>
                  Paciente: <strong>{turnoACobrar.paciente_nombre}</strong>
                  {turnoACobrar.motivo && <> — {turnoACobrar.motivo}</>}
                  {turnoACobrar.sesiones_autorizadas && (
                    <div style={{marginTop:6,fontWeight:700,color:'#1D4ED8'}}>
                      Sesión {turnoACobrar.sesion_numero??'?'} de {turnoACobrar.sesiones_autorizadas} autorizadas
                      {turnoACobrar.sesion_numero >= turnoACobrar.sesiones_autorizadas && <span style={{marginLeft:8,color:'#DC2626'}}>⚠ Última sesión</span>}
                    </div>
                  )}
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Monto total <span className="req">*</span></label>
                    <input className="form-input" type="number" min="0" required value={cobroForm.monto} onChange={e => setCobroForm(f=>({...f,monto:e.target.value}))} placeholder="$0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Método de pago</label>
                    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:4}}>
                      {[['efectivo','Efectivo'],['transferencia','Transf.'],['tarjeta_debito','Débito'],['tarjeta_credito','Crédito'],['obra_social','OS']].map(([val,lbl])=>(
                        <button key={val} type="button" className={`btn btn-sm ${cobroForm.metodo_pago===val?'btn-primary':'btn-ghost'}`}
                          onClick={() => setCobroForm(f=>({...f,metodo_pago:val}))}>{lbl}</button>
                      ))}
                    </div>
                  </div>
                </div>
                {cobroForm.metodo_pago==='obra_social' && (
                  <div className="form-row cols-2">
                    <div className="form-group">
                      <label className="form-label">Monto OS</label>
                      <input className="form-input" type="number" min="0" value={cobroForm.monto_os} onChange={e=>setCobroForm(f=>({...f,monto_os:e.target.value}))} placeholder="$0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Copago</label>
                      <input className="form-input" type="number" min="0" value={cobroForm.monto_copago} onChange={e=>setCobroForm(f=>({...f,monto_copago:e.target.value}))} placeholder="$0" />
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={cobroForm.concepto} onChange={e=>setCobroForm(f=>({...f,concepto:e.target.value}))} placeholder="" />
                </div>
                {cobroError && <div className="alert alert-danger">{cobroError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setModalCobro(false); setTurnoACobrar(null) }}>Omitir por ahora</button>
                <button type="submit" className="btn btn-success" disabled={cobroSaving}>{cobroSaving?'Registrando...':'Registrar cobro'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal confirm genérico ──────────────────────────────────────── */}
      {modalConfirm && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-body" style={{padding:24}}>
              <p style={{fontSize:'.95rem',marginBottom:20}}>{modalConfirm.msg}</p>
              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button className="btn btn-ghost" onClick={() => setModalConfirm(null)}>Cancelar</button>
                <button className="btn btn-danger" onClick={async()=>{ setModalConfirm(null); try { await modalConfirm.onConfirm() } catch {} }}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Consultation Panel ─────────────────────────────────────── */}
      {consultaOpen && consultaTurno && (
        <ConsultaPanel
          turno={consultaTurno}
          onClose={closeConsulta}
          onUpdated={handleConsultaUpdated}
        />
      )}
    </div>
  )
}
