import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import Odontograma from '../components/Odontograma'
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

function getWhatsAppUrl(tel) {
  if (!tel) return null
  const num = tel.replace(/\D/g, '')
  const normalized = num.startsWith('549') ? num : num.startsWith('54') ? `549${num.slice(2)}` : `549${num}`
  return `https://wa.me/${normalized}`
}

const ESTADOS_OD = [
  'sano','caries','obturado','corona','endodoncia',
  'extraccion_indicada','extraido','implante','fractura',
  'ausente_congenito','a_tratar','protesis_fija','protesis_removible'
]
const ESTADO_LABEL = { sano:'Sano', caries:'Caries', obturado:'Obturado', corona:'Corona', endodoncia:'Endodoncia', extraccion_indicada:'Extracción indicada', extraido:'Extraído', implante:'Implante', fractura:'Fractura', ausente_congenito:'Aus. congénito', a_tratar:'A tratar', protesis_fija:'Prótesis fija', protesis_removible:'Prótesis removible' }

const ENFERMEDADES_LIST = [
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'hipertension', label: 'Hipertensión' },
  { key: 'cardiopatias', label: 'Cardiopatías' },
  { key: 'epilepsia', label: 'Epilepsia' },
  { key: 'hiv', label: 'VIH/SIDA' },
  { key: 'hepatitis', label: 'Hepatitis' },
  { key: 'asma', label: 'Asma' },
  { key: 'otras', label: 'Otras (especificar en notas)' },
]

// Normalize enfermedades: handles legacy array format ["cardiopatia"] and current object format {cardiopatias: true}
const ENF_KEY_MAP = { cardiopatia: 'cardiopatias', cardiopatías: 'cardiopatias', hipertensión: 'hipertension' }
function parseEnfermedades(raw) {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    if (Array.isArray(parsed)) {
      const obj = {}
      parsed.forEach(k => { const norm = ENF_KEY_MAP[k] || k; obj[norm] = true })
      return obj
    }
    return (typeof parsed === 'object' && parsed !== null) ? parsed : {}
  } catch { return {} }
}

const INDICACIONES_TEMPLATES = {
  extraccion: `INDICACIONES POST-EXTRACCIÓN\n\n1. Morder la gasa durante 30 minutos. Si hay sangrado, reemplazar con gasa limpia.\n2. NO enjuagarse la boca durante las primeras 24 horas.\n3. Aplicar hielo en la zona (20 min con hielo, 20 min sin hielo) las primeras 6 horas.\n4. Dieta blanda y fría las primeras 24 horas. Evitar alimentos calientes, duros o picantes.\n5. NO fumar ni consumir alcohol durante las primeras 48 horas.\n6. Tomar la medicación indicada según lo prescrito.\n7. Evitar esfuerzo físico intenso durante 24 horas.\n8. Si el sangrado no cede, hay dolor intenso o fiebre, comunicarse con el consultorio.`,
  cirugia: `INDICACIONES POST-OPERATORIAS\n\n1. Morder la gasa durante 1 hora. Reemplazar si hay sangrado activo.\n2. Aplicar hielo en la zona durante las primeras 48 horas (20 min con hielo, 20 min sin).\n3. Dieta líquida y blanda las primeras 48 horas. NO alimentos calientes, duros ni picantes.\n4. NO escupir, NO hacer buches ni aspirar por bombilla durante 3 días.\n5. NO fumar ni consumir alcohol durante al menos 72 horas.\n6. Tomar la medicación recetada en los horarios indicados. No interrumpir el antibiótico.\n7. Cepillar con cuidado evitando la zona operada durante 3–5 días.\n8. Evitar esfuerzo físico durante 24–48 horas.\n9. Puede haber hinchazón las primeras 48 horas, es normal.\n10. Si hay fiebre >38°C, sangrado persistente o mal olor, comunicarse urgente con el consultorio.`,
  blanqueamiento: `INDICACIONES POST-BLANQUEAMIENTO\n\n1. Evitar alimentos y bebidas que manchen durante 48 horas:\n   - Evitar: café, té, vino tinto, mate, gaseosas oscuras, salsas con tomate.\n   - Permitido: arroz, pollo, queso blanco, papa, pera, agua.\n2. Es normal sentir sensibilidad 24–48 horas. Es temporaria.\n3. Si hay sensibilidad, puede tomar ibuprofeno o paracetamol según indicación.\n4. NO fumar durante las primeras 48 horas.\n5. Cepillado suave con pasta para sensibles los primeros días.\n6. Evitar alimentos/bebidas muy calientes o muy frías durante 24–48 horas.\n7. El resultado final se aprecia a las 2–3 semanas.\n8. Para mantener el resultado: buena higiene, evitar hábitos que manchen, controles periódicos.`,
}

const METODO_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta_debito: 'Tarjeta Débito', tarjeta_credito: 'Tarjeta Crédito', obra_social: 'Obra Social', cheque: 'Cheque', mercadopago: 'MercadoPago', otro: 'Otro' }

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n ?? 0)
}
function calcEdad(fn) {
  if (!fn) return null
  return Math.floor((Date.now() - new Date(fn)) / (1000*60*60*24*365.25))
}

export default function PacienteDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { configuracion, user } = useAuth()
  const addToast = useToast()
  const [tab, setTab] = useState(() => user?.rol === 'recepcionista' ? 'turnos' : 'hc')

  // Adjuntos (agrupados por evolucion_id en el frontend)
  const [adjuntos, setAdjuntos] = useState([])
  // Upload desde modal evolución
  const [evolAdjFile, setEvolAdjFile] = useState(null)
  const [evolAdjUploading, setEvolAdjUploading] = useState(false)
  const [paciente, setPaciente] = useState(null)
  const [piezas, setPiezas] = useState({})
  const [evoluciones, setEvoluciones] = useState([])
  const [pagos, setPagos] = useState([])
  const [presupuestos, setPresupuestos] = useState([])
  const [turnos, setTurnos] = useState([])
  const [prestaciones, setPrestaciones] = useState([])
  const [anamnesis, setAnamnesis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  // Edición de paciente
  const [editPaciente, setEditPaciente] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)

  // Pieza seleccionada
  const [piezaSel, setPiezaSel] = useState(null)
  const [piezaEstado, setPiezaEstado] = useState('sano')
  const [piezaNota, setPiezaNota] = useState('')

  // Modal evolución
  const [modalEvol, setModalEvol] = useState(false)
  const [editEvol, setEditEvol] = useState(null) // evolución que se edita
  const [evolForm, setEvolForm] = useState({ descripcion: '', prestacion_nombre: '', monto: '', piezas_tratadas: '' })

  // Modal pago
  const [modalPago, setModalPago] = useState(false)
  const [pagoForm, setPagoForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })

  // Modal turno (desde ficha)
  const [modalTurno, setModalTurno] = useState(false)
  const [editTurno, setEditTurno] = useState(null)
  const [turnoForm, setTurnoForm] = useState({ fecha_hora: '', duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '', sesiones_autorizadas: '' })

  // Modal cobro (turno completado)
  const [modalCobro, setModalCobro] = useState(false)
  const [turnoACobrar, setTurnoACobrar] = useState(null)
  const [cobroForm, setCobroForm] = useState({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })
  const [cobroSaving, setCobroSaving] = useState(false)
  const [cobroError, setCobroError] = useState('')

  // Anamnesis
  const [editAnamnesis, setEditAnamnesis] = useState(false)
  const [anamnesisForm, setAnamnesisForm] = useState({
    motivo_consulta: '', enfermedades: {}, medicacion: [], alergias: {}, alergias_otras: '',
    embarazada: false, fumador: false, anticoagulantes: false, marcapasos: false,
    ultima_visita_medico: '', cirugias_previas: '', antecedentes_odontologicos: '', firma_fecha: ''
  })
  const [medicacionInput, setMedicacionInput] = useState('')

  const ALERGIAS_LIST = [
    { key: 'anestesicos', label: 'Anestésicos locales' },
    { key: 'latex', label: 'Látex' },
    { key: 'penicilina', label: 'Penicilina/antibióticos' },
    { key: 'aines', label: 'AINEs (ibuprofeno, etc.)' },
    { key: 'otras', label: 'Otras' },
  ]

  // Receta
  const [modalReceta, setModalReceta] = useState(false)
  const [recetaMeds, setRecetaMeds] = useState([{ medicamento: '', concentracion: '', forma: '', dosis: '', posologia: '', cantidad: '', dias: '' }])
  const [recetaIndicaciones, setRecetaIndicaciones] = useState('')
  const [recetaSaving, setRecetaSaving] = useState(false)
  const [recetaProfesional, setRecetaProfesional] = useState(null) // profesional seleccionado para firma
  const [colaboradoresAll, setColaboradoresAll] = useState([])

  // Indicaciones post-operatorias
  const [modalIndicaciones, setModalIndicaciones] = useState(false)
  const [indicacionesTipo, setIndicacionesTipo] = useState('extraccion')
  const [indicacionesTexto, setIndicacionesTexto] = useState('')

  const [saving, setSaving] = useState(false)
  const [modalConfirm, setModalConfirm] = useState(null) // { msg, onConfirm, danger? }

  // NPS survey
  const [showNPS, setShowNPS] = useState(null) // turno cobrado

  // Planes de pago
  const [planesPago, setPlanesPago] = useState([])
  const [planesCuotas, setPlanesCuotas] = useState({}) // planId → cuotas[]
  const [modalPlan, setModalPlan] = useState(false)
  const [planForm, setPlanForm] = useState({ concepto: '', monto_total: '', cuotas: 3, fecha_inicio: '' })
  const [planSaving, setPlanSaving] = useState(false)
  const [planError, setPlanError] = useState('')

  useEffect(() => { loadAll() }, [id])

  useEffect(() => {
    if (tab !== 'cuotas') return
    planesPago.filter(p => p.estado === 'activo').forEach(plan => {
      if (planesCuotas[plan.id]) return
      api.planesPago.get(plan.id).then(full => {
        setPlanesCuotas(prev => ({ ...prev, [plan.id]: full?.cuotas ?? [] }))
      }).catch(() => {})
    })
  }, [tab, planesPago])

  async function loadAll() {
    setLoading(true)
    setLoadError(null)
    // 8-second timeout safety net
    const withTimeout = (promise, ms = 8000) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado. Verificá tu conexión.')), ms)
      )
      return Promise.race([promise, timeout])
    }
    // Fetch patient with Cache-Control: no-cache to bypass stale SW cache
    const token = localStorage.getItem('ds_token')
    const pacientePromise = fetch(`/api/pacientes/${id}`, {
      headers: { 'Authorization': token ? `Bearer ${token}` : '', 'Cache-Control': 'no-cache' },
    }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error ?? `Error ${r.status}`)
      return d?.data ?? d
    })
    try {
      const pacienteData = await withTimeout(pacientePromise)
      if (!pacienteData || pacienteData.error) throw new Error(pacienteData?.error ?? 'Paciente no encontrado')
      const results = await Promise.allSettled([
        Promise.resolve(pacienteData),
        api.odontograma.get(id),
        api.evoluciones.list(id),
        api.pagos.list({ paciente_id: id }),
        api.presupuestos.list(id),
        api.turnos.list({ paciente_id: id }),
        api.prestaciones.list(),
        api.anamnesis.get(id),
        api.planesPago.list(id),
      ])
      const val = (i) => results[i].status === 'fulfilled' ? results[i].value : null
      const pac = val(0)
      setPaciente(pac)
      if (pac) {
        setEditForm({
          nombre: pac.nombre, apellido: pac.apellido, dni: pac.dni ?? '',
          fecha_nacimiento: pac.fecha_nacimiento ?? '', sexo: pac.sexo ?? '',
          telefono: pac.telefono ?? '', telefono_alternativo: pac.telefono_alternativo ?? '',
          email: pac.email ?? '', direccion: pac.direccion ?? '', ciudad: pac.ciudad ?? '',
          obra_social: pac.obra_social ?? '', numero_afiliado: pac.numero_afiliado ?? '',
          plan_obra_social: pac.plan_obra_social ?? '', alergias: pac.alergias ?? '',
          medicacion_actual: pac.medicacion_actual ?? '', antecedentes_medicos: pac.antecedentes_medicos ?? '',
          notas: pac.notas ?? '',
        })
      }
      const od = val(1)
      const map = {}; (od ?? []).forEach(p => { map[p.numero_pieza] = p }); setPiezas(map)
      setEvoluciones(val(2) ?? [])
      setPagos(val(3) ?? [])
      setPresupuestos(val(4) ?? [])
      setTurnos(val(5) ?? [])
      setPrestaciones(val(6) ?? [])
      setPlanesPago(val(8) ?? [])
      const anam = val(7)
      setAnamnesis(anam)
      if (anam) {
        let enfermedades = {}
        let medicacion = []
        let alergias = {}
        let alergias_otras = ''
        try { enfermedades = JSON.parse(anam.enfermedades ?? '{}') } catch {}
        try { medicacion = JSON.parse(anam.medicacion ?? '[]') } catch {}
        try {
          const a = JSON.parse(anam.alergias ?? '{}')
          if (typeof a === 'object' && !Array.isArray(a)) { alergias = a; alergias_otras = a._otras ?? '' }
          else alergias_otras = String(anam.alergias ?? '')
        } catch { alergias_otras = anam.alergias ?? '' }
        setAnamnesisForm({
          motivo_consulta: anam.motivo_consulta ?? '',
          enfermedades,
          medicacion,
          alergias,
          alergias_otras,
          embarazada: !!anam.embarazada,
          fumador: !!anam.fumador,
          anticoagulantes: !!anam.anticoagulantes,
          marcapasos: !!anam.marcapasos,
          ultima_visita_medico: anam.ultima_visita_medico ?? '',
          cirugias_previas: anam.cirugias_previas ?? '',
          antecedentes_odontologicos: anam.antecedentes_odontologicos ?? '',
          firma_fecha: anam.firma_fecha ?? '',
        })
      }
      api.adjuntos.list(id).then(setAdjuntos).catch(() => {})
    } catch (err) {
      setLoadError(err.message || 'No se pudo cargar la ficha del paciente.')
    } finally { setLoading(false) }
  }

  async function handlePiezaClick(num) {
    const current = piezas[num]
    setPiezaSel(num)
    setPiezaEstado(current?.estado ?? 'sano')
    setPiezaNota(current?.notas ?? '')
  }

  async function savePieza() {
    setSaving(true)
    try {
      const result = await api.odontograma.save({ paciente_id: id, numero_pieza: piezaSel, estado: piezaEstado, notas: piezaNota })
      setPiezas(prev => ({ ...prev, [piezaSel]: result }))
      setPiezaSel(null)
    } finally { setSaving(false) }
  }

  async function handleEditPacienteSave(e) {
    e.preventDefault()
    setEditSaving(true)
    try {
      const updated = await api.pacientes.update(id, editForm)
      setPaciente(p => ({ ...p, ...updated }))
      setEditPaciente(false)
      addToast('Datos del paciente actualizados', 'success')
    } catch (err) { addToast('No se pudo guardar el paciente. Nombre y apellido son obligatorios.', 'error') }
    finally { setEditSaving(false) }
  }

  async function handleEvolSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        paciente_id: id,
        descripcion: evolForm.descripcion,
        prestacion_id: null,
        prestacion_nombre: evolForm.prestacion_nombre || null,
        monto: Number(evolForm.monto) || 0,
        piezas_tratadas: JSON.stringify(evolForm.piezas_tratadas ? evolForm.piezas_tratadas.split(',').map(x => parseInt(x.trim())).filter(Boolean) : []),
      }
      let evolId = editEvol?.id
      if (editEvol) {
        const updated = await api.evoluciones.update(editEvol.id, payload)
        setEvoluciones(prev => prev.map(ev => ev.id === editEvol.id ? { ...ev, ...updated } : ev))
        addToast('Evolución actualizada', 'success')
      } else {
        const ev = await api.evoluciones.create(payload)
        evolId = ev.id
        setEvoluciones(prev => [ev, ...prev])
        addToast('Evolución registrada', 'success')
      }
      // Subir archivo adjunto si hay uno seleccionado
      if (evolAdjFile && evolId) {
        setEvolAdjUploading(true)
        try {
          const fd = new FormData()
          fd.append('file', evolAdjFile)
          fd.append('paciente_id', String(id))
          fd.append('evolucion_id', String(evolId))
          const nuevoAdj = await api.adjuntos.upload(fd)
          setAdjuntos(prev => [nuevoAdj, ...prev])
          addToast('Archivo adjuntado', 'success')
        } catch (e) {
          addToast(e.message ?? 'Error al subir archivo', 'error')
        } finally {
          setEvolAdjUploading(false)
          setEvolAdjFile(null)
        }
      }
      setModalEvol(false)
      setEditEvol(null)
      setEvolForm({ descripcion: '', prestacion_nombre: '', monto: '', piezas_tratadas: '' })
    } finally { setSaving(false) }
  }

  function openEditEvol(ev) {
    setEvolAdjFile(null)
    setEditEvol(ev)
    setEvolForm({
      descripcion: ev.descripcion,
      prestacion_nombre: ev.prestacion_nombre ?? '',
      monto: ev.monto ? String(ev.monto) : '',
      piezas_tratadas: (() => { try { return (JSON.parse(ev.piezas_tratadas) || []).join(', ') } catch { return '' } })(),
    })
    setModalEvol(true)
  }

  async function handlePagoSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const pagoData = {
        paciente_id: id,
        monto: Number(pagoForm.monto),
        metodo_pago: pagoForm.metodo_pago,
        concepto: pagoForm.concepto,
      }
      if (pagoForm.metodo_pago === 'obra_social') {
        pagoData.monto_os = Number(pagoForm.monto_os) || 0
        pagoData.monto_copago = Number(pagoForm.monto_copago) || 0
      }
      const p = await api.pagos.create(pagoData)
      setPagos(prev => [p, ...prev])
      setPaciente(pac => ({ ...pac, saldo: (pac.saldo ?? 0) + Number(pagoForm.monto) }))
      setModalPago(false)
      setPagoForm({ monto: '', metodo_pago: 'efectivo', concepto: '', monto_os: 0, monto_copago: 0 })
    } finally { setSaving(false) }
  }

  // Turnos desde ficha
  function openNewTurno() {
    setEditTurno(null)
    const now = new Date()
    now.setMinutes(0, 0, 0)
    now.setHours(now.getHours() + 1)
    setTurnoForm({ fecha_hora: format(now, "yyyy-MM-dd'T'HH:mm"), duracion_minutos: 60, motivo: '', prestacion_id: '', estado: 'programado', notas: '', sesiones_autorizadas: '' })
    setModalTurno(true)
  }

  function openEditTurno(t) {
    setEditTurno(t)
    setTurnoForm({
      fecha_hora: format(new Date(t.fecha_hora), "yyyy-MM-dd'T'HH:mm"),
      duracion_minutos: t.duracion_minutos ?? 60,
      motivo: t.motivo ?? '',
      prestacion_id: t.prestacion_id ?? '',
      estado: t.estado,
      notas: t.notas ?? '',
      sesiones_autorizadas: t.sesiones_autorizadas ?? '',
    })
    setModalTurno(true)
  }

  function openCobro(t) {
    const prestacion = prestaciones.find(p => p.id === t.prestacion_id)
    const montoBase = prestacion?.precio ?? 0
    setTurnoACobrar(t)
    setCobroForm({
      monto: String(montoBase),
      metodo_pago: 'efectivo',
      concepto: prestacion ? prestacion.nombre : (t.motivo || 'Consulta'),
      monto_os: 0,
      monto_copago: 0,
    })
    setCobroError('')
    setModalCobro(true)
  }

  async function handleCobro(e) {
    e.preventDefault()
    if (!cobroForm.monto || Number(cobroForm.monto) <= 0) { setCobroError('Ingresá un monto válido'); return }
    setCobroSaving(true); setCobroError('')
    try {
      const pagoData = {
        paciente_id: id,
        monto: Number(cobroForm.monto),
        metodo_pago: cobroForm.metodo_pago,
        concepto: cobroForm.concepto || 'Consulta',
        turno_id: turnoACobrar.id,
      }
      if (cobroForm.metodo_pago === 'obra_social') {
        pagoData.monto_os = Number(cobroForm.monto_os) || 0
        pagoData.monto_copago = Number(cobroForm.monto_copago) || 0
      }
      const p = await api.pagos.create(pagoData)
      setPagos(prev => [p, ...prev])
      setPaciente(pac => ({ ...pac, saldo: (pac.saldo ?? 0) + Number(cobroForm.monto) }))
      addToast('Pago registrado correctamente', 'success')
      // Auto-completar turno si estaba en presente
      if (turnoACobrar.estado === 'presente') {
        const upd = await api.turnos.update(turnoACobrar.id, { estado: 'completado' }).catch(() => null)
        if (upd) setTurnos(prev => prev.map(t => t.id === turnoACobrar.id ? { ...t, ...upd } : t))
      }
      setModalCobro(false)
      // Ofrecer encuesta NPS por WhatsApp si tiene teléfono
      if (paciente?.telefono) {
        setShowNPS(turnoACobrar)
      } else {
        setTurnoACobrar(null)
      }
    } catch (err) { setCobroError('No se pudo registrar el pago. Verificá que el monto sea mayor a cero.') }
    finally { setCobroSaving(false) }
  }

  async function handleTurnoSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { ...turnoForm, paciente_id: id, duracion_minutos: Number(turnoForm.duracion_minutos) || 60 }
      if (!payload.prestacion_id) delete payload.prestacion_id
      if (editTurno) {
        const updated = await api.turnos.update(editTurno.id, payload)
        setTurnos(prev => prev.map(t => t.id === editTurno.id ? { ...t, ...updated } : t))
        setModalTurno(false)
        addToast('Turno actualizado', 'success')
        // Si se marcó como completado, abrir modal cobro
        if (payload.estado === 'completado' && editTurno.estado !== 'completado') {
          openCobro({ ...editTurno, ...updated })
        }
      } else {
        const created = await api.turnos.create(payload)
        setTurnos(prev => [created, ...prev])
        setModalTurno(false)
        addToast('Turno creado', 'success')
      }
    } catch (err) { addToast('No se pudo guardar el turno. Verificá que la fecha/hora sean válidas.', 'error') }
    finally { setSaving(false) }
  }

  async function handleCancelTurno(turnoId) {
    setModalConfirm({
      msg: '¿Cancelar este turno?',
      onConfirm: async () => {
        await api.turnos.cancel(turnoId)
        setTurnos(prev => prev.map(t => t.id === turnoId ? { ...t, estado: 'cancelado' } : t))
        setModalTurno(false)
        addToast('Turno cancelado', 'info')
      }
    })
  }

  // Anamnesis
  async function handleAnamnesisSubmit(e) {
    e.preventDefault()
    setSaving(true)
    try {
      const alergiasSerialized = JSON.stringify({ ...anamnesisForm.alergias, _otras: anamnesisForm.alergias_otras })
      const result = await api.anamnesis.save({
        paciente_id: id,
        motivo_consulta: anamnesisForm.motivo_consulta,
        enfermedades: anamnesisForm.enfermedades,
        medicacion: anamnesisForm.medicacion,
        alergias: alergiasSerialized,
        embarazada: anamnesisForm.embarazada,
        fumador: anamnesisForm.fumador,
        anticoagulantes: anamnesisForm.anticoagulantes,
        marcapasos: anamnesisForm.marcapasos,
        ultima_visita_medico: anamnesisForm.ultima_visita_medico,
        cirugias_previas: anamnesisForm.cirugias_previas,
        antecedentes_odontologicos: anamnesisForm.antecedentes_odontologicos,
        firma_fecha: anamnesisForm.firma_fecha || new Date().toISOString().split('T')[0],
      })
      setAnamnesis(result)
      setEditAnamnesis(false)
    } catch (err) { addToast('No se pudo guardar la anamnesis. Intentá nuevamente.', 'error') }
    finally { setSaving(false) }
  }

  function toggleEnfermedad(key) {
    setAnamnesisForm(f => ({ ...f, enfermedades: { ...f.enfermedades, [key]: !f.enfermedades[key] } }))
  }

  function addMedicacion() {
    if (!medicacionInput.trim()) return
    setAnamnesisForm(f => ({ ...f, medicacion: [...f.medicacion, medicacionInput.trim()] }))
    setMedicacionInput('')
  }

  function removeMedicacion(idx) {
    setAnamnesisForm(f => ({ ...f, medicacion: f.medicacion.filter((_, i) => i !== idx) }))
  }

  // Presupuestos
  const [modalPresupuesto, setModalPresupuesto] = useState(false)
  const [presupuestoDetalle, setPresupuestoDetalle] = useState(null) // presupuesto abierto para ver/editar
  const [presupuestoDetalleData, setPresupuestoDetalleData] = useState(null) // datos completos con items
  const [presupuestoForm, setPresupuestoForm] = useState({ notas: '', fecha_vencimiento: '' })
  const [presupuestoItems, setPresupuestoItems] = useState([{ prestacion_id: '', descripcion: '', cantidad: 1, precio_unitario: '' }])
  const [presupuestoSaving, setPresupuestoSaving] = useState(false)

  // Modal: presupuesto aprobado → generar turnos
  const [modalGenTurnos, setModalGenTurnos] = useState(false)
  const [presupAprobado, setPresupAprobado] = useState(null) // presupuesto que se aprobó
  const [genTurnosSaving, setGenTurnosSaving] = useState(false)

  function openNuevoPresupuesto() {
    setPresupuestoForm({ notas: '', fecha_vencimiento: '' })
    setPresupuestoItems([{ prestacion_id: '', descripcion: '', cantidad: 1, precio_unitario: '' }])
    setPresupuestoDetalle(null)
    setModalPresupuesto(true)
  }

  async function openPresupuestoDetalle(p) {
    try {
      const data = await api.presupuestos.get(p.id)
      setPresupuestoDetalleData(data)
      setPresupuestoDetalle(p)
      setPresupuestoItems((data.items ?? []).map(i => ({
        prestacion_id: i.prestacion_id ?? '',
        descripcion: i.descripcion ?? '',
        cantidad: i.cantidad ?? 1,
        precio_unitario: String(i.precio_unitario ?? 0),
      })))
      setPresupuestoForm({ notas: data.notas ?? '', fecha_vencimiento: data.fecha_vencimiento ?? '' })
      setModalPresupuesto(true)
    } catch (e) { addToast(e.message, 'error') }
  }

  function addPresupuestoItem() {
    setPresupuestoItems(prev => [...prev, { prestacion_id: '', descripcion: '', cantidad: 1, precio_unitario: '' }])
  }

  function removePresupuestoItem(idx) {
    setPresupuestoItems(prev => prev.filter((_, i) => i !== idx))
  }

  function setPresupuestoItem(idx, k, v) {
    setPresupuestoItems(prev => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item))
  }

  const presupuestoTotal = presupuestoItems.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0)

  async function handlePresupuestoSave(e) {
    e.preventDefault()
    const items = presupuestoItems.filter(i => i.descripcion.trim())
    if (!items.length) { addToast('Agregá al menos un ítem con descripción', 'warning'); return }
    setPresupuestoSaving(true)
    try {
      const payload = {
        paciente_id: id,
        items: items.map(i => ({
          prestacion_id: i.prestacion_id || null,
          descripcion: i.descripcion,
          cantidad: Number(i.cantidad) || 1,
          precio_unitario: Number(i.precio_unitario) || 0,
        })),
        notas: presupuestoForm.notas || null,
        fecha_vencimiento: presupuestoForm.fecha_vencimiento || null,
        estado: presupuestoForm.estado ?? (presupuestoDetalle ? presupuestoDetalle.estado : 'pendiente'),
      }
      const estadoAnterior = presupuestoDetalle?.estado
      if (presupuestoDetalle) {
        const updated = await api.presupuestos.update(presupuestoDetalle.id, payload)
        setPresupuestos(prev => prev.map(p => p.id === presupuestoDetalle.id ? { ...p, ...updated } : p))
        // Si se aprobó → ofrecer generar turnos
        if (payload.estado === 'aprobado' && estadoAnterior !== 'aprobado') {
          setPresupAprobado({ ...presupuestoDetalle, ...updated })
          setModalPresupuesto(false)
          setModalGenTurnos(true)
          return
        }
      } else {
        const created = await api.presupuestos.create(payload)
        setPresupuestos(prev => [created, ...prev])
      }
      setModalPresupuesto(false)
    } catch (err) { addToast(`No se pudo guardar el presupuesto. ${err.message}`, 'error') }
    finally { setPresupuestoSaving(false) }
  }

  function printPresupuesto(pres, items) {
    window.print()
  }

  // Receta
  function openReceta() {
    setRecetaMeds([{ medicamento: '', concentracion: '', forma: '', dosis: '', posologia: '', cantidad: '', dias: '' }])
    setRecetaIndicaciones('')
    setRecetaProfesional(null)
    // Cargar colaboradores profesionales para elegir quién firma
    api.colaboradores.list().then(cols => {
      setColaboradoresAll((cols ?? []).filter(c => c.rol === 'profesional' && c.activo !== 0))
    }).catch(() => {})
    setModalReceta(true)
  }

  function addMedReceta() {
    setRecetaMeds(m => [...m, { medicamento: '', concentracion: '', forma: '', dosis: '', posologia: '', cantidad: '', dias: '' }])
  }

  function setRecetaMed(idx, k, v) {
    setRecetaMeds(ms => ms.map((m, i) => i === idx ? { ...m, [k]: v } : m))
  }

  function removeRecetaMed(idx) {
    setRecetaMeds(ms => ms.filter((_, i) => i !== idx))
  }

  async function guardarEImprimirReceta() {
    // Guardar en DB antes de imprimir
    const medsValidos = recetaMeds.filter(m => m.medicamento.trim())
    if (medsValidos.length > 0) {
      setRecetaSaving(true)
      try {
        const prof = recetaProfesional
        await api.recetas.create({
          paciente_id: id,
          medicamentos: medsValidos,
          indicaciones: recetaIndicaciones,
          profesional_nombre: prof ? `${prof.nombre} ${prof.apellido ?? ''}`.trim() : configuracion?.nombre_profesional,
          profesional_matricula: prof ? prof.matricula ?? '' : configuracion?.matricula,
        })
        addToast('Receta guardada en el historial del paciente', 'success')
      } catch (e) {
        addToast('No se pudo guardar la receta, pero podés imprimirla igual', 'warning')
      } finally {
        setRecetaSaving(false)
      }
    }
    window.print()
  }

  function openIndicaciones(tipo) {
    setIndicacionesTipo(tipo)
    setIndicacionesTexto(INDICACIONES_TEMPLATES[tipo])
    setModalIndicaciones(true)
  }

  function printIndicaciones() {
    window.print()
  }

  async function handleGenerarTurnos() {
    if (!presupAprobado || !presupuestoDetalleData) return
    setGenTurnosSaving(true)
    try {
      const items = (presupuestoDetalleData.items ?? []).filter(i => i.descripcion)
      let fecha = new Date()
      fecha.setHours(9, 0, 0, 0)
      fecha = addDays(fecha, 1)
      for (const item of items) {
        await api.turnos.create({
          paciente_id: id,
          fecha_hora: format(fecha, "yyyy-MM-dd'T'HH:mm"),
          duracion_minutos: 60,
          motivo: item.descripcion,
          estado: 'programado',
        })
        fecha = addDays(fecha, 7)
      }
      const nuevosTurnos = await api.turnos.list({ paciente_id: id }).catch(() => turnos)
      setTurnos(nuevosTurnos ?? turnos)
      setModalGenTurnos(false)
      setPresupAprobado(null)
      setTab('turnos')
    } catch (err) { addToast('No se pudieron crear todos los turnos. Intentá nuevamente.', 'error') }
    finally { setGenTurnosSaving(false) }
  }

  if (loading) return (
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <span className="spinner" style={{ width: 40, height: 40 }} />
      <div style={{ marginTop: 16, color: 'var(--c-text-3)', fontSize: '.9rem' }}>Cargando ficha del paciente...</div>
    </div>
  )
  if (loadError) return (
    <div className="empty-state" style={{ paddingTop: 60 }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⚠️</div>
      <div className="empty-title" style={{ color: 'var(--c-danger)' }}>Error al cargar la ficha</div>
      <div className="empty-sub" style={{ marginBottom: 20 }}>{loadError}</div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={loadAll}>Reintentar</button>
        <button className="btn btn-ghost" onClick={() => navigate('/pacientes')}>← Volver a pacientes</button>
      </div>
    </div>
  )
  if (!paciente) return <div className="empty-state"><div className="empty-title">Paciente no encontrado</div><button className="btn btn-ghost" onClick={() => navigate('/pacientes')}>← Volver</button></div>

  const totalPagado = pagos.reduce((s, p) => s + Number(p.monto), 0)

  // Alerta anamnesis
  const anamnesisAlerta = (() => {
    if (!anamnesis) return false
    const enf = parseEnfermedades(anamnesis.enfermedades)
    return Object.values(enf).some(Boolean) || !!anamnesis.anticoagulantes || !!anamnesis.marcapasos
  })()

  return (
    <div>
      {/* CSS de impresión para recetas, presupuestos e indicaciones */}
      <style>{`
        @media print {
          /* CORRECTO: visibility:hidden permite que hijos sean visibility:visible */
          /* display:none en un padre NO puede ser sobreescrito por hijos — ese era el bug */
          body * { visibility: hidden !important; }

          /* Mostrar solo el contenido del área de impresión activa */
          .receta-print, .receta-print * { visibility: visible !important; }
          .presupuesto-print, .presupuesto-print * { visibility: visible !important; }
          .indicaciones-print, .indicaciones-print * { visibility: visible !important; }

          /* Posicionar el modal como si fuera la página */
          .receta-print,
          .presupuesto-print,
          .indicaciones-print {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            background: white !important;
            z-index: 99999 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 28px 36px !important;
          }

          /* Ocultar controles de UI: footer, close, botones de tipo */
          .modal-footer { visibility: hidden !important; height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
          .btn-close { visibility: hidden !important; }
          .indicaciones-tipo-selector { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .indicaciones-tipo-selector * { visibility: hidden !important; }
          .indicaciones-form-label { visibility: hidden !important; height: 0 !important; margin: 0 !important; }

          /* Textarea: mostrar como bloque de texto */
          .indicaciones-print textarea {
            border: none !important;
            resize: none !important;
            outline: none !important;
            background: transparent !important;
            font-family: Arial, sans-serif !important;
            font-size: 0.9rem !important;
          }

          /* Limpiar el modal overlay */
          .modal-overlay { background: none !important; }
        }
      `}</style>

      {/* Banner alerta anamnesis */}
      {anamnesisAlerta && (
        <div style={{ background: '#FFF3CD', border: '1px solid #F59E0B', borderRadius: 'var(--radius-sm)', padding: '8px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', color: '#92400E' }}>
          <span style={{ fontSize: '1rem' }}>⚠️</span>
          <strong>Ver anamnesis antes de atender</strong> — este paciente tiene enfermedades sistémicas o condiciones especiales registradas.
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', fontSize: '.75rem' }} onClick={() => setTab('anamnesis')}>Ver anamnesis</button>
        </div>
      )}

      {/* Header paciente */}
      <div className="pd-header">
        <div className="pd-avatar">{paciente.apellido[0]}{paciente.nombre[0]}</div>
        <div className="pd-info">
          <div className="pd-name">{paciente.apellido}, {paciente.nombre}</div>
          <div className="pd-meta">
            {paciente.dni && <span className="pd-meta-item">DNI {paciente.dni}</span>}
            {paciente.fecha_nacimiento && <span className="pd-meta-item">{calcEdad(paciente.fecha_nacimiento)} años</span>}
            {paciente.telefono && <span className="pd-meta-item">{paciente.telefono}</span>}
            {paciente.obra_social && <span className="pd-meta-item"><span className="badge badge-info">{paciente.obra_social}</span></span>}
            <span className="pd-meta-item">Total pagado: <strong>{fmt(totalPagado)}</strong></span>
            {paciente.saldo < 0 && <span className="pd-meta-item"><span className="badge badge-danger" style={{ fontSize: '.85rem', padding: '3px 10px' }}>Debe {fmt(Math.abs(paciente.saldo))}</span></span>}
          </div>
          {paciente.notas && <div className="text-sm text-muted mt-1">{paciente.notas}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditPaciente(true)}>Editar ficha</button>
          {getWhatsAppUrl(paciente.telefono) && (
            <a href={getWhatsAppUrl(paciente.telefono)} target="_blank" rel="noopener noreferrer"
              className="btn btn-sm"
              style={{ background: '#25D366', color: '#FFF', textDecoration: 'none' }}>
              WhatsApp
            </a>
          )}
          {user?.rol !== 'recepcionista' && (
            <button className="btn btn-ghost btn-sm" onClick={() => openReceta()}>Nueva receta</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => openIndicaciones('extraccion')}>Indicaciones</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setModalPago(true)}>+ Pago</button>
          {user?.rol !== 'recepcionista' && (
            <button className="btn btn-primary btn-sm" onClick={() => setModalEvol(true)}>+ Evolución</button>
          )}
        </div>
      </div>

      {/* Barra de info rápida */}
      {(() => {
        const ahora = new Date()
        const turnosCompletados = turnos.filter(t => t.estado === 'completado')
        const ultTurno = [...turnosCompletados].sort((a,b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))[0]
        const proxTurno = [...turnos].filter(t => new Date(t.fecha_hora) > ahora && !['cancelado','ausente'].includes(t.estado)).sort((a,b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))[0]
        const ultEvol = evoluciones[0]
        if (!ultTurno && !proxTurno && !ultEvol && !(paciente.saldo < 0) && turnosCompletados.length === 0) return null
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, marginBottom: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {turnosCompletados.length > 0 && (
              <div style={{ padding: '8px 16px', borderRight: '1px solid var(--c-border)', fontSize: '.78rem' }}>
                <div style={{ color: 'var(--c-text-3)', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Visitas totales</div>
                <div style={{ color: 'var(--c-text)', fontWeight: 700, marginTop: 2, fontSize: '.9rem' }}>{turnosCompletados.length}</div>
              </div>
            )}
            {ultTurno && (
              <div style={{ padding: '8px 16px', borderRight: '1px solid var(--c-border)', fontSize: '.78rem' }}>
                <div style={{ color: 'var(--c-text-3)', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Último turno</div>
                <div style={{ color: 'var(--c-text)', fontWeight: 500, marginTop: 2 }}>{format(new Date(ultTurno.fecha_hora), "d MMM yyyy", { locale: es })}{ultTurno.motivo ? ` — ${ultTurno.motivo}` : ''}</div>
              </div>
            )}
            {proxTurno && (
              <div style={{ padding: '8px 16px', borderRight: '1px solid var(--c-border)', fontSize: '.78rem' }}>
                <div style={{ color: 'var(--c-text-3)', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Próximo turno</div>
                <div style={{ color: 'var(--c-primary)', fontWeight: 600, marginTop: 2 }}>{format(new Date(proxTurno.fecha_hora), "d MMM yyyy, HH:mm", { locale: es })}</div>
              </div>
            )}
            {ultEvol && (
              <div style={{ padding: '8px 16px', borderRight: '1px solid var(--c-border)', fontSize: '.78rem' }}>
                <div style={{ color: 'var(--c-text-3)', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Última prestación</div>
                <div style={{ color: 'var(--c-text)', fontWeight: 500, marginTop: 2 }}>{ultEvol.prestacion_nombre || ultEvol.descripcion?.slice(0, 40) || '—'}</div>
              </div>
            )}
            {paciente.saldo < 0 && (
              <div style={{ padding: '8px 16px', fontSize: '.78rem' }}>
                <div style={{ color: 'var(--c-text-3)', fontWeight: 600, fontSize: '.68rem', textTransform: 'uppercase', letterSpacing: '.05em' }}>Deuda</div>
                <div style={{ color: 'var(--c-danger)', fontWeight: 700, marginTop: 2 }}>{fmt(Math.abs(paciente.saldo))}</div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Tabs */}
      {(() => {
        const isDental = /odontol/i.test(configuracion?.especialidad ?? '')
        const isRecep = user?.rol === 'recepcionista'
        const tabs = [
          ...(!isRecep ? [['hc','Historia Clínica'], ['anamnesis','Anamnesis']] : []),
          ...(isDental ? [['odontograma','Diagrama']] : []),
          ['turnos','Turnos'], ['presupuestos','Presupuestos'], ['pagos','Pagos'], ['cuotas','Planes de pago']
        ]
        return (
          <div className="tabs">
            {tabs.map(([k,l]) => (
              <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        )
      })()}

      {/* HISTORIA CLÍNICA */}
      {tab === 'hc' && (
        <div>
          {/* Resumen anamnesis en HC */}
          {anamnesis && (() => {
            const enf = parseEnfermedades(anamnesis.enfermedades)
            let alg = {}
            try { alg = JSON.parse(anamnesis.alergias ?? '{}') } catch {}
            const enfsActivas = ENFERMEDADES_LIST.filter(e => enf[e.key]).map(e => e.label)
            const tieneCondiciones = enfsActivas.length > 0 || anamnesis.anticoagulantes || anamnesis.marcapasos
            if (!tieneCondiciones) return null
            return (
              <div style={{ marginBottom: 12, padding: '8px 14px', background: '#FFF7ED', border: '1px solid #F97316', borderRadius: 'var(--radius-sm)', fontSize: '.82rem' }}>
                <strong style={{ color: '#C2410C' }}>Condiciones médicas relevantes:</strong>
                <span style={{ marginLeft: 8, color: '#92400E' }}>
                  {enfsActivas.join(', ')}
                  {anamnesis.anticoagulantes ? (enfsActivas.length ? ', ' : '') + 'Anticoagulantes' : ''}
                  {anamnesis.marcapasos ? ((enfsActivas.length || anamnesis.anticoagulantes) ? ', ' : '') + 'Marcapasos' : ''}
                </span>
                {Object.values(alg).some(Boolean) && (
                  <span style={{ marginLeft: 12, color: '#92400E' }}>| <strong>Alergias</strong></span>
                )}
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8, fontSize: '.72rem' }} onClick={() => setTab('anamnesis')}>Ver completo</button>
              </div>
            )
          })()}
          {user?.rol !== 'recepcionista' && (
            <div className="page-actions" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalReceta(true)}>Nueva Receta</button>
              <button className="btn btn-primary btn-sm" onClick={() => { setEditEvol(null); setEvolForm({ descripcion: '', prestacion_nombre: '', monto: '', piezas_tratadas: '' }); setEvolAdjFile(null); setModalEvol(true) }}>+ Agregar evolución</button>
            </div>
          )}
          {evoluciones.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">Sin evoluciones registradas</div></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {evoluciones.map(ev => (
                <div key={ev.id} className="card">
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="text-sm text-muted">{format(new Date(ev.fecha), "d 'de' MMMM yyyy, HH:mm", { locale: es })}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {ev.monto > 0 && <span className="badge badge-success">{fmt(ev.monto)}</span>}
                        {user?.rol !== 'recepcionista' && (
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditEvol(ev)}>Editar</button>
                        )}
                      </div>
                    </div>
                    {ev.prestacion_nombre && <div className="text-sm" style={{ color: 'var(--c-primary)', fontWeight: 600, marginBottom: 4 }}>{ev.prestacion_nombre}</div>}
                    <div style={{ fontSize: '.9rem' }}>{ev.descripcion}</div>
                    {/odontol/i.test(configuracion?.especialidad ?? '') && ev.piezas_tratadas && ev.piezas_tratadas !== '[]' && (
                      <div className="text-xs text-muted mt-1">Piezas: {ev.piezas_tratadas}</div>
                    )}
                    {/* Archivos adjuntos de esta evolución */}
                    {(() => {
                      const archivos = adjuntos.filter(a => String(a.evolucion_id) === String(ev.id))
                      if (archivos.length === 0) return null
                      return (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {archivos.map(adj => {
                            const isImage = adj.tipo_mime?.startsWith('image/')
                            const isPdf = adj.tipo_mime === 'application/pdf'
                            const icon = isImage ? '🖼️' : isPdf ? '📄' : '📎'
                            return (
                              <button key={adj.id} className="btn btn-ghost btn-sm"
                                style={{ fontSize: '.78rem', border: '1px solid var(--c-border)' }}
                                onClick={async () => {
                                  try {
                                    const blob = await api.adjuntos.getBlob(adj.id)
                                    const url = URL.createObjectURL(blob)
                                    const a = document.createElement('a')
                                    a.href = url; a.target = '_blank'; a.rel = 'noopener'
                                    if (!isImage && !isPdf) a.download = adj.nombre_archivo
                                    a.click()
                                    setTimeout(() => URL.revokeObjectURL(url), 5000)
                                  } catch { addToast('No se pudo abrir el archivo', 'error') }
                                }}>
                                {icon} {adj.nombre_archivo}
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ANAMNESIS */}
      {tab === 'anamnesis' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Anamnesis / Historia Médica</span>
            {user?.rol !== 'recepcionista' && (
              <button className="btn btn-primary btn-sm" onClick={() => setEditAnamnesis(true)}>
                {anamnesis ? 'Editar' : 'Completar anamnesis'}
              </button>
            )}
          </div>
          {!anamnesis && !editAnamnesis ? (
            <div className="empty-state"><div className="empty-icon">📋</div><div className="empty-title">Sin anamnesis registrada</div></div>
          ) : !editAnamnesis ? (
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {anamnesis.motivo_consulta && <div><strong>Motivo de consulta:</strong> <span>{anamnesis.motivo_consulta}</span></div>}
              {(() => {
                const enf = parseEnfermedades(anamnesis.enfermedades)
                const activas = ENFERMEDADES_LIST.filter(e => enf[e.key])
                if (!activas.length) return null
                return <div><strong>Enfermedades sistémicas:</strong> {activas.map(e => <span key={e.key} className="badge badge-warning" style={{ marginLeft: 4 }}>{e.label}</span>)}</div>
              })()}
              {(() => {
                let med = []
                try { med = JSON.parse(anamnesis.medicacion ?? '[]') } catch {}
                if (!med.length) return null
                return <div><strong>Medicación:</strong> {med.join(', ')}</div>
              })()}
              {(() => {
                let alerList = {}
                try { alerList = JSON.parse(anamnesis.alergias ?? '{}') } catch {}
                const alerDisplay = [
                  alerList.penicilina && 'Penicilina',
                  alerList.aspirina && 'Aspirina',
                  alerList.latex && 'Látex',
                  alerList.yodo && 'Yodo',
                  alerList._otras && alerList._otras,
                ].filter(Boolean).join(', ') || (
                  typeof alerList === 'string' ? alerList : null
                )
                if (!alerDisplay) return null
                return <div><strong>Alergias:</strong> {alerDisplay}</div>
              })()}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {!!anamnesis.embarazada && <span className="badge badge-warning">Embarazada</span>}
                {!!anamnesis.fumador && <span className="badge badge-warning">Fumador/a</span>}
                {!!anamnesis.anticoagulantes && <span className="badge badge-danger">Anticoagulantes</span>}
              </div>
              {anamnesis.cirugias_previas && <div><strong>Cirugías previas:</strong> {anamnesis.cirugias_previas}</div>}
              {anamnesis.antecedentes_odontologicos && <div><strong>Antecedentes clínicos:</strong> {anamnesis.antecedentes_odontologicos}</div>}
              {anamnesis.firma_fecha && <div className="text-sm text-muted">Fecha de firma: {anamnesis.firma_fecha}</div>}
            </div>
          ) : null}

          {/* Formulario anamnesis */}
          {editAnamnesis && (
            <form onSubmit={handleAnamnesisSubmit}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Motivo de consulta principal</label>
                  <textarea className="form-input" rows={2} value={anamnesisForm.motivo_consulta}
                    onChange={e => setAnamnesisForm(f => ({ ...f, motivo_consulta: e.target.value }))} />
                </div>

                <div className="form-group">
                  <label className="form-label">Enfermedades sistémicas</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                    {ENFERMEDADES_LIST.map(enf => (
                      <label key={enf.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.85rem' }}>
                        <input type="checkbox" checked={!!anamnesisForm.enfermedades[enf.key]}
                          onChange={() => toggleEnfermedad(enf.key)} />
                        {enf.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Medicación actual</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" value={medicacionInput} onChange={e => setMedicacionInput(e.target.value)}
                      placeholder="" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addMedicacion())} />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addMedicacion}>Agregar</button>
                  </div>
                  {anamnesisForm.medicacion.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                      {anamnesisForm.medicacion.map((m, i) => (
                        <span key={i} className="badge badge-neutral" style={{ cursor: 'pointer' }} onClick={() => removeMedicacion(i)}>
                          {m} ✕
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Alergias conocidas</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                    {ALERGIAS_LIST.map(al => (
                      <label key={al.key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.85rem' }}>
                        <input type="checkbox" checked={!!anamnesisForm.alergias?.[al.key]}
                          onChange={e => setAnamnesisForm(f => ({ ...f, alergias: { ...f.alergias, [al.key]: e.target.checked } }))} />
                        {al.label}
                      </label>
                    ))}
                  </div>
                  {anamnesisForm.alergias?.otras && (
                    <input className="form-input" style={{ marginTop: 6 }} placeholder=""
                      value={anamnesisForm.alergias_otras}
                      onChange={e => setAnamnesisForm(f => ({ ...f, alergias_otras: e.target.value }))} />
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                  {[['embarazada','¿Embarazada?'],['fumador','¿Fumador/a?'],['anticoagulantes','¿Toma anticoagulantes?'],['marcapasos','¿Tiene marcapasos?']].map(([k,l]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.85rem', fontWeight: 600 }}>
                      <input type="checkbox" checked={!!anamnesisForm[k]}
                        onChange={e => setAnamnesisForm(f => ({ ...f, [k]: e.target.checked }))} />
                      {l}
                    </label>
                  ))}
                </div>

                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Cirugías previas</label>
                    <textarea className="form-input" rows={2} value={anamnesisForm.cirugias_previas}
                      onChange={e => setAnamnesisForm(f => ({ ...f, cirugias_previas: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Antecedentes clínicos</label>
                    <textarea className="form-input" rows={2} value={anamnesisForm.antecedentes_odontologicos}
                      onChange={e => setAnamnesisForm(f => ({ ...f, antecedentes_odontologicos: e.target.value }))} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Fecha de aceptación / firma</label>
                  <input className="form-input" type="date" value={anamnesisForm.firma_fecha}
                    onChange={e => setAnamnesisForm(f => ({ ...f, firma_fecha: e.target.value }))}
                    style={{ maxWidth: 200 }} />
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditAnamnesis(false)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar anamnesis'}</button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ODONTOGRAMA */}
      {tab === 'odontograma' && (
        <div>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Diagrama clínico</span>
              <span className="text-sm text-muted">Hacé clic en una pieza para editarla</span>
            </div>
            <div className="card-body">
              <Odontograma piezas={piezas} onPiezaClick={handlePiezaClick} />
            </div>
          </div>

          {/* Panel de edición de pieza seleccionada */}
          {piezaSel !== null && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-header">
                <span className="card-title">Pieza N° {piezaSel}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setPiezaSel(null)}>Cancelar</button>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-input" value={piezaEstado} onChange={e => setPiezaEstado(e.target.value)}>
                    {ESTADOS_OD.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Observaciones</label>
                  <textarea className="form-input" rows={3} value={piezaNota} onChange={e => setPiezaNota(e.target.value)} placeholder="" />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setPiezaSel(null)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={savePieza} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TURNOS */}
      {tab === 'turnos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Historial de turnos</span>
            <button className="btn btn-primary btn-sm" onClick={openNewTurno}>+ Nuevo turno</button>
          </div>
          {turnos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📅</div><div className="empty-title">Sin turnos registrados</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Fecha y hora</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {turnos.map(t => (
                    <tr key={t.id}>
                      <td className="td-main">{format(new Date(t.fecha_hora), "d MMM yyyy, HH:mm", { locale: es })}</td>
                      <td className="text-sm">{t.motivo || '—'}</td>
                      <td><span className={`badge badge-${t.estado === 'completado' ? 'success' : t.estado === 'ausente' ? 'danger' : t.estado === 'cancelado' ? 'neutral' : 'info'}`}>{t.estado}</span></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => openEditTurno(t)}>Editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PRESUPUESTOS */}
      {tab === 'presupuestos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Presupuestos</span>
            <button className="btn btn-primary btn-sm" onClick={openNuevoPresupuesto}>+ Nuevo Presupuesto</button>
          </div>
          {presupuestos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">💼</div><div className="empty-title">Sin presupuestos</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Nº</th><th>Fecha</th><th>Total</th><th>Pagado</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {presupuestos.map(p => (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => openPresupuestoDetalle(p)}>
                      <td className="td-main">#{p.numero}</td>
                      <td className="text-sm">{format(new Date(p.fecha || p.created_at), "d MMM yyyy", { locale: es })}</td>
                      <td className="font-semibold">{fmt(p.total)}</td>
                      <td className="text-sm">{fmt(p.total_pagado)}</td>
                      <td><span className={`badge badge-${p.estado === 'completado' ? 'success' : p.estado === 'aprobado' ? 'info' : p.estado === 'vencido' ? 'danger' : 'warning'}`}>{p.estado}</span></td>
                      <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openPresupuestoDetalle(p)}>Editar</button>
                        {getWhatsAppUrl(paciente.telefono) && (
                          <button className="btn btn-ghost btn-sm" style={{ color: '#25D366', marginLeft: 4 }} onClick={() => {
                            const items = (p.items ?? []).length > 0 ? p.items : []
                            const lineas = items.map(i => `• ${i.descripcion} x${i.cantidad} — ${fmt(i.precio_unitario * i.cantidad)}`).join('\n')
                            const texto = `Hola ${paciente.nombre}, te enviamos el presupuesto del consultorio:\n*Presupuesto N° ${p.numero}*\n${lineas}\n*Total: ${fmt(p.total)}*\nAnte cualquier consulta, estamos a tu disposición.`
                            window.open(`${getWhatsAppUrl(paciente.telefono)}?text=${encodeURIComponent(texto)}`, '_blank')
                          }}>WhatsApp</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PAGOS */}
      {tab === 'pagos' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Historial de pagos</span>
            <span className="font-semibold" style={{ color: 'var(--c-success)' }}>Total: {fmt(totalPagado)}</span>
          </div>
          {pagos.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">💵</div><div className="empty-title">Sin pagos registrados</div></div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead><tr><th>Fecha</th><th>Monto</th><th>Método</th><th>Concepto</th></tr></thead>
                <tbody>
                  {pagos.map(p => (
                    <tr key={p.id}>
                      <td className="text-sm">{format(new Date(p.fecha), "d MMM yyyy, HH:mm", { locale: es })}</td>
                      <td className="td-main">{fmt(p.monto)}</td>
                      <td><span className="badge badge-neutral">{METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}</span></td>
                      <td className="text-sm text-muted">{p.concepto || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* PLANES DE PAGO */}
      {tab === 'cuotas' && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span className="card-title">Planes de pago en cuotas</span>
              {user?.rol !== 'recepcionista' && (
                <button className="btn btn-primary btn-sm" onClick={() => {
                  setPlanForm({ concepto: '', monto_total: '', cuotas: 3, fecha_inicio: format(new Date(), 'yyyy-MM-dd') })
                  setPlanError('')
                  setModalPlan(true)
                }}>+ Nuevo plan</button>
              )}
            </div>
            {planesPago.length === 0 ? (
              <div className="empty-state"><div className="empty-icon">💳</div><div className="empty-title">Sin planes de pago</div><div className="empty-sub">Creá un plan para dividir el costo del tratamiento en cuotas mensuales</div></div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Descripción</th><th>Total</th><th>Cuotas</th><th>Pagadas</th><th>Estado</th></tr></thead>
                  <tbody>
                    {planesPago.map(plan => {
                      const totalCuotas = plan.cuotas ?? 0
                      const pagadas = plan.cuotas_pagadas_real ?? plan.cuotas_pagadas ?? 0
                      return (
                        <tr key={plan.id}>
                          <td style={{ fontWeight: 600 }}>{plan.concepto || 'Sin descripción'}</td>
                          <td>{fmt(plan.monto_total)}</td>
                          <td>{totalCuotas || '—'}</td>
                          <td>
                            <span style={{ color: pagadas === totalCuotas ? '#15803D' : '#C2410C' }}>
                              {pagadas}/{totalCuotas || '—'}
                            </span>
                          </td>
                          <td>
                            <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 100, fontSize: '.74rem', fontWeight: 600, background: plan.estado === 'cancelado' ? '#FEF2F2' : plan.estado === 'completado' ? '#F0FDF4' : '#EFF6FF', color: plan.estado === 'cancelado' ? '#DC2626' : plan.estado === 'completado' ? '#15803D' : '#1D4ED8' }}>
                              {plan.estado === 'activo' ? 'Activo' : plan.estado === 'completado' ? 'Completado' : 'Cancelado'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Detalle de cuotas del primer plan activo */}
          {planesPago.filter(p => p.estado === 'activo').map(plan => (
            <div key={plan.id} className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title">Cuotas — {plan.concepto || fmt(plan.monto_total)}</span></div>
              <div className="table-wrapper">
                <table className="table">
                  <thead><tr><th>Cuota</th><th>Vencimiento</th><th>Monto</th><th>Estado</th><th></th></tr></thead>
                  <tbody>
                    {!planesCuotas[plan.id] ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--c-text-3)' }}>Cargando...</td></tr>
                    ) : planesCuotas[plan.id].map((c, i) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>Cuota {i + 1}</td>
                        <td className="text-sm">{c.fecha_vencimiento ? format(new Date(c.fecha_vencimiento), "d MMM yyyy", { locale: es }) : '—'}</td>
                        <td>{fmt(c.monto)}</td>
                        <td>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 100, fontSize: '.74rem', fontWeight: 600, background: c.estado === 'pagada' ? '#F0FDF4' : c.estado === 'vencida' ? '#FEF2F2' : '#FFF7ED', color: c.estado === 'pagada' ? '#15803D' : c.estado === 'vencida' ? '#DC2626' : '#92400E' }}>
                            {c.estado === 'pagada' ? 'Pagada' : c.estado === 'vencida' ? 'Vencida' : 'Pendiente'}
                          </span>
                        </td>
                        <td>
                          {c.estado !== 'pagada' && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#15803D' }} onClick={async () => {
                              try {
                                const pago = await api.pagos.create({ paciente_id: paciente.id, monto: c.monto, metodo_pago: 'efectivo', concepto: `Cuota ${i+1} — ${plan.concepto || 'Plan de pago'}` })
                                await api.planesPago.pagarCuota(plan.id, c.id, pago.id)
                                const [planes, full] = await Promise.all([
                                  api.planesPago.list(paciente.id),
                                  api.planesPago.get(plan.id),
                                ])
                                setPlanesPago(planes ?? [])
                                setPlanesCuotas(prev => ({ ...prev, [plan.id]: full?.cuotas ?? [] }))
                              } catch (e) { addToast('Error al registrar el pago de la cuota', 'error') }
                            }}>Marcar pagada</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}


      {/* MODAL: Editar ficha del paciente */}
      {editPaciente && (
        <div className="modal-overlay">
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Editar ficha del paciente</span>
              <button className="btn-close" onClick={() => setEditPaciente(false)}>✕</button>
            </div>
            <form onSubmit={handleEditPacienteSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Nombre <span className="req">*</span></label>
                    <input className="form-input" required value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Apellido <span className="req">*</span></label>
                    <input className="form-input" required value={editForm.apellido} onChange={e => setEditForm(f => ({ ...f, apellido: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">DNI</label>
                    <input className="form-input" value={editForm.dni} onChange={e => setEditForm(f => ({ ...f, dni: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de nacimiento</label>
                    <input className="form-input" type="date" value={editForm.fecha_nacimiento} onChange={e => setEditForm(f => ({ ...f, fecha_nacimiento: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sexo</label>
                    <select className="form-input" value={editForm.sexo} onChange={e => setEditForm(f => ({ ...f, sexo: e.target.value }))}>
                      <option value="">Sin especificar</option>
                      <option value="masculino">Masculino</option>
                      <option value="femenino">Femenino</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Teléfono</label>
                    <input className="form-input" value={editForm.telefono} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Teléfono alternativo</label>
                    <input className="form-input" value={editForm.telefono_alternativo} onChange={e => setEditForm(f => ({ ...f, telefono_alternativo: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Dirección</label>
                    <input className="form-input" value={editForm.direccion} onChange={e => setEditForm(f => ({ ...f, direccion: e.target.value }))} />
                  </div>
                </div>
                <div className="form-row cols-3">
                  <div className="form-group">
                    <label className="form-label">Obra social</label>
                    <input className="form-input" value={editForm.obra_social} onChange={e => setEditForm(f => ({ ...f, obra_social: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">N° afiliado</label>
                    <input className="form-input" value={editForm.numero_afiliado} onChange={e => setEditForm(f => ({ ...f, numero_afiliado: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Plan</label>
                    <input className="form-input" value={editForm.plan_obra_social} onChange={e => setEditForm(f => ({ ...f, plan_obra_social: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Alergias</label>
                  <input className="form-input" value={editForm.alergias} onChange={e => setEditForm(f => ({ ...f, alergias: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Medicación actual</label>
                  <input className="form-input" value={editForm.medicacion_actual} onChange={e => setEditForm(f => ({ ...f, medicacion_actual: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notas / Antecedentes</label>
                  <textarea className="form-input" rows={3} value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditPaciente(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Editar pieza odontograma */}
      {piezaSel && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Pieza {piezaSel}</span>
              <button className="btn-close" onClick={() => setPiezaSel(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-input" value={piezaEstado} onChange={e => setPiezaEstado(e.target.value)}>
                  {ESTADOS_OD.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-input" rows={3} value={piezaNota} onChange={e => setPiezaNota(e.target.value)} placeholder="" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setPiezaSel(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePieza} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nueva/Editar evolución */}
      {modalEvol && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editEvol ? 'Editar evolución' : 'Nueva Evolución'}</span>
              <button className="btn-close" onClick={() => setModalEvol(false)}>✕</button>
            </div>
            <form onSubmit={handleEvolSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Servicio / Prestación realizada</label>
                  <input className="form-input" type="text" placeholder="" value={evolForm.prestacion_nombre} onChange={e => setEvolForm(f => ({ ...f, prestacion_nombre: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción <span className="req">*</span></label>
                  <textarea className="form-input" rows={4} required value={evolForm.descripcion} onChange={e => setEvolForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="" />
                </div>
                <div className="form-row cols-2">
                  {/odontol/i.test(configuracion?.especialidad ?? '') && (
                    <div className="form-group">
                      <label className="form-label">Piezas tratadas</label>
                      <input className="form-input" placeholder="" value={evolForm.piezas_tratadas} onChange={e => setEvolForm(f => ({ ...f, piezas_tratadas: e.target.value }))} />
                      <span className="form-hint">Separadas por coma</span>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Monto cobrado</label>
                    <input className="form-input" type="number" min="0" value={evolForm.monto} onChange={e => setEvolForm(f => ({ ...f, monto: e.target.value }))} />
                  </div>
                </div>
              </div>
              {/* Adjuntar archivo */}
              {['tenant', 'admin', 'profesional', 'superadmin'].includes(user?.rol) && (
                <div className="modal-body" style={{ paddingTop: 0 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">📎 Adjuntar archivo (opcional)</label>
                    {evolAdjFile ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--c-surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--c-border)' }}>
                        <span style={{ flex: 1, fontSize: '.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📄 {evolAdjFile.name} <span style={{ fontWeight: 400, color: 'var(--c-text-3)' }}>({(evolAdjFile.size / 1024).toFixed(0)} KB)</span>
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEvolAdjFile(null)}>✕</button>
                      </div>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--c-surface)', borderRadius: 'var(--radius-sm)', border: '1px dashed var(--c-border)', cursor: 'pointer', color: 'var(--c-text-3)', fontSize: '.85rem' }}>
                        <input type="file" style={{ display: 'none' }} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                          onChange={e => { const f = e.target.files[0]; if (f) setEvolAdjFile(f); e.target.value = '' }} />
                        Clic para adjuntar imagen, PDF o documento · Máx 20 MB
                      </label>
                    )}
                  </div>
                </div>
              )}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setModalEvol(false); setEvolAdjFile(null) }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={saving || evolAdjUploading}>
                  {saving || evolAdjUploading ? 'Guardando...' : editEvol ? 'Guardar cambios' : 'Guardar evolución'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Registrar pago */}
      {modalPago && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Registrar Pago</span>
              <button className="btn-close" onClick={() => setModalPago(false)}>✕</button>
            </div>
            <form onSubmit={handlePagoSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Monto <span className="req">*</span></label>
                  <input className="form-input" type="number" min="1" required value={pagoForm.monto} onChange={e => setPagoForm(f => ({ ...f, monto: e.target.value }))} placeholder="$0" />
                </div>
                <div className="form-group">
                  <label className="form-label">Método de pago</label>
                  <select className="form-input" value={pagoForm.metodo_pago} onChange={e => setPagoForm(f => ({ ...f, metodo_pago: e.target.value }))}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="tarjeta_debito">Tarjeta débito</option>
                    <option value="tarjeta_credito">Tarjeta crédito</option>
                    <option value="obra_social">Obra social</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                {pagoForm.metodo_pago === 'obra_social' && (
                  <div className="form-row cols-2">
                    <div className="form-group">
                      <label className="form-label">Monto Obra Social</label>
                      <input className="form-input" type="number" min="0" value={pagoForm.monto_os} onChange={e => setPagoForm(f => ({ ...f, monto_os: e.target.value }))} placeholder="$0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Copago</label>
                      <input className="form-input" type="number" min="0" value={pagoForm.monto_copago} onChange={e => setPagoForm(f => ({ ...f, monto_copago: e.target.value }))} placeholder="$0" />
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Concepto</label>
                  <input className="form-input" value={pagoForm.concepto} onChange={e => setPagoForm(f => ({ ...f, concepto: e.target.value }))} placeholder="" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalPago(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success" disabled={saving}>{saving ? 'Guardando...' : 'Registrar pago'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo/Editar turno desde ficha */}
      {modalTurno && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editTurno ? 'Editar turno' : 'Nuevo turno'}</span>
              <button className="btn-close" onClick={() => setModalTurno(false)}>✕</button>
            </div>
            <form onSubmit={handleTurnoSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Fecha y hora <span className="req">*</span></label>
                    <input className="form-input" type="datetime-local" required value={turnoForm.fecha_hora} onChange={e => setTurnoForm(f => ({ ...f, fecha_hora: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración (min)</label>
                    <select className="form-input" value={turnoForm.duracion_minutos} onChange={e => setTurnoForm(f => ({ ...f, duracion_minutos: e.target.value }))}>
                      {[15,20,30,45,60,90,120].map(d => <option key={d} value={d}>{d} min</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Motivo / Servicio</label>
                  <input className="form-input" value={turnoForm.motivo} onChange={e => setTurnoForm(f => ({ ...f, motivo: e.target.value, prestacion_id: '' }))} placeholder="" />
                </div>
                {editTurno && (
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select className="form-input" value={turnoForm.estado} onChange={e => setTurnoForm(f => ({ ...f, estado: e.target.value }))}>
                      <option value="programado">Programado</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="presente">Presente</option>
                      <option value="completado">Completado</option>
                      <option value="ausente">Ausente</option>
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Notas</label>
                  <textarea className="form-input" rows={2} value={turnoForm.notas} onChange={e => setTurnoForm(f => ({ ...f, notas: e.target.value }))} />
                </div>
              </div>
              <div className="modal-footer">
                {editTurno && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleCancelTurno(editTurno.id)}>Cancelar turno</button>
                )}
                {editTurno && editTurno.estado !== 'completado' && (
                  <button type="button" className="btn btn-success btn-sm" onClick={() => { setModalTurno(false); openCobro(editTurno) }}>Cobrar</button>
                )}
                <div style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost" onClick={() => setModalTurno(false)}>Cerrar</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando...' : editTurno ? 'Actualizar' : 'Crear turno'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Nueva receta imprimible */}
      {modalReceta && (
        <div className="modal-overlay">
          <div className="modal modal-lg receta-print" onClick={e => e.stopPropagation()} style={{ maxHeight: '95vh' }}>
            <div className="modal-header">
              <span className="modal-title">Nueva Receta</span>
              <button className="btn-close" onClick={() => setModalReceta(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Header receta (para imprimir) */}
              <div style={{ borderBottom: '2px solid var(--c-border)', paddingBottom: 16, marginBottom: 20 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                  {configuracion?.nombre_profesional || 'Profesional'}
                </div>
                {configuracion?.especialidad && <div className="text-sm text-muted">{configuracion.especialidad}</div>}
                {configuracion?.matricula && <div className="text-sm">Matrícula: {configuracion.matricula}</div>}
                {configuracion?.telefono && <div className="text-sm">Tel: {configuracion.telefono}</div>}
                {configuracion?.direccion && <div className="text-sm">{configuracion.direccion}{configuracion.ciudad ? `, ${configuracion.ciudad}` : ''}</div>}
                <div className="text-sm" style={{ marginTop: 8 }}>
                  Paciente: <strong>{paciente.apellido}, {paciente.nombre}</strong>
                  {paciente.dni && ` — DNI ${paciente.dni}`}
                </div>
                <div className="text-sm text-muted">Fecha: {format(new Date(), "d 'de' MMMM yyyy", { locale: es })}</div>
              </div>

              {/* Medicamentos */}
              <div style={{ marginBottom: 16, fontWeight: 700, fontSize: '.9rem', color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Prescripción</div>
              {recetaMeds.map((med, idx) => (
                <div key={idx} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className="text-sm font-semibold">Medicamento {idx + 1}</span>
                    {recetaMeds.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRecetaMed(idx)}>Eliminar</button>}
                  </div>
                  <div className="form-row cols-3">
                    <div className="form-group">
                      <label className="form-label">Medicamento</label>
                      <input className="form-input" value={med.medicamento} onChange={e => setRecetaMed(idx, 'medicamento', e.target.value)} placeholder="" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Concentración</label>
                      <input className="form-input" value={med.concentracion} onChange={e => setRecetaMed(idx, 'concentracion', e.target.value)} placeholder="" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Forma farmacéutica</label>
                      <input className="form-input" value={med.forma} onChange={e => setRecetaMed(idx, 'forma', e.target.value)} placeholder="" />
                    </div>
                  </div>
                  <div className="form-row cols-3" style={{ marginTop: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Dosis</label>
                      <input className="form-input" value={med.dosis} onChange={e => setRecetaMed(idx, 'dosis', e.target.value)} placeholder="" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Posología</label>
                      <input className="form-input" value={med.posologia} onChange={e => setRecetaMed(idx, 'posologia', e.target.value)} placeholder="" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cantidad / Días</label>
                      <input className="form-input" value={med.dias} onChange={e => setRecetaMed(idx, 'dias', e.target.value)} placeholder="" />
                    </div>
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-secondary btn-sm" onClick={addMedReceta}>+ Agregar medicamento</button>

              {/* Indicaciones adicionales */}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Indicaciones adicionales (opcional)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder=""
                  value={recetaIndicaciones}
                  onChange={e => setRecetaIndicaciones(e.target.value)}
                />
              </div>

              {/* Selector de profesional firmante */}
              {colaboradoresAll.length > 0 && (
                <div className="form-group" style={{ marginTop: 8 }}>
                  <label className="form-label">Profesional firmante</label>
                  <select
                    className="form-input"
                    value={recetaProfesional?.id ?? ''}
                    onChange={e => {
                      const sel = colaboradoresAll.find(c => String(c.id) === e.target.value)
                      setRecetaProfesional(sel ?? null)
                    }}
                  >
                    <option value="">{configuracion?.nombre_profesional || 'Profesional principal'} (titular)</option>
                    {colaboradoresAll.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre} {c.apellido ?? ''}{c.matricula ? ` — Mat. ${c.matricula}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Firma digital */}
              <div style={{ marginTop: 40, borderTop: '1px solid var(--c-border)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  {(() => {
                    const firmaBase64 = recetaProfesional?.firma_digital || configuracion?.firma_digital
                    if (firmaBase64) {
                      return (
                        <div>
                          <img src={firmaBase64} alt="Firma" style={{ maxHeight: 80, maxWidth: 220, display: 'block', margin: '0 auto' }} />
                          <div style={{ borderTop: '1px solid var(--c-text)', marginTop: 6, paddingTop: 6, fontSize: '.82rem' }}>
                            {recetaProfesional
                              ? `${recetaProfesional.nombre} ${recetaProfesional.apellido ?? ''}`
                              : configuracion?.nombre_profesional || 'Profesional'}
                            {(recetaProfesional?.matricula || configuracion?.matricula) && (
                              <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--c-text-3)' }}>
                                Mat. {recetaProfesional?.matricula ?? configuracion?.matricula}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div>
                        <div style={{ height: 70, width: 220, border: '1px dashed var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', color: 'var(--c-text-3)', marginBottom: 6 }}>
                          Sin firma digital guardada
                        </div>
                        <div style={{ borderTop: '1px solid var(--c-text)', paddingTop: 6, fontSize: '.82rem' }}>
                          Firma y sello del profesional
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalReceta(false)}>Cerrar</button>
              <button type="button" className="btn btn-primary" disabled={recetaSaving} onClick={guardarEImprimirReceta}>
                {recetaSaving ? 'Guardando...' : '🖨️ Guardar e imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: Indicaciones post-operatorias */}
      {modalIndicaciones && (
        <div className="modal-overlay">
          <div className="modal modal-lg indicaciones-print" onClick={e => e.stopPropagation()} style={{ maxHeight: '95vh' }}>
            <div className="modal-header">
              <span className="modal-title">Indicaciones post-operatorias</span>
              <button className="btn-close" onClick={() => setModalIndicaciones(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Header imprimible */}
              <div style={{ borderBottom: '2px solid var(--c-border)', paddingBottom: 14, marginBottom: 4 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
                  {configuracion?.nombre_profesional || 'Profesional'}
                </div>
                {configuracion?.especialidad && <div className="text-sm text-muted">{configuracion.especialidad}</div>}
                {configuracion?.matricula && <div className="text-sm">Matrícula: {configuracion.matricula}</div>}
                {configuracion?.telefono && <div className="text-sm">Tel: {configuracion.telefono}</div>}
                {configuracion?.direccion && <div className="text-sm">{configuracion.direccion}{configuracion.ciudad ? `, ${configuracion.ciudad}` : ''}</div>}
                <div className="text-sm" style={{ marginTop: 8 }}>
                  Paciente: <strong>{paciente.apellido}, {paciente.nombre}</strong>
                  {paciente.dni && ` — DNI ${paciente.dni}`}
                </div>
                <div className="text-sm text-muted">Fecha: {format(new Date(), "d 'de' MMMM yyyy", { locale: es })}</div>
              </div>

              {/* Selector de tipo — oculto al imprimir */}
              <div className="indicaciones-tipo-selector" style={{ display: 'flex', gap: 8 }}>
                {[['extraccion','Post-extracción'],['cirugia','Post-cirugía'],['blanqueamiento','Post-blanqueamiento']].map(([tipo, label]) => (
                  <button key={tipo} type="button"
                    className={`btn btn-sm ${indicacionesTipo === tipo ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => { setIndicacionesTipo(tipo); setIndicacionesTexto(INDICACIONES_TEMPLATES[tipo]) }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Texto editable */}
              <div className="form-group">
                <label className="form-label indicaciones-form-label">Indicaciones (editable)</label>
                <textarea
                  className="form-input"
                  rows={16}
                  style={{ fontFamily: 'monospace', fontSize: '.85rem', whiteSpace: 'pre-wrap' }}
                  value={indicacionesTexto}
                  onChange={e => setIndicacionesTexto(e.target.value)}
                />
              </div>

              {/* Firma */}
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ textAlign: 'center' }}>
                  {configuracion?.firma_digital ? (
                    <div>
                      <img src={configuracion.firma_digital} alt="Firma" style={{ maxHeight: 70, maxWidth: 200, display: 'block', margin: '0 auto' }} />
                      <div style={{ borderTop: '1px solid var(--c-text)', marginTop: 4, paddingTop: 6, fontSize: '.82rem' }}>
                        {configuracion.nombre_profesional || 'Profesional'}
                        {configuracion.matricula && <span style={{ display: 'block', fontSize: '.75rem', color: 'var(--c-text-3)' }}>Mat. {configuracion.matricula}</span>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ borderTop: '1px solid var(--c-text)', width: 200, paddingTop: 6, fontSize: '.82rem' }}>
                      Firma y sello del profesional
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setModalIndicaciones(false)}>Cerrar</button>
              <button type="button" className="btn btn-primary" onClick={printIndicaciones}>🖨️ Imprimir indicaciones</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cobro de turno completado */}
      {modalCobro && turnoACobrar && (
        <div className="modal-overlay">
          <div className="modal modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Cobrar turno</span>
              <button className="btn-close" onClick={() => setModalCobro(false)}>✕</button>
            </div>
            <form onSubmit={handleCobro}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
                  Turno del {turnoACobrar.fecha_hora ? format(new Date(turnoACobrar.fecha_hora), "d MMM yyyy, HH:mm", { locale: es }) : ''}
                  {turnoACobrar.motivo && <> — {turnoACobrar.motivo}</>}
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Monto total <span className="req">*</span></label>
                    <input className="form-input" type="number" min="0" required value={cobroForm.monto}
                      onChange={e => setCobroForm(f => ({ ...f, monto: e.target.value }))} placeholder="$0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Concepto</label>
                    <input className="form-input" value={cobroForm.concepto}
                      onChange={e => setCobroForm(f => ({ ...f, concepto: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Método de pago</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {[['efectivo','Efectivo'],['transferencia','Transferencia'],['tarjeta_debito','Débito'],['tarjeta_credito','Crédito'],['obra_social','Obra Social']].map(([val, label]) => (
                      <button key={val} type="button"
                        className={`btn btn-sm ${cobroForm.metodo_pago === val ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() => setCobroForm(f => ({ ...f, metodo_pago: val }))}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {cobroForm.metodo_pago === 'obra_social' && (
                  <div className="form-row cols-2">
                    <div className="form-group">
                      <label className="form-label">Monto Obra Social</label>
                      <input className="form-input" type="number" min="0" value={cobroForm.monto_os}
                        onChange={e => setCobroForm(f => ({ ...f, monto_os: e.target.value }))} placeholder="$0" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Copago del paciente</label>
                      <input className="form-input" type="number" min="0" value={cobroForm.monto_copago}
                        onChange={e => setCobroForm(f => ({ ...f, monto_copago: e.target.value }))} placeholder="$0" />
                    </div>
                  </div>
                )}
                {cobroError && <div className="alert alert-danger">{cobroError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => { setModalCobro(false); setTurnoACobrar(null); }}>Omitir por ahora</button>
                <button type="submit" className="btn btn-success" disabled={cobroSaving}>
                  {cobroSaving ? 'Registrando...' : 'Registrar cobro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Encuesta NPS / Satisfacción */}
      {showNPS && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Pago registrado ✓</span>
              <button className="btn-close" onClick={() => { setShowNPS(null); setTurnoACobrar(null) }}>✕</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '20px 24px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>⭐</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>¿Enviar encuesta de satisfacción?</div>
              <div style={{ fontSize: '.84rem', color: 'var(--c-text-2)', marginBottom: 16 }}>
                Enviá un mensaje por WhatsApp a {paciente.nombre} para conocer su experiencia.
              </div>
              {(() => {
                const texto = `Hola ${paciente.nombre}! Gracias por visitarnos hoy 😊 Nos encantaría saber tu opinión sobre la atención. En una escala del 1 al 10, ¿cómo calificarías tu experiencia en el consultorio? Tu opinión nos ayuda a mejorar. ¡Gracias!`
                const url = `${getWhatsAppUrl(paciente.telefono)}?text=${encodeURIComponent(texto)}`
                return (
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button className="btn btn-ghost" onClick={() => { setShowNPS(null); setTurnoACobrar(null) }}>Omitir</button>
                    <a href={url} target="_blank" rel="noreferrer"
                      className="btn btn-success"
                      style={{ textDecoration: 'none' }}
                      onClick={() => { setShowNPS(null); setTurnoACobrar(null) }}>
                      📲 Enviar encuesta
                    </a>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Nuevo/Editar presupuesto */}
      {modalPresupuesto && (
        <div className="modal-overlay">
          <div className="modal modal-lg presupuesto-print" onClick={e => e.stopPropagation()} style={{ maxHeight: '95vh' }}>
            <div className="modal-header">
              <span className="modal-title">{presupuestoDetalle ? `Presupuesto #${presupuestoDetalle.numero}` : 'Nuevo Presupuesto'}</span>
              <button className="btn-close" onClick={() => setModalPresupuesto(false)}>✕</button>
            </div>
            <form onSubmit={handlePresupuestoSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Header imprimible */}
                <div style={{ borderBottom: '2px solid var(--c-border)', paddingBottom: 14, marginBottom: 4 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>{configuracion?.nombre_consultorio || configuracion?.nombre_profesional || 'Consultorio'}</div>
                  {configuracion?.nombre_profesional && <div className="text-sm">Prof.: {configuracion.nombre_profesional}{configuracion.matricula ? ` — Mat. ${configuracion.matricula}` : ''}</div>}
                  <div className="text-sm">Paciente: <strong>{paciente.apellido}, {paciente.nombre}</strong>{paciente.dni ? ` — DNI ${paciente.dni}` : ''}</div>
                  <div className="text-sm text-muted">Fecha: {format(new Date(), "d 'de' MMMM yyyy", { locale: es })}</div>
                </div>

                {/* Ítems */}
                <div>
                  <div style={{ marginBottom: 10, fontWeight: 700, fontSize: '.85rem', color: 'var(--c-text-2)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Ítems del presupuesto</div>
                  {presupuestoItems.map((item, idx) => (
                    <div key={idx} style={{ border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                        <span className="text-sm" style={{ fontWeight: 600 }}>Ítem {idx + 1}</span>
                        {presupuestoItems.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removePresupuestoItem(idx)}>Eliminar</button>}
                      </div>
                      <div style={{ marginBottom: 8 }}>
                        <div className="form-group">
                          <label className="form-label">Descripción del servicio <span className="req">*</span></label>
                          <input className="form-input" value={item.descripcion} onChange={e => setPresupuestoItem(idx, 'descripcion', e.target.value)} placeholder="" required={idx === 0} />
                        </div>
                      </div>
                      <div className="form-row cols-2">
                        <div className="form-group">
                          <label className="form-label">Cantidad</label>
                          <input className="form-input" type="number" min="1" value={item.cantidad} onChange={e => setPresupuestoItem(idx, 'cantidad', e.target.value)} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Precio unitario</label>
                          <input className="form-input" type="number" min="0" value={item.precio_unitario} onChange={e => setPresupuestoItem(idx, 'precio_unitario', e.target.value)} placeholder="$0" />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginTop: 6, fontSize: '.82rem', color: 'var(--c-text-2)' }}>
                        Subtotal: <strong>{fmt((Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0))}</strong>
                      </div>
                    </div>
                  ))}
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addPresupuestoItem}>+ Agregar ítem</button>
                </div>

                <div style={{ background: 'var(--c-surface-2)', border: '1px solid var(--c-border)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '.9rem' }}>TOTAL</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, color: 'var(--c-success)' }}>{fmt(presupuestoTotal)}</span>
                </div>

                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Notas</label>
                    <textarea className="form-input" rows={2} value={presupuestoForm.notas} onChange={e => setPresupuestoForm(f => ({ ...f, notas: e.target.value }))} placeholder="" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha de vencimiento</label>
                    <input className="form-input" type="date" value={presupuestoForm.fecha_vencimiento} onChange={e => setPresupuestoForm(f => ({ ...f, fecha_vencimiento: e.target.value }))} />
                  </div>
                </div>
                {presupuestoDetalle && (
                  <div className="form-group">
                    <label className="form-label">Estado del presupuesto</label>
                    <select className="form-input" value={presupuestoForm.estado ?? presupuestoDetalle.estado}
                      onChange={e => setPresupuestoForm(f => ({ ...f, estado: e.target.value }))}
                      style={{ maxWidth: 220 }}>
                      <option value="pendiente">Pendiente</option>
                      <option value="aprobado">Aprobado</option>
                      <option value="en_curso">En curso</option>
                      <option value="completado">Completado</option>
                      <option value="rechazado">Rechazado</option>
                      <option value="vencido">Vencido</option>
                    </select>
                  </div>
                )}

                {/* Firma imprimible */}
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--c-border)' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid var(--c-text)', width: 180, paddingTop: 6, fontSize: '.78rem' }}>Firma del paciente</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ borderTop: '1px solid var(--c-text)', width: 180, paddingTop: 6, fontSize: '.78rem' }}>Firma del profesional</div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModalPresupuesto(false); window.print() }}>Imprimir Presupuesto</button>
                <div style={{ flex: 1 }} />
                <button type="button" className="btn btn-ghost" onClick={() => setModalPresupuesto(false)}>Cerrar</button>
                <button type="submit" className="btn btn-primary" disabled={presupuestoSaving}>{presupuestoSaving ? 'Guardando...' : presupuestoDetalle ? 'Guardar cambios' : 'Crear presupuesto'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: Nuevo plan de pago */}
      {modalPlan && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Nuevo plan de pago</span>
              <button className="btn-close" onClick={() => setModalPlan(false)}>✕</button>
            </div>
            <form onSubmit={async e => {
              e.preventDefault()
              if (!planForm.monto_total || Number(planForm.monto_total) <= 0) { setPlanError('El monto debe ser mayor a cero'); return }
              setPlanSaving(true); setPlanError('')
              try {
                const plan = await api.planesPago.create({ paciente_id: paciente.id, ...planForm, monto_total: Number(planForm.monto_total), cuotas: Number(planForm.cuotas) })
                const planes = await api.planesPago.list(paciente.id)
                setPlanesPago(planes ?? [])
                setPlanesCuotas(prev => { const n = { ...prev }; delete n[plan.id]; return n })
                setModalPlan(false)
              } catch (err) { setPlanError('No se pudo crear el plan. Verificá los datos.') }
              finally { setPlanSaving(false) }
            }}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Descripción</label>
                  <input className="form-input" value={planForm.concepto} onChange={e => setPlanForm(f => ({ ...f, concepto: e.target.value }))} placeholder="" />
                </div>
                <div className="form-row cols-2">
                  <div className="form-group">
                    <label className="form-label">Monto total <span className="req">*</span></label>
                    <input className="form-input" type="number" min="1" required value={planForm.monto_total} onChange={e => setPlanForm(f => ({ ...f, monto_total: e.target.value }))} placeholder="$0" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Cantidad de cuotas</label>
                    <select className="form-input" value={planForm.cuotas} onChange={e => setPlanForm(f => ({ ...f, cuotas: e.target.value }))}>
                      {[2,3,4,5,6,8,10,12,18,24].map(n => <option key={n} value={n}>{n} cuotas</option>)}
                    </select>
                  </div>
                </div>
                {planForm.monto_total > 0 && (
                  <div style={{ background: 'var(--c-surface-2)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '.84rem' }}>
                    Cuota mensual: <strong>{fmt(Math.ceil(planForm.monto_total / planForm.cuotas))}</strong>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Fecha de inicio</label>
                  <input className="form-input" type="date" value={planForm.fecha_inicio} onChange={e => setPlanForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
                </div>
                {planError && <div className="alert alert-danger">{planError}</div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setModalPlan(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={planSaving}>{planSaving ? 'Creando...' : 'Crear plan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Presupuesto aprobado → generar turnos */}
      {modalGenTurnos && (
        <div className="modal-overlay">
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">Presupuesto aprobado</span>
              <button className="btn-close" onClick={() => setModalGenTurnos(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 8 }}>¿Querés programar los turnos del tratamiento?</p>
              <p className="text-sm text-muted" style={{ marginBottom: 0 }}>
                Se creará un turno por cada ítem del presupuesto, espaciados 7 días a partir de mañana a las 9:00 hs.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setModalGenTurnos(false); setPresupAprobado(null) }}>No, después</button>
              <button className="btn btn-primary" onClick={handleGenerarTurnos} disabled={genTurnosSaving}>
                {genTurnosSaving ? 'Creando turnos...' : 'Sí, programar turnos'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación genérico */}
      {modalConfirm && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-body" style={{ padding: 24 }}>
              <p style={{ fontSize: '.95rem', marginBottom: 20 }}>{modalConfirm.msg}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setModalConfirm(null)}>Cancelar</button>
                <button className={`btn ${modalConfirm.danger !== false ? 'btn-danger' : 'btn-primary'}`} onClick={async () => { setModalConfirm(null); await modalConfirm.onConfirm() }}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
