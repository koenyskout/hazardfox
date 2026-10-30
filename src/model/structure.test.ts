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

  it('moving a controller sideways does not make its arrows cross', async () => {
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
      return n
    }
    const bad: number[] = []
    for (let dx = -300; dx <= 300; dx += 10) bad.push(...(crossings(updateItem(p0, aeb, { nudge: { dx, dy: 0 } })) ? [dx] : []))
    expect(bad).toEqual([])
  })
})
