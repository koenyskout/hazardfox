import { describe, expect, it } from 'vitest'
import { projectBuilder } from './build'
import { deserialize, serialize } from './serialize'
import { contextHolds, draftTrace } from './traces'
import { generateUcaText } from './uca'
import { computeLabels } from './labels'
import { refsOf } from './refs'
import { deleteItems } from './ops'
import { anyOf, leaves, whenTexts } from './variables'
import type { Condition, Id, Scenario, Uca } from './types'

function setup() {
  const b = projectBuilder()
  const e = b.add('entity', { title: 'Pump' })
  const a = b.add('variable', { layer: 'domain', parent: e, title: 'power', type: 'enum', states: ['on', 'off'] })
  const c = b.add('variable', { layer: 'domain', parent: e, title: 'flow', type: 'range', min: 0, max: 10 })
  const n = b.add('node', { title: 'Nurse', role: 'controller' })
  const pr = b.add('node', { title: 'Patient', role: 'process' })
  const ca = b.add('ca', { from: n, to: pr, title: 'Stop' })
  const cond = (variable: Id, op: Condition['op'], state: string): Condition => ({ variable, op, state })
  const u = b.add('uca', { ca, guide: 'not-provided', conditions: [cond(c, '>', '5'), anyOf(cond(a, '=', 'on'), cond(a, '=', 'off'))] })
  return { b, a, c, u, ca, cond }
}

describe('any-of conditions', () => {
  it('reads as text with the group in parentheses', () => {
    const { b, u } = setup()
    const p = b.project
    expect(whenTexts(p, (p.items[u] as Uca).conditions)).toEqual(['flow is greater than 5', '(power is on or power is off)'])
    expect(generateUcaText(p, computeLabels(p), p.items[u] as Uca)).toContain('flow is greater than 5 and (power is on or power is off)')
  })
  it('holds when one branch holds', () => {
    const { b, a, c, u } = setup()
    const p = b.project, uca = p.items[u] as Uca
    expect(contextHolds(p, uca, { [c]: '7', [a]: 'off' })).toBe(true)
    expect(contextHolds(p, { ...uca, conditions: [anyOf({ variable: a, op: '=', state: 'on' }, { variable: c, op: '<', state: '3' })] }, { [c]: '7', [a]: 'off' })).toBe(false)
    expect(contextHolds(p, uca, { [c]: '2', [a]: 'on' })).toBe(false)
    expect(contextHolds(p, uca, { [c]: '7' })).toBeNull()
  })
  it('keeps groups through save / load and finds the variables inside', () => {
    const { b, a, u } = setup()
    const q = deserialize(serialize(b.project))
    const uca = q.items[u] as Uca
    expect(uca.conditions).toEqual((b.project.items[u] as Uca).conditions)
    expect(refsOf(uca)).toContain(a)
    expect(uca.conditions.flatMap(leaves)).toHaveLength(3)
  })
  it('drops a deleted variable from inside a group', () => {
    const { b, a, u } = setup()
    const q = deleteItems(b.project, [a])
    const uca = q.items[u] as Uca
    expect(uca.conditions.flatMap(leaves).every((c) => c.variable !== a)).toBe(true)
  })
  it('drafts a trace that satisfies the first branch', () => {
    const { b, a, u } = setup()
    const s = { scenarioType: 'uca', uca: u, cause: 'control-algorithm', trace: { lanes: [], steps: [] } } as unknown as Scenario
    const t = draftTrace(b.project, s)
    expect(t.lanes).toContain(a)
    expect(t.steps[1].values[a]).toBe('on')
  })
})
