import { useEffect, useMemo, useState } from 'react'
import { DOM, layoutDomain, type DomainEdge, type DomainLayout } from '../model/domainLayout'
import { useStore } from '../model/store'
import type { Pt } from '../model/structure'
import { select, useLabels, useProject } from './hooks'

const path = (pts: Pt[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ')
const mid = (pts: Pt[]): Pt => {
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    if (acc + d >= total / 2) { const t = d ? (total / 2 - acc) / d : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t } }
    acc += d
  }
  return pts[0]
}
/** A point a few pixels along the edge, away from the end it starts at, pushed sideways so cardinalities don't sit on the line. */
const near = (a: Pt, b: Pt): Pt => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d
  return { x: a.x + ux * 14 - uy * 10, y: a.y + uy * 14 + ux * 10 }
}

function Edge({ e, selected }: { e: DomainEdge; selected: boolean }) {
  const part = e.kind === 'part'
  const first = e.pts[0], last = e.pts[e.pts.length - 1]
  const m = mid(e.pts)
  const c = selected ? '#2563eb' : '#374151'
  return (
    <g onMouseDown={(ev) => { ev.stopPropagation(); select(e.id) }} style={{ cursor: 'pointer' }}>
      <path d={path(e.pts)} fill="none" stroke="transparent" strokeWidth={12} />
      <path d={path(e.pts)} fill="none" stroke={c} strokeWidth={selected ? 2 : 1.3} strokeDasharray={part ? '5 3' : undefined} markerEnd={part ? 'url(#dom-tri)' : undefined} />
      {!part && e.label && (
        <text x={m.x} y={m.y - 4} textAnchor="middle" fontSize={11} fontStyle="italic" fill={c} stroke="#fff" strokeWidth={3} paintOrder="stroke">{e.label}</text>
      )}
      {!part && e.fromCard && <text {...near(first, e.pts[1])} fontSize={10} fill="#6b7280" textAnchor="middle">{e.fromCard}</text>}
      {!part && e.toCard && <text {...near(last, e.pts[e.pts.length - 2])} fontSize={10} fill="#6b7280" textAnchor="middle">{e.toCard}</text>}
    </g>
  )
}

/** Domain model as a class diagram: entities with attributes (world variables) and operations, labelled relationships; dashed arrows point to the parent entity (part / specialisation). */
export function DomainDiagram() {
  const p = useProject()
  const labels = useLabels()
  const selected = useStore((s) => s.selected)
  const [layout, setLayout] = useState<DomainLayout | null>(null)
  const [err, setErr] = useState('')
  const sig = useMemo(() => JSON.stringify(Object.values(p.items).filter((i) => i.kind === 'entity' || i.kind === 'relationship' || (i.kind === 'variable' && i.layer === 'domain')).map((i) => [i.id, i.title, i.rank, i.parent, (i as { from?: string }).from, (i as { to?: string }).to, (i as { operations?: string[] }).operations, (i as { type?: string }).type, (i as { states?: string[] }).states, (i as { fromCard?: string }).fromCard, (i as { toCard?: string }).toCard, (i as { min?: number }).min, (i as { max?: number }).max, (i as { unit?: string }).unit])), [p])
  useEffect(() => {
    let live = true
    layoutDomain(p, labels).then((l) => live && (setLayout(l), setErr('')), (e) => live && setErr(String(e)))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  if (err) return <p className="empty">Layout failed: {err}</p>
  if (!layout) return <p className="empty">Laying out…</p>
  if (!layout.boxes.length) return <p className="empty">Add entities to see the domain model diagram.</p>
  const { row, head, pad } = DOM
  return (
    <div className="domain-diagram">
      <p className="hint">Entities with their attributes (world variables) and operations; lines are relationships (name, cardinalities), dashed arrows lead to the parent entity. Click to select.</p>
      <div className="stage" style={{ overflow: 'auto' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width={layout.width} height={layout.height} fontFamily="Helvetica, Arial, sans-serif" fontSize={12} style={{ width: layout.width, height: layout.height }} onMouseDown={() => select(null)}>
          <defs>
            <marker id="dom-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1L11 6L1 11z" fill="#fff" stroke="#374151" /></marker>
          </defs>
          {layout.edges.map((e, i) => <Edge key={e.id + i} e={e} selected={selected === e.id} />)}
          {layout.boxes.map((b) => {
            const on = selected === b.id
            const stroke = on ? '#2563eb' : '#374151'
            let y = head
            const attrY = y + 14
            y += b.attrs.length * row + (b.attrs.length ? 8 : 0)
            const opY = y + 14
            return (
              <g key={b.id} transform={`translate(${b.x} ${b.y})`} onMouseDown={(ev) => { ev.stopPropagation(); select(b.id) }} style={{ cursor: 'pointer' }}>
                <rect width={b.w} height={b.h} rx={3} fill="#fff" stroke={stroke} strokeWidth={on ? 2.5 : 1.5} />
                <rect width={b.w} height={head} rx={3} fill="#dbeafe" stroke={stroke} strokeWidth={on ? 2.5 : 1.5} />
                <text x={b.w / 2} y={15} textAnchor="middle" fontSize={10} fill="#6b7280">{b.head}</text>
                <text x={b.w / 2} y={31} textAnchor="middle" fontSize={13} fontWeight={700} fill="#111827">{b.title}</text>
                {b.attrs.map((a, i) => <text key={a.id} x={pad} y={attrY + i * row} fill="#111827" fontSize={12}>{a.text}</text>)}
                {b.ops.length > 0 && b.attrs.length > 0 && <line x1={0} x2={b.w} y1={y} y2={y} stroke="#9ca3af" />}
                {b.ops.map((o, i) => <text key={i} x={pad} y={opY + i * row} fill="#374151" fontSize={12}>{o}()</text>)}
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
