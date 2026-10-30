import { describe, expect, it } from 'vitest'
import { layoutDomain } from './domainLayout'
import { exampleProject } from './example'
import { computeLabels } from './labels'
import { itemsOfKind } from './tree'

describe('domain diagram layout', () => {
  it('places every entity and routes every relationship', async () => {
    const p = exampleProject()
    const l = await layoutDomain(p, computeLabels(p))
    expect(l.boxes).toHaveLength(itemsOfKind(p, 'entity').length)
    expect(l.edges.filter((e) => e.kind === 'rel')).toHaveLength(itemsOfKind(p, 'relationship').length)
    for (const b of l.boxes) expect(b.x + b.w).toBeLessThanOrEqual(l.width)
    for (const e of l.edges) expect(e.pts.length).toBeGreaterThanOrEqual(2)
  })
})
