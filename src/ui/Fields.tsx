import { useRef, type ReactNode } from 'react'
import { mention, mentions } from '../model/refs'
import { byLabel, DELETED, renderText } from '../model/labels'
import { useStore, type View } from '../model/store'
import type { Id, Item, Kind, Labels } from '../model/types'
import { useLabels, useProject } from './hooks'
import { HoverCard, ItemCard } from './HoverCard'

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

/** A chip that links to the target item. */
export function Ref({ id }: { id: Id }) {
  const p = useProject()
  const labels = useLabels()
  const goto = useStore((s) => s.goto)
  const it = p.items[id]
  if (!it) return <span className="chip dead">{DELETED}</span>
  return (
    <HoverCard card={() => <ItemCard it={it} p={p} labels={labels} go={(t) => goto(VIEW_OF[p.items[t].kind], t)} />}>
      <a className={'chip k-' + it.kind} href="#" onClick={(e) => { e.preventDefault(); goto(VIEW_OF[it.kind], id) }}>
        {labels[id]}
      </a>
    </HoverCard>
  )
}

export const optionLabel = (labels: Labels, it: Item) => `${labels[it.id]} ${it.title || ''}`.trim()

export function RefList(props: { value: Id[]; options: Item[]; onChange: (v: Id[]) => void; placeholder?: string; disabled?: Id[] }) {
  const labels = useLabels()
  const rest = props.options.filter((o) => !props.value.includes(o.id))
  return (
    <div className="reflist">
      {props.value.map((id) => (
        <span key={id} className="chipwrap">
          <Ref id={id} />
          <button className="x" title="Remove" onClick={() => props.onChange(props.value.filter((v) => v !== id))}>×</button>
        </span>
      ))}
      <select
        value=""
        onChange={(e) => e.target.value && props.onChange([...props.value, e.target.value])}
      >
        <option value="">{props.placeholder ?? '+ add…'}</option>
        {rest.map((o) => (
          <option key={o.id} value={o.id}>{optionLabel(labels, o)}</option>
        ))}
      </select>
    </div>
  )
}

export function SingleRef(props: { value: Id | null; options: Item[]; onChange: (v: Id | null) => void; none?: string }) {
  const labels = useLabels()
  return (
    <select value={props.value ?? ''} onChange={(e) => props.onChange(e.target.value || null)}>
      <option value="">{props.none ?? '— none —'}</option>
      {props.options.map((o) => (
        <option key={o.id} value={o.id}>{optionLabel(labels, o)}</option>
      ))}
    </select>
  )
}

/** Textarea with `@[id]` reference insertion and a rendered preview. */
export function RichText(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const p = useProject()
  const labels = useLabels()
  const ta = useRef<HTMLTextAreaElement>(null)
  const insert = (id: string) => {
    const el = ta.current
    const at = el ? el.selectionStart : props.value.length
    const end = el ? el.selectionEnd : at
    const next = props.value.slice(0, at) + mention(id) + props.value.slice(end)
    props.onChange(next)
    setTimeout(() => el?.focus(), 0)
  }
  const hasRefs = mentions(props.value).length > 0
  const others = Object.values(p.items).sort(byLabel(labels))
  return (
    <div className="rich">
      <textarea ref={ta} rows={props.rows ?? 3} value={props.value} placeholder={props.placeholder} onChange={(e) => props.onChange(e.target.value)} />
      <div className="rich-tools">
        <select value="" onChange={(e) => e.target.value && insert(e.target.value)} title="Insert a live reference">
          <option value="">@ insert reference…</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>{optionLabel(labels, o)}</option>
          ))}
        </select>
      </div>
      {hasRefs && <div className="preview">{renderText(labels, props.value)}</div>}
    </div>
  )
}

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
