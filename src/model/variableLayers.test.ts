import { describe, expect, it } from 'vitest'
import { makeItem } from './create'
import { deserialize, serialize } from './serialize'
import { setLayer } from './formal'
import { crossingExampleProject } from './crossingExample'
import { aboutOf, isWorld, rulesOf } from './types'
import { itemsOfKind } from './tree'

describe('variables by layer', () => {
  it('carry only the fields of their layer', () => {
    const w = makeItem('variable', { layer: 'domain' }) as unknown as Record<string, unknown>
    const b = makeItem('variable', { layer: 'belief' }) as unknown as Record<string, unknown>
    const q = makeItem('variable', { layer: 'internal' }) as unknown as Record<string, unknown>
    expect(Object.keys(w)).toContain('rules')
    expect(w).not.toHaveProperty('about')
    expect(b).toHaveProperty('about', null)
    expect(b).not.toHaveProperty('rules')
    expect(q).not.toHaveProperty('about')
    expect(q).not.toHaveProperty('otherwise')
  })
  it('accessors are total over the union', () => {
    const p = crossingExampleProject()
    for (const v of itemsOfKind(p, 'variable')) {
      expect(isWorld(v) ? aboutOf(v) : true).toBe(isWorld(v) ? null : true)
      if (!isWorld(v)) expect(rulesOf(v)).toEqual([])
    }
  })
  it('changing the layer drops the fields of the old one and survives a round trip', () => {
    const p = crossingExampleProject()
    const v = itemsOfKind(p, 'variable').find(isWorld)!
    const q = setLayer(p, v.id, 'internal', v.parent)
    const nv = q.items[v.id] as unknown as Record<string, unknown>
    expect(nv.layer).toBe('internal')
    expect(nv).not.toHaveProperty('rules')
    expect(serialize(deserialize(serialize(q)))).toBe(serialize(q))
  })
})

describe('scenarios by type', () => {
  it('carry only the fields of their type and convert', async () => {
    const { setScenarioType } = await import('./ops')
    const { describeKind } = await import('../mcp/schema')
    const u = makeItem('scenario', { scenarioType: 'uca' }) as unknown as Record<string, unknown>
    const c = makeItem('scenario', { scenarioType: 'ca' }) as unknown as Record<string, unknown>
    expect(u).toHaveProperty('uca')
    expect(u).not.toHaveProperty('hazards')
    expect(c).toHaveProperty('hazards')
    expect(c).not.toHaveProperty('uca')
    expect(Object.keys(describeKind('scenario'))).toEqual(expect.arrayContaining(['uca', 'ca', 'hazards', 'cause']))
    const p = crossingExampleProject()
    const s = itemsOfKind(p, 'scenario').find((x) => x.scenarioType === 'uca')!
    const q = setScenarioType(p, s.id, 'ca', null)
    expect(q.items[s.id]).toMatchObject({ scenarioType: 'ca', hazards: [] })
    expect(q.items[s.id]).not.toHaveProperty('uca')
    expect(serialize(deserialize(serialize(q)))).toBe(serialize(q))
  })
})
