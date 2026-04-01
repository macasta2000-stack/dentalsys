import React from 'react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:'2rem', textAlign:'center'}}>
          <div style={{fontSize:'3rem', marginBottom:'1rem'}}>⚠️</div>
          <h2 style={{color:'#f8fafc', marginBottom:'.5rem'}}>Algo salió mal</h2>
          <p style={{color:'#94a3b8', marginBottom:'1.5rem'}}>
            {this.state.error?.message || 'Error inesperado'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload() }}
            style={{background:'#3b82f6', color:'white', border:'none', padding:'.6rem 1.5rem', borderRadius:'8px', cursor:'pointer'}}
          >
            Recargar página
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
