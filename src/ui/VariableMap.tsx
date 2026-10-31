import { addBelief, addSignal, beliefsAbout, clusterStructs, controlledBy, feedbackInto, refines, signalsInto, structPath, updatedBy, variablesIn } from '../model/formal'
import { useState } from 'react'
import { StructViewToggle, useStructView } from './structView'
import { createItem } from '../model/ops'
import type { Id, Project, Variable } from '../model/types'
import { describeStates } from '../model/variables'
import { itemsOfKind } from '../model/tree'
import { Ref } from './Fields'
import { LayerIcon } from './Icon'
import { addItemInDialog, commit, isComputed, useProject } from './hooks'
import { Picker } from './Picker'
import { Modal } from './Modal'

/** One row per variable; within an owner the raw ones first, then the computed ones. */
const ordered = (p: Project, world: Variable[]) => [...world.filter((w) => !isComputed(p, w)), ...world.filter((w) => isComputed(p, w))]

/** "+ signal": let an existing incoming feedback report the variable, or create a new feedback from a chosen node first. */
function AddSignal({ c, w }: { c: string; w: string }) {
  const p = useProject()
  const [choosing, setChoosing] = useState(false)
  const fbs = feedbackInto(p, c)
  const sources = itemsOfKind(p, 'node').filter((n) => n.id !== c).sort((a, b) => a.rank - b.rank)
  const label = <span title="Let a feedback report this variable">+ <LayerIcon layer="signal" />signal</span>
  const create = (from: Id | null) => from && commit((q) => { const r = createItem(q, 'feedback', { from, to: c }); return addSignal(r.project, r.id, w).project })
  return choosing
    ? <Picker key="src" className="add" autoOpen options={sources} onPick={create} onClose={() => setChoosing(false)}>{label}</Picker>
    : <Picker key="fb" className="add" options={fbs} onPick={(f) => f && commit((q) => addSignal(q, f, w).project)} create={{ label: 'New feedback from…', run: () => setChoosing(true) }}>{label}</Picker>
}

/** World variables × controllers: what each controller believes, from which signals; gaps where a UCA context needs a belief. */
export function VariableMap({ only }: { only?: string } = {}) {
  const dotted = useStructView() === 'dotted'
  const p = useProject()
  const world = variablesIn(p, 'domain')
  const ctrls = itemsOfKind(p, 'node').filter((n) => n.role === 'controller' && (!only || n.id === only)).sort((a, b) => a.rank - b.rank)
  const ucas = itemsOfKind(p, 'uca')
  const owners = [...new Set(world.map((w) => w.parent ?? ''))]
  /** Is w part of the context of a UCA of a control action from controller c? */
  const needed = (c: string, w: string) => ucas.some((u) => p.items[u.ca]?.kind === 'ca' && (p.items[u.ca] as { from: string }).from === c && u.conditions.some((x) => x.variable === w || x.other === w))
  if (!world.length) return <p className="empty">Add world variables (layer “World”) to entities first; then map what each controller observes and believes.</p>
  return (
    <div className="varmap-wrap">
      <p className="hint">
        Each row is actual world state; each column a controller’s process model. A cell shows the controller’s belief about the variable and the signals
        (feedback) it is updated from. <b>Red</b>: a UCA context uses the variable but the controller has no belief about it. <b>Amber</b>: a belief that no feedback updates.
      </p>
      {world.some((w) => w.struct) && <div style={{ textAlign: 'right', marginBottom: 6 }}><StructViewToggle /></div>}
      <table className="grid varmap">
        <thead>
          <tr><th><LayerIcon layer="domain" />World variable</th><th>Controlled by</th>{ctrls.map((c) => <th key={c.id}><Ref id={c.id} /> {c.title}</th>)}</tr>
        </thead>
        <tbody>
          {owners.flatMap((o) => [
            <tr key={'o' + o} className="group"><th colSpan={2 + ctrls.length}>{p.items[o] ? <Ref id={o} /> : <span className="muted">No owner</span>} {o && <button className="add" title="Add a world variable to this owner" onClick={() => addItemInDialog('variable', { layer: 'domain', parent: o })}>+ <LayerIcon layer="domain" />variable</button>}</th></tr>,
            ...clusterStructs(ordered(p, world.filter((w) => (w.parent ?? '') === o))).flatMap((w, i, all) => {
            const path = dotted ? [] : structPath(w), prev = i && !dotted ? structPath(all[i - 1]) : []
            let k = 0
            while (k < path.length && path[k] === prev[k]) k++
            return [...path.slice(k).map((h, j) => <tr key={w.id + 'h' + j} className="group sub"><th colSpan={2 + ctrls.length} style={{ paddingLeft: 12 + (k + j) * 16 }}><span className="muted">▸</span> {h}</th></tr>), (
            <tr key={w.id} className={isComputed(p, w) ? 'computed' : ''}>
              <th style={path.length ? { paddingLeft: 12 + path.length * 16 } : undefined}><Ref id={w.id} />{isComputed(p, w) && <span className="calc" title="Computed from lower-level world variables">ƒ computed</span>}<br /><small className="muted">{describeStates(w)}</small>{isComputed(p, w) && <div className="via"><span className="muted">from</span> {refines(p, w).map((id) => <Ref key={id} id={id} />)}</div>}</th>
              <td>{controlledBy(p, w.id).map((c) => <Ref key={c.id} id={c.id} />)}</td>
              {ctrls.map((c) => {
                const bel = beliefsAbout(p, c.id, w.id)
                const sig = bel.length ? [...new Set(bel.flatMap((b) => updatedBy(p, b)))] : signalsInto(p, c.id).filter((s) => s.about === w.id)
                const cls = !bel.length ? (needed(c.id, w.id) ? 'gap' : '') : !sig.length ? 'warn' : 'ok'
                return (
                  <td key={c.id} className={cls}>
                    {bel.map((b) => <Ref key={b.id} id={b.id} />)}
                    {sig.length > 0 && <div className="via"><span className="muted">from</span> {sig.map((s) => <Ref key={s.id} id={s.id} />)}</div>}
                    <div className="cell-add">
                      {!bel.length && <button className="add" title="Add a belief about this variable to the controller's process model" onClick={() => commit((q) => addBelief(q, c.id, w.id).project)}>+ <LayerIcon layer="belief" />belief</button>}
                      {!sig.length && <AddSignal c={c.id} w={w.id} />}
                    </div>
                  </td>
                )
              })}
            </tr>
            )]}),
          ])}
          <tr className="group"><th colSpan={2 + ctrls.length}><LayerIcon layer="internal" /> Internal state <small className="muted">modes, timers, counters – owned by each controller, not about the world</small></th></tr>
          <tr>
            <th><small className="muted">per controller</small></th>
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

/** Button in a controller's details that opens its own variable map column in a dialog. */
export function ControllerEditorButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false)
  const p = useProject()
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}>Open editor…</button>
      {open && <Modal title={`Variables of ${p.items[id]?.title ?? ''}`} onClose={() => setOpen(false)} wide><VariableMap only={id} /></Modal>}
    </>
  )
}
