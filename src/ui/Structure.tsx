import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from 'react'
import { download } from '../model/persist'
import { updateItem } from '../model/ops'
import { applyOverrides, layoutStructure, type Layout } from '../model/structure'
import { useStore } from '../model/store'
import { itemsOfKind } from '../model/tree'
import type { Id } from '../model/types'
import { structureSvg } from '../export/structureImage'
import { Ref, VIEW_OF } from './Fields'
import { useHoverCard } from './HoverCard'
import { ItemCard } from './ItemCard'
import { FlatTable } from './FlatTable'
import { addItem, commit, select, useLabels, useProject } from './hooks'
import { StructureSvg } from './StructureSvg'
import { DeleteDialog, TreeTable } from './TreeTable'

type Tab = 'diagram' | 'nodes' | 'ca' | 'feedback'

export function Structure() {
  const p = useProject()
  const [tab, setTab] = useState<Tab>('diagram')
  const nodes = itemsOfKind(p, 'node')
  const tabs: [Tab, string, number][] = [
    ['diagram', 'Diagram', nodes.length],
    ['nodes', 'Elements', nodes.length],
    ['ca', 'Control actions', itemsOfKind(p, 'ca').length],
    ['feedback', 'Feedback', itemsOfKind(p, 'feedback').length],
  ]
  const sel = nodes[0]?.id
  return (
    <div className="page full">
      <div className="tabs">
        {tabs.map(([k, l, n]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l} {k !== 'diagram' && <i>{n}</i>}</button>)}
      </div>
      {tab === 'diagram' && <Diagram />}
      {tab === 'nodes' && <TreeTable kind="node" empty="Add controllers, controlled processes and external elements. Nest elements to build the hierarchy. Sensors and actuators are set on the feedback and control action arrows." extraHeader="Role" extra={(n) => (n.kind === 'node' ? <span className="muted">{n.role}</span> : null)} />}
      {tab === 'ca' && (
        <FlatTable kind="ca" items={itemsOfKind(p, 'ca')} init={{ from: sel ?? '', to: nodes[1]?.id ?? '' }}
          columns={[{ head: 'From → To', cell: (c) => (c.kind === 'ca' ? <span>{c.from ? <Ref id={c.from} /> : '?'} → {c.to ? <Ref id={c.to} /> : '?'}</span> : null) }]} />
      )}
      {tab === 'feedback' && (
        <FlatTable kind="feedback" items={itemsOfKind(p, 'feedback')} init={{ from: nodes[1]?.id ?? '', to: sel ?? '' }}
          columns={[{ head: 'From → To', cell: (c) => (c.kind === 'feedback' ? <span>{c.from ? <Ref id={c.from} /> : '?'} → {c.to ? <Ref id={c.to} /> : '?'}</span> : null) }, { head: 'Variables', cell: (c) => (c.kind === 'feedback' ? <span className="reflist">{c.variables.map((v) => <Ref key={v} id={v} />)}</span> : null) }]} />
      )}
    </div>
  )
}

function Diagram() {
  const p = useProject()
  const selected = useStore((s) => s.selected)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [err, setErr] = useState('')
  const [view, setView] = useState({ x: 20, y: 20, k: 1 })
  const box = useRef<HTMLDivElement>(null)
  const labels = useLabels()
  const goto = useStore((s) => s.goto)
  const hc = useHoverCard()
  const [deleting, setDeleting] = useState<Id | null>(null)
  const sel = selected && ['node', 'ca', 'feedback'].includes(p.items[selected]?.kind) ? selected : null

  // Re-run ELK only when structure (not nudges) changes.
  const sig = useMemo(() => JSON.stringify([
    itemsOfKind(p, 'node').map((n) => [n.id, n.parent, n.rank, n.title, n.role, n.wide, n.tall]),
    itemsOfKind(p, 'ca').map((c) => [c.id, c.from, c.to, c.title, c.rank]),
    itemsOfKind(p, 'feedback').map((c) => [c.id, c.from, c.to, c.title, c.rank]),
  ]), [p])
  useEffect(() => {
    let live = true
    layoutStructure(p).then((l) => live && (setLayout(l), setErr('')), (e) => live && setErr(String(e)))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  const [devices, setDevices] = useState(() => { try { return localStorage.getItem('hazardfox.devices') !== '0' } catch { return true } })
  const toggleDevices = () => setDevices((v) => { try { localStorage.setItem('hazardfox.devices', v ? '0' : '1') } catch { /* ignore */ } return !v })
  const [resize, setResize] = useState<{ id: Id; wide?: number; tall?: number } | null>(null)
  const drawn = useMemo(() => {
    if (!layout) return null
    const d = applyOverrides(p, layout)
    const it = resize && p.items[resize.id]
    return resize && it?.kind === 'node' ? { ...d, nodes: d.nodes.map((n) => (n.id === resize.id ? { ...n, w: resize.wide === undefined ? n.w : Math.max(n.minW, n.defW + resize.wide), h: resize.tall === undefined ? n.h : Math.max(n.minH, n.compound ? 60 + resize.tall : n.minH + resize.tall) } : n)) } : d
  }, [p, layout, resize])
  const floor = (id: Id) => { const n = layout?.nodes[id]; return n && !n.compound ? n.minW - n.defW : 0 }
  const drag = useRef<null | { kind: 'pan' | 'node' | 'edge' | 'resize' | 'resizeH'; id?: Id; sx: number; sy: number; ox: number; oy: number; moved: boolean }>(null)

  const fit = () => {
    if (!drawn || !box.current) return
    const r = box.current.getBoundingClientRect()
    const k = Math.min(1.5, (r.width - 40) / drawn.width, (r.height - 40) / drawn.height)
    setView({ k, x: (r.width - drawn.width * k) / 2, y: 20 })
  }
  useEffect(() => { if (layout) fit() }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps

  const hover = (id: Id | null, e: MouseEvent) => {
    const it = id && p.items[id]
    if (!it || drag.current) return hc.closeSoon()
    const r = e.currentTarget.getBoundingClientRect()
    const at = it.kind === 'node' ? { left: r.left, top: r.top, bottom: r.bottom } : { left: e.clientX, top: e.clientY, bottom: e.clientY + 8 }
    hc.open(() => at, () => <ItemCard it={it} p={p} labels={labels} go={(t) => goto(VIEW_OF[p.items[t].kind], t)} />)
  }
  const down = (e: MouseEvent, kind: 'pan' | 'node' | 'edge' | 'resize' | 'resizeH', id?: Id) => {
    e.stopPropagation()
    hc.close()
    let ox = 0, oy = 0
    const it = id ? p.items[id] : null
    if (kind === 'resize' && it?.kind === 'node') ox = it.wide
    if (kind === 'resizeH' && it?.kind === 'node') oy = it.tall
    if (kind !== 'resize' && kind !== 'resizeH' && it?.kind === 'node' && it.nudge) { ox = it.nudge.dx; oy = it.nudge.dy }
    if ((it?.kind === 'ca' || it?.kind === 'feedback') && it.bend) { ox = it.bend.dx; oy = it.bend.dy }
    drag.current = { kind, id, sx: e.clientX, sy: e.clientY, ox: kind === 'pan' ? view.x : ox, oy: kind === 'pan' ? view.y : oy, moved: false }
    if (id) select(id)
  }
  const move = (e: MouseEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    d.moved = true
    if (d.kind === 'resizeH') return setResize({ id: d.id!, tall: Math.max(0, Math.round(d.oy + dy / view.k)) })
    if (d.kind === 'resize') return setResize({ id: d.id!, wide: Math.max(floor(d.id!), Math.round(d.ox + dx / view.k)) })
    if (d.kind === 'pan') return setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }))
    const patch = d.kind === 'node' ? { nudge: { dx: d.ox + dx / view.k, dy: d.oy + dy / view.k } } : { bend: { dx: d.ox + dx / view.k, dy: d.oy + dy / view.k } }
    commit((q) => updateItem(q, d.id!, patch), 'drag:' + d.id)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if ((d?.kind === 'resize' || d?.kind === 'resizeH') && resize) { const { id, ...patch } = resize; commit((q) => updateItem(q, id, patch)) }
    setResize(null)
  }
  const wheel = (e: WheelEvent) => {
    const r = box.current!.getBoundingClientRect()
    const f = Math.exp(-e.deltaY * 0.0015)
    setView((v) => {
      const k = Math.max(0.2, Math.min(3, v.k * f))
      const mx = e.clientX - r.left, my = e.clientY - r.top
      return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
    })
  }
  const addNode = () => addItem('node', { title: 'New element', parent: selected && p.items[selected]?.kind === 'node' ? selected : null })
  const hasBends = Object.values(p.items).some((i) => (i.kind === 'ca' || i.kind === 'feedback') && i.bend)
  const hasNudges = Object.values(p.items).some((i) => (i.kind === 'node' && i.nudge) || ((i.kind === 'ca' || i.kind === 'feedback') && i.bend))

  return (
    <div className="diagram-wrap" tabIndex={-1} onKeyDown={(e) => { if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setDeleting(sel) } }}>
      <div className="toolbar">
        <button onClick={addNode}>+ Element</button>
        <button onClick={fit}>Fit</button>
        <button disabled={!hasNudges} onClick={() => commit((q) => {
          let n = q
          for (const i of Object.values(q.items)) if ((i.kind === 'node' && i.nudge) || ((i.kind === 'ca' || i.kind === 'feedback') && i.bend)) n = updateItem(n, i.id, i.kind === 'node' ? { nudge: null } : { bend: null })
          return n
        })}>Reset manual positions</button>
        <button disabled={!hasBends} title="Discard manually dragged arrows and labels; re-route arrows automatically" onClick={() => commit((q) => {
          let n = q
          for (const i of Object.values(q.items)) if ((i.kind === 'ca' || i.kind === 'feedback') && i.bend) n = updateItem(n, i.id, { bend: null })
          return n
        })}>Auto-arrange arrows</button>
        <button title="Show or hide the sensors and actuators drawn on the arrows" onClick={toggleDevices}>{devices ? 'Hide' : 'Show'} sensors/actuators</button>
        <button onClick={async () => { const s = await structureSvg(p); if (s) download('control-structure.svg', s.svg, 'image/svg+xml') }}>Export SVG</button>
        <span className="hint">Select + Delete to remove · drag elements or labels to nudge · wheel to zoom · drag background to pan</span>
      </div>
      <div className="canvas" ref={box} onMouseDown={(e) => down(e, 'pan')} onMouseMove={move} onMouseUp={up} onMouseLeave={up} onWheel={wheel}>
        {err && <div className="empty">{err}</div>}
        {!drawn || drawn.nodes.length === 0 ? <div className="empty">Add control structure elements and control actions to see the diagram.</div> : (
          <div style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transformOrigin: '0 0', width: drawn.width, height: drawn.height }}>
            <StructureSvg p={p} d={drawn} h={{ selected, onHover: hover, hideDevices: !devices, onNodeDown: (e, id) => down(e, 'node', id), onResizeDown: (e, id) => down(e, 'resize', id), onResizeHDown: (e, id) => down(e, 'resizeH', id), onEdgeDown: (e, id) => down(e, 'edge', id) }} />
          </div>
        )}
        {hc.node}
      </div>
      {deleting && <DeleteDialog ids={[deleting]} onClose={() => setDeleting(null)} />}
    </div>
  )
}
