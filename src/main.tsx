import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Prevent mouse wheel from changing number input values globally
document.addEventListener('wheel', (e) => {
  const el = document.activeElement as HTMLInputElement | null
  if (el && el.type === 'number') el.blur()
}, { passive: false })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
