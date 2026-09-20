import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            style: {
              background: '#222',
              color: '#fff',
            },
          }}
        />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
