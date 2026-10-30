import { Select } from './Select'
import { useState } from 'react'
import { defineRangeType, deleteRangeType, renameRangeType, updateItem } from '../model/ops'
import { describeStates } from '../model/variables'
import type { RangeType, Variable } from '../model/types'
import { commit, useProject } from './hooks'
import { Field, NumberInput, Ref, TextInput } from './Fields'
import { Modal } from './Modal'
import { Icon } from './Icon'

const usersOf = (items: ReturnType<typeof useProject>['items'], name: string) => Object.values(items).filter((i): i is Variable => i.kind === 'variable' && i.rangeType === name)
const show = (t: RangeType) => describeStates({ type: 'range', states: [], rules: [], ...t } as unknown as Variable)

/** Popup to create (`name` null) or edit a named range type. `then` gets the saved name. */
export function RangeTypeDialog({ name, init, onClose, then }: { name: string | null; init?: RangeType; onClose: () => void; then?: (name: string) => void }) {
  const p = useProject()
  const [n, setN] = useState(name ?? '')
  const [t, setT] = useState<RangeType>((name && p.rangeTypes?.[name]) || init || { min: null, max: null, unit: '' })
  const taken = n.trim() !== name && !!p.rangeTypes?.[n.trim()]
  const bad = !n.trim() ? 'Name required' : taken ? 'Name already used' : t.min !== null && t.max !== null && t.min > t.max ? 'Min is above max' : ''
  const users = name ? usersOf(p.items, name).length : 0
  const save = () => {
    const nm = n.trim()
    commit((q) => defineRangeType(name && nm !== name ? renameRangeType(q, name, nm) : q, nm, t))
    then?.(nm)
    onClose()
  }
  return (
    <Modal title={name ? `Range type ${name}` : 'New range type'} onClose={onClose}>
      <Field single label="Name"><TextInput value={n} onChange={setN} placeholder="e.g. Percentage, Temperature" /></Field>
      <div className="two">
        <Field single label="Min"><NumberInput value={t.min} onChange={(min) => setT({ ...t, min })} /></Field>
        <Field single label="Max"><NumberInput value={t.max} onChange={(max) => setT({ ...t, max })} /></Field>
        <Field single label="Unit"><TextInput value={t.unit} onChange={(unit) => setT({ ...t, unit })} placeholder="e.g. %, mL/h" /></Field>
      </div>
      {users > 1 && <p className="muted">Used by {users} variables; they all follow this change.</p>}
      {bad && <p className="muted">{bad}</p>}
      <div className="modal-actions">
        {name && <button className="btn" onClick={() => { commit((q) => deleteRangeType(q, name)); onClose() }} title="Variables keep their current bounds as custom ones">Delete type</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!!bad} onClick={save}>Save</button>
      </div>
    </Modal>
  )
}

/** Popup to choose a range variable's type, or give it custom bounds. */
export function VariableRangeDialog({ v, onClose }: { v: Variable; onClose: () => void }) {
  const p = useProject()
  const [type, setType] = useState(v.rangeType)
  const [t, setT] = useState<RangeType>({ min: v.min, max: v.max, unit: v.unit })
  const [creating, setCreating] = useState(false)
  const types = Object.keys(p.rangeTypes ?? {}).sort()
  const cur = type ? p.rangeTypes![type] : t
  const apply = () => { commit((q) => updateItem(q, v.id, type ? { rangeType: type } : { rangeType: '', ...t })); onClose() }
  return (
    <Modal title={`Range of ${v.title || 'variable'}`} onClose={onClose}>
      <Field single label="Type">
        <div style={{ display: 'flex', gap: 6 }}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Custom</option>
            {types.map((x) => <option key={x} value={x}>{x} ({show(p.rangeTypes![x])})</option>)}
          </Select>
          <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={12} /> New type…</button>
        </div>
      </Field>
      {type ? <p className="muted">{show(cur)} — edit the type in Domain model → Types.</p> : (
        <div className="two">
          <Field single label="Min"><NumberInput value={t.min} onChange={(min) => setT({ ...t, min })} /></Field>
          <Field single label="Max"><NumberInput value={t.max} onChange={(max) => setT({ ...t, max })} /></Field>
          <Field single label="Unit"><TextInput value={t.unit} onChange={(unit) => setT({ ...t, unit })} placeholder="e.g. %, mL/h" /></Field>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="primary" onClick={apply}>Apply</button>
      </div>
      {creating && <RangeTypeDialog name={null} init={type ? undefined : t} onClose={() => setCreating(false)} then={setType} />}
    </Modal>
  )
}

/** Domain model tab listing the project's range types. */
export function RangeTypes() {
  const p = useProject()
  const [edit, setEdit] = useState<string | null | undefined>(undefined)
  const names = Object.keys(p.rangeTypes ?? {}).sort()
  return (
    <div className="page">
      <div className="toolbar"><button className="btn" onClick={() => setEdit(null)}><Icon name="plus" size={12} /> Range type</button></div>
      {names.length === 0 ? <p className="empty">Range types name reusable numeric bounds and units (e.g. Percentage 0–100 %) that range variables can share.</p> : (
        <table className="grid">
          <thead><tr><th>Name</th><th>Range</th><th>Used by</th><th /></tr></thead>
          <tbody>
            {names.map((n) => (
              <tr key={n}>
                <td>{n}</td><td>{show(p.rangeTypes![n])}</td>
                <td>{usersOf(p.items, n).map((v) => <Ref key={v.id} id={v.id} />) }{!usersOf(p.items, n).length && <span className="muted">—</span>}</td>
                <td><button className="btn" onClick={() => setEdit(n)}>Edit…</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {edit !== undefined && <RangeTypeDialog name={edit} onClose={() => setEdit(undefined)} />}
    </div>
  )
}
