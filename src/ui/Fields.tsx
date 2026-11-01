import { useState, type ReactNode } from 'react'
import { ChipLabel } from './Icon'
import { DELETED } from '../model/labels'
import { useStore, type View } from '../model/store'
import type { ConditionOp, Id, Item, Kind, Labels } from '../model/types'
import { useLabels, useProject } from './hooks'
import { HoverCard } from './HoverCard'
import { ItemCard } from './ItemCard'
import { Picker } from './Picker'
import { RichEditor } from './RichEditor'

export const VIEW_OF: Record<Kind, View> = {
  loss: 'step1',
  hazard: 'step1',
  constraint: 'step1',
  requirement: 'requirements',
  assumption: 'overview',
  entity: 'domain',
  operation: 'domain',
  relationship: 'domain',
  variable: 'domain',
  node: 'structure',
  ca: 'structure',
  feedback: 'structure',
  uca: 'ucas',
  scenario: 'scenarios',
}

/** A `<label>` would forward clicks and :hover to the first button inside (pickers, chips, editor toolbar), so only fields with a single input (`single`) use one. */
export function Field(props: { label: string; children: ReactNode; hint?: string; single?: boolean }) {
  const Tag = props.single ? 'label' : 'div'
  return (
    <Tag className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small className="hint">{props.hint}</small>}
    </Tag>
  )
}

export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; autoFocus?: boolean }) {
  if (props.multiline) return <textarea rows={3} autoFocus={props.autoFocus} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
  return <input autoFocus={props.autoFocus} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
}

/** Numeric input that keeps what is being typed ("-", "1.") and reports null while it is not a number. */
export function NumberInput(props: { value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(props.value === null ? '' : String(props.value))
  const shown = Number(text) === props.value && text.trim() !== '' ? text : props.value === null && !Number.isFinite(Number(text)) ? text : props.value === null ? '' : String(props.value)
  return <input inputMode="decimal" value={shown} onChange={(e) => { const t = e.target.value; setText(t); props.onChange(t.trim() !== '' && Number.isFinite(Number(t)) ? Number(t) : null) }} />
}

/** Number input with spinner within optional bounds. `value` is the text (may be empty or partial). */
export function BoundedNumber(props: { value: string; onChange: (v: string) => void; min: number | null; max: number | null; step: number; placeholder?: string }) {
  return <input className="num" type="number" min={props.min ?? undefined} max={props.max ?? undefined} step={props.step} placeholder={props.placeholder} value={props.value} onChange={(e) => props.onChange(e.target.value)} />
}

/** The variable's whole range as a bar with draggable handles; the highlighted part is what the condition selects (one handle for =, ≠, <, ≤, >, ≥; two for (not) between). */
export function RangeBar(props: { min: number; max: number; step: number; op: ConditionOp; a: string; b: string; unit?: string; onChange: (a: string, b: string) => void }) {
  const { min, max, step, op } = props
  const dual = op === 'between' || op === 'not between'
  const num = (t: string, d: number) => (t.trim() !== '' && Number.isFinite(Number(t)) ? Math.min(max, Math.max(min, Number(t))) : d)
  const touched = props.a.trim() !== '' && (!dual || props.b.trim() !== '')
  const a = num(props.a, dual ? min : (min + max) / 2)
  const b = num(props.b, max)
  const pct = (x: number) => ((x - min) / (max - min)) * 100
  const at = (x: number) => `calc(${pct(x)}% + ${7 - 0.14 * pct(x)}px)`
  const seg = (from: number, to: number) => <span className="rb-fill" style={{ left: at(from), width: `calc(${at(to)} - ${at(from)})` }} />
  const fills =
    op === '<' || op === '≤' ? seg(min, a) :
    op === '>' || op === '≥' ? seg(a, max) :
    op === 'between' ? seg(a, b) :
    op === 'not between' ? <>{seg(min, a)}{seg(b, max)}</> : null
  const out = (x: number) => String(Math.round(x / step) * step === x ? x : +x.toFixed(Math.max(0, -Math.floor(Math.log10(step)))))
  return (
    <div className={'rangebar' + (touched ? '' : ' untouched')}>
      <span className="rb-lbl">{min}</span>
      <div className="rb-bar">
        <span className="rb-track" />
        {fills}
        <input type="range" min={min} max={max} step={step} value={a} onChange={(e) => { const x = Number(e.target.value); props.onChange(out(dual ? Math.min(x, b) : x), dual ? props.b || out(b) : '') }} />
        {dual && <input type="range" min={min} max={max} step={step} value={b} onChange={(e) => { const x = Number(e.target.value); props.onChange(props.a || out(a), out(Math.max(x, a))) }} />}
        <input className={'rb-val' + (dual ? ' lo' : '')} type="number" min={min} max={max} step={step} style={{ left: at(a) }} value={props.a} placeholder="–" onChange={(e) => props.onChange(e.target.value, dual ? props.b || out(b) : '')} />
        {dual && <input className="rb-val hi" type="number" min={min} max={max} step={step} style={{ left: at(b) }} value={props.b} placeholder="–" onChange={(e) => props.onChange(props.a || out(a), e.target.value)} />}
      </div>
      <span className="rb-lbl">{max}{props.unit ? ' ' + props.unit : ''}</span>
    </div>
  )
}

/** Shows the item's hover card (title, description, traceability) when hovering the children. */
export function ItemHover({ id, children }: { id: Id; children: ReactNode }) {
  const p = useProject()
  const labels = useLabels()
  const goto = useStore((s) => s.goto)
  const it = p.items[id]
  if (!it) return <>{children}</>
  return <HoverCard card={() => <ItemCard it={it} p={p} labels={labels} go={(t) => goto(VIEW_OF[p.items[t].kind], t)} />}>{children}</HoverCard>
}

/** A chip that links to the target item. */
export function Ref({ id }: { id: Id }) {
  const p = useProject()
  const labels = useLabels()
  const goto = useStore((s) => s.goto)
  const it = p.items[id]
  if (!it) return <span className="chip dead">{DELETED}</span>
  return (
    <ItemHover id={id}>
      <a className={'chip k-' + it.kind} href="#" onClick={(e) => { e.preventDefault(); goto(VIEW_OF[it.kind], id) }}>
        <ChipLabel it={it} label={labels[id]} />
      </a>
    </ItemHover>
  )
}

export const optionLabel = (labels: Labels, it: Item) => `${labels[it.id]} ${it.title || ''}`.trim()

export function RefList(props: { value: Id[]; options: Item[]; onChange: (v: Id[]) => void; placeholder?: string; disabled?: Id[]; create?: { label: string; run: () => Id } }) {
  const rest = props.options.filter((o) => !props.value.includes(o.id))
  return (
    <div className="reflist">
      {props.value.map((id) => (
        <span key={id} className="chipwrap">
          <Ref id={id} />
          <button className="x" title="Remove" onClick={() => props.onChange(props.value.filter((v) => v !== id))}>×</button>
        </span>
      ))}
      <Picker options={rest} onPick={(id) => id && props.onChange([...props.value, id])} create={props.create && { label: props.create.label, run: () => { const id = props.create!.run(); props.onChange([...props.value, id]) } }}><span className="muted">{props.placeholder ?? '+ add…'}</span></Picker>
    </div>
  )
}

export function SingleRef(props: { value: Id | null; options: Item[]; onChange: (v: Id | null) => void; none?: string }) {
  const labels = useLabels()
  const cur = useProject().items[props.value ?? '']
  const opts = cur && !props.options.includes(cur) ? [cur, ...props.options] : props.options
  return (
    <Picker options={opts} onPick={props.onChange}>
      {cur ? <><ItemHover id={cur.id}><span className={'chip k-' + cur.kind}><ChipLabel it={cur} label={labels[cur.id]} /></span></ItemHover>{labels[cur.id] !== cur.title && ` ${cur.title}`}</> : <span className="muted">{props.none ?? '— none —'}</span>}
    </Picker>
  )
}

export const RichText = RichEditor

export function Tags(props: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <input
      value={props.value.join(', ')}
      placeholder="comma, separated"
      onChange={(e) => props.onChange(e.target.value.split(',').map((t) => t.trimStart()))}
      onBlur={(e) => props.onChange(e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
    />
  )
}
