import { Select } from './ui/Select'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { fsAccess, openProject, saveProject } from './model/persist'
import { newProject } from './model/create'
import { useStore, type View } from './model/store'
import { validate } from './model/validate'
import { exampleProject } from './model/example'
import { medicationExampleProject } from './model/domainExample'
import { crossingExampleProject } from './model/crossingExample'
import { HANDBOOK_EXAMPLES, handbookExampleProject } from './model/handbookExamples'
import { PUBLISHED_EXAMPLES, publishedExampleProject } from './model/publishedExamples'
import { Details, EditDialog } from './ui/Details'
import { DialogHost, askConfirm } from './ui/dialogs'
import { useProject } from './ui/hooks'
import { Palette } from './ui/Palette'
import { Structure } from './ui/Structure'
import { Domain, Overview, Requirements, Scenarios, Step1, Ucas } from './ui/views1'
import { Trace } from './ui/views2'
import { Validation } from './ui/Validation'
import { Welcome } from './ui/Welcome'

import { AutoReviewToggle, useAiIssues, useAutoReview } from './ui/Review'
const ExportView = lazy(() => import('./ui/ExportView').then((m) => ({ default: m.ExportView })))

const NAV: [View, string, string][] = [
  ['welcome', 'Welcome', '🦊'],
  ['overview', 'Overview', '◎'],
  ['domain', 'Domain model', '▦'],
  ['step1', '1 · Losses & hazards', '⚠'],
  ['structure', '2 · Control structure', '⛓'],
  ['ucas', '3 · Unsafe control actions', '✖'],
  ['scenarios', '4 · Loss scenarios', '⤳'],
  ['requirements', 'Requirements', '✔'],
  ['trace', 'Traceability', '⇄'],
  ['validation', 'Validation', '✓'],
  ['export', 'Export', '⇩'],
]

export default function App() {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const { undo, redo, past, future, dirty, fileName, load, setPalette } = useStore()
  const p = useProject()
  const issues = useMemo(() => validate(p), [p])
  const aiFindings = useAiIssues()
  useAutoReview()
  const [detailsOpen, setDetailsOpen] = useState(() => window.innerWidth > 860)
  const errs = issues.concat(aiFindings).filter((i) => i.severity !== 'info').length

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (mod && k === 'k') { e.preventDefault(); setPalette(true) }
      else if (mod && k === 's') { e.preventDefault(); saveProject(e.shiftKey).catch(() => {}) }
      else if (mod && k === 'o') { e.preventDefault(); openProject().catch(() => {}) }
      else if (mod && k === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo() }
      else if (mod && k === 'y' && !typing) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [undo, redo, setPalette])

  const body = {
    welcome: <Welcome />, overview: <Overview />, step1: <Step1 />, domain: <Domain />, structure: <Structure />, ucas: <Ucas />,
    scenarios: <Scenarios />, requirements: <Requirements />, trace: <Trace />, validation: <Validation />, export: <ExportView />,
    review: <Validation details />,
  }[view]
  const wideDetails = view !== 'welcome' && view !== 'trace' && view !== 'validation' && view !== 'review' && view !== 'export'

  return (
    <div className="app">
      <header>
        <b className="brand">🦊 HazardFox</b>
        <span className="title" title={p.meta.name}><span className="name">{p.meta.name}{dirty ? ' •' : ''}</span><small className="muted">{fileName ?? 'not saved yet'}</small></span>
        <span className="spacer" />
        <button onClick={async () => { if (!dirty || (await askConfirm('Your changes have not been saved.', { title: 'Discard unsaved changes?', confirm: 'Discard' }))) load(newProject(), null) }}>New</button>
        <button onClick={() => openProject().catch(() => {})}>Open</button>
        <button onClick={() => saveProject().catch(() => {})} title={fsAccess ? 'Save in place (Ctrl+S)' : 'Download (Ctrl+S)'}>Save</button>
        <Select value="" title="Load an example project" onChange={async (e) => { const v = e.target.value; if (v && (!dirty || (await askConfirm('Your changes have not been saved.', { title: 'Discard unsaved changes?', confirm: 'Discard' })))) load(v === 'pump' ? exampleProject() : v === 'medication' ? medicationExampleProject() : v === 'crossing' ? crossingExampleProject() : v.startsWith('pub-') ? publishedExampleProject(v) : handbookExampleProject(v), null, null, true) }}>
          <option value="">Example…</option>
          <option value="pump">Infusion pump (example)</option>
          <option value="medication">Hospital medication (large domain model)</option>
          <option value="crossing">Level crossing (several trains: some / every / no)</option>
          <optgroup label="STPA Handbook, appendices">
            {HANDBOOK_EXAMPLES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </optgroup>
          <optgroup label="Published STPA analyses">
            {PUBLISHED_EXAMPLES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </optgroup>
        </Select>
        <span className="sep" />
        <button disabled={!past.length} onClick={undo} title="Undo (Ctrl+Z)">↶</button>
        <button disabled={!future.length} onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
        <AutoReviewToggle />
        <button onClick={() => setPalette(true)} title="Ctrl+K">Search <span className="wide-only">⌘K</span></button>
        {wideDetails && <button className={detailsOpen ? 'on' : ''} onClick={() => setDetailsOpen(!detailsOpen)} title={detailsOpen ? 'Hide the details panel' : 'Show the details panel'}>Details</button>}
      </header>
      <nav>
        {NAV.map(([v, l, ic]) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)} title={l}>
            <span className="ic">{ic}</span><span className="nav-l">{l}</span>{v === 'validation' && errs > 0 && <i className="badge" title="Errors and warnings">{errs}</i>}
          </button>
        ))}
      </nav>
      <main><Suspense fallback={<p className="muted" style={{ padding: 16 }}>Loading…</p>}>{body}</Suspense></main>
      {wideDetails && detailsOpen && <Details />}
      <Palette />
      <EditDialog />
      <DialogHost />
    </div>
  )
}
