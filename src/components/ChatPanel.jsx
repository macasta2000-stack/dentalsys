import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'

const POLL_INTERVAL = 5000 // 5 seconds

// ── Main Chat Panel ─────────────────────────────────────────────────────────

export default function ChatPanel({ isOpen, onClose }) {
  const [view, setView] = useState('list') // list | thread | nuevo
  const [conversaciones, setConversaciones] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [loading, setLoading] = useState(false)

  // Load conversations
  const loadConversaciones = useCallback(async () => {
    try {
      const data = await api.chat.conversaciones()
      setConversaciones(Array.isArray(data) ? data : [])
    } catch {}
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadConversaciones()
      const interval = setInterval(loadConversaciones, POLL_INTERVAL)
      return () => clearInterval(interval)
    }
  }, [isOpen, loadConversaciones])

  // Open group chat (create if not exists)
  async function openGrupo() {
    setLoading(true)
    try {
      const res = await api.chat.crearConversacion('grupo')
      setActiveConv({ id: res.conversacion_id, nombre: 'Equipo', tipo: 'grupo' })
      setView('thread')
    } catch {} finally { setLoading(false) }
  }

  // Open private chat
  async function openPrivado(member) {
    setLoading(true)
    try {
      const res = await api.chat.crearConversacion('privado', member.user_type, member.user_id)
      setActiveConv({ id: res.conversacion_id, nombre: member.nombre, tipo: 'privado' })
      setView('thread')
    } catch {} finally { setLoading(false) }
  }

  function openConv(conv) {
    setActiveConv(conv)
    setView('thread')
  }

  function goBack() {
    setView('list')
    setActiveConv(null)
    loadConversaciones()
  }

  if (!isOpen) return null

  return (
    <>
      <div className="chat-overlay" onClick={onClose} />
      <aside className="chat-panel">
        {/* Header */}
        <div className="chat-header">
          {view !== 'list' && (
            <button className="chat-back" onClick={goBack} title="Volver">←</button>
          )}
          <span className="chat-header-title">
            {view === 'list' ? 'Chat del equipo' : view === 'nuevo' ? 'Nuevo chat' : activeConv?.nombre || 'Chat'}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {view === 'list' && (
              <button className="chat-action-btn" onClick={() => setView('nuevo')} title="Nuevo chat privado">+</button>
            )}
            <button className="chat-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        {view === 'list' && (
          <ConversationList
            conversaciones={conversaciones}
            onOpenConv={openConv}
            onOpenGrupo={openGrupo}
            loading={loading}
          />
        )}
        {view === 'thread' && activeConv && (
          <MessageThread conv={activeConv} />
        )}
        {view === 'nuevo' && (
          <NewChatView onSelect={openPrivado} />
        )}
      </aside>
    </>
  )
}

// ── Conversation List ────────────────────────────────────────────────────────

function ConversationList({ conversaciones, onOpenConv, onOpenGrupo, loading }) {
  const hasGrupo = conversaciones.some(c => c.tipo === 'grupo')

  return (
    <div className="chat-body">
      {/* Quick action: group chat */}
      {!hasGrupo && (
        <button className="chat-conv-item chat-conv-new" onClick={onOpenGrupo} disabled={loading}>
          <div className="chat-conv-avatar grupo">E</div>
          <div className="chat-conv-info">
            <div className="chat-conv-name">Crear chat de equipo</div>
            <div className="chat-conv-last">Incluye a todos los miembros del consultorio</div>
          </div>
        </button>
      )}

      {conversaciones.length === 0 && hasGrupo === false && (
        <div className="chat-empty">Sin conversaciones. Creá el chat de equipo o iniciá un chat privado.</div>
      )}

      {conversaciones.map(conv => (
        <button key={conv.id} className="chat-conv-item" onClick={() => onOpenConv(conv)}>
          <div className={`chat-conv-avatar ${conv.tipo}`}>
            {conv.tipo === 'grupo' ? 'E' : conv.nombre?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="chat-conv-info">
            <div className="chat-conv-name">
              {conv.nombre}
              {conv.no_leidos > 0 && <span className="chat-unread-badge">{conv.no_leidos}</span>}
            </div>
            {conv.ultimo_mensaje && (
              <div className="chat-conv-last">
                <strong>{conv.ultimo_mensaje.sender}:</strong> {conv.ultimo_mensaje.texto?.slice(0, 50)}
                {conv.ultimo_mensaje.texto?.length > 50 ? '...' : ''}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Message Thread ───────────────────────────────────────────────────────────

function MessageThread({ conv }) {
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  const loadMessages = useCallback(async (after) => {
    try {
      const data = await api.chat.mensajes(conv.id, after)
      if (Array.isArray(data) && data.length > 0) {
        setMensajes(prev => {
          const ids = new Set(prev.map(m => m.id))
          const newMsgs = data.filter(m => !ids.has(m.id))
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev
        })
      }
    } catch {}
  }, [conv.id])

  // Initial load + mark as read
  useEffect(() => {
    setMensajes([])
    loadMessages()
    api.chat.marcarLeido(conv.id).catch(() => {})
    inputRef.current?.focus()
  }, [conv.id, loadMessages])

  // Poll for new messages
  useEffect(() => {
    const interval = setInterval(() => {
      const lastMsg = mensajes[mensajes.length - 1]
      loadMessages(lastMsg?.created_at)
    }, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [mensajes, loadMessages])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  async function handleSend(e) {
    e.preventDefault()
    if (!texto.trim() || sending) return
    setSending(true)
    try {
      const msg = await api.chat.enviar(conv.id, texto.trim())
      setMensajes(prev => [...prev, msg])
      setTexto('')
      inputRef.current?.focus()
    } catch {} finally { setSending(false) }
  }

  function formatHora(iso) {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      const hoy = new Date().toISOString().slice(0, 10)
      const fecha = iso.slice(0, 10)
      const hora = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      if (fecha === hoy) return hora
      return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${hora}`
    } catch { return '' }
  }

  return (
    <div className="chat-thread-wrapper">
      <div className="chat-messages">
        {mensajes.length === 0 && (
          <div className="chat-empty">No hay mensajes todavía. Escribí algo para empezar.</div>
        )}
        {mensajes.map(msg => (
          <div key={msg.id} className={`chat-msg ${msg.sender_type === 'owner' && !msg.sender_id ? '' : ''}`}>
            <div className="chat-msg-header">
              <span className="chat-msg-sender">{msg.sender_nombre}</span>
              <span className="chat-msg-time">{formatHora(msg.created_at)}</span>
            </div>
            <div className="chat-msg-text">{msg.texto}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-bar" onSubmit={handleSend}>
        <input
          ref={inputRef}
          className="chat-input"
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Escribí un mensaje..."
          maxLength={2000}
          disabled={sending}
        />
        <button type="submit" className="chat-send-btn" disabled={!texto.trim() || sending}>
          {sending ? '...' : '➤'}
        </button>
      </form>
    </div>
  )
}

// ── New Chat View (pick team member) ─────────────────────────────────────────

function NewChatView({ onSelect }) {
  const [miembros, setMiembros] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.chat.miembros()
      .then(data => setMiembros(Array.isArray(data) ? data.filter(m => !m.es_yo) : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="chat-body"><div className="chat-empty">Cargando equipo...</div></div>

  return (
    <div className="chat-body">
      {miembros.length === 0 ? (
        <div className="chat-empty">No hay otros miembros en el equipo. Agregá colaboradores desde Configuración.</div>
      ) : (
        miembros.map(m => (
          <button key={`${m.user_type}-${m.user_id}`} className="chat-conv-item" onClick={() => onSelect(m)}>
            <div className="chat-conv-avatar privado">{m.nombre?.[0]?.toUpperCase() || '?'}</div>
            <div className="chat-conv-info">
              <div className="chat-conv-name">{m.nombre}</div>
              <div className="chat-conv-last">{m.rol}</div>
            </div>
          </button>
        ))
      )}
    </div>
  )
}

// ── Floating Chat Button with unread count ───────────────────────────────────

export function ChatButton({ onClick }) {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let active = true
    async function check() {
      try {
        const data = await api.chat.conversaciones()
        if (!active) return
        const total = (Array.isArray(data) ? data : []).reduce((sum, c) => sum + (c.no_leidos || 0), 0)
        setUnread(total)
      } catch {}
    }
    check()
    const interval = setInterval(check, 15000) // check every 15s
    return () => { active = false; clearInterval(interval) }
  }, [])

  return (
    <button className="chat-fab" onClick={onClick} title="Chat del equipo">
      <span className="chat-fab-icon">💬</span>
      {unread > 0 && <span className="chat-fab-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
  )
}
