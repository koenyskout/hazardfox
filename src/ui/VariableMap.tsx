import { addBelief, addSignal, beliefsAbout, controlledBy, feedbackInto, signalsInto, variablesIn } from '../model/formal'
import { describeStates } from '../model/variables'
import { itemsOfKind } from '../model/tree'
import { Ref } from './Fields'
import { addItemInDialog, commit, useProject } from './hooks'
import { Picker } from './Picker'

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
          <tr><th>World variable</th><th>Controlled by</th>{ctrls.map((c) => <th key={c.id}><Ref id={c.id} /> {c.title}</th>)}</tr>
        </thead>
        <tbody>
          {world.map((w) => (
            <tr key={w.id}>
              <th><Ref id={w.id} /> {w.title}<br /><small className="muted">{w.parent && p.items[w.parent]?.title} · {describeStates(w)}</small></th>
              <td>{controlledBy(p, w.id).map((c) => <Ref key={c.id} id={c.id} />)}</td>
              {ctrls.map((c) => {
                const bel = beliefsAbout(p, c.id, w.id)
                const sig = signalsInto(p, c.id).filter((s) => s.about === w.id)
                const fbs = feedbackInto(p, c.id)
                const cls = !bel.length ? (needed(c.id, w.id) ? 'gap' : '') : !sig.length ? 'warn' : 'ok'
                return (
                  <td key={c.id} className={cls}>
                    {bel.map((b) => <Ref key={b.id} id={b.id} />)}
                    {sig.length > 0 && <div className="via"><span className="muted">from</span> {sig.map((s) => <Ref key={s.id} id={s.id} />)}</div>}
                    <div className="cell-add">
                      {!bel.length && <button className="add" title="Add a belief about this variable to the controller's process model" onClick={() => commit((q) => addBelief(q, c.id, w.id).project)}>+ belief</button>}
                      {!sig.length && fbs.length > 0 && (
                        <Picker options={fbs} onPick={(f) => f && commit((q) => addSignal(q, f, w.id).project)}><span className="add" title="Let an incoming feedback report this variable">+ signal</span></Picker>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          <tr>
            <th>Internal state<br /><small className="muted">modes, timers, counters</small></th>
            <td />
            {ctrls.map((c) => (
              <td key={c.id}>
                {variablesIn(p, 'internal', c.id).map((v) => <Ref key={v.id} id={v.id} />)}
                <div className="cell-add"><button className="add" onClick={() => addItemInDialog('variable', { layer: 'internal', parent: c.id })}>+ internal</button></div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
