import { newProject } from '../model/create'
import { exampleProject } from '../model/example'
import { openProject } from '../model/persist'
import { useStore } from '../model/store'
import { useProject } from './hooks'

export function Welcome() {
  const p = useProject()
  const { load, setView, fileName } = useStore()
  const hasWork = Object.keys(p.items).length > 0
  return (
    <div className="page welcome">
      <h2>🦊 Welcome to HazardFox</h2>
      <p className="lead">
        HazardFox is a workspace for <b>STPA</b> (System-Theoretic Process Analysis) and <b>STPA-Sec</b>, a method for
        finding how a system can get into unsafe or insecure states, and for turning that into requirements. It
        keeps all your artifacts linked, so renumbering, tracing and export take care of themselves.
      </p>
      <div className="actions">
        {hasWork && <button className="primary" onClick={() => setView('overview')}>Continue “{p.meta.name}”{fileName ? ` (${fileName})` : ''}</button>}
        <button className={hasWork ? '' : 'primary'} onClick={() => load(newProject(), null)}>New analysis</button>
        <button onClick={() => openProject().catch(() => {})}>Open a file…</button>
        <button onClick={() => load(exampleProject(), null, null, true)}>Explore the infusion-pump example</button>
      </div>

      <h3>The four steps</h3>
      <ol className="steps">
        <li><b>Losses &amp; hazards.</b> What must never happen (losses), and which system states could lead to them (hazards), with system-level constraints.</li>
        <li><b>Control structure.</b> Model the system as controllers, controlled processes and the control actions and feedback between them.</li>
        <li><b>Unsafe control actions.</b> For every control action: when would providing, not providing, or mistiming it be hazardous?</li>
        <li><b>Loss scenarios.</b> Why could those unsafe actions occur, or control actions go wrong? In STPA-Sec, scenarios can also carry threats (STRIDE).</li>
      </ol>

      <h3>What HazardFox does for you</h3>
      <div className="cols">
        <div className="card"><b>Linked artifacts</b><p className="muted">Labels like H-2.1 or UCA-3 are derived, never typed. Move or regroup items and every reference follows. Mention items in text with <code>@</code>.</p></div>
        <div className="card"><b>Checks &amp; traceability</b><p className="muted">Validation flags missing links and gaps; the trace view follows a loss down to requirements. Optional local AI review (Ollama) comments on wording.</p></div>
        <div className="card"><b>Local &amp; portable</b><p className="muted">No server. Your project is a single JSON file, autosaved in the browser as a safety net. Export to Word or Excel, or let an agent edit it via MCP.</p></div>
      </div>

      <h3>Getting started</h3>
      <p className="muted">
        Start with a new analysis and describe the system under analysis on the Overview page, then work through the
        steps in the left menu in order. Press <kbd>⌘K</kbd> to search and jump to any item. The <b>Example…</b> menu
        in the header has worked examples from the STPA Handbook and published analyses to learn from.
      </p>
    </div>
  )
}
