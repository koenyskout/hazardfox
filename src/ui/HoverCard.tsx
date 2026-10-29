import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { effectiveLosses } from '../model/derived'
import { byLabel, renderText } from '../model/labels'
import { incoming, refsOf } from '../model/refs'
import { generateUcaText } from '../model/uca'
import { GUIDE_WORD_LABELS, KIND_NAMES, type Id, type Item, type Kind, type Labels, type Project } from '../model/types'

const MAX_PER_KIND = 5

/** Items grouped by kind, ordered by label. */
function group(p: Project, labels: Labels, ids: Iterable<Id>): [Kind, Id[]][] {
  const by = new Map<Kind, Id[]>()
  for (const id of new Set(ids)) {
    const it = p.items[id]
    if (it) by.set(it.kind, [...(by.get(it.kind) ?? []), id])
  }
  return [...by].map(([k, v]) => [k, v.sort(byLabel(labels))] as [Kind, Id[]])
}

function Group({ title, groups, p, labels, go }: { title: string; groups: [Kind, Id[]][]; p: Project; labels: Labels; go: (id: Id) => void }) {
  if (!groups.length) return null
  return (
    <div className="hc-sec">
      <div className="hc-head">{title}</div>
      {groups.map(([k, ids]) => (
        <div key={k} className="hc-row">
          <span className="hc-kind">{KIND_NAMES[k]}{ids.length > 1 ? 's' : ''}</span>
          <span>
            {ids.slice(0, MAX_PER_KIND).map((i) => (
              <a key={i} href="#" className={'chip k-' + k} title={p.items[i].title} onClick={(e) => { e.preventDefault(); go(i) }}>{labels[i]}</a>
            ))}
            {ids.length > MAX_PER_KIND && <span className="muted"> +{ids.length - MAX_PER_KIND}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

export function ItemCard({ it, p, labels, go }: { it: Item; p: Project; labels: Labels; go: (id: Id) => void }) {
  const refs = [...(it.parent ? [it.parent] : []), ...refsOf(it), ...(it.kind === 'hazard' ? effectiveLosses(p, it.id) : [])]
  const out = group(p, labels, refs.filter((i) => i !== it.id))
  const inc = group(p, labels, incoming(p, it.id).map((o) => o.id))
  const title = it.title || (it.kind === 'uca' ? generateUcaText(p, labels, it) : '')
  const desc = renderText(labels, it.description).trim()
  return (
    <>
      <div className="hc-top">
        <span className={'chip k-' + it.kind}>{labels[it.id]}</span>
        <span className="hc-type">{KIND_NAMES[it.kind]}{it.kind === 'uca' && ` · ${GUIDE_WORD_LABELS[it.guide]}`}</span>
      </div>
      <div className="hc-title">{title || <span className="muted">(untitled)</span>}</div>
      {desc && <div className="hc-desc">{desc}</div>}
      <Group title="Refers to" groups={out} p={p} labels={labels} go={go} />
      <Group title="Referenced by" groups={inc} p={p} labels={labels} go={go} />
      {!out.length && !inc.length && <div className="hc-sec muted">Not linked to anything yet.</div>}
    </>
  )
}

/** Wraps a trigger; shows a floating card after a short hover or on keyboard focus. */
export function HoverCard({ children, card }: { children: ReactNode; card: () => ReactNode }) {
  const trigger = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(0)
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const open = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const r = trigger.current?.getBoundingClientRect()
      if (!r) return
      const below = r.bottom + 260 < window.innerHeight || r.top < 260
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 336)), y: below ? r.bottom + 6 : r.top - 6, below })
    }, 250)
  }
  const close = () => { window.clearTimeout(timer.current); setPos(null) }
  const closeSoon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(close, 200) }
  const keep = () => window.clearTimeout(timer.current)
  useEffect(() => {
    if (!pos) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const scroll = (e: Event) => !(e.target instanceof Node && box.current?.contains(e.target)) && close()
    window.addEventListener('keydown', esc)
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('scroll', scroll, true) }
  }, [pos])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <span ref={trigger} className="hc-trigger" onMouseEnter={open} onMouseLeave={closeSoon} onFocus={open} onBlur={close} onClick={close}>
      {children}
      {pos && createPortal(
        <div ref={box} className="hovercard" onMouseEnter={keep} onMouseLeave={closeSoon} style={{ left: pos.x, top: pos.y, transform: pos.below ? undefined : 'translateY(-100%)' }}>{card()}</div>,
        document.body,
      )}
    </span>
  )
}
