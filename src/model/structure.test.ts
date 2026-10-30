import { describe, expect, it } from 'vitest'
import { projectBuilder } from './build'
import { updateItem } from './ops'
import { publishedExampleProject } from './publishedExamples'
import { applyOverrides, layoutStructure } from './structure'

describe('control structure layout', () => {
  it('puts controller above process, nests children, routes feedback', async () => {
    const b = projectBuilder()
    const mk = b.add
    const sys = mk('node', { title: 'Plant', role: 'external' })
    const c = mk('node', { title: 'Controller', role: 'controller' })
    const a = mk('node', { title: 'Valve actuator', role: 'process', parent: sys })
    const pr = mk('node', { title: 'Process', role: 'process', parent: sys })
    mk('ca', { title: 'open', from: c, to: a })
    mk('ca', { title: 'flow', from: a, to: pr })
    mk('feedback', { title: 'level', from: pr, to: c })
    const p = b.project
    const l = await layoutStructure(p)
    expect(l.nodes[c].y).toBeLessThan(l.nodes[a].y)
    expect(l.nodes[a].y).toBeLessThan(l.nodes[pr].y)
    expect(l.nodes[sys].compound).toBe(true)
    expect(l.nodes[a].x).toBeGreaterThanOrEqual(l.nodes[sys].x)
    expect(l.edges).toHaveLength(3)
    const d = applyOverrides(p, l)
    expect(d.width).toBeGreaterThan(100)
    // moving a node re-routes its arrows orthogonally to the new position
    const moved = applyOverrides(updateItem(p, pr, { nudge: { dx: 200, dy: 0 } }), l)
    const e = moved.edges.find((x) => x.to === pr)!
    const box = moved.nodes.find((n) => n.id === pr)!
    const end = e.points[e.points.length - 1]
    expect(end.x).toBeGreaterThanOrEqual(box.x)
    expect(end.x).toBeLessThanOrEqual(box.x + box.w)
    e.points.slice(1).forEach((q, i) => expect(q.x === e.points[i].x || q.y === e.points[i].y).toBe(true))
    // a straight vertical arrow slides sideways when dragged, but stays inside both boxes
    const ca = Object.values(p.items).find((x) => x.kind === 'ca' && x.from === c && x.to === a)!.id
    const x0 = d.edges.find((x) => x.id === ca)!.points[0].x
    const slid = applyOverrides(updateItem(p, ca, { bend: { dx: 15, dy: 0 } }), l).edges.find((x) => x.id === ca)!
    expect(slid.points[0].x).toBeGreaterThan(x0)
    expect(slid.points[0].x).toBe(slid.points[1].x)
    const far = applyOverrides(updateItem(p, ca, { bend: { dx: 5000, dy: 0 } }), l)
    const cb = far.nodes.find((n) => n.id === c)!
    expect(far.edges.find((x) => x.id === ca)!.points[0].x).toBeLessThanOrEqual(cb.x + cb.w)
  })

  it('moving a controller sideways keeps arrows apart (no crossing, overlap, or crowding)', async () => {
    const p0 = publishedExampleProject('pub-aeb')
    const l = await layoutStructure(p0)
    const aeb = Object.values(p0.items).find((x) => x.kind === 'node' && x.title === 'AEB controller')!.id
    const crossings = (p = p0) => {
      const d = applyOverrides(p, l)
      const sg = d.edges.flatMap((e) => e.points.slice(1).map((q, i) => ({ e, a: e.points[i], b: q })))
      let n = 0
      for (const v of sg) for (const h of sg) {
        if (v.e === h.e || Math.abs(v.a.x - v.b.x) > 1 || Math.abs(h.a.y - h.b.y) > 1) continue
        if (v.a.x > Math.min(h.a.x, h.b.x) + 1 && v.a.x < Math.max(h.a.x, h.b.x) - 1 && h.a.y > Math.min(v.a.y, v.b.y) + 1 && h.a.y < Math.max(v.a.y, v.b.y) - 1) n++
      }
      for (const u of sg) for (const v of sg) {
        if (u.e.id >= v.e.id || Math.abs(u.a.x - u.b.x) > 1 || Math.abs(v.a.x - v.b.x) > 1 || Math.abs(u.a.x - v.a.x) > 4) continue
        if (Math.min(Math.max(u.a.y, u.b.y), Math.max(v.a.y, v.b.y)) - Math.max(Math.min(u.a.y, u.b.y), Math.min(v.a.y, v.b.y)) > 6) n++
      }
      // arrows keep SEP between them and MARGIN from the corner of the box they meet
      const ends: Record<string, number[]> = {}
      for (const e of d.edges) for (const [i, j, id] of [[0, 1, e.from], [e.points.length - 1, e.points.length - 2, e.to]] as const) {
        const nb = d.nodes.find((x) => x.id === id)!, q = e.points[i], k = e.points[j]
        const v = Math.abs(q.x - k.x) < 1
        const t = v ? q.x : q.y, lo = v ? nb.x : nb.y, hi = v ? nb.x + nb.w : nb.y + nb.h
        if (t - lo < 9.5 || hi - t < 9.5) n++
        const key = id + (v ? (Math.abs(q.y - nb.y) < 1 ? 't' : 'b') : (Math.abs(q.x - nb.x) < 1 ? 'l' : 'r'))
        ;(ends[key] ??= []).push(t)
      }
      for (const w of Object.values(ends)) { w.sort((a, b) => a - b); for (let i = 1; i < w.length; i++) if (w[i] - w[i - 1] < 13.5) n++ }
      return n
    }
    const bad: number[] = []
    for (let dx = -300; dx <= 300; dx += 10) bad.push(...(crossings(updateItem(p0, aeb, { nudge: { dx, dy: 0 } })) ? [dx] : []))
    expect(bad).toEqual([])
  })

  it('control actions leave the bottom and arrive at the top, feedback the reverse, also after moving nodes', async () => {
    const p0 = publishedExampleProject('pub-aeb')
    const l = await layoutStructure(p0)
    const nodes = Object.values(p0.items).filter((x) => x.kind === 'node')
    for (const n of nodes) for (const [dx, dy] of [[0, 0], [-200, 0], [150, 0], [0, 300], [-120, 250], [0, -80]]) {
      const d = applyOverrides(updateItem(p0, n.id, { nudge: { dx, dy } }), l)
      for (const e of d.edges) {
        const a = d.nodes.find((x) => x.id === e.from)!, b = d.nodes.find((x) => x.id === e.to)!
        const s = e.points[0], t = e.points[e.points.length - 1]
        expect(Math.abs(s.y - (e.kind === 'ca' ? a.y + a.h : a.y)) < 1 && Math.abs(t.y - (e.kind === 'ca' ? b.y : b.y + b.h)) < 1, `${n.title} ${dx},${dy} ${e.kind}`).toBe(true)
        e.points.slice(1).forEach((q, i) => expect(q.x === e.points[i].x || q.y === e.points[i].y).toBe(true))
      }
    }
  })

  it('dragging an arrow keeps every segment horizontal or vertical', async () => {
    const p0 = publishedExampleProject('pub-aeb')
    const l = await layoutStructure(p0)
    const arrows = Object.values(p0.items).filter((x) => x.kind === 'ca' || x.kind === 'feedback')
    for (const it of arrows) for (const [dx, dy] of [[30, 0], [-60, 20], [0, 40], [500, -90], [-500, 90]]) {
      const e = applyOverrides(updateItem(p0, it.id, { bend: { dx, dy } }), l).edges.find((x) => x.id === it.id)!
      e.points.slice(1).forEach((q, i) => expect(q.x === e.points[i].x || q.y === e.points[i].y, `${it.kind} ${dx},${dy}`).toBe(true))
    }
  })
})
