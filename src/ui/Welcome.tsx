import { newProject } from '../model/create'
import { exampleProject } from '../model/example'
import { openProject } from '../model/persist'
import { useStore } from '../model/store'
import { useProject } from './hooks'
import { Icon } from './Icon'

export function Welcome() {
  const p = useProject()
  const { load, setView, fileName } = useStore()
  const hasWork = Object.keys(p.items).length > 0
  return (
    <div className="page welcome">
      <section className="hero">
        <h2>🦊 HazardFox</h2>
        <p className="lead">
          Find how a system can get into <b>unsafe or insecure states</b>, and turn that into requirements.
          A workspace for <b>STPA</b> and <b>STPA-Sec</b> that keeps everything linked.
        </p>
        <div className="actions">
          {hasWork && <button className="primary" onClick={() => setView('overview')}>Continue “{p.meta.name}”{fileName ? ` (${fileName})` : ''}</button>}
          <button className={hasWork ? '' : 'primary'} onClick={() => load(newProject(), null)}>New analysis</button>
          <button onClick={() => openProject().catch(() => {})}>Open a file…</button>
          <button onClick={() => load(exampleProject(), null, null, true)}>Explore the infusion-pump example</button>
        </div>
      </section>

      <h3>The four steps</h3>
      <div className="steps-row">
        <div className="step"><span className="num">1</span><b>Losses &amp; hazards</b><p>What must never happen, and which system states could lead to it.</p></div>
        <div className="step"><span className="num">2</span><b>Control structure</b><p>Controllers, controlled processes, and the control actions and feedback between them.</p></div>
        <div className="step"><span className="num">3</span><b>Unsafe control actions</b><p>When would providing, not providing or mistiming a control action be hazardous?</p></div>
        <div className="step"><span className="num">4</span><b>Loss scenarios</b><p>Why could those happen? In STPA-Sec, scenarios can also carry threats (STRIDE).</p></div>
      </div>

      <h3>Beyond plain STPA</h3>
      <p className="lead small">Everything works with plain text. Add formalism where it pays off: it is optional, and your text always stays.</p>
      <div className="cols">
        <div className="card feat"><Icon name="entity" size={22} /><b>Domain model</b><p>Entities, properties and relationships as the vocabulary of your analysis.</p></div>
        <div className="card feat"><Icon name="layer-domain" size={22} /><b>Precise conditions</b><p>State exactly when a hazard or UCA applies: “some train”, timing, alternatives.</p></div>
        <div className="card feat"><Icon name="layer-belief" size={22} /><b>Process models</b><p>Beliefs per controller, updated by feedback. See what a controller cannot know.</p></div>
        <div className="card feat"><Icon name="layer-signal" size={22} /><b>Scenario traces</b><p>Step through a scenario and watch world, signals and beliefs drift apart.</p></div>
        <div className="card feat"><Icon name="check" size={22} /><b>Extra checks</b><p>The more you formalize, the more Validation can check for you.</p></div>
        <div className="card feat"><Icon name="layer-computed" size={22} /><b>Refinement</b><p>Compute a variable from more detailed ones; derive detailed UCAs from a general one.</p></div>
      </div>

      <h3>And it keeps things tidy</h3>
      <div className="cols">
        <div className="card feat"><Icon name="relationship" size={22} /><b>Linked artifacts</b><p>Numbers like H-2.1 or UCA-3 are assigned automatically and references follow when you move items. Type <code>@</code> to refer to an item.</p></div>
        <div className="card feat"><Icon name="warn" size={22} /><b>Checks &amp; traceability</b><p>Validation points out gaps; the trace view follows a loss down to requirements. Optional AI review on your own computer.</p></div>
        <div className="card feat"><Icon name="gear" size={22} /><b>Local &amp; portable</b><p>Everything stays on your computer, in one file you save yourself. Export to Word or Excel, or let an AI agent edit it through MCP.</p></div>
      </div>

      <p className="muted tip">
        Start with a new analysis, describe the system on the Overview page, then follow the steps in the left menu.
        Press <kbd>⌘K</kbd> to jump to any item. The <b>Example…</b> menu has worked examples from the STPA Handbook and
        published analyses.
      </p>
    </div>
  )
}
