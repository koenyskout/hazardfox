import { addBelief, addSignal, beliefsAbout, controlledBy, feedbackInto, refinedBy, refines, signalsInto, updatedBy, variablesIn } from '../model/formal'
import type { Project, Variable } from '../model/types'
import { describeStates } from '../model/variables'
import { itemsOfKind } from '../model/tree'
import { Ref } from './Fields'
import { LayerIcon } from './Icon'
import { addItemInDialog, commit, useProject } from './hooks'
import { Picker } from './Picker'

/** World variables depth-first, each refined variable followed by its parts (a part shared by several wholes is listed once). */
function hierarchy(p: Project, world: Variable[]): [Variable, number][] {
  const ids = new Set(world.map((w) => w.id))
  const seen = new Set<string>()
  const out: [Variable, number][] = []
  const visit = (w: Variable, d: number) => {
    if (seen.has(w.id)) return
    seen.add(w.id)
    out.push([w, d])
    for (const id of refines(p, w)) { const x = p.items[id]; if (x?.kind === 'variable' && ids.has(id)) visit(x, d + 1) }
  }
  for (const w of world) if (!refinedBy(p, w.id).some((x) => ids.has(x.id))) visit(w, 0)
  for (const w of world) visit(w, 0)
  return out
}

/** World variables × controllers: what each controller believes, from which signals; gaps where a UCA context needs a belief. */
export function VariableMap() {
  const p = useProject()
  const world = variablesIn(p, 'domain')
  const ctrls = itemsOfKind(p, 'node').filter((n) => n.role === 'controller').sort((a, b) => a.rank - b.rank)
  const ucas = itemsOfKind(p, 'uca')
  /** Is w part of the context of a UCA of a control action from controller c? */
  const needed = (c: string, w: string) => ucas.some((u) => p.items[u.ca]?.kind === 'ca' && (p.items[u.ca] as { from: string }).from === c && u.conditions.some((x) => x.variable === w))
  if (!world.length) return <p className="empty">Add world variables (layer “World”) to entities first; then map what each controller observes and believes.</p>
  return (
    <div className="varmap-wrap">
      <p className="hint">
        Each row is actual world state; each column a controller’s process model. A cell shows the controller’s belief about the variable and the signals
        (feedback) it is updated from. <b>Red</b>: a UCA context uses the variable but the controller has no belief about it. <b>Amber</b>: a belief that no feedback updates.
      </p>
      <table className="grid varmap">
        <thead>
          <tr><th><LayerIcon layer="domain" />World variable</th><th>Controlled by</th>{ctrls.map((c) => <th key={c.id}><Ref id={c.id} /> {c.title}</th>)}</tr>
        </thead>
        <tbody>
          {hierarchy(p, world).map(([w, d]) => (
            <tr key={w.id}>
              <th style={{ paddingLeft: 6 + d * 18 }}>{d > 0 && <span className="muted">↳ </span>}<Ref id={w.id} /><br /><small className="muted">{w.parent && p.items[w.parent]?.title} · {describeStates(w)}{w.rules.length > 0 && <> · from {refines(p, w).map((id) => p.items[id]?.title).join(', ')}</>}</small></th>
              <td>{controlledBy(p, w.id).map((c) => <Ref key={c.id} id={c.id} />)}</td>
              {ctrls.map((c) => {
                const bel = beliefsAbout(p, c.id, w.id)
                const sig = bel.length ? [...new Set(bel.flatMap((b) => updatedBy(p, b)))] : signalsInto(p, c.id).filter((s) => s.about === w.id)
                const fbs = feedbackInto(p, c.id)
                const cls = !bel.length ? (needed(c.id, w.id) ? 'gap' : '') : !sig.length ? 'warn' : 'ok'
                return (
                  <td key={c.id} className={cls}>
                    {bel.map((b) => <Ref key={b.id} id={b.id} />)}
                    {sig.length > 0 && <div className="via"><span className="muted">from</span> {sig.map((s) => <Ref key={s.id} id={s.id} />)}</div>}
                    <div className="cell-add">
                      {!bel.length && <button className="add" title="Add a belief about this variable to the controller's process model" onClick={() => commit((q) => addBelief(q, c.id, w.id).project)}>+ <LayerIcon layer="belief" />belief</button>}
                      {!sig.length && fbs.length > 0 && (
                        <Picker className="add" options={fbs} onPick={(f) => f && commit((q) => addSignal(q, f, w.id).project)}><span title="Let an incoming feedback report this variable">+ <LayerIcon layer="signal" />signal</span></Picker>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          <tr>
            <th><LayerIcon layer="internal" />Internal state<br /><small className="muted">modes, timers, counters</small></th>
            <td />
            {ctrls.map((c) => (
              <td key={c.id}>
                {variablesIn(p, 'internal', c.id).map((v) => <Ref key={v.id} id={v.id} />)}
                <div className="cell-add"><button className="add" onClick={() => addItemInDialog('variable', { layer: 'internal', parent: c.id })}>+ <LayerIcon layer="internal" />internal</button></div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
