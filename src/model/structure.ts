import ELK, { type ElkNode, type ElkExtendedEdge } from 'elkjs/lib/elk.bundled.js'
import { children, itemsOfKind } from './tree'
import type { CsNode, Id, NodeRole, Offset, Project } from './types'

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
  /** Sensor / actuator pill sitting on the arrow. */
  device: { x: number; y: number; w: number; h: number; name: string; kind: 'sensor' | 'actuator' } | null
  text: string
}
export interface Layout { nodes: Record<Id, NodeBox>; edges: EdgeRoute[]; width: number; height: number }

/** Minimum distance between parallel arrows on one side of a box, and between an arrow and the corner of its box. */
const SEP = 14
const MARGIN = 10
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
      for (const side of it.kind === 'ca' ? [-1, 1] : [1, -1]) {
        for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88]) for (const gap of [6, 16, 28, 44, 70, 110, 170]) for (const sh of [0, -1, 1]) {
          const mx = sg.a.x + (sg.b.x - sg.a.x) * t + (vertical ? 0 : sh * w * 0.6), my = sg.a.y + (sg.b.y - sg.a.y) * t + (vertical ? sh * h * 0.7 : 0)
          const r: Rect = vertical ? { x: side < 0 ? mx - w - gap : mx + gap, y: my - h / 2, w, h } : { x: mx - w / 2, y: side < 0 ? my - h - 3 : my + 3, w, h }
          const pad = { x: r.x - 2, y: r.y - 2, w: w + 4, h: h + 4 }
          let score = si * 3 + Math.abs(t - 0.5) * 4 + (side === (it.kind === 'ca' ? -1 : 1) ? 0 : 2) + (gap > 6 ? 3 + gap / 10 : 0) + Math.abs(sh) * 2 + (sg.len < h + 10 && vertical ? 20 : 0)
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

/** Shift every segment of an orthogonal route by d to its left-hand side, so the copy runs parallel to the original. */
const offsetRoute = (pts: Pt[], d: number): Pt[] =>
  pts.map((q, i) => {
    let x = q.x, y = q.y
    for (const [a, b] of [[pts[i - 1], q], [q, pts[i + 1]]]) {
      if (!a || !b) continue
      if (Math.abs(a.x - b.x) < 1) x += b.y < a.y ? d : -d
      else y += b.x > a.x ? d : -d
    }
    return { x, y }
  })

/**
 * An arrow that leaves (or enters) a box and immediately turns sideways across another arrow of the same box would cross it:
 * move its end point to the far side of that arrow (when it still lies inside the box).
 */
const uncross = (routes: EdgeRoute[], nodes: Record<Id, NodeBox>) => {
  for (const r of routes) {
    const n = r.points.length
    if (n < 4) continue
    for (const end of [0, n - 1]) {
      const dir = end === 0 ? 1 : -1
      const e = r.points[end], k = r.points[end + dir], nx = r.points[end + 2 * dir]
      const box = nodes[end === 0 ? r.from : r.to]
      if (!box || Math.abs(e.x - k.x) > 1 || Math.abs(k.y - nx.y) > 1) continue
      const side = Math.sign(nx.x - k.x)
      for (const o of routes) {
        if (o === r) continue
        for (const [oe, ok, node] of [[0, 1, o.from], [o.points.length - 1, o.points.length - 2, o.to]] as const) {
          if (node !== (end === 0 ? r.from : r.to)) continue
          const a = o.points[oe], b = o.points[ok]
          if (Math.abs(a.x - b.x) > 1 || Math.abs(a.x - e.x) < 1) continue
          const between = (a.x - k.x) * (a.x - nx.x) < 0
          const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)]
          if (!between || k.y < y0 || k.y > y1) continue
          let x = a.x + side * SEP
          if (side > 0 && x > box.x + box.w - MARGIN && widen(box, x + MARGIN - box.x, nodes)) x = a.x + side * SEP
          const x2 = x >= box.x + MARGIN && x <= box.x + box.w - MARGIN ? x : NaN
          x = x2
          if (!isNaN(x)) {
            r.points[end] = { ...e, x }
            r.points[end + dir] = { ...k, x }
            continue
          }
          // no room: slide the straight crossed arrow to the near side instead
          const A = nodes[o.from], B = nodes[o.to]
          const lo = Math.max(A.x, B.x) + MARGIN, hi = Math.min(A.x + A.w, B.x + B.w) - MARGIN
          const nxx = e.x - side * SEP
          if (o.points.length === 2 && nxx >= lo && nxx <= hi) o.points = o.points.map((q) => ({ ...q, x: nxx }))
        }
      }
    }
  }
}

/** Make a box wider to the right (to `w`) if no other box is in the way. */
const widen = (box: NodeBox, w: number, nodes: Record<Id, NodeBox>): boolean => {
  if (w <= box.w) return true
  const free = Object.values(nodes).every((o) => o === box || o.compound || o.y >= box.y + box.h || o.y + o.h <= box.y || o.x + o.w <= box.x + box.w || o.x >= box.x + w + 24)
  if (free) box.w = w
  return free
}

/**
 * Arrows that meet the same side of a box keep at least SEP between them and MARGIN from the corners
 * (order is kept; a straight arrow also stays inside the other box). A box that is too narrow for its arrows grows.
 */
const placePorts = (routes: EdgeRoute[], nodes: Record<Id, NodeBox>) => {
  interface Port { r: EdgeRoute; i: number; j: number; ax: 'x' | 'y'; lo: number; hi: number }
  for (let round = 0; round < 4; round++) {
    const groups = new Map<string, { box: NodeBox; ax: 'x' | 'y'; ports: Port[] }>()
    for (const r of routes) {
      const n = r.points.length
      for (const [i, j, id] of [[0, 1, r.from], [n - 1, n - 2, r.to]] as const) {
        const box = nodes[id], e = r.points[i], k = r.points[j]
        if (!box || box.compound) continue
        const ax = Math.abs(e.x - k.x) < 1 && Math.abs(e.y - k.y) >= 1 ? 'x' : Math.abs(e.y - k.y) < 1 && Math.abs(e.x - k.x) >= 1 ? 'y' : null
        if (!ax) continue
        const side = ax === 'x' ? (Math.abs(e.y - box.y) < 1 ? 't' : Math.abs(e.y - box.y - box.h) < 1 ? 'b' : '') : (Math.abs(e.x - box.x) < 1 ? 'l' : Math.abs(e.x - box.x - box.w) < 1 ? 'r' : '')
        if (!side) continue
        const key = id + side
        const g = groups.get(key) ?? { box, ax, ports: [] }
        g.ports.push({ r, i, j, ax, lo: -Infinity, hi: Infinity })
        groups.set(key, g)
      }
    }
    for (const { box, ax, ports } of groups.values()) {
      const size = ax === 'x' ? box.w : box.h
      const need = 2 * MARGIN + (ports.length - 1) * SEP
      if (size < need && ax === 'x') widen(box, need, nodes)
      for (const q of ports) {
        const [a0, a1] = ax === 'x' ? [box.x, box.x + box.w] : [box.y, box.y + box.h]
        q.lo = a0 + MARGIN
        q.hi = a1 - MARGIN
        if (q.r.points.length === 2) {
          const o = nodes[q.i === 0 ? q.r.to : q.r.from]
          if (o) {
            const [b0, b1] = ax === 'x' ? [o.x, o.x + o.w] : [o.y, o.y + o.h]
            if (Math.min(a1, b1) - Math.max(a0, b0) >= 2 * MARGIN) { q.lo = Math.max(q.lo, b0 + MARGIN); q.hi = Math.min(q.hi, b1 - MARGIN) }
          }
        }
      }
      const val = (q: Port) => q.r.points[q.i][ax]
      ports.sort((a, b) => val(a) - val(b))
      const set = (q: Port, v: number) => { q.r.points[q.i] = { ...q.r.points[q.i], [ax]: v }; q.r.points[q.j] = { ...q.r.points[q.j], [ax]: v } }
      ports.forEach((q, i) => {
        let v = Math.max(q.lo, Math.min(q.hi, val(q)))
        if (i && v < val(ports[i - 1]) + SEP) v = Math.min(q.hi, val(ports[i - 1]) + SEP)
        if (v !== val(q)) set(q, v)
      })
      for (let i = ports.length - 2; i >= 0; i--) {
        const q = ports[i]
        if (val(ports[i + 1]) - val(q) < SEP) { const v = Math.max(q.lo, val(ports[i + 1]) - SEP); if (v !== val(q)) set(q, v) }
      }
      // straight arrows squeezed by a narrow overlap of the two boxes: widen the box whose right edge limits the overlap
      if (ax === 'x') for (let i = 1; i < ports.length; i++) {
        const gap = val(ports[i]) - val(ports[i - 1])
        if (gap >= SEP - 0.5) continue
        for (const q of [ports[i - 1], ports[i]]) {
          if (q.r.points.length !== 2) continue
          const o = nodes[q.i === 0 ? q.r.to : q.r.from]
          if (!o || o.compound) continue
          const lim = box.x + box.w <= o.x + o.w ? box : o
          if (widen(lim, lim.w + SEP - gap, nodes)) break
        }
      }
    }
  }
}

/** Move vertical segments that run on top of another arrow's vertical segment sideways until they are apart (end points stay inside their boxes). */
const separateVertical = (routes: EdgeRoute[], nodes: Record<Id, NodeBox>) => {
  const span = (a: Pt, b: Pt) => [Math.min(a.y, b.y), Math.max(a.y, b.y)]
  const clash = (r: EdgeRoute, i: number, x: number) => {
    const [y0, y1] = span(r.points[i], r.points[i + 1])
    return routes.some((o) => o !== r && o.points.slice(1).some((q, j) => {
      const a = o.points[j]
      if (Math.abs(a.x - q.x) > 1 || Math.abs(a.x - x) >= 10) return false
      const [z0, z1] = span(a, q)
      return Math.min(y1, z1) - Math.max(y0, z0) > 6
    }))
  }
  for (const r of routes) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i], b = r.points[i + 1]
      if (Math.abs(a.x - b.x) > 1 || !clash(r, i, a.x)) continue
      const ends = [i === 0 ? nodes[r.from] : null, i + 1 === r.points.length - 1 ? nodes[r.to] : null].filter(Boolean) as NodeBox[]
      const lo = Math.max(-Infinity, ...ends.map((n) => n.x + MARGIN)), hi = Math.min(Infinity, ...ends.map((n) => n.x + n.w - MARGIN))
      const x = [14, -14, 28, -28, 42, -42].map((d) => a.x + d).find((c) => c >= lo && c <= hi && !clash(r, i, c))
      if (x !== undefined) { r.points[i] = { ...a, x }; r.points[i + 1] = { ...b, x } }
    }
  }
}

/**
 * Spread the straight vertical arrows of each node pair evenly over the shared width, away from the arrows of other pairs
 * on the same boxes (greedy: largest groups first, each arrow takes the free slot closest to its ideal position).
 */
const spreadPorts = (routes: EdgeRoute[], nodes: Record<Id, NodeBox>) => {
  const groups = new Map<string, EdgeRoute[]>()
  for (const r of routes) {
    if (r.points.length !== 2 || Math.abs(r.points[0].x - r.points[1].x) > 1 || !nodes[r.from] || !nodes[r.to]) continue
    const k = [r.from, r.to].sort().join('|')
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const used: Record<Id, number[]> = {}
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const a = nodes[g[0].from], b = nodes[g[0].to]
    const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w)
    if (hi - lo < 2 * MARGIN) continue
    const m = MARGIN, L = lo + m, H = hi - m
    g.sort((p, q) => p.points[0].x - q.points[0].x || (p.kind === 'ca' ? -1 : 1))
    const gap = Math.min(40, (H - L) / g.length)
    const mean = g.reduce((t, r) => t + r.points[0].x, 0) / g.length
    const start = Math.max(L, Math.min(H - gap * (g.length - 1), mean - (gap * (g.length - 1)) / 2))
    g.forEach((r, i) => {
      const ideal = start + gap * i
      let best = ideal, bs = -Infinity
      for (let d = -40; d <= 40; d += 4) {
        const x = ideal + d
        if (x < L || x > H) continue
        const dist = Math.min(18, ...[...(used[r.from] ?? []), ...(used[r.to] ?? [])].map((u) => Math.abs(u - x)))
        const sc = dist - Math.abs(d) * 0.12
        if (sc > bs) { bs = sc; best = x }
      }
      r.points = r.points.map((q) => ({ x: best, y: q.y }))
      ;(used[r.from] ??= []).push(best)
      ;(used[r.to] ??= []).push(best)
    })
  }
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

/** Does the route leave/arrive on the sides the convention asks for? */
const sidesOk = (r: EdgeRoute, a: NodeBox, b: NodeBox) => {
  const s = r.points[0], t = r.points[r.points.length - 1]
  const [ys, yt] = r.kind === 'ca' ? [a.y + a.h, b.y] : [a.y, b.y + b.h]
  return Math.abs(s.y - ys) < 1 && Math.abs(t.y - yt) < 1
}

/** Replace a jogged route by one straight vertical line (moving the ends a little) when the nodes overlap horizontally and nothing is in the way. */
/** Remove a short sideways jog just before the end of a route: slide the end point (or, if it would leave the box, the last long vertical) so the arrow arrives straight. */
const unjogEnd = (pts: Pt[], b: NodeBox | undefined, obstacles: NodeBox[]): Pt[] => {
  const n = pts.length
  if (n < 4 || !b) return pts
  const [p0, p1, p2, p3] = pts.slice(n - 4)
  if (Math.abs(p2.x - p3.x) > 1 || Math.abs(p1.y - p2.y) > 1 || Math.abs(p0.x - p1.x) > 1 || Math.abs(p1.x - p2.x) > 60 || Math.abs(p1.x - p2.x) < 1) return pts
  if (p1.x >= b.x + MARGIN && p1.x <= b.x + b.w - MARGIN) return [...pts.slice(0, n - 3), { x: p1.x, y: p3.y }]
  const x = p3.x
  const y0 = Math.min(p0.y, p3.y), y1 = Math.max(p0.y, p3.y)
  if (n > 4 && obstacles.every((o) => o.y >= y1 || o.y + o.h <= y0 || x + 6 < o.x || x - 6 > o.x + o.w)) return [...pts.slice(0, n - 4), { x, y: p0.y }, { x, y: p3.y }]
  return pts
}
const unjog = (pts: Pt[], a: NodeBox | undefined, b: NodeBox | undefined, obstacles: NodeBox[]): Pt[] =>
  unjogEnd(unjogEnd(pts, b, obstacles).reverse(), a, obstacles).reverse()

const straighten = (pts: Pt[], a: NodeBox | undefined, b: NodeBox | undefined, obstacles: NodeBox[]): Pt[] => {
  if (pts.length < 3 || !a || !b) return pts
  const first = pts[0], last = pts[pts.length - 1]
  if (Math.abs(first.x - pts[1].x) > 1e-6 || Math.abs(last.x - pts[pts.length - 2].x) > 1e-6) return pts
  const lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w)
  if (hi - lo < 2 * MARGIN) return pts
  const m = MARGIN
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
        children: children(p, n.id, 'node').map(build),
        layoutOptions: { 'elk.padding': '[top=40,left=16,bottom=16,right=16]', 'elk.nodeSize.constraints': 'MINIMUM_SIZE', 'elk.nodeSize.minimum': `(${Math.max(...ls.map((l) => l.length)) * CHAR_W + 32 + n.wide},60)` },
      }
    }
    const w = Math.max(n.role === 'process' ? 320 : 120, Math.max(...ls.map((l) => l.length)) * CHAR_W + 28, (deg[n.id] ?? 0) * 30 + 40) + n.wide
    return { id: n.id, width: w, height: 30 + ls.length * 16 }
  }
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
    const obst = Object.values(out.nodes).filter((n) => n.id !== sa && n.id !== ta && !isAnc(n.id, sa) && !isAnc(n.id, ta))
    pts = unjog(straighten(pts, out.nodes[sa], out.nodes[ta], obst), out.nodes[sa], out.nodes[ta], obst)
    if (m.reversed) pts = pts.reverse()
    routes.set(e.id, { id: e.id, kind: m.kind, from: m.from, to: m.to, points: pts, text: m.text, label: null, device: null })
  }
  // Feedback parallel to a control action: offset the reversed route of that action.
  const nth: Record<string, number> = {}
  for (const [id, m] of meta) {
    if (!m.pairOf) continue
    const base = routes.get(m.pairOf)
    if (!base) continue
    const pts = [...base.points].reverse()
    const d = 22 * (nth[m.pairOf] = (nth[m.pairOf] ?? 0) + 1)
    routes.set(id, {
      id, kind: 'feedback', from: m.from, to: m.to, text: m.text,
      points: (() => {
        const cand = [offsetRoute(pts, d), offsetRoute(pts, -d)]
        const stub = (q: Pt[]) => Math.min(Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), Math.hypot(q[q.length - 1].x - q[q.length - 2].x, q[q.length - 1].y - q[q.length - 2].y))
        return pts.length < 3 || stub(cand[0]) >= 14 ? cand[0] : cand[1]
      })(),
      label: null, device: null,
    })
  }
  for (const r of routes.values()) {
    const a = out.nodes[r.from], b = out.nodes[r.to]
    if (a && b && !sidesOk(r, a, b)) r.points = routeVertical(a, b, r.kind === 'feedback', 0)
  }
  spreadPorts([...routes.values()], out.nodes)
  separateVertical([...routes.values()], out.nodes)
  placePorts([...routes.values()], out.nodes)
  uncross([...routes.values()], out.nodes)
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
export function applyOverrides(p: Project, l: Layout): Drawn {
  const nodes = Object.values(l.nodes)
    .filter((n) => p.items[n.id])
    .map((n) => { const d = cumulative(p, n.id); return { ...n, x: n.x + d.x, y: n.y + d.y } })
  const box = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const live = l.edges.filter((e) => p.items[e.id] && l.nodes[e.from] && l.nodes[e.to])
  const pairKey = (e: EdgeRoute) => [e.from, e.to].sort().join('|')
  const groups = new Map<string, EdgeRoute[]>()
  for (const e of live) groups.set(pairKey(e), [...(groups.get(pairKey(e)) ?? []), e])
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
  const edges = live.map((e) => {
    const a = cumulative(p, e.from), b = cumulative(p, e.to)
    const it = p.items[e.id]
    const bend = it && (it.kind === 'ca' || it.kind === 'feedback') ? it.bend : null
    if (a.x || a.y || b.x || b.y) {
      // an end moved: re-route between the actual boxes instead of stretching the old route
      const g = groups.get(pairKey(e))!
      let pts = routeVertical(box[e.from], box[e.to], e.kind === 'feedback', (g.indexOf(e) - (g.length - 1) / 2) * 22)
      pts = bendRoute(pts, bend, box[e.from], box[e.to])
      return { ...e, points: slide(pts, e, bend) }
    }
    const points = bendRoute(e.points, bend, box[e.from], box[e.to])
    return { ...e, points: slide(points, e, bend) }
  })
  // re-routed arrows (after moving nodes) get the same crossing fix as the automatic layout
  separateVertical(edges, box)
  placePorts(edges, box)
  uncross(edges, box)
  const devs = placeDevices(edges.flatMap((e) => { const d = deviceOf(p, e.id); return d ? [{ id: e.id, points: e.points, ...d }] : [] }), nodes)
  const labs = placeLabels(edges.filter((e) => e.label).map((e) => ({ id: e.id, kind: e.kind, points: e.points, lines: e.label!.lines })), nodes, Object.values(devs))
  edges.forEach((e, i) => {
    const lab = labs[e.id]
    edges[i] = { ...e, device: devs[e.id] ?? null, label: lab ?? null }
  })
  const xs = [...nodes.flatMap((n) => [n.x, n.x + n.w]), ...edges.flatMap((e) => [...e.points.map((q) => q.x), ...(e.label ? [e.label.x, e.label.x + e.label.w] : [])])]
  const ys = [...nodes.flatMap((n) => [n.y, n.y + n.h]), ...edges.flatMap((e) => [...e.points.map((q) => q.y), ...(e.label ? [e.label.y, e.label.y + e.label.h] : [])])]
  const minX = Math.min(0, ...xs) - 20, minY = Math.min(0, ...ys) - 20
  return { nodes, edges, minX, minY, width: Math.max(1, ...xs) - minX + 20, height: Math.max(1, ...ys) - minY + 20 }
}

export const ROLE_FILL: Record<NodeRole, string> = {
  controller: '#dbeafe',
  process: '#fee2e2',
  external: '#e5e7eb',
}
export const ROLE_STROKE: Record<NodeRole, string> = {
  controller: '#2563eb',
  process: '#dc2626',
  external: '#6b7280',
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
