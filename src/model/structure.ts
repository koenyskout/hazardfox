import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import { routeAround, type Used } from './route'
import { children, itemsOfKind } from './tree'
import type { CsNode, Id, NodeRole, Offset, Project } from './types'

export interface Pt { x: number; y: number }
export interface NodeBox { id: Id; x: number; y: number; w: number; h: number; compound: boolean; depth: number; lines: string[]; minW: number; defW: number; minH: number }
export interface EdgeRoute {
  id: Id
  kind: 'ca' | 'feedback'
  from: Id
  to: Id
  /** Polyline in drawing direction (from → to). */
  points: Pt[]
  label: { x: number; y: number; w: number; h: number; lines: string[] } | null
  /** Sensor / actuator pill sitting on the arrow. */
  device: { x: number; y: number; w: number; h: number; name: string; kind: 'sensor' | 'actuator' } | null
  text: string
}
export interface Layout { nodes: Record<Id, NodeBox>; edges: EdgeRoute[]; width: number; height: number }

/** Minimum distance between parallel arrows on one side of a box, and between an arrow and the corner of its box. */
const SEP = 20
const MARGIN = 16
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
const placeLabels = (items: { id: Id; kind: 'ca' | 'feedback'; points: Pt[]; lines: string[] }[], nodes: NodeBox[], blocks: Rect[] = []): Record<Id, Rect & { lines: string[] }> => {
  const out: Record<Id, Rect & { lines: string[] }> = {}
  const byLines = [...items].sort((x, y) => y.lines.length - x.lines.length)
  for (const it of [...byLines, ...byLines]) {
    if (!it.lines.length) continue
    const placed: Rect[] = [...blocks, ...Object.entries(out).filter(([k]) => k !== it.id).map(([, v]) => v)]
    const w = Math.max(...it.lines.map((l) => l.length)) * 6.2 + 10, h = it.lines.length * 13 + 4
    const segs = it.points.slice(1).map((q, i) => ({ a: it.points[i], b: q })).map((sg) => ({ ...sg, len: Math.abs(sg.a.x - sg.b.x) + Math.abs(sg.a.y - sg.b.y) }))
    const order = [...segs].sort((x, y) => y.len - x.len)
    let best: (Rect & { score: number }) | null = null
    order.forEach((sg, si) => {
      const vertical = Math.abs(sg.a.x - sg.b.x) < 1
      // preferred: centred on the line (the white label background interrupts it)
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const mx = sg.a.x + (sg.b.x - sg.a.x) * t, my = sg.a.y + (sg.b.y - sg.a.y) * t
        const r: Rect = { x: mx - w / 2, y: my - h / 2, w, h }
        const pad = { x: r.x - 2, y: r.y - 2, w: w + 4, h: h + 4 }
        let score = si * 3 + Math.abs(t - 0.5) * 4 + ((vertical ? sg.len < h + 16 : sg.len < w + 16) ? 25 : 0)
        score += nodes.filter((n) => hitsRect(pad, n)).length * 100 + placed.filter((q) => hitsRect(pad, q)).length * 100
        for (const o of items) if (o !== it) for (let i = 1; i < o.points.length; i++) if (segHits(o.points[i - 1], o.points[i], pad)) score += 15
        // the line's own other segments must not run under the label
        for (let i = 1; i < it.points.length; i++) if (it.points[i - 1] !== sg.a && segHits(it.points[i - 1], it.points[i], pad)) score += 10
        if (!best || score < best.score) best = { ...r, score }
      }
      for (const side of it.kind === 'ca' ? [-1, 1] : [1, -1]) {
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]) for (const gap of [6, 16, 28, 44, 70, 110, 170]) for (const sh of [0, -1, 1]) {
          const mx = sg.a.x + (sg.b.x - sg.a.x) * t + (vertical ? 0 : sh * w * 0.6), my = sg.a.y + (sg.b.y - sg.a.y) * t + (vertical ? sh * h * 0.7 : 0)
          const r: Rect = vertical ? { x: side < 0 ? mx - w - gap : mx + gap, y: my - h / 2, w, h } : { x: mx - w / 2, y: side < 0 ? my - h - 3 : my + 3, w, h }
          const pad = { x: r.x - 2, y: r.y - 2, w: w + 4, h: h + 4 }
          let score = 12 + si * 3 + Math.abs(t - 0.5) * 4 + (side === (it.kind === 'ca' ? -1 : 1) ? 0 : 2) + (gap > 6 ? 3 + gap / 10 : 0) + Math.abs(sh) * 2 + (sg.len < h + 10 && vertical ? 20 : 0)
          score += nodes.filter((n) => hitsRect(pad, n)).length * 100 + placed.filter((q) => hitsRect(pad, q)).length * 100
          for (const o of items) if (o !== it) for (let i = 1; i < o.points.length; i++) if (segHits(o.points[i - 1], o.points[i], pad)) score += 15
          if (!best || score < best.score) best = { ...r, score }
        }
      }
    })
    const r = best ?? { x: 0, y: 0, w, h }
    out[it.id] = { x: r.x, y: r.y, w, h, lines: it.lines }
  }
  return out
}

type Device = NonNullable<EdgeRoute['device']>

/** The sensor / actuator name of an arrow, if any. */
const deviceOf = (p: Project, id: Id): { name: string; kind: Device['kind'] } | null => {
  const it = p.items[id]
  if (it?.kind === 'ca' && it.actuator) return { name: it.actuator, kind: 'actuator' }
  if (it?.kind === 'feedback' && it.sensor) return { name: it.sensor, kind: 'sensor' }
  return null
}

/** Sit each sensor / actuator pill on its arrow (actuators near the process, sensors near its origin), staggered so pills of parallel arrows do not collide. */
const placeDevices = (items: { id: Id; points: Pt[]; name: string; kind: Device['kind'] }[], nodes: NodeBox[]): Record<Id, Device> => {
  const out: Record<Id, Device> = {}
  const placed: Rect[] = []
  for (const it of items) {
    if (it.points.length < 2) continue
    const w = it.name.length * 5.8 + 18, h = 16
    const pref = it.kind === 'actuator' ? 0.75 : 0.25
    let best: (Rect & { score: number }) | null = null
    for (let k = 0; k <= 16; k++) {
      for (const sgn of k ? [1, -1] : [1]) {
        const t = pref + sgn * k * 0.05
        if (t < 0.06 || t > 0.94) continue
        const c = pointAt(it.points, t)
        const r: Rect = { x: c.x - w / 2, y: c.y - h / 2, w, h }
        const pad = { x: r.x - 3, y: r.y - 2, w: w + 6, h: h + 4 }
        let score = k * 2 + nodes.filter((n) => hitsRect(pad, n)).length * 100 + placed.filter((q) => hitsRect(pad, q)).length * 100
        let own = 0
        for (let i = 1; i < it.points.length; i++) if (segHits(it.points[i - 1], it.points[i], pad)) own++
        if (own > 1) score += 20
        for (const o of items) if (o !== it) for (let i = 1; i < o.points.length; i++) if (segHits(o.points[i - 1], o.points[i], pad)) score += 6
        if (!best || score < best.score) best = { ...r, score }
      }
    }
    if (!best) continue
    placed.push(best)
    out[it.id] = { x: best.x, y: best.y, w, h, name: it.name, kind: it.kind }
  }
  return out
}

/**
 * Route that obeys the drawing convention: a control action leaves the bottom of `a` and arrives at the top of `b`,
 * feedback leaves the top of `a` and arrives at the bottom of `b` (`up` mirrors everything vertically).
 * Straight when the boxes share enough width, else one jog; when `b` is not below `a`, around the outside.
 */
const routeVertical = (a: NodeBox, b: NodeBox, up: boolean, slot: number): Pt[] => {
  const f = (n: NodeBox): NodeBox => (up ? { ...n, y: -(n.y + n.h) } : n)
  const A = f(a), B = f(b)
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  const ya = A.y + A.h, yb = B.y
  let pts: Pt[]
  const lo = Math.max(A.x, B.x), hi = Math.min(A.x + A.w, B.x + B.w)
  if (yb - ya >= 40) {
    if (hi - lo >= 2 * MARGIN) {
      const x = clamp((lo + hi) / 2 + slot, lo + MARGIN, hi - MARGIN)
      pts = [{ x, y: ya }, { x, y: yb }]
    } else {
      const xa = clamp(B.x + B.w / 2 + slot, A.x + MARGIN, A.x + A.w - MARGIN), xb = clamp(A.x + A.w / 2 + slot, B.x + MARGIN, B.x + B.w - MARGIN)
      const ym = (ya + yb) / 2 + slot
      pts = [{ x: xa, y: ya }, { x: xa, y: ym }, { x: xb, y: ym }, { x: xb, y: yb }]
    }
  } else {
    const xa = clamp(A.x + A.w / 2 + slot, A.x + MARGIN, A.x + A.w - MARGIN), xb = clamp(B.x + B.w / 2 + slot, B.x + MARGIN, B.x + B.w - MARGIN)
    const right = Math.max(A.x + A.w, B.x + B.w) + 30, left = Math.min(A.x, B.x) - 30
    const xo = Math.abs(xa - right) + Math.abs(xb - right) <= Math.abs(xa - left) + Math.abs(xb - left) ? right : left
    pts = [{ x: xa, y: ya }, { x: xa, y: ya + 24 }, { x: xo, y: ya + 24 }, { x: xo, y: yb - 24 }, { x: xb, y: yb - 24 }, { x: xb, y: yb }]
  }
  return up ? pts.map((q) => ({ x: q.x, y: -q.y })) : pts
}

/**
 * Dragging a route shifts its inner corners; the end points slide along their box side so every segment stays horizontal or vertical
 * (the end point stops at the box margin and the corner follows it).
 */
const bendRoute = (pts: Pt[], bend: Offset | null, a: NodeBox, b: NodeBox): Pt[] => {
  if (!bend || pts.length < 3) return pts
  const n = pts.length
  const out = pts.map((q, i) => (i > 0 && i < n - 1 ? { x: q.x + bend.dx, y: q.y + bend.dy } : { ...q }))
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  for (const [i, j, box] of [[0, 1, a], [n - 1, n - 2, b]] as const) {
    if (!box) continue
    if (Math.abs(pts[i].x - pts[j].x) < 1) { const x = clamp(pts[i].x + bend.dx, box.x + MARGIN, box.x + box.w - MARGIN); out[i].x = x; out[j].x = x }
    else { const y = clamp(pts[i].y + bend.dy, box.y + MARGIN, box.y + box.h - MARGIN); out[i].y = y; out[j].y = y }
  }
  return out
}

const elk = new ELK()

/** Auto-layout of the control structure hierarchy with ELK (layered, top = controllers). */
export async function layoutStructure(p: Project): Promise<Layout> {
  const nodes = itemsOfKind(p, 'node')
  const inTree = new Set(nodes.map((n) => n.id))
  const lines: Record<Id, string[]> = {}
  const minW: Record<Id, number> = {}, defW: Record<Id, number> = {}
  const compound = new Set(nodes.filter((n) => nodes.some((c) => c.parent === n.id)).map((n) => n.id))

  const build = (n: CsNode): ElkNode => {
    const title = n.title || '(unnamed)'
    const ls = wrap(title, 22)
    lines[n.id] = ls
    if (compound.has(n.id)) {
      minW[n.id] = Math.max(...ls.map((l) => l.length)) * CHAR_W + 32
      return {
        id: n.id,
        children: children(p, n.id, 'node').map(build),
        layoutOptions: { 'elk.padding': `[top=40,left=16,bottom=${16 + Math.max(0, n.tall)},right=16]`, 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${Math.max(...ls.map((l) => l.length)) * CHAR_W + 32 + Math.max(0, n.wide)},60)` },
      }
    }
    minW[n.id] = Math.max(Math.max(...ls.map((l) => l.length)) * CHAR_W + 28, (deg[n.id] ?? 0) * 30 + 40)
    defW[n.id] = Math.max(n.role === 'process' ? 320 : 120, minW[n.id])
    const w = Math.max(minW[n.id], defW[n.id] + n.wide)
    return { id: n.id, width: w, height: 30 + ls.length * 16 + Math.max(0, n.tall) }
  }
  const baseH = (id: Id, h: number) => { const n = p.items[id] as CsNode; return h - Math.max(0, n.tall) }
  const roots = children(p, null, 'node')
  // boxes grow with the number of arrows they carry (so parallel arrows get room); the controlled process starts wide
  const deg: Record<Id, number> = {}
  for (const e of [...itemsOfKind(p, 'ca'), ...itemsOfKind(p, 'feedback')]) { deg[e.from] = (deg[e.from] ?? 0) + 1; deg[e.to] = (deg[e.to] ?? 0) + 1 }

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

  const pairs: Record<string, number> = {}
  for (const m of meta.values()) { const k = [m.from, m.to].sort().join('|'); pairs[k] = (pairs[k] ?? 0) + 1 }

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
      'elk.layered.spacing.nodeNodeBetweenLayers': String(Math.min(400, Math.max(80, ...Object.values(labelLines).map((l) => l.length * 13 + 40), ...Object.values(pairs).map((n) => n * 20 + 50)))),
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
      out.nodes[c.id] = { id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, compound: compound.has(c.id), depth, lines: lines[c.id], minW: minW[c.id] ?? 0, defW: defW[c.id] ?? minW[c.id] ?? 0, minH: baseH(c.id, c.height ?? 0) }
      walk(c, x, y, depth + 1)
    }
  }
  walk(res, 0, 0, 0)
  // ELK may stretch a compound beyond its content (e.g. to align layers); trim it to the children plus padding and extra height
  for (const n of Object.values(out.nodes).filter((q) => q.compound).sort((a, b) => b.depth - a.depth)) {
    const kids = children(p, n.id, 'node').map((k) => out.nodes[k.id]).filter(Boolean)
    if (!kids.length) continue
    const h = Math.max(60, Math.max(...kids.map((k) => k.y + k.h)) - n.y + 16 + Math.max(0, (p.items[n.id] as CsNode).tall))
    if (h < n.h) { n.h = h; n.minH = baseH(n.id, h) }
  }

  // connected boxes need vertical room for the arrow and its label: push everything below apart (growing compounds that straddle the cut)
  for (let it = 0; it < 60; it++) {
    let moved = false
    for (const [id, m] of meta) {
      const A = out.nodes[m.from], B = out.nodes[m.to]
      if (!A || !B || A.compound || B.compound) continue
      const [up, lo] = A.y <= B.y ? [A, B] : [B, A]
      const gap = lo.y - (up.y + up.h)
      if (gap < -1) continue
      const need = 70 + 14 * Math.max(1, labelLines[id]?.length ?? 1) + (pairs[[m.from, m.to].sort().join('|')] - 1) * 20
      if (gap >= need) continue
      const cut = lo.y, delta = need - gap
      // compounds grow only if something inside them moves down
      const grow = new Set<Id>()
      for (const n of Object.values(out.nodes)) {
        if (n.y < cut - 0.5) continue
        for (let q = p.items[n.id]?.parent; q; q = p.items[q]?.parent ?? null) grow.add(q)
      }
      for (const n of Object.values(out.nodes)) {
        if (n.y >= cut - 0.5) n.y += delta
        else if (n.compound && grow.has(n.id) && n.y + n.h > cut + 0.5) { n.h += delta; n.minH += delta }
      }
      moved = true
    }
    if (!moved) break
  }
  const routes = new Map<string, EdgeRoute>()
  for (const [id, m] of meta) {
    if (out.nodes[m.from] && out.nodes[m.to]) routes.set(id, { id, kind: m.kind, from: m.from, to: m.to, points: [], text: m.text, label: null, device: null })
  }
  const dist = (e: EdgeRoute) => Math.abs(out.nodes[e.from].x - out.nodes[e.to].x) + Math.abs(out.nodes[e.from].y - out.nodes[e.to].y)
  const order = [...routes.values()].sort((x, y) => dist(x) - dist(y))
  const done = routeSet(out.nodes, order, new Map(), order.map((e) => e.id))
  for (const [id, pts] of done) routes.get(id)!.points = pts
  const devs = placeDevices([...routes.values()].flatMap((r) => { const d = deviceOf(p, r.id); return d ? [{ id: r.id, points: r.points, ...d }] : [] }), Object.values(out.nodes))
  const labs = placeLabels([...routes.values()].filter((r) => r.text).map((r) => ({ id: r.id, kind: r.kind, points: r.points, lines: labelLines[r.id] ?? wrapLabel(r.text, 26) })), Object.values(out.nodes), Object.values(devs))
  for (const r of routes.values()) { r.label = labs[r.id] ?? null; r.device = devs[r.id] ?? null }
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
/** Route `todo` (ids in order) between `box`es with the obstacle-aware router; `fixed` routes stay put and are avoided. A few rip-up passes reduce the order dependence. */
function routeSet(box: Record<Id, NodeBox>, edges: EdgeRoute[], fixed: Map<string, Pt[]>, todo: string[], finish: (e: EdgeRoute, pts: Pt[]) => Pt[] = (_, q) => q): Map<string, Pt[]> {
  const solid = Object.values(box).filter((n) => !n.compound)
  const byId = new Map(edges.map((e) => [e.id, e]))
  const segsOf = (pts: Pt[]) => pts.slice(1).map((q, i) => ({ a: pts[i], b: q }))
  const routed = new Map<string, Pt[]>()
  const pass = (id: string) => {
    const e = byId.get(id)!
    const others = [...fixed, ...routed].filter(([k]) => k !== id)
    const us: Used[] = []
    for (const [k, v] of others) { const o = byId.get(k); if (o) us.push({ box: o.from, y: v[0].y, x: v[0].x }, { box: o.to, y: v[v.length - 1].y, x: v[v.length - 1].x }) }
    const pref = e.kind === 'feedback' ? 'up' : 'down'
    const pts = routeAround(box[e.from], box[e.to], pref, solid, others.flatMap(([, v]) => segsOf(v)), us, SEP, MARGIN)
      ?? routeVertical(box[e.from], box[e.to], pref === 'up', 0)
    routed.set(id, finish(e, pts))
  }
  for (const id of todo) pass(id)
  if (todo.length > 1) for (let r = 0; r < 2; r++) for (const id of todo) pass(id)
  return routed
}

function segHitsBox(a: Pt, b: Pt, n: { x: number; y: number; w: number; h: number }) {
  return Math.max(a.x, b.x) > n.x + 0.5 && Math.min(a.x, b.x) < n.x + n.w - 0.5 && Math.max(a.y, b.y) > n.y + 0.5 && Math.min(a.y, b.y) < n.y + n.h - 0.5
}

export function applyOverrides(p: Project, l: Layout): Drawn {
  const nodes = Object.values(l.nodes)
    .filter((n) => p.items[n.id])
    .map((n) => { const d = cumulative(p, n.id); return { ...n, x: n.x + d.x, y: n.y + d.y } })
  const box = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const live = l.edges.filter((e) => p.items[e.id] && l.nodes[e.from] && l.nodes[e.to])
  /** A straight arrow slides sideways (vertical) or up/down (horizontal) with the bend offset, staying within both boxes. */
  const slide = (pts: Pt[], e: EdgeRoute, bend: Offset | null): Pt[] => {
    if (!bend || pts.length !== 2) return pts
    const A = box[e.from], B = box[e.to]
    if (Math.abs(pts[0].x - pts[1].x) < 1) {
      const lo = Math.max(A.x, B.x) + MARGIN, hi = Math.min(A.x + A.w, B.x + B.w) - MARGIN
      if (hi < lo) return pts
      const x = Math.max(lo, Math.min(hi, pts[0].x + bend.dx))
      return pts.map((q) => ({ ...q, x }))
    }
    if (Math.abs(pts[0].y - pts[1].y) < 1) {
      const lo = Math.max(A.y, B.y) + MARGIN, hi = Math.min(A.y + A.h, B.y + B.h) - MARGIN
      if (hi < lo) return pts
      const y = Math.max(lo, Math.min(hi, pts[0].y + bend.dy))
      return pts.map((q) => ({ ...q, y }))
    }
    return pts
  }
  const solid = nodes.filter((n) => !n.compound)
  const bendOf = (e: EdgeRoute) => { const it = p.items[e.id]; return it && (it.kind === 'ca' || it.kind === 'feedback') ? it.bend : null }
  const base = new Map<string, Pt[]>()
  const dirty: EdgeRoute[] = []
  for (const e of live) {
    const a = cumulative(p, e.from), b = cumulative(p, e.to)
    const pts = slide(bendRoute(e.points, bendOf(e), box[e.from], box[e.to]), e, bendOf(e))
    const hits = pts.slice(1).some((q, i) => solid.some((n) => n.id !== e.from && n.id !== e.to && segHitsBox(pts[i], q, n)))
    if (a.x || a.y || b.x || b.y || hits) dirty.push(e); else base.set(e.id, pts)
  }
  const routed = routeSet(box, live, base, dirty.map((e) => e.id), (e, pts) => slide(bendRoute(pts, bendOf(e), box[e.from], box[e.to]), e, bendOf(e)))
  const edges = live.map((e) => ({ ...e, points: routed.get(e.id) ?? base.get(e.id)! }))
  // the router already keeps arrows apart, so no port/crossing post-processing here
  const devs = placeDevices(edges.flatMap((e) => { const d = deviceOf(p, e.id); return d ? [{ id: e.id, points: e.points, ...d }] : [] }), nodes)
  const labs = placeLabels(edges.filter((e) => e.label).map((e) => ({ id: e.id, kind: e.kind, points: e.points, lines: e.label!.lines })), nodes, Object.values(devs))
  edges.forEach((e, i) => {
    const lab = labs[e.id]
    const it = p.items[e.id], sh = it && (it.kind === 'ca' || it.kind === 'feedback') ? it.labelShift : null
    edges[i] = { ...e, device: devs[e.id] ?? null, label: lab ? (sh ? { ...lab, x: lab.x + sh.dx, y: lab.y + sh.dy } : lab) : null }
  })
  const xs = [...nodes.flatMap((n) => [n.x, n.x + n.w]), ...edges.flatMap((e) => [...e.points.map((q) => q.x), ...(e.label ? [e.label.x, e.label.x + e.label.w] : [])])]
  const ys = [...nodes.flatMap((n) => [n.y, n.y + n.h]), ...edges.flatMap((e) => [...e.points.map((q) => q.y), ...(e.label ? [e.label.y, e.label.y + e.label.h] : [])])]
  const minX = Math.min(0, ...xs) - 20, minY = Math.min(0, ...ys) - 20
  return { nodes, edges, minX, minY, width: Math.max(1, ...xs) - minX + 20, height: Math.max(1, ...ys) - minY + 20 }
}

export const ROLE_FILL: Record<NodeRole, string> = {
  controller: '#dbe7f5',
  process: '#f1ebe2',
  external: '#f3f4f6',
}
export const ROLE_STROKE: Record<NodeRole, string> = {
  controller: '#5b7a9f',
  process: '#a08a6a',
  external: '#9ca3af',
}

/** Sensors and actuators are drawn as small markers on their arrow, not as boxes. */
export const DEVICE_STYLE = { actuator: { fill: '#fef3c7', stroke: '#d97706' }, sensor: { fill: '#dcfce7', stroke: '#16a34a' } }

/** Thin slanted leader from a label to its arrow (never axis-aligned, so it cannot be mistaken for an arrow), or null when the label touches the arrow. */
export function labelLeader(label: { x: number; y: number; w: number; h: number }, pts: Pt[]): { from: Pt; to: Pt } | null {
  let best: { from: Pt; to: Pt; d: number; a: Pt; b: Pt } | null = null
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4))
    for (let k = 0; k <= n; k++) {
      const q = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }
      const c = { x: Math.max(label.x, Math.min(label.x + label.w, q.x)), y: Math.max(label.y, Math.min(label.y + label.h, q.y)) }
      const d = Math.hypot(q.x - c.x, q.y - c.y)
      if (!best || d < best.d) best = { from: c, to: q, d, a, b }
    }
  }
  if (!best || best.d < 5) return null
  // aim at a point a little further along the arrow, toward the label's centre
  const { a, b, to } = best
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len
  const toward = (label.x + label.w / 2 - to.x) * ux + (label.y + label.h / 2 - to.y) * uy >= 0 ? 1 : -1
  for (const dir of [toward, -toward]) {
    const t = (to.x - a.x) * ux + (to.y - a.y) * uy + dir * 9
    if (t >= 0 && t <= len) return { from: best.from, to: { x: a.x + ux * t, y: a.y + uy * t } }
  }
  return { from: best.from, to }
}

/** Point at fraction t of the polyline's length. */
export function pointAt(pts: Pt[], t: number): Pt {
  const len = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y))
  let d = t * len.reduce((a, b) => a + b, 0)
  for (let i = 0; i < len.length; i++) {
    if (d <= len[i] || i === len.length - 1) { const f = len[i] ? Math.min(1, d / len[i]) : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f } }
    d -= len[i]
  }
  return pts[0]
}
