import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { restoreAutosave, startAutosave } from './model/persist'
import { useStore } from './model/store'
import './styles.css'

restoreAutosave().then((r) => {
  if (r && Object.keys(r.project.items).length) { useStore.getState().load(r.project, r.fileName, null, true); useStore.getState().setView('welcome') }
  startAutosave()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
