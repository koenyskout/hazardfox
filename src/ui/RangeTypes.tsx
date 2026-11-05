import { Select } from './Select'
import { DataTypeSelect } from './Details'
import { useState, type ReactNode } from 'react'
import { StringList } from './StringList'
import { nestableStructs, applyStructType, blankField, defineStructType, deleteStructType, renameStructType, defineEnumType, deleteEnumType, renameEnumType, defineRangeType, deleteRangeType, renameRangeType, defineSymbolicType, deleteSymbolicType, renameSymbolicType, updateItem } from '../model/ops'
import { describeStates, normSym, symProps, SYMBOLIC_DEFAULT } from '../model/variables'
import { structOf } from '../model/types'
import type { RangeType, StructField, SymbolicType, Variable } from '../model/types'
import { commit, useProject } from './hooks'
import { Field, NumberInput, TextInput } from './Fields'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { askText } from './dialogs'

const usersOf = (items: ReturnType<typeof useProject>['items'], by: 'rangeType' | 'enumType' | 'symbolicType', name: string) => Object.values(items).filter((i): i is Variable => i.kind === 'variable' && i[by] === name)
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
    <Modal title={name ? `Numeric range type ${name}` : 'New numeric range type'} onClose={onClose}>
      <Field single label="Name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. Percentage, Temperature" /></Field>
      <div className="two">
        <Field single label="Min"><NumberInput value={t.min} onChange={(min) => setT({ ...t, min })} /></Field>
        <Field single label="Max"><NumberInput value={t.max} onChange={(max) => setT({ ...t, max })} /></Field>
        <Field single label="Unit"><TextInput value={t.unit} onChange={(unit) => setT({ ...t, unit })} placeholder="e.g. %, mL/h" /></Field>
      </div>
      {users > 1 && <p className="muted">Used by {users} variables; they all follow this change.</p>}
      {bad && <p className="muted">{bad}</p>}
      <div className="modal-actions">
        {name && <button className="icon-btn danger" aria-label="Delete type" onClick={() => { commit((q) => deleteRangeType(q, name)); onClose() }} title="Delete type (variables keep their current bounds)"><Icon name="trash" size={15} /></button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!!bad} onClick={save}><Icon name="save" size={13} /> Save</button>
      </div>
    </Modal>
  )
}

export const VariableRangeDialog = ({ v, onClose }: { v: Variable; onClose: () => void }) =>
  <RangeDialog title={`Numeric range of ${v.title || 'variable'}`} value={v} onClose={onClose} onApply={(patch) => commit((q) => updateItem(q, v.id, patch))} />

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {types.length > 0 && <Select style={{ flex: 1, minWidth: 0 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Custom</option>
            {types.map((x) => <option key={x} value={x}>{x} ({show(p.rangeTypes![x])})</option>)}
          </Select>}
          <button className="btn" style={{ whiteSpace: 'nowrap', flex: 'none' }} onClick={() => setCreating(true)}><Icon name="plus" size={12} /> New type…</button>
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
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      <div className="toolbar"><button onClick={onNew}><Icon name="plus" /> Add {title.toLowerCase().replace(/s$/, '')}</button></div>
      <div className="types-list">{children}</div>
    </section>
  )
}

/** One line per type: name, short definition, usage count, Edit and delete. */
function TypeRow({ name, def, vars, onEdit, onDelete, deleteTip }: { name: string; def: ReactNode; vars: Variable[]; onEdit: () => void; onDelete: () => void; deleteTip: string }) {
  return (
    <div className="type-row">
      <strong className="type-name">{name}</strong>
      <span className="type-def">{def}</span>
      <span className="type-used muted" title={vars.map((v) => v.title || 'untitled').join(', ')}>{vars.length ? `${vars.length} ${vars.length === 1 ? 'variable' : 'variables'}` : 'not used'}</span>
      <span className="type-actions"><button className="btn" onClick={onEdit}><Icon name="pencil" size={12} /> Edit</button><button className="icon-btn danger" aria-label="Delete type" onClick={onDelete} title={deleteTip}><Icon name="trash" size={15} /></button></span>
    </div>
  )
}

/** Footer of the "new type" dialogs: the name problem (if any) and Cancel / Create. */
const CreateActions = ({ name, bad, onClose, onCreate, label = 'Create' }: { name: string; bad: string; onClose: () => void; onCreate: () => void; label?: string }) => (
  <>
    {bad && name !== '' && <p className="muted">{bad}</p>}
    <div className="modal-actions">
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="primary" disabled={!!bad} onClick={onCreate}>{label === 'Save' && <Icon name="save" size={13} />} {label}</button>
    </div>
  </>
)

/** Domain model Types tab: range, enum, symbolic and struct types as sections of cards. */
export function TypesPage() {
  return (
    <div className="page types-page">
      <p className="hint">Named types are shared by variables and control-action parameters: change a type once and every variable using it follows. <b>Numeric range</b>: numbers with bounds and a unit. <b>Enum</b>: a fixed list of states. <b>Symbolic</b>: opaque identifiers such as t1 or id7, optionally ordered. <b>Struct</b>: a group of fields, each with its own type.</p>
      <RangeTypes /><EnumTypes /><SymbolicTypes /><StructTypes />
    </div>
  )
}

/** Named numeric bounds and units for range variables. */
function RangeTypes() {
  const p = useProject()
  const [edit, setEdit] = useState<string | null | undefined>(undefined)
  const names = Object.keys(p.rangeTypes ?? {}).sort()
  return (
    <Section title="Numeric range types" hint="A numeric range with a unit that several variables can share (e.g. Percentage 0–100 %)." onNew={() => setEdit(null)}>
      {!names.length && <p className="empty">No numeric range types. Create one, or give a variable its own bounds.</p>}
      {names.map((n) => <TypeRow key={n} name={n} def={show(p.rangeTypes![n])} vars={usersOf(p.items, 'rangeType', n)} onEdit={() => setEdit(n)} onDelete={() => commit((q) => deleteRangeType(q, n))} deleteTip="Delete type (variables keep their bounds)" />)}
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
      <button className="btn" title={`Change numeric range type (${v.rangeType || 'custom'})`} style={{ flex: 'none', whiteSpace: 'nowrap', fontSize: 11, padding: '1px 6px' }} onClick={(e) => { e.stopPropagation(); setOpen(true) }}>{v.rangeType ? <b>{v.rangeType} </b> : null}{describeStates(v)}</button>
      {open && <VariableRangeDialog v={v} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Popup to create a named, reusable state list (enum type). `then` gets the saved name. */
export function EnumTypeDialog({ init, edit, onClose, then }: { init?: string[]; edit?: string; onClose: () => void; then?: (name: string) => void }) {
  const p = useProject()
  const [n, setN] = useState(edit ?? '')
  const [states, setStates] = useState<string[]>(init ?? (edit ? p.enumTypes?.[edit] : undefined) ?? [])
  const nm = n.trim()
  const bad = !nm ? 'Name required' : nm !== edit && p.enumTypes?.[nm] ? 'Name already used' : ''
  const save = () => { commit((q) => defineEnumType(edit && nm !== edit ? renameEnumType(q, edit, nm) : q, nm, states.map((x) => x.trim()).filter(Boolean))); then?.(nm); onClose() }
  return (
    <Modal title={edit ? `Edit enumeration type “${edit}”` : 'New enumeration type'} onClose={onClose}>
      {edit && <p className="hint">A shared type: changes apply to all {usersOf(p.items, 'enumType', edit).length} variable(s) that use it.</p>}
      <Field single label="Type name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. On/Off, Severity" /></Field>
      <Field single label="States"><StringList bullet value={states} onChange={setStates} placeholder="State" addLabel="Add state" /></Field>
      <CreateActions name={n} bad={bad} label={edit ? 'Save' : 'Create'} onClose={onClose} onCreate={save} />
    </Modal>
  )
}

/** Reusable state lists of enum variables, editable here; users follow the change. */
function EnumTypes() {
  const p = useProject()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const names = Object.keys(p.enumTypes ?? {}).sort()
  return (
    <Section title="Enum types" hint="Shared state lists (e.g. On / Off). A variable can also keep its own states." onNew={() => setCreating(true)}>
      {creating && <EnumTypeDialog onClose={() => setCreating(false)} />}
      {!names.length && <p className="empty">No enum types yet. Create one here, or in a variable’s States field with “Save as type…”.</p>}
      {editing && <EnumTypeDialog edit={editing} onClose={() => setEditing(null)} />}
      {names.map((n) => <TypeRow key={n} name={n} def={p.enumTypes![n].join(', ') || 'no states'} vars={usersOf(p.items, 'enumType', n)} onEdit={() => setEditing(n)} onDelete={() => commit((q) => deleteEnumType(q, n))} deleteTip="Delete type (variables keep their states)" />)}
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
            <DataTypeSelect x={f} own="only for this field" noSymbolic structs={nestableStructs(p, self)}
              onChange={(patch) => {
                const en = patch.enumType ? p.enumTypes?.[patch.enumType] : null, r = patch.rangeType ? p.rangeTypes?.[patch.rangeType] : null
                set(i, { ...patch, ...(r ?? {}), ...(en ? { states: [...en] } : {}) } as Partial<StructField>)
              }} />
            {!f.structType && f.type === 'enum' && !f.enumType && <StringList value={f.states} onChange={(v) => set(i, { states: v })} placeholder="State" addLabel="Add state" />}
          </td>
          <td><button className="icon-btn danger" aria-label="Remove field" title="Remove field" onClick={() => onChange(fields.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button></td>
        </tr>
      ))}
      <tr><td colSpan={3}><button className="btn" onClick={() => onChange([...fields, blankField()])}><Icon name="plus" size={12} /> Field</button></td></tr>
    </>
  )
}

/** Popup to create a struct type: name and fields together. */
function StructTypeDialog({ edit, onClose }: { edit?: string; onClose: () => void }) {
  const p = useProject()
  const [n, setN] = useState(edit ?? '')
  const [fields, setFields] = useState<StructField[]>(edit ? p.structTypes![edit].fields : [blankField()])
  const nm = n.trim()
  const bad = !nm ? 'Name required' : nm !== edit && p.structTypes?.[nm] ? 'Name already used' : ''
  const save = () => { commit((q) => defineStructType(edit && nm !== edit ? renameStructType(q, edit, nm) : q, nm, { fields: fields.filter((f) => f.name.trim()) })); onClose() }
  return (
    <Modal title={edit ? `Edit struct type “${edit}”` : 'New struct type'} onClose={onClose} wide>
      <Field single label="Name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. Position" /></Field>
      <table className="grid"><thead><tr><th>Field</th><th>Type</th><th /></tr></thead><tbody><StructFields self={edit ?? nm} fields={fields} onChange={setFields} /></tbody></table>
      <CreateActions name={n} bad={bad} label={edit ? 'Save' : 'Create'} onClose={onClose} onCreate={save} />
    </Modal>
  )
}

/** Composite struct types (fields with a type each) to apply to entities and relationships. */
function StructTypes() {
  const p = useProject()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const names = Object.keys(p.structTypes ?? {}).sort()
  return (
    <Section title="Struct types" hint="Groups of fields (e.g. Position: x, y). Applying one to an entity adds a world variable for each field." onNew={() => setCreating(true)}>
      {creating && <StructTypeDialog onClose={() => setCreating(false)} />}
      {editing && <StructTypeDialog edit={editing} onClose={() => setEditing(null)} />}
      {!names.length && <p className="empty">No struct types yet.</p>}
      {names.map((n) => <TypeRow key={n} name={n} def={p.structTypes![n].fields.map((f) => f.name).filter(Boolean).join(', ') || 'no fields'} vars={Object.values(p.items).filter((i): i is Variable => i.kind === 'variable' && structOf(i)?.type === n)} onEdit={() => setEditing(n)} onDelete={() => commit((q) => deleteStructType(q, n))} deleteTip="Delete type (existing variables stay)" />)}
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

const symbolicText = (t: SymbolicType) => {
  const n = normSym(t), l = [n.ordered && 'ordered', n.unique && 'unique', n.monotonic && 'monotonic', n.sequential && 'sequential'].filter(Boolean)
  return l.join(', ') || 'no properties'
}

const PROPS: { key: 'ordered' | 'unique' | 'monotonic' | 'sequential'; tip: string; info: string }[] = [
  { key: 'ordered', tip: 'Values have an order (is less than / at least …); natural order of the symbols, t2 before t10', info: 'Values have an order: conditions may say “less than” / “at least” (t2 comes before t10).' },
  { key: 'unique', tip: 'Every new value differs from all earlier ones (IDs, nonces); a repeat in a trace is a replay', info: 'Every new value differs from all earlier ones, like an ID or nonce. A repeat in a trace is flagged as a replay.' },
  { key: 'monotonic', tip: 'The value never decreases over time (timestamps, counters); implies ordered', info: 'The value never decreases over time, like a timestamp or counter. A decrease in a trace is flagged as stale data.' },
  { key: 'sequential', tip: 'Each change goes to the direct successor (sequence numbers: t3 → t4); a jump is a lost value; implies ordered', info: 'Each change goes to the direct successor, like a sequence number (t3 → t4). A jump in a trace is flagged as a lost value.' },
]
type PropKey = (typeof PROPS)[number]['key']
/** What each property implies (shown nested in the detailed list). */
const PROP_TREE: unknown[][] = [['ordered', ['monotonic'], ['sequential']], ['unique']]
/** The properties of a symbolic type as checkboxes (`detailed`: nested by implication, each with an explanation); monotonic / sequential imply ordered. */
export function SymbolicProps({ t, onChange, detailed }: { t: SymbolicType; onChange: (t: SymbolicType) => void; detailed?: boolean }) {
  const n = normSym(t)
  const forced = (k: string) => (k === 'ordered' && (n.monotonic || n.sequential))
  const row = (key: PropKey, kids: unknown[] = []): ReactNode => {
    const { tip, info } = PROPS.find((x) => x.key === key)!
    return (
      <div key={key} title={tip}>
        <label className="check" style={{ gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={!!n[key]} disabled={forced(key)} onChange={(e) => onChange(normSym({ ...t, [key]: e.target.checked }))} />
          <Icon name={key} size={14} /> <b>{key}</b>
        </label>
        {detailed && <div className="muted" style={{ fontSize: 12, margin: '1px 0 0 24px' }}>{info}</div>}
        {detailed && kids.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0 0 12px', paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>{kids.map((k) => { const [kk, ...rest] = k as [PropKey, ...unknown[]]; return row(kk, rest) })}</div>}
      </div>
    )
  }
  if (detailed) return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{PROP_TREE.map(([k, ...rest]) => row(k as PropKey, rest))}</div>
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {PROPS.map(({ key }) => row(key))}
    </div>
  )
}

/** Popup to create a named symbolic (opaque) type. `then` gets the saved name. */
/** Popup to create a named symbolic (opaque) type, or with `edit` (a type's name) to rename it and change its properties. */
export function SymbolicTypeDialog({ init, edit, onClose, then }: { init?: SymbolicType; edit?: string; onClose: () => void; then?: (name: string) => void }) {
  const p = useProject()
  const [n, setN] = useState(edit ?? '')
  const [t, setT] = useState<SymbolicType>(init ?? (edit ? p.symbolicTypes?.[edit] : undefined) ?? SYMBOLIC_DEFAULT)
  const nm = n.trim()
  const bad = !nm ? 'Name required' : nm !== edit && p.symbolicTypes?.[nm] ? 'Name already used' : ''
  return (
    <Modal title={edit ? `Edit symbolic type “${edit}”` : 'New symbolic type'} onClose={onClose}>
      <Field single label="Name"><TextInput autoFocus value={n} onChange={setN} placeholder="e.g. Timestamp, ID" /></Field>
      <Field label="Properties"><SymbolicProps detailed t={t} onChange={setT} /></Field>
      <CreateActions name={n} bad={bad} label={edit ? 'Save' : 'Create'} onClose={onClose} onCreate={() => { commit((q) => defineSymbolicType(edit && nm !== edit ? renameSymbolicType(q, edit, nm) : q, nm, t)); then?.(nm); onClose() }} />
    </Modal>
  )
}

/** For a variable or parameter of symbolic type: pick a named type (or own properties) and create one. */
export function SymbolicPicker({ x, onChange }: { x: Partial<SymbolicType> & { symbolicType?: string }; onChange: (patch: Partial<SymbolicType> & { symbolicType?: string }) => void }) {
  const [edit, setEdit] = useState(false)
  const t = symProps(x)
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {x.symbolicType ? <><span className="muted">{symbolicText(t)}</span><button className="icon-btn" aria-label="Edit type" title="Edit this type" onClick={() => setEdit(true)}><Icon name="pencil" size={13} /></button>{edit && <SymbolicTypeDialog edit={x.symbolicType} onClose={() => setEdit(false)} />}</> : <SymbolicProps t={t} onChange={onChange} />}
    </div>
  )
}

/** Opaque named types (Timestamp, ID) whose values are symbolic constants; only the properties matter. */
function SymbolicTypes() {
  const p = useProject()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const names = Object.keys(p.symbolicTypes ?? {}).sort()
  return (
    <Section title="Symbolic types" hint="Types whose values have no further meaning (e.g. Timestamp: ordered; ID: no properties). Values are symbols such as t1 or id7; the properties decide which comparisons are allowed." onNew={() => setCreating(true)}>
      {creating && <SymbolicTypeDialog onClose={() => setCreating(false)} />}
      {!names.length && <p className="empty">No symbolic types yet.</p>}
      {editing && <SymbolicTypeDialog edit={editing} onClose={() => setEditing(null)} />}
      {names.map((n) => <TypeRow key={n} name={n} def={symbolicText(p.symbolicTypes![n])} vars={usersOf(p.items, 'symbolicType', n)} onEdit={() => setEditing(n)} onDelete={() => commit((q) => deleteSymbolicType(q, n))} deleteTip="Delete type (variables keep their properties)" />)}
    </Section>
  )
}
