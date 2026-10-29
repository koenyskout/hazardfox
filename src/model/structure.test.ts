import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { createItem, updateItem } from './ops'
import { applyOverrides, layoutStructure } from './structure'
import type { Id, Project } from './types'

describe('control structure layout', () => {
  it('puts controller above process, nests children, routes feedback', async () => {
    let p: Project = emptyProject()
    const mk = (kind: Parameters<typeof createItem>[1], init: Record<string, unknown>) => {
      const r = createItem(p, kind, init); p = r.project; return r.id as Id
    }
    const sys = mk('node', { title: 'Plant', role: 'external' })
    const c = mk('node', { title: 'Controller', role: 'controller' })
    const a = mk('node', { title: 'Valve actuator', role: 'actuator', parent: sys })
    const pr = mk('node', { title: 'Process', role: 'process', parent: sys })
    mk('ca', { title: 'open', from: c, to: a })
    mk('ca', { title: 'flow', from: a, to: pr })
    mk('feedback', { title: 'level', from: pr, to: c })
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
  })
})
