import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { format, addDays, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

const BASE = '/api'

async function fetchJSON(path) {
  const r = await fetch(`${BASE}${path}`)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || 'Error')
  return data?.data ?? data
}
async function postJSON(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || 'Error')
  return data?.data ?? data
}

const DIAS_LABEL = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

export default function BookingPage() {
  const { slug } = useParams()
  const [clinic, setClinic] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [step, setStep] = useState(1) // 1=info, 2=fecha, 3=hora, 4=form, 5=done
  const [selectedDate, setSelectedDate] = useState(null)
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [selectedProf, setSelectedProf] = useState('')
  const [slots, setSlots] = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [form, setForm] = useState({ nombre: '', apellido: '', telefono: '', email: '', motivo: '' })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    fetchJSON(`/booking/${slug}`)
      .then(data => { setClinic(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [slug])

  async function loadSlots(fecha) {
    setLoadingSlots(true)
    try {
      const q = selectedProf ? `&profesional_id=${selectedProf}` : ''
      const data = await fetchJSON(`/booking/${slug}/slots?fecha=${fecha}${q}`)
      setSlots(data ?? [])
    } catch { setSlots([]) }
    setLoadingSlots(false)
  }

  function selectDate(d) {
    const dateStr = format(d, 'yyyy-MM-dd')
    setSelectedDate(dateStr)
    setSelectedSlot(null)
    loadSlots(dateStr)
    setStep(3)
  }

  function selectSlot(slot) {
    setSelectedSlot(slot)
    setStep(4)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return
    if (!form.telefono.trim() && !form.email.trim()) return
    setSending(true)
    try {
      const res = await postJSON(`/booking/${slug}`, {
        ...form,
        fecha_hora: selectedSlot.fecha_hora,
        profesional_id: selectedProf || undefined,
      })
      setResult(res)
      setStep(5)
    } catch (err) {
      alert(err.message)
    }
    setSending(false)
  }

  // Generate next 14 days
  const diasLaborales = (clinic?.dias_laborales || '1,2,3,4,5').split(',').map(Number)
  const proxDias = []
  for (let i = 0; i < 21 && proxDias.length < 14; i++) {
    const d = addDays(new Date(), i)
    if (diasLaborales.includes(d.getDay())) proxDias.push(d)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{ textAlign: 'center', color: '#64748B' }}>Cargando...</div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 40 }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🦷</div>
        <h2 style={{ color: '#1E293B', marginBottom: 8 }}>No encontramos este consultorio</h2>
        <p style={{ color: '#64748B' }}>{error}</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #F0F9FF 0%, #F8FAFC 100%)', padding: '20px 16px' }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🦷</div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0369A1', margin: 0 }}>{clinic.nombre_consultorio}</h1>
          {clinic.nombre_profesional && <p style={{ color: '#64748B', fontSize: '.9rem', margin: '4px 0 0' }}>{clinic.nombre_profesional}</p>}
          {clinic.direccion && <p style={{ color: '#94A3B8', fontSize: '.82rem', margin: '2px 0 0' }}>{clinic.direccion}{clinic.ciudad ? `, ${clinic.ciudad}` : ''}</p>}
        </div>

        {/* Steps indicator */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {[1, 2, 3, 4].map(s => (
            <div key={s} style={{ width: s <= step ? 32 : 24, height: 4, borderRadius: 2, background: s <= step ? '#0369A1' : '#CBD5E1', transition: 'all .2s' }} />
          ))}
        </div>

        <div style={{ background: '#FFF', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.06)', overflow: 'hidden' }}>

          {/* Step 1: Profesional (si hay mas de 1) */}
          {step === 1 && (
            <div style={{ padding: 24 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: 16 }}>Solicitar turno online</h2>
              {clinic.profesionales?.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569', marginBottom: 6, display: 'block' }}>Profesional (opcional)</label>
                  <select style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9rem' }}
                    value={selectedProf} onChange={e => setSelectedProf(e.target.value)}>
                    <option value="">Cualquier profesional</option>
                    {clinic.profesionales.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
                  </select>
                </div>
              )}
              <p style={{ color: '#64748B', fontSize: '.85rem', marginBottom: 16 }}>
                Horario de atencion: {clinic.horario_inicio} a {clinic.horario_fin}
              </p>
              <button onClick={() => setStep(2)}
                style={{ width: '100%', padding: '12px', background: '#0369A1', color: '#FFF', border: 'none', borderRadius: 10, fontSize: '.95rem', fontWeight: 600, cursor: 'pointer' }}>
                Elegir fecha
              </button>
            </div>
          )}

          {/* Step 2: Fecha */}
          {step === 2 && (
            <div style={{ padding: 24 }}>
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#0369A1', cursor: 'pointer', fontSize: '.85rem', marginBottom: 12 }}>← Volver</button>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: 16 }}>Selecciona un dia</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
                {proxDias.map(d => {
                  const dateStr = format(d, 'yyyy-MM-dd')
                  const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
                  return (
                    <button key={dateStr} onClick={() => selectDate(d)}
                      style={{ padding: '12px 8px', background: isToday ? '#F0F9FF' : '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = '#0369A1'; e.currentTarget.style.background = '#F0F9FF' }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = isToday ? '#F0F9FF' : '#F8FAFC' }}>
                      <div style={{ fontSize: '.72rem', color: '#94A3B8', fontWeight: 600 }}>{DIAS_LABEL[d.getDay()]}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1E293B' }}>{d.getDate()}</div>
                      <div style={{ fontSize: '.72rem', color: '#64748B' }}>{format(d, 'MMM', { locale: es })}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: Hora */}
          {step === 3 && (
            <div style={{ padding: 24 }}>
              <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: '#0369A1', cursor: 'pointer', fontSize: '.85rem', marginBottom: 12 }}>← Volver</button>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: 4 }}>
                Horarios disponibles
              </h2>
              <p style={{ color: '#64748B', fontSize: '.85rem', marginBottom: 16 }}>
                {selectedDate && format(new Date(selectedDate + 'T12:00'), "EEEE d 'de' MMMM", { locale: es })}
              </p>
              {loadingSlots ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}>Buscando horarios...</div>
              ) : slots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>😔</div>
                  <p style={{ color: '#64748B' }}>No hay horarios disponibles este dia</p>
                  <button onClick={() => setStep(2)} style={{ marginTop: 12, padding: '8px 20px', background: '#0369A1', color: '#FFF', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Elegir otro dia</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
                  {slots.map(s => (
                    <button key={s.hora} onClick={() => selectSlot(s)}
                      style={{ padding: '10px 8px', background: '#FFF', border: '1.5px solid #E2E8F0', borderRadius: 8, cursor: 'pointer', fontSize: '.9rem', fontWeight: 600, color: '#0369A1', transition: 'all .15s' }}
                      onMouseOver={e => { e.currentTarget.style.background = '#0369A1'; e.currentTarget.style.color = '#FFF' }}
                      onMouseOut={e => { e.currentTarget.style.background = '#FFF'; e.currentTarget.style.color = '#0369A1' }}>
                      {s.hora}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: Formulario */}
          {step === 4 && (
            <form onSubmit={handleSubmit} style={{ padding: 24 }}>
              <button type="button" onClick={() => setStep(3)} style={{ background: 'none', border: 'none', color: '#0369A1', cursor: 'pointer', fontSize: '.85rem', marginBottom: 12 }}>← Volver</button>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, color: '#1E293B', marginBottom: 4 }}>Completa tus datos</h2>
              <p style={{ color: '#64748B', fontSize: '.85rem', marginBottom: 16 }}>
                Turno: {selectedDate && format(new Date(selectedDate + 'T12:00'), "EEEE d 'de' MMMM", { locale: es })} a las {selectedSlot?.hora}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Nombre *</label>
                    <input type="text" required style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9rem' }}
                      value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} placeholder="Juan" />
                  </div>
                  <div>
                    <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Apellido</label>
                    <input type="text" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9rem' }}
                      value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} placeholder="Perez" />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Telefono *</label>
                  <input type="tel" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9rem' }}
                    value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} placeholder="11 5555-4444" />
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Email (opcional)</label>
                  <input type="email" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9rem' }}
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="juan@email.com" />
                </div>
                <div>
                  <label style={{ fontSize: '.82rem', fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>Motivo de consulta</label>
                  <select style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: '.9rem' }}
                    value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })}>
                    <option value="">Seleccionar...</option>
                    <option value="Control rutinario">Control rutinario</option>
                    <option value="Dolor de muela">Dolor de muela</option>
                    <option value="Limpieza">Limpieza dental</option>
                    <option value="Ortodoncia">Ortodoncia</option>
                    <option value="Implante">Implante</option>
                    <option value="Blanqueamiento">Blanqueamiento</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <button type="submit" disabled={sending}
                  style={{ width: '100%', padding: '13px', background: '#0369A1', color: '#FFF', border: 'none', borderRadius: 10, fontSize: '.95rem', fontWeight: 600, cursor: 'pointer', marginTop: 8, opacity: sending ? .6 : 1 }}>
                  {sending ? 'Enviando...' : 'Solicitar turno'}
                </button>
              </div>
            </form>
          )}

          {/* Step 5: Confirmacion */}
          {step === 5 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#059669', marginBottom: 8 }}>Solicitud enviada</h2>
              <p style={{ color: '#64748B', fontSize: '.9rem', lineHeight: 1.5 }}>
                {result?.mensaje || 'El consultorio te confirmara el turno por telefono o email.'}
              </p>
              <div style={{ marginTop: 20, padding: 16, background: '#F0FDF4', borderRadius: 10, fontSize: '.85rem', color: '#15803D' }}>
                <strong>{format(new Date(selectedSlot.fecha_hora), "EEEE d 'de' MMMM 'a las' HH:mm", { locale: es })}</strong>
                <br />{clinic.nombre_consultorio}
                {clinic.direccion && <><br />{clinic.direccion}</>}
              </div>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '.72rem', marginTop: 20 }}>
          Powered by DentalSys
        </p>
      </div>
    </div>
  )
}
