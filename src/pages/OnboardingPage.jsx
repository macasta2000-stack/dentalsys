import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'

const ESPECIALIDADES = [
  'Clínica Médica', 'Odontología', 'Pediatría', 'Cardiología',
  'Dermatología', 'Traumatología', 'Oftalmología', 'Ginecología',
  'Psiquiatría', 'Neurología', 'Oncología', 'Endocrinología',
  'Kinesiología', 'Psicología', 'Nutrición', 'Fonoaudiología',
]

const OBRAS_SOCIALES_COMUNES = [
  'OSDE', 'Swiss Medical', 'Galeno', 'PAMI', 'IOMA', 'APROSS',
  'OMINT', 'Medicus', 'Sancor Salud', 'Accord Salud', 'OSPAT',
]

const STEPS = [
  { id: 'especialidad', title: '¿Cuál es tu especialidad?', emoji: '🏥' },
  { id: 'equipo',       title: '¿Cuántos profesionales trabajan en el centro?', emoji: '👥' },
  { id: 'obras',        title: '¿Trabajás con obras sociales?', emoji: '🏦' },
  { id: 'cobro',        title: '¿Cómo organizás los cobros?', emoji: '💰' },
  { id: 'recepcion',    title: '¿Tenés recepción física?', emoji: '🚪' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [answers, setAnswers] = useState({
    nombre_consultorio: '',
    especialidad: '',
    especialidad_custom: '',
    num_profesionales: 1,
    tiene_obras: 'no',
    obras_sociales: [],
    obra_input: '',
    tipo_cobro: 'prestacion',
    tiene_recepcion: false,
  })

  const set = (k, v) => setAnswers(a => ({ ...a, [k]: v }))

  function addObra() {
    const val = answers.obra_input.trim()
    if (!val || answers.obras_sociales.includes(val)) return
    set('obras_sociales', [...answers.obras_sociales, val])
    set('obra_input', '')
  }

  function removeObra(os) {
    set('obras_sociales', answers.obras_sociales.filter(o => o !== os))
  }

  function addObraQuick(os) {
    if (answers.obras_sociales.includes(os)) {
      removeObra(os)
    } else {
      set('obras_sociales', [...answers.obras_sociales, os])
    }
  }

  const canNext = () => {
    const s = STEPS[step]
    if (s.id === 'especialidad') return (answers.especialidad || answers.especialidad_custom).trim().length > 0
    if (s.id === 'obras' && answers.tiene_obras === 'si') return answers.obras_sociales.length > 0
    return true
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }
  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  async function handleFinish() {
    setSaving(true)
    try {
      const especialidad = answers.especialidad_custom.trim() || answers.especialidad
      await api.onboarding.complete({
        nombre_consultorio: answers.nombre_consultorio,
        especialidad,
        num_profesionales: answers.num_profesionales,
        obras_sociales: answers.tiene_obras !== 'no' ? answers.obras_sociales : [],
        tipo_cobro: answers.tipo_cobro,
        tiene_recepcion: answers.tiene_recepcion,
      })
      await refreshUser?.()
      navigate('/', { replace: true })
    } catch (e) {
      console.error('Error en onboarding:', e)
      // Aún así navegar — no queremos bloquear al usuario
      navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  const current = STEPS[step]
  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px 16px', fontFamily: 'Outfit, system-ui, sans-serif',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>🏥</div>
        <div style={{ color: '#3b82f6', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.5px' }}>Clingest</div>
        <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: 2 }}>Configuremos tu sistema</div>
      </div>

      {/* Card principal */}
      <div style={{
        background: '#1e293b', borderRadius: 20, padding: '36px 32px',
        width: '100%', maxWidth: 520, border: '1px solid #334155',
        boxShadow: '0 24px 64px rgba(0,0,0,.4)',
      }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#64748b', fontSize: '.8rem' }}>Paso {step + 1} de {STEPS.length}</span>
            <span style={{ color: '#3b82f6', fontSize: '.8rem', fontWeight: 600 }}>{Math.round(progress)}%</span>
          </div>
          <div style={{ height: 6, background: '#334155', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
              borderRadius: 99, width: `${progress}%`,
              transition: 'width .4s cubic-bezier(.4,0,.2,1)',
            }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {STEPS.map((s, i) => (
              <div key={s.id} style={{
                flex: 1, height: 3, borderRadius: 99,
                background: i <= step ? '#3b82f6' : '#334155',
                transition: 'background .3s',
              }} />
            ))}
          </div>
        </div>

        {/* Header del paso */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>{current.emoji}</div>
          <h2 style={{ color: '#f1f5f9', fontSize: '1.3rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>
            {current.title}
          </h2>
        </div>

        {/* ── PASO 1: Especialidad ── */}
        {current.id === 'especialidad' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '.82rem', marginBottom: 6, display: 'block' }}>
                Nombre del centro (opcional)
              </label>
              <input
                style={inputStyle}
                placeholder=""
                value={answers.nombre_consultorio}
                onChange={e => set('nombre_consultorio', e.target.value)}
              />
            </div>
            <div>
              <label style={{ color: '#94a3b8', fontSize: '.82rem', marginBottom: 8, display: 'block' }}>
                Seleccioná tu especialidad
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {ESPECIALIDADES.map(esp => (
                  <button key={esp} onClick={() => { set('especialidad', esp); set('especialidad_custom', '') }}
                    style={{
                      ...pillStyle,
                      background: answers.especialidad === esp ? '#3b82f6' : '#0f172a',
                      color: answers.especialidad === esp ? '#fff' : '#94a3b8',
                      border: `1px solid ${answers.especialidad === esp ? '#3b82f6' : '#334155'}`,
                    }}>
                    {esp}
                  </button>
                ))}
              </div>
              <input
                style={inputStyle}
                placeholder=""
                value={answers.especialidad_custom}
                onChange={e => { set('especialidad_custom', e.target.value); set('especialidad', '') }}
              />
            </div>
          </div>
        )}

        {/* ── PASO 2: Equipo ── */}
        {current.id === 'equipo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { val: 1, label: 'Solo yo', desc: 'Consultorio individual', emoji: '👨‍⚕️' },
              { val: 3, label: '2 a 5 profesionales', desc: 'Clínica pequeña', emoji: '👩‍⚕️👨‍⚕️' },
              { val: 8, label: '6 a 10 profesionales', desc: 'Centro médico mediano', emoji: '🏥' },
              { val: 15, label: 'Más de 10', desc: 'Centro médico grande', emoji: '🏨' },
            ].map(opt => (
              <button key={opt.val} onClick={() => set('num_profesionales', opt.val)}
                style={{
                  ...optionCardStyle,
                  border: `2px solid ${answers.num_profesionales === opt.val ? '#3b82f6' : '#334155'}`,
                  background: answers.num_profesionales === opt.val ? 'rgba(59,130,246,.1)' : '#0f172a',
                }}>
                <span style={{ fontSize: '1.5rem' }}>{opt.emoji}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '.95rem' }}>{opt.label}</div>
                  <div style={{ color: '#64748b', fontSize: '.8rem' }}>{opt.desc}</div>
                </div>
                {answers.num_profesionales === opt.val && <span style={{ color: '#3b82f6', fontSize: '1.2rem' }}>✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── PASO 3: Obras sociales ── */}
        {current.id === 'obras' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { val: 'no', label: 'No, solo privado', emoji: '💳' },
                { val: 'si', label: 'Sí, trabajo con obras sociales', emoji: '🏦' },
                { val: 'algunos', label: 'Algunas consultas con cobertura', emoji: '🔀' },
              ].map(opt => (
                <button key={opt.val} onClick={() => set('tiene_obras', opt.val)}
                  style={{
                    ...optionCardStyle,
                    border: `2px solid ${answers.tiene_obras === opt.val ? '#3b82f6' : '#334155'}`,
                    background: answers.tiene_obras === opt.val ? 'rgba(59,130,246,.1)' : '#0f172a',
                  }}>
                  <span style={{ fontSize: '1.3rem' }}>{opt.emoji}</span>
                  <div style={{ color: '#f1f5f9', fontWeight: 500 }}>{opt.label}</div>
                  {answers.tiene_obras === opt.val && <span style={{ color: '#3b82f6', marginLeft: 'auto' }}>✓</span>}
                </button>
              ))}
            </div>

            {(answers.tiene_obras === 'si' || answers.tiene_obras === 'algunos') && (
              <div style={{ marginTop: 8 }}>
                <div style={{ color: '#94a3b8', fontSize: '.82rem', marginBottom: 8 }}>
                  ¿Cuáles? (podés agregar más desde Configuración)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {OBRAS_SOCIALES_COMUNES.map(os => (
                    <button key={os} onClick={() => addObraQuick(os)}
                      style={{
                        ...pillStyle,
                        background: answers.obras_sociales.includes(os) ? '#0ea5e9' : '#0f172a',
                        color: answers.obras_sociales.includes(os) ? '#fff' : '#94a3b8',
                        border: `1px solid ${answers.obras_sociales.includes(os) ? '#0ea5e9' : '#334155'}`,
                      }}>
                      {os}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder=""
                    value={answers.obra_input}
                    onChange={e => set('obra_input', e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addObra()}
                  />
                  <button onClick={addObra} style={addBtnStyle}>+ Agregar</button>
                </div>
                {answers.obras_sociales.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {answers.obras_sociales.map(os => (
                      <span key={os} style={{
                        background: '#1e3a5f', color: '#7dd3fc', borderRadius: 20,
                        padding: '4px 10px', fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        {os}
                        <button onClick={() => removeObra(os)} style={{ background: 'none', border: 'none', color: '#7dd3fc', cursor: 'pointer', padding: 0, fontSize: '.9rem' }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── PASO 4: Cobro ── */}
        {current.id === 'cobro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { val: 'consulta', label: 'Por consulta', desc: 'Precio fijo por cada visita', emoji: '🩺' },
              { val: 'prestacion', label: 'Por prestación', desc: 'Cada servicio tiene su propio precio', emoji: '📋' },
              { val: 'mixto', label: 'Mixto', desc: 'Consulta base + prestaciones adicionales', emoji: '🔀' },
            ].map(opt => (
              <button key={opt.val} onClick={() => set('tipo_cobro', opt.val)}
                style={{
                  ...optionCardStyle,
                  border: `2px solid ${answers.tipo_cobro === opt.val ? '#3b82f6' : '#334155'}`,
                  background: answers.tipo_cobro === opt.val ? 'rgba(59,130,246,.1)' : '#0f172a',
                }}>
                <span style={{ fontSize: '1.5rem' }}>{opt.emoji}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#f1f5f9', fontWeight: 600 }}>{opt.label}</div>
                  <div style={{ color: '#64748b', fontSize: '.8rem' }}>{opt.desc}</div>
                </div>
                {answers.tipo_cobro === opt.val && <span style={{ color: '#3b82f6' }}>✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* ── PASO 5: Recepción ── */}
        {current.id === 'recepcion' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => set('tiene_recepcion', true)}
              style={{
                ...optionCardStyle,
                border: `2px solid ${answers.tiene_recepcion ? '#3b82f6' : '#334155'}`,
                background: answers.tiene_recepcion ? 'rgba(59,130,246,.1)' : '#0f172a',
              }}>
              <span style={{ fontSize: '1.5rem' }}>🚪</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ color: '#f1f5f9', fontWeight: 600 }}>Sí, tengo recepción</div>
                <div style={{ color: '#64748b', fontSize: '.8rem' }}>
                  El sistema habilitará: recepción de pacientes, sala de espera, cobro al salir
                </div>
              </div>
              {answers.tiene_recepcion && <span style={{ color: '#3b82f6' }}>✓</span>}
            </button>
            <button onClick={() => set('tiene_recepcion', false)}
              style={{
                ...optionCardStyle,
                border: `2px solid ${!answers.tiene_recepcion ? '#3b82f6' : '#334155'}`,
                background: !answers.tiene_recepcion ? 'rgba(59,130,246,.1)' : '#0f172a',
              }}>
              <span style={{ fontSize: '1.5rem' }}>🩺</span>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ color: '#f1f5f9', fontWeight: 600 }}>No, consultorio directo</div>
                <div style={{ color: '#64748b', fontSize: '.8rem' }}>
                  Los pacientes van directo al consultorio. Flujo simplificado.
                </div>
              </div>
              {!answers.tiene_recepcion && <span style={{ color: '#3b82f6' }}>✓</span>}
            </button>

            {/* Preview del workflow */}
            <div style={{ marginTop: 8, padding: '14px 16px', background: '#0f172a', borderRadius: 10, border: '1px solid #334155' }}>
              <div style={{ color: '#64748b', fontSize: '.75rem', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tu flujo de atención quedará así:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {(answers.tiene_recepcion
                  ? ['Recepción', 'Sala de espera', 'Consultorio', 'Cobro', 'Salida']
                  : ['Consultorio', 'Cobro']
                ).map((etapa, i, arr) => (
                  <span key={etapa} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      background: '#1e3a5f', color: '#7dd3fc', borderRadius: 20,
                      padding: '4px 10px', fontSize: '.78rem', fontWeight: 500,
                    }}>{etapa}</span>
                    {i < arr.length - 1 && <span style={{ color: '#334155' }}>→</span>}
                  </span>
                ))}
                <span style={{ color: '#64748b', fontSize: '.75rem' }}>(personalizable)</span>
              </div>
            </div>
          </div>
        )}

        {/* Navegación */}
        <div style={{ display: 'flex', gap: 10, marginTop: 28, justifyContent: 'space-between' }}>
          {step > 0 ? (
            <button onClick={prev} style={backBtnStyle}>← Anterior</button>
          ) : (
            <div />
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={next} disabled={!canNext()} style={{
              ...nextBtnStyle,
              opacity: canNext() ? 1 : .4,
              cursor: canNext() ? 'pointer' : 'not-allowed',
            }}>
              Siguiente →
            </button>
          ) : (
            <button onClick={handleFinish} disabled={saving} style={nextBtnStyle}>
              {saving ? '⏳ Configurando...' : '✅ ¡Listo, empezar!'}
            </button>
          )}
        </div>
      </div>

      {/* Skip */}
      <button
        onClick={async () => {
          try { await api.onboarding.complete({ skip: true }); await refreshUser?.() } catch {}
          navigate('/', { replace: true })
        }}
        style={{ marginTop: 16, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '.82rem' }}
      >
        Omitir por ahora →
      </button>
    </div>
  )
}

// ── Estilos compartidos ──
const inputStyle = {
  width: '100%', background: '#0f172a', border: '1px solid #334155',
  borderRadius: 8, padding: '10px 12px', color: '#f1f5f9',
  fontSize: '.9rem', outline: 'none', boxSizing: 'border-box',
}

const pillStyle = {
  padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
  fontSize: '.82rem', fontWeight: 500, transition: 'all .15s',
}

const optionCardStyle = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
  borderRadius: 12, cursor: 'pointer', background: 'none', width: '100%',
  transition: 'all .2s',
}

const addBtnStyle = {
  background: '#334155', color: '#94a3b8', border: 'none',
  borderRadius: 8, padding: '10px 14px', cursor: 'pointer',
  fontSize: '.85rem', whiteSpace: 'nowrap',
}

const backBtnStyle = {
  background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
  borderRadius: 10, padding: '10px 20px', cursor: 'pointer',
  fontSize: '.9rem', fontWeight: 500,
}

const nextBtnStyle = {
  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
  color: '#fff', border: 'none', borderRadius: 10,
  padding: '12px 28px', cursor: 'pointer', fontSize: '.95rem',
  fontWeight: 700, boxShadow: '0 4px 14px rgba(59,130,246,.4)',
}
