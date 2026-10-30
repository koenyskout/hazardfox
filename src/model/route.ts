/** Obstacle-aware orthogonal router for arrows re-routed after elements moved. */
export interface Pt { x: number; y: number }
export interface Box { id: string; x: number; y: number; w: number; h: number }
export interface Seg { a: Pt; b: Pt }
/** An arrow end already sitting on a box side (so new ports keep their distance). */
export interface Used { box: string; y: number; x: number }

const BEND = 40, CROSS = 400, PARALLEL = 600, USED = 500

class Heap {
  private h: { k: number; v: number }[] = []
  get size() { return this.h.length }
  push(k: number, v: number) {
    const h = this.h
    h.push({ k, v })
    for (let i = h.length - 1; i > 0;) { const p = (i - 1) >> 1; if (h[p].k <= h[i].k) break; [h[p], h[i]] = [h[i], h[p]]; i = p }
  }
  pop() {
    const h = this.h, top = h[0], last = h.pop()!
    if (h.length) {
      h[0] = last
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1
        let m = i
        if (l < h.length && h[l].k < h[m].k) m = l
        if (r < h.length && h[r].k < h[m].k) m = r
        if (m === i) break
        ;[h[m], h[i]] = [h[i], h[m]]; i = m
      }
    }
    return top
  }
}

const uniq = (v: number[]) => [...new Set(v.map((q) => Math.round(q)))].sort((a, b) => a - b)

/**
 * Route from `a` to `b`: a control action (`up` false) leaves the bottom of `a` and arrives at the top of `b`, feedback the reverse.
 * Avoids all `boxes`, keeps `sep` from other arrows' parallel segments, prefers few bends and few crossings. Null if nothing is found.
 */
export function routeAround(a: Box, b: Box, up: boolean, boxes: Box[], segs: Seg[], used: Used[], sep: number, margin: number): Pt[] | null {
  const sd = up ? -1 : 1
  const ya = up ? a.y : a.y + a.h, yb = up ? b.y + b.h : b.y
  const ports = (n: Box) => {
    const out: number[] = []
    for (let x = n.x + margin; x <= n.x + n.w - margin + 0.01; x += 10) out.push(x)
    out.push(n.x + n.w - margin)
    return uniq(out)
  }
  const pa = ports(a), pb = ports(b)
  const gap = margin
  const xs = uniq([...boxes.flatMap((n) => [n.x - gap, n.x - gap - sep, n.x + n.w + gap, n.x + n.w + gap + sep]), ...pa, ...pb])
  const ys = uniq([...boxes.flatMap((n) => [n.y - gap, n.y - gap - sep, n.y + n.h + gap, n.y + n.h + gap + sep]), ya, yb])
  const xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i]))
  const NX = xs.length, NY = ys.length
  const solid = boxes.map((n) => ({ x0: n.x - 0.5, x1: n.x + n.w + 0.5, y0: n.y - 0.5, y1: n.y + n.h + 0.5, id: n.id }))
  const blocked = (x0: number, y0: number, x1: number, y1: number, skip: string | null) => {
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1)
    return solid.some((r) => r.id !== skip && hx > r.x0 && lx < r.x1 && hy > r.y0 && ly < r.y1)
  }
  const stepCost = (x0: number, y0: number, x1: number, y1: number) => {
    const horiz = y0 === y1
    let c = Math.abs(x1 - x0) + Math.abs(y1 - y0)
    const lo = horiz ? Math.min(x0, x1) : Math.min(y0, y1), hi = horiz ? Math.max(x0, x1) : Math.max(y0, y1)
    for (const s of segs) {
      const sh = Math.abs(s.a.y - s.b.y) < 1, sv = Math.abs(s.a.x - s.b.x) < 1
      if (horiz && sh) {
        if (Math.abs(s.a.y - y0) < sep - 1 && Math.min(hi, Math.max(s.a.x, s.b.x)) - Math.max(lo, Math.min(s.a.x, s.b.x)) > 2) c += PARALLEL
      } else if (!horiz && sv) {
        if (Math.abs(s.a.x - x0) < sep - 1 && Math.min(hi, Math.max(s.a.y, s.b.y)) - Math.max(lo, Math.min(s.a.y, s.b.y)) > 2) c += PARALLEL
      } else if (horiz && sv) {
        if (s.a.x > lo + 0.5 && s.a.x < hi - 0.5 && y0 > Math.min(s.a.y, s.b.y) + 0.5 && y0 < Math.max(s.a.y, s.b.y) - 0.5) c += CROSS
      } else if (!horiz && sh) {
        if (s.a.y > lo + 0.5 && s.a.y < hi - 0.5 && x0 > Math.min(s.a.x, s.b.x) + 0.5 && x0 < Math.max(s.a.x, s.b.x) - 0.5) c += CROSS
      }
    }
    return c
  }
  const portCost = (n: Box, y: number, x: number) => {
    let c = Math.abs(x - (n.x + n.w / 2)) * 0.1
    for (const u of used) if (u.box === n.id && Math.abs(u.y - y) < 1 && Math.abs(u.x - x) < sep - 1) c += USED
    return c
  }
  // state = (ix, iy, d) with d: 0 +x, 1 -x, 2 +y, 3 -y
  const idx = (ix: number, iy: number, d: number) => (iy * NX + ix) * 4 + d
  const dist = new Map<number, number>(), prev = new Map<number, number>()
  const heap = new Heap()
  const tx0 = b.x + margin, tx1 = b.x + b.w - margin
  const hOf = (x: number, y: number) => Math.max(0, tx0 - x, x - tx1) + Math.abs(y - yb)
  const startOf = new Map<number, number>()
  const iyA = yi.get(Math.round(ya))!
  const dSd = sd > 0 ? 2 : 3
  for (const x of pa) {
    const ix = xi.get(Math.round(x))!, iy = iyA + sd
    if (iy < 0 || iy >= NY) continue
    const y1 = ys[iy]
    if (blocked(x, ya, x, y1, a.id)) continue
    const c = portCost(a, ya, x) + stepCost(x, ya, x, y1)
    const s = idx(ix, iy, dSd)
    if (c < (dist.get(s) ?? Infinity)) { dist.set(s, c); startOf.set(s, x); heap.push(c + hOf(x, y1), s) }
  }
  const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1]
  let best: { cost: number; state: number; x: number } | null = null
  let n = 0
  while (heap.size && n++ < 80000) {
    const { k, v } = heap.pop()
    if (best && k >= best.cost) break
    const d = v % 4, cell = (v - d) / 4, ix = cell % NX, iy = (cell - ix) / NX
    const g = dist.get(v)!
    if (k - hOf(xs[ix], ys[iy]) > g + 1e-6) continue
    for (let nd = 0; nd < 4; nd++) {
      if ((nd ^ 1) === d && nd !== d) continue
      const jx = ix + DX[nd], jy = iy + DY[nd]
      if (jx < 0 || jx >= NX || jy < 0 || jy >= NY) continue
      const x0 = xs[ix], y0 = ys[iy], x1 = xs[jx], y1 = ys[jy]
      const last = nd === dSd && y1 === Math.round(yb) && x1 >= tx0 - 0.5 && x1 <= tx1 + 0.5
      if (blocked(x0, y0, x1, y1, last ? b.id : null)) continue
      let c = g + stepCost(x0, y0, x1, y1) + (nd === d ? 0 : BEND)
      if (last) {
        c += portCost(b, yb, x1)
        if (!best || c < best.cost) { best = { cost: c, state: v, x: x1 }; prev.set(-1, v) }
        continue
      }
      const s = idx(jx, jy, nd)
      if (c < (dist.get(s) ?? Infinity)) { dist.set(s, c); prev.set(s, v); heap.push(c + hOf(x1, y1), s) }
    }
  }
  if (!best) return null
  const pts: Pt[] = [{ x: best.x, y: yb }]
  let s: number | undefined = best.state
  while (s !== undefined) {
    const d = s % 4, cell = (s - d) / 4, ix = cell % NX, iy = (cell - ix) / NX
    pts.push({ x: xs[ix], y: ys[iy] })
    if (startOf.has(s)) { pts.push({ x: startOf.get(s)!, y: ya }); break }
    s = prev.get(s)
  }
  pts.reverse()
  const out: Pt[] = []
  for (const q of pts) {
    const m = out.length
    if (m && Math.abs(out[m - 1].x - q.x) < 0.5 && Math.abs(out[m - 1].y - q.y) < 0.5) continue
    if (m >= 2 && ((Math.abs(out[m - 2].x - out[m - 1].x) < 0.5 && Math.abs(out[m - 1].x - q.x) < 0.5) || (Math.abs(out[m - 2].y - out[m - 1].y) < 0.5 && Math.abs(out[m - 1].y - q.y) < 0.5))) out[m - 1] = q
    else out.push(q)
  }
  return out.length >= 2 ? out : null
}
