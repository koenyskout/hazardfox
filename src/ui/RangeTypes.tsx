import { Select } from './Select'
import { useState } from 'react'
import { StringList } from './StringList'
import { nestableStructs, applyStructType, blankField, defineStructType, deleteStructType, renameStructType, defineEnumType, deleteEnumType, renameEnumType, defineRangeType, deleteRangeType, renameRangeType, updateItem } from '../model/ops'
import { describeStates } from '../model/variables'
import type { RangeType, StructField, Variable, VariableType } from '../model/types'
import { commit, useProject } from './hooks'
import { Field, NumberInput, Ref, TextInput } from './Fields'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { askText } from './dialogs'

const usersOf = (items: ReturnType<typeof useProject>['items'], by: 'rangeType' | 'enumType', name: string) => Object.values(items).filter((i): i is Variable => i.kind === 'variable' && i[by] === name)
const show = (t: RangeType) => describeStates({ type: 'range', states: [], rules: [], ...t } as unknown as Variable)

/** Popup to create (`name` null) or edit a named range type. `then` gets the saved name. */
export function RangeTypeDialog({ name, init, onClose, then }: { name: string | null; init?: RangeType; onClose: () => void; then?: (name: string) => void }) {
  const p = useProject()
  const [n, setN] = useState(name ?? '')
  const [t, setT] = useState<RangeType>((name && p.rangeTypes?.[name]) || init || { min: null, max: null, unit: '' })
  const taken = n.trim() !== name && !!p.rangeTypes?.[n.trim()]
  const bad = !n.trim() ? 'Name required' : taken ? 'Name already used' : t.min !== null && t.max !== null && t.min > t.max ? 'Min is above max' : ''
  const users = name ? usersOf(p.items, 'rangeType', name).length : 0
  const save = () => {
    const nm = n.trim()
    commit((q) => defineRangeType(name && nm !== name ? renameRangeType(q, name, nm) : q, nm, t))
    then?.(nm)
    onClose()
  }
  return (
    <Modal title={name ? `Range type ${name}` : 'New range type'} onClose={onClose}>
      <Field single label="Name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. Percentage, Temperature" /></Field>
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

export const VariableRangeDialog = ({ v, onClose }: { v: Variable; onClose: () => void }) =>
  <RangeDialog title={`Range of ${v.title || 'variable'}`} value={v} onClose={onClose} onApply={(patch) => commit((q) => updateItem(q, v.id, patch))} />

/** Popup to choose a range type (existing or new) or give custom bounds, for a variable or parameter. */
export function RangeDialog({ title, value, onClose, onApply }: { title: string; value: { rangeType: string; min: number | null; max: number | null; unit: string }; onClose: () => void; onApply: (patch: { rangeType: string; min?: number | null; max?: number | null; unit?: string }) => void }) {
  const p = useProject()
  const [type, setType] = useState(value.rangeType)
  const [t, setT] = useState<RangeType>({ min: value.min, max: value.max, unit: value.unit })
  const [creating, setCreating] = useState(false)
  const types = Object.keys(p.rangeTypes ?? {}).sort()
  const cur = type ? p.rangeTypes![type] : t
  const apply = () => { onApply(type ? { rangeType: type } : { rangeType: '', ...t }); onClose() }
  return (
    <Modal title={title} onClose={onClose}>
      <Field single label="Type">
        <div style={{ display: 'flex', gap: 6 }}>
          {types.length > 0 && <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Custom</option>
            {types.map((x) => <option key={x} value={x}>{x} ({show(p.rangeTypes![x])})</option>)}
          </Select>}
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

/** A titled section of the Types page: heading, one-line explanation, "+ New" button, then the type cards. */
function Section({ title, hint, onNew, children }: { title: string; hint: string; onNew: () => void; children: React.ReactNode }) {
  return (
    <section className="types-section">
      <div className="types-head"><div><h3>{title}</h3><p className="muted">{hint}</p></div><button className="btn" onClick={onNew}><Icon name="plus" size={12} /> New</button></div>
      <div className="types-list">{children}</div>
    </section>
  )
}

const Used = ({ vars }: { vars: Variable[] }) => <div className="type-used">{vars.length ? <>Used by {vars.map((v) => <Ref key={v.id} id={v.id} />)}</> : <span className="muted">Not used yet</span>}</div>

/** Name field of a type card; renames on blur when changed and not empty. */
const RenameInput = ({ name, rename }: { name: string; rename: (to: string) => void }) =>
  <input className="type-name" defaultValue={name} onBlur={(e) => { const to = e.target.value.trim(); if (to && to !== name) rename(to) }} />

/** Footer of the "new type" dialogs: the name problem (if any) and Cancel / Create. */
const CreateActions = ({ name, bad, onClose, onCreate }: { name: string; bad: string; onClose: () => void; onCreate: () => void }) => (
  <>
    {bad && name !== '' && <p className="muted">{bad}</p>}
    <div className="modal-actions">
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!!bad} onClick={onCreate}>Create</button>
    </div>
  </>
)

/** Domain model Types tab: range, enum and struct types as three sections of cards. */
export function TypesPage() {
  return <div className="page types-page"><RangeTypes /><EnumTypes /><StructTypes /></div>
}

/** Named numeric bounds and units for range variables. */
function RangeTypes() {
  const p = useProject()
  const [edit, setEdit] = useState<string | null | undefined>(undefined)
  const names = Object.keys(p.rangeTypes ?? {}).sort()
  return (
    <Section title="Range types" hint="Numeric bounds and a unit, shared by range variables (e.g. Percentage 0–100 %). Bounds are per project." onNew={() => setEdit(null)}>
      {!names.length && <p className="empty">No range types. Create one, or give a variable its own bounds.</p>}
      {names.map((n) => (
        <div key={n} className="type-card">
          <div className="type-head"><strong>{n}</strong><span className="type-def">{show(p.rangeTypes![n])}</span>
            <span className="type-actions"><button className="btn" onClick={() => setEdit(n)}>Edit</button><button className="btn" onClick={() => commit((q) => deleteRangeType(q, n))} title="Variables keep their bounds">Delete</button></span></div>
          <Used vars={usersOf(p.items, 'rangeType', n)} />
        </div>
      ))}
      {edit !== undefined && <RangeTypeDialog name={edit} onClose={() => setEdit(undefined)} />}
    </Section>
  )
}

/** Table cell for a variable's range: type name and bounds, click to change them in a popup. Empty for other types. */
export function RangeCell({ v }: { v: Variable }) {
  const [open, setOpen] = useState(false)
  if (v.type !== 'range') return null
  return (
    <>
      <button className="btn" title={`Change range type (${v.rangeType || 'custom'})`} style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 11, padding: '1px 6px' }} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>{v.rangeType ? <b>{v.rangeType} </b> : null}{describeStates(v)}</button>
      {open && <VariableRangeDialog v={v} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Popup to create a named, reusable state list (enum type). `then` gets the saved name. */
export function EnumTypeDialog({ init, onClose, then }: { init?: string[]; onClose: () => void; then?: (name: string) => void }) {
  const p = useProject()
  const [n, setN] = useState('')
  const [states, setStates] = useState<string[]>(init ?? [])
  const nm = n.trim()
  const bad = !nm ? 'Name required' : p.enumTypes?.[nm] ? 'Name already used' : ''
  const save = () => { commit((q) => defineEnumType(q, nm, states.map((x) => x.trim()).filter(Boolean))); then?.(nm); onClose() }
  return (
    <Modal title="New enum type" onClose={onClose}>
      <Field single label="Name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. On/Off, Severity" /></Field>
      <Field single label="States"><StringList value={states} onChange={setStates} placeholder="State" addLabel="Add state" /></Field>
      <CreateActions name={n} bad={bad} onClose={onClose} onCreate={save} />
    </Modal>
  )
}

/** Reusable state lists of enum variables, editable here; users follow the change. */
function EnumTypes() {
  const p = useProject()
  const [creating, setCreating] = useState(false)
  const names = Object.keys(p.enumTypes ?? {}).sort()
  return (
    <Section title="Enum types" hint="Shared state lists (e.g. On / Off). A variable can also keep its own states." onNew={() => setCreating(true)}>
      {creating && <EnumTypeDialog onClose={() => setCreating(false)} />}
      {!names.length && <p className="empty">No enum types yet. Create one here, or in a variable’s States field with “Save as type…”.</p>}
      {names.map((n) => (
        <div key={n} className="type-card">
          <div className="type-head">
            <RenameInput name={n} rename={(to) => commit((q) => renameEnumType(q, n, to))} />
            <span className="type-actions"><button className="btn" onClick={() => commit((q) => deleteEnumType(q, n))} title="Variables keep their states">Delete</button></span>
          </div>
          <StringList value={p.enumTypes![n]} onChange={(v) => commit((q) => defineEnumType(q, n, v))} placeholder="State" addLabel="Add state" />
          <Used vars={usersOf(p.items, 'enumType', n)} />
        </div>
      ))}
    </Section>
  )
}

/** Field rows of a struct type (name, type, own states) with add / remove; `self` is the type's name, to keep nesting acyclic. */
function StructFields({ self, fields, onChange }: { self: string; fields: StructField[]; onChange: (f: StructField[]) => void }) {
  const p = useProject()
  const set = (i: number, patch: Partial<StructField>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)))
  return (
    <>
      {fields.map((f, i) => (
        <tr key={i}>
          <td><input value={f.name} placeholder="Field" onChange={(e) => set(i, { name: e.target.value })} /></td>
          <td>
            <Select value={f.structType ? 'struct:' + f.structType : f.type === 'range' && f.rangeType ? 'range:' + f.rangeType : f.type === 'enum' && f.enumType ? 'enum:' + f.enumType : f.type}
              onChange={(e) => { const [t, nm = ''] = e.target.value.split(':'); if (t === 'struct') return set(i, { structType: nm }); const r = nm && t === 'range' ? p.rangeTypes?.[nm] : null; const en = nm && t === 'enum' ? p.enumTypes?.[nm] : null; set(i, { structType: '', type: t as VariableType, rangeType: t === 'range' ? nm : '', enumType: t === 'enum' ? nm : '', ...(r ?? {}), ...(en ? { states: [...en] } : {}) }) }}>
              <option value="boolean">boolean</option>
              <option value="enum">enum (own states)</option>
              <option value="range">range (own bounds)</option>
              {Object.keys(p.enumTypes ?? {}).map((x) => <option key={'e' + x} value={'enum:' + x}>{x} (enum type)</option>)}
              {Object.keys(p.rangeTypes ?? {}).map((x) => <option key={'r' + x} value={'range:' + x}>{x} (range type)</option>)}
              {nestableStructs(p, self).map((x) => <option key={'s' + x} value={'struct:' + x}>{x} (struct type)</option>)}
            </Select>
            {!f.structType && f.type === 'enum' && !f.enumType && <StringList value={f.states} onChange={(v) => set(i, { states: v })} placeholder="State" addLabel="Add state" />}
          </td>
          <td><button className="btn" onClick={() => onChange(fields.filter((_, j) => j !== i))}>×</button></td>
        </tr>
      ))}
      <tr><td colSpan={3}><button className="btn" onClick={() => onChange([...fields, blankField()])}>+ Field</button></td></tr>
    </>
  )
}

/** Popup to create a struct type: name and fields together. */
function NewStructDialog({ onClose }: { onClose: () => void }) {
  const p = useProject()
  const [n, setN] = useState('')
  const [fields, setFields] = useState<StructField[]>([blankField()])
  const nm = n.trim()
  const bad = !nm ? 'Name required' : p.structTypes?.[nm] ? 'Name already used' : ''
  const save = () => { commit((q) => defineStructType(q, nm, { fields: fields.filter((f) => f.name.trim()) })); onClose() }
  return (
    <Modal title="New struct type" onClose={onClose} wide>
      <Field single label="Name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. Position" /></Field>
      <table className="grid"><thead><tr><th>Field</th><th>Type</th><th /></tr></thead><tbody><StructFields self={nm} fields={fields} onChange={setFields} /></tbody></table>
      <CreateActions name={n} bad={bad} onClose={onClose} onCreate={save} />
    </Modal>
  )
}

/** Composite struct types (fields with a type each) to apply to entities and relationships. */
function StructTypes() {
  const p = useProject()
  const [creating, setCreating] = useState(false)
  const names = Object.keys(p.structTypes ?? {}).sort()
  return (
    <Section title="Struct types" hint="Groups of fields (e.g. Position: x, y). Applying one to an entity creates a world variable per field." onNew={() => setCreating(true)}>
      {creating && <NewStructDialog onClose={() => setCreating(false)} />}
      {!names.length && <p className="empty">No struct types yet.</p>}
      {names.map((n) => (
        <div key={n} className="type-card">
          <div className="type-head">
            <RenameInput name={n} rename={(to) => commit((q) => renameStructType(q, n, to))} />
            <span className="type-actions"><button className="btn" onClick={() => commit((q) => deleteStructType(q, n))}>Delete</button></span>
          </div>
          <table className="grid"><tbody><StructFields self={n} fields={p.structTypes![n].fields} onChange={(fields) => commit((q) => defineStructType(q, n, { fields }))} /></tbody></table>
        </div>
      ))}
    </Section>
  )
}

/** "+ struct…" for an owner: pick a struct type and a name to create its field variables. */
export function ApplyStruct({ parent }: { parent: string }) {
  const p = useProject()
  const names = Object.keys(p.structTypes ?? {}).sort()
  if (!names.length) return null
  return (
    <Select value="" onChange={async (e) => {
      const t = e.target.value
      const n = t && await askText({ title: `Add ${t}`, label: `Name of the ${t} (e.g. ${t.toLowerCase()})`, confirm: 'Add' })
      if (n) commit((q) => applyStructType(q, t, n, parent))
    }}>
      <option value="">+ struct…</option>
      {names.map((x) => <option key={x}>{x}</option>)}
    </Select>
  )
}
