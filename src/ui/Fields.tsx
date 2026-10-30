import type { ReactNode } from 'react'
import { DELETED } from '../model/labels'
import { useStore, type View } from '../model/store'
import type { Id, Item, Kind, Labels } from '../model/types'
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
  relationship: 'domain',
  variable: 'domain',
  node: 'structure',
  ca: 'structure',
  feedback: 'structure',
  uca: 'ucas',
  scenario: 'scenarios',
}

export function Field(props: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.children}
      {props.hint && <small className="hint">{props.hint}</small>}
    </label>
  )
}

export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
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
        {labels[id]}
      </a>
    </ItemHover>
  )
}

export const optionLabel = (labels: Labels, it: Item) => `${labels[it.id]} ${it.title || ''}`.trim()

export function RefList(props: { value: Id[]; options: Item[]; onChange: (v: Id[]) => void; placeholder?: string; disabled?: Id[] }) {
  const rest = props.options.filter((o) => !props.value.includes(o.id))
  return (
    <div className="reflist">
      {props.value.map((id) => (
        <span key={id} className="chipwrap">
          <Ref id={id} />
          <button className="x" title="Remove" onClick={() => props.onChange(props.value.filter((v) => v !== id))}>×</button>
        </span>
      ))}
      <Picker options={rest} onPick={(id) => id && props.onChange([...props.value, id])}><span className="muted">{props.placeholder ?? '+ add…'}</span></Picker>
    </div>
  )
}

export function SingleRef(props: { value: Id | null; options: Item[]; onChange: (v: Id | null) => void; none?: string }) {
  const labels = useLabels()
  const cur = useProject().items[props.value ?? '']
  const opts = cur && !props.options.includes(cur) ? [cur, ...props.options] : props.options
  return (
    <Picker options={opts} onPick={props.onChange}>
      {cur ? <><span className={'chip k-' + cur.kind}>{labels[cur.id]}</span> {cur.title}</> : <span className="muted">{props.none ?? '— none —'}</span>}
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
