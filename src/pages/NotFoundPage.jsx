import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--c-bg, #f0f6ff)',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 4px 32px rgba(3,105,161,.10)',
        padding: '48px 40px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
      }}>
        {/* Illustration */}
        <div style={{ fontSize: '4rem', marginBottom: 8, lineHeight: 1 }}>🏥</div>
        <div style={{
          fontSize: '5rem',
          fontWeight: 800,
          color: 'var(--c-primary, #0369a1)',
          lineHeight: 1,
          marginBottom: 8,
          letterSpacing: '-2px',
        }}>404</div>

        <h1 style={{
          fontSize: '1.35rem',
          fontWeight: 700,
          color: 'var(--c-text, #0f172a)',
          margin: '0 0 10px',
        }}>
          Página no encontrada
        </h1>

        <p style={{
          fontSize: '.93rem',
          color: 'var(--c-text-3, #64748b)',
          marginBottom: 32,
          lineHeight: 1.6,
        }}>
          La página que buscás no existe o fue movida.<br />
          Verificá la URL o volvé al inicio.
        </p>

        <button
          onClick={() => navigate('/')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 28px',
            background: 'var(--c-primary, #0369a1)',
            color: '#fff',
            border: 'none',
            borderRadius: 100,
            fontWeight: 700,
            fontSize: '.9rem',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(3,105,161,.25)',
            transition: 'background .15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--c-primary-dark, #075985)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--c-primary, #0369a1)'}
        >
          ← Volver al inicio
        </button>
      </div>
    </div>
  )
}
