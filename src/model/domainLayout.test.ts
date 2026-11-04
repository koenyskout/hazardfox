import { describe, expect, it } from 'vitest'
import { medicationExampleProject } from './domainExample'
import { layoutDomain } from './domainLayout'
import { validate } from './validate'
import { exampleProject } from './example'
import { computeLabels } from './labels'
import { itemsOfKind } from './tree'

describe('domain diagram layout', () => {
  it('places every entity and routes every relationship', async () => {
    const p = exampleProject()
    const l = await layoutDomain(p, computeLabels(p))
    expect(l.boxes.filter((b) => !b.assoc)).toHaveLength(itemsOfKind(p, 'entity').length)
    expect(l.boxes.filter((b) => b.assoc)).toHaveLength(itemsOfKind(p, 'relationship').length)
    expect(l.edges.filter((e) => e.kind === 'rel')).toHaveLength(2 * itemsOfKind(p, 'relationship').length)
    for (const b of l.boxes) expect(b.x + b.w).toBeLessThanOrEqual(l.width)
    for (const e of l.edges) expect(e.pts.length).toBeGreaterThanOrEqual(2)
  })

  it('lays out the large medication example without overlapping boxes, and it validates without errors', async () => {
    const p = medicationExampleProject()
    const l = await layoutDomain(p, computeLabels(p))
    expect(l.boxes.length).toBeGreaterThan(12)
    expect(l.edges.filter((e) => e.kind === 'rel').length).toBeGreaterThan(30)
    for (const a of l.boxes) for (const b of l.boxes) {
      if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
    }
    expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
  })
})
