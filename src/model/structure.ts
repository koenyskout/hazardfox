import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import { children, itemsOfKind } from './tree'
import type { CsNode, Id, NodeRole, Project } from './types'

export interface Pt { x: number; y: number }
export interface NodeBox { id: Id; x: number; y: number; w: number; h: number; compound: boolean; depth: number; lines: string[] }
export interface EdgeRoute {
  id: Id
  kind: 'ca' | 'feedback'
  from: Id
  to: Id
  /** Polyline in drawing direction (from → to). */
  points: Pt[]
  label: { x: number; y: number; w: number; h: number; lines: string[] } | null
  text: string
}
export interface Layout { nodes: Record<Id, NodeBox>; edges: EdgeRoute[]; width: number; height: number }

const CHAR_W = 7.2
const wrap = (text: string, max: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  return lines.length ? lines.slice(0, 3) : ['']
}

/** Wrap on commas / spaces into lines of about `max` chars (no line cap, unlike node titles). */
const wrapLabel = (text: string, max: number): string[] => {
  const lines: string[] = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w } else cur = cur ? cur + ' ' + w : w
  }
  if (cur) lines.push(cur)
  return lines
}

type Rect = { x: number; y: number; w: number; h: number }
const hitsRect = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const segHits = (p: Pt, q: Pt, r: Rect) => hitsRect({ x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(p.x - q.x), h: Math.abs(p.y - q.y) }, r)

/**
 * Put every label beside one of its edge's segments (control actions left/above, feedback right/below, they run in pairs),
 * avoiding boxes, other labels and other edges: the candidate with the lowest penalty wins.
 */
const placeLabels = (items: { id: Id; kind: 'ca' | 'feedback'; points: Pt[]; lines: string[] }[], nodes: NodeBox[]): Record<Id, Rect & { lines: string[] }> => {
  const out: Record<Id, Rect & { lines: string[] }> = {}
  const placed: Rect[] = []
  for (const it of items) {
    if (!it.lines.length) continue
    const w = Math.max(...it.lines.map((l) => l.length)) * 6.2 + 10, h = it.lines.length * 13 + 4
    const segs = it.points.slice(1).map((q, i) => ({ a: it.points[i], b: q })).map((sg) => ({ ...sg, len: Math.abs(sg.a.x - sg.b.x) + Math.abs(sg.a.y - sg.b.y) }))
    const order = [...segs].sort((x, y) => y.len - x.len)
    let best: (Rect & { score: number }) | null = null
    order.forEach((sg, si) => {
      const vertical = Math.abs(sg.a.x - sg.b.x) < 1
      for (const side of it.kind === 'ca' ? [-1, 1] : [1, -1]) {
        for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
          const mx = sg.a.x + (sg.b.x - sg.a.x) * t, my = sg.a.y + (sg.b.y - sg.a.y) * t
          const r: Rect = vertical ? { x: side < 0 ? mx - w - 6 : mx + 6, y: my - h / 2, w, h } : { x: mx - w / 2, y: side < 0 ? my - h - 3 : my + 3, w, h }
          const pad = { x: r.x - 2, y: r.y - 2, w: w + 4, h: h + 4 }
          let score = si * 3 + Math.abs(t - 0.5) * 4 + (side === (it.kind === 'ca' ? -1 : 1) ? 0 : 2) + (sg.len < h + 10 && vertical ? 20 : 0)
          score += nodes.filter((n) => hitsRect(pad, n)).length * 100 + placed.filter((q) => hitsRect(pad, q)).length * 100
          for (const o of items) if (o !== it) for (let i = 1; i < o.points.length; i++) if (segHits(o.points[i - 1], o.points[i], pad)) score += 15
          if (!best || score < best.score) best = { ...r, score }
        }
      }
    })
    const r = best ?? { x: 0, y: 0, w, h }
    placed.push(r)
    out[it.id] = { x: r.x, y: r.y, w, h, lines: it.lines }
  }
  return out
}

/** Orthogonal route between two boxes; `slot` offsets parallel edges. */
const routeBetween = (a: NodeBox, b: NodeBox, slot: number): Pt[] => {
  // shared span of two intervals, if wide enough for a straight line; `want` is the preferred position
  const span = (a0: number, a1: number, b0: number, b1: number, want: number) => {
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
    if (hi - lo < 4) return null
    const m = Math.min(8, (hi - lo) / 4)
    return Math.max(lo + m, Math.min(hi - m, want))
  }
  const aboveB = a.y + a.h <= b.y, belowB = b.y + b.h <= a.y
  const x = span(a.x, a.x + a.w, b.x, b.x + b.w, (Math.max(a.x, b.x) + Math.min(a.x + a.w, b.x + b.w)) / 2 + slot)
  if (x !== null && (aboveB || belowB)) return [{ x, y: aboveB ? a.y + a.h : a.y }, { x, y: aboveB ? b.y : b.y + b.h }]
  const leftOfB = a.x + a.w <= b.x, rightOfB = b.x + b.w <= a.x
  const y = span(a.y, a.y + a.h, b.y, b.y + b.h, (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2 + slot)
  if (y !== null && (leftOfB || rightOfB)) return [{ x: leftOfB ? a.x + a.w : a.x, y }, { x: leftOfB ? b.x : b.x + b.w, y }]
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  if (aboveB || belowB) {
    const x1 = clamp(a.x + a.w / 2 + slot, a.x + 8, a.x + a.w - 8), x2 = clamp(b.x + b.w / 2 + slot, b.x + 8, b.x + b.w - 8)
    const y1 = aboveB ? a.y + a.h : a.y, y2 = aboveB ? b.y : b.y + b.h
    const ym = (y1 + y2) / 2 + slot
    return [{ x: x1, y: y1 }, { x: x1, y: ym }, { x: x2, y: ym }, { x: x2, y: y2 }]
  }
  // overlapping boxes: fall back to a straight line between centres
  return [{ x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }]
}

/** Replace a jogged route by one straight vertical line (moving the ends a little) when the nodes overlap horizontally and nothing is in the way. */
const straighten = (pts: Pt[], a: NodeBox | undefined, b: NodeBox | undefined, obstacles: NodeBox[]): Pt[] => {
  if (pts.length < 3 || !a || !b) return pts
  const first = pts[0], last = pts[pts.length - 1]
  if (Math.abs(first.x - pts[1].x) > 1e-6 || Math.abs(last.x - pts[pts.length - 2].x) > 1e-6) return pts
  const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w)
  if (hi - lo < 4) return pts
  const m = Math.min(8, (hi - lo) / 4)
  const y0 = Math.min(first.y, last.y), y1 = Math.max(first.y, last.y)
  const between = obstacles.filter((n) => n.y < y1 && n.y + n.h > y0)
  const free = (x: number) => between.every((n) => x + 6 < n.x || x - 6 > n.x + n.w)
  const want = Math.max(lo + m, Math.min(hi - m, first.x))
  const cands = [want, ...Array.from({ length: 12 }, (_, i) => want + (i % 2 ? -1 : 1) * Math.ceil((i + 1) / 2) * 10)].filter((x) => x >= lo + m && x <= hi - m)
  const x = cands.find(free)
  return x === undefined ? pts : [{ x, y: first.y }, { x, y: last.y }]
}

const elk = new ELK()

/** Auto-layout of the control structure hierarchy with ELK (layered, top = controllers). */
export async function layoutStructure(p: Project): Promise<Layout> {
  const nodes = itemsOfKind(p, 'node')
  const inTree = new Set(nodes.map((n) => n.id))
  const lines: Record<Id, string[]> = {}
  const compound = new Set(nodes.filter((n) => nodes.some((c) => c.parent === n.id)).map((n) => n.id))

  const build = (n: CsNode): ElkNode => {
    const title = n.title || '(unnamed)'
    const ls = wrap(title, 22)
    lines[n.id] = ls
    if (compound.has(n.id)) {
      return {
        id: n.id,
        children: children(p, n.id, 'node').map((c) => build(c as CsNode)),
        layoutOptions: { 'elk.padding': '[top=40,left=16,bottom=16,right=16]', 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${Math.max(...ls.map((l) => l.length)) * CHAR_W + 32 + n.wide},60)` },
      }
    }
    const w = Math.max(120, Math.max(...ls.map((l) => l.length)) * CHAR_W + 28) + n.wide
    return { id: n.id, width: w, height: 30 + ls.length * 16 }
  }
  const roots = children(p, null, 'node') as CsNode[]

  const edges: ElkExtendedEdge[] = []
  const meta = new Map<string, { kind: 'ca' | 'feedback'; from: Id; to: Id; text: string; reversed: boolean; pairOf?: string }>()
  const isAnc = (a: Id, b: Id) => { let c = p.items[b]; while (c?.parent) { if (c.parent === a) return true; c = p.items[c.parent] } return false }
  const ok = (a: Id, b: Id) => inTree.has(a) && inTree.has(b) && a !== b && !isAnc(a, b) && !isAnc(b, a)
  const cas = itemsOfKind(p, 'ca').filter((c) => ok(c.from, c.to))
  const labelLines: Record<string, string[]> = {}
  const addEdge = (id: string, s: Id, t: Id, text: string) => {
    const ls = text ? wrapLabel(text, 26) : []
    labelLines[id] = ls
    edges.push({ id, sources: [s], targets: [t] } as ElkExtendedEdge)
  }
  for (const c of cas) {
    addEdge(c.id, c.from, c.to, c.title)
    meta.set(c.id, { kind: 'ca', from: c.from, to: c.to, text: c.title, reversed: false })
  }
  for (const f of itemsOfKind(p, 'feedback').filter((f) => ok(f.from, f.to))) {
    const pair = cas.find((c) => c.from === f.to && c.to === f.from)
    if (pair) meta.set(f.id, { kind: 'feedback', from: f.from, to: f.to, text: f.title, reversed: true, pairOf: pair.id })
    else {
      addEdge(f.id, f.to, f.from, f.title)
      meta.set(f.id, { kind: 'feedback', from: f.from, to: f.to, text: f.title, reversed: true })
    }
  }

  const graph: ElkNode = {
    id: 'root',
    children: roots.map(build),
    edges,
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.max(80, ...Object.values(labelLines).map((l) => l.length * 13 + 40))),
      'elk.spacing.edgeNode': '24',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
    },
  }
  const res = await elk.layout(graph)

  const out: Layout = { nodes: {}, edges: [], width: res.width ?? 0, height: res.height ?? 0 }
  const abs: Record<Id, Pt> = { root: { x: 0, y: 0 } }
  const walk = (n: ElkNode, ox: number, oy: number, depth: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0)
      abs[c.id] = { x, y }
      out.nodes[c.id] = { id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, compound: compound.has(c.id), depth, lines: lines[c.id] }
      walk(c, x, y, depth + 1)
    }
  }
  walk(res, 0, 0, 0)

  const routes = new Map<string, EdgeRoute>()
  for (const e of res.edges ?? []) {
    const m = meta.get(e.id)
    const s = e.sections?.[0]
    if (!m || !s) continue
    const o = abs[(e as unknown as { container?: string }).container ?? 'root'] ?? { x: 0, y: 0 }
    let pts: Pt[] = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map((q) => ({ x: q.x + o.x, y: q.y + o.y }))
    const sa = e.sources?.[0] as Id, ta = e.targets?.[0] as Id
    pts = straighten(pts, out.nodes[sa], out.nodes[ta], Object.values(out.nodes).filter((n) => n.id !== sa && n.id !== ta && !isAnc(n.id, sa) && !isAnc(n.id, ta)))
    if (m.reversed) pts = pts.reverse()
    routes.set(e.id, { id: e.id, kind: m.kind, from: m.from, to: m.to, points: pts, text: m.text, label: null })
  }
  // Feedback parallel to a control action: offset the reversed route of that action.
  for (const [id, m] of meta) {
    if (!m.pairOf) continue
    const base = routes.get(m.pairOf)
    if (!base) continue
    const pts = [...base.points].reverse()
    const vertical = pts.length > 1 && Math.abs(pts[0].x - pts[1].x) < 1
    const d = 22
    routes.set(id, {
      id, kind: 'feedback', from: m.from, to: m.to, text: m.text,
      points: pts.map((q) => (vertical ? { x: q.x + d, y: q.y } : { x: q.x, y: q.y + d })),
      label: null,
    })
  }
  const labs = placeLabels([...routes.values()].filter((r) => r.text).map((r) => ({ id: r.id, kind: r.kind, points: r.points, lines: labelLines[r.id] ?? wrapLabel(r.text, 26) })), Object.values(out.nodes))
  for (const r of routes.values()) r.label = labs[r.id] ?? null
  out.edges = [...routes.values()]
  return out
}

export interface Drawn { nodes: NodeBox[]; edges: EdgeRoute[]; width: number; height: number; minX: number; minY: number }

const cumulative = (p: Project, id: Id): Pt => {
  let dx = 0, dy = 0
  let c = p.items[id]
  while (c) {
    if (c.kind === 'node' && c.nudge) { dx += c.nudge.dx; dy += c.nudge.dy }
    c = c.parent ? p.items[c.parent] : (undefined as never)
  }
  return { x: dx, y: dy }
}

/** Apply stored manual nudges / bends to the auto layout. */
export function applyOverrides(p: Project, l: Layout): Drawn {
  const nodes = Object.values(l.nodes)
    .filter((n) => p.items[n.id])
    .map((n) => { const d = cumulative(p, n.id); return { ...n, x: n.x + d.x, y: n.y + d.y } })
  const box = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const live = l.edges.filter((e) => p.items[e.id] && l.nodes[e.from] && l.nodes[e.to])
  const pairKey = (e: EdgeRoute) => [e.from, e.to].sort().join('|')
  const groups = new Map<string, EdgeRoute[]>()
  for (const e of live) groups.set(pairKey(e), [...(groups.get(pairKey(e)) ?? []), e])
  const edges = live.map((e) => {
    const a = cumulative(p, e.from), b = cumulative(p, e.to)
    const it = p.items[e.id]
    const bend = it && (it.kind === 'ca' || it.kind === 'feedback') ? it.bend : null
    if (a.x || a.y || b.x || b.y) {
      // an end moved: re-route between the actual boxes instead of stretching the old route
      const g = groups.get(pairKey(e))!
      let pts = routeBetween(box[e.from], box[e.to], (g.indexOf(e) - (g.length - 1) / 2) * 22)
      if (bend && pts.length > 2) pts = pts.map((q, i) => (i > 0 && i < pts.length - 1 ? { x: q.x + bend.dx, y: q.y + bend.dy } : q))
      return { ...e, points: pts }
    }
    const n = e.points.length
    const points = e.points.map((q, i) => {
      const t = n > 1 ? i / (n - 1) : 0
      const mid = i > 0 && i < n - 1
      return { x: q.x + a.x + (b.x - a.x) * t + (mid && bend ? bend.dx : 0), y: q.y + a.y + (b.y - a.y) * t + (mid && bend ? bend.dy : 0) }
    })
    return { ...e, points }
  })
  const labs = placeLabels(edges.filter((e) => e.label).map((e) => ({ id: e.id, kind: e.kind, points: e.points, lines: e.label!.lines })), nodes)
  edges.forEach((e, i) => {
    const it = p.items[e.id]
    const bend = it && (it.kind === 'ca' || it.kind === 'feedback') ? it.bend : null
    const lab = labs[e.id]
    edges[i] = { ...e, label: lab ? { ...lab, x: lab.x + (e.points.length > 2 ? 0 : bend?.dx ?? 0), y: lab.y + (e.points.length > 2 ? 0 : bend?.dy ?? 0) } : null }
  })
  const xs = [...nodes.flatMap((n) => [n.x, n.x + n.w]), ...edges.flatMap((e) => [...e.points.map((q) => q.x), ...(e.label ? [e.label.x, e.label.x + e.label.w] : [])])]
  const ys = [...nodes.flatMap((n) => [n.y, n.y + n.h]), ...edges.flatMap((e) => [...e.points.map((q) => q.y), ...(e.label ? [e.label.y, e.label.y + e.label.h] : [])])]
  const minX = Math.min(0, ...xs) - 20, minY = Math.min(0, ...ys) - 20
  return { nodes, edges, minX, minY, width: Math.max(1, ...xs) - minX + 20, height: Math.max(1, ...ys) - minY + 20 }
}

export const ROLE_FILL: Record<NodeRole, string> = {
  controller: '#dbeafe',
  actuator: '#fef3c7',
  sensor: '#dcfce7',
  process: '#fee2e2',
  external: '#e5e7eb',
}
export const ROLE_STROKE: Record<NodeRole, string> = {
  controller: '#2563eb',
  actuator: '#d97706',
  sensor: '#16a34a',
  process: '#dc2626',
  external: '#6b7280',
}
