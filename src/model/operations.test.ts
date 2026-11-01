import { describe, expect, it } from 'vitest'
import { projectBuilder } from './build'
import { deserialize, serialize } from './serialize'
import { clockAt, traceState } from './traces'
import { deleteItems } from './ops'
import { operationOfCa, operationsOf } from './operations'
import type { Trace } from './types'

function setup() {
  const b = projectBuilder()
  const e = b.add('entity', { title: 'Pump' })
  const v = b.add('variable', { layer: 'domain', parent: e, title: 'power', type: 'enum', states: ['on', 'off'] })
  const n = b.add('node', { title: 'Nurse', role: 'controller' })
  const pr = b.add('node', { title: 'Patient', role: 'process' })
  const op = b.add('operation', { title: 'Stop', entity: e, effects: [{ variable: v, state: 'off' }] })
  const ca = b.add('ca', { from: n, to: pr, title: 'Stop pump', operation: op })
  const u = b.add('uca', { ca, guide: 'not-provided' })
  const s = b.add('scenario', { scenarioType: 'uca', uca: u, cause: 'control-algorithm' })
  return { b, e, v, op, ca, s }
}

describe('operations', () => {
  it('apply their effects when the control action occurs', () => {
    const { b, v, ca } = setup()
    const t: Trace = { lanes: [v], steps: [
      { t: '0', note: '', values: { [v]: 'on' }, events: [] },
      { t: '1', note: '', values: {}, events: [{ on: ca, what: 'occurs' }] },
      { t: '2', note: '', values: { [v]: 'on' }, events: [] },
    ] }
    expect(traceState(b.project, t, 0)[v]).toBe('on')
    expect(traceState(b.project, t, 1)[v]).toBe('off')
    expect(traceState(b.project, t, 2)[v]).toBe('on')
  })
  it('count as events for the control actions that realize them', () => {
    const { b, op, ca } = setup()
    const t: Trace = { lanes: [], steps: [{ t: '0', note: '', values: {}, events: [{ on: ca, what: 'occurs' }] }, { t: '4', note: '', values: {}, events: [] }] }
    expect(clockAt(b.project, t, 1).since(op)).toBe(4)
    expect(operationOfCa(b.project, ca)?.id).toBe(op)
    expect(operationsOf(b.project, b.project.items[op] && (b.project.items[op] as { entity: string }).entity).length).toBe(1)
  })
  it('migrate from the old name list and round-trip', () => {
    const b = projectBuilder()
    const e = b.add('entity', { title: 'Gate', operations: ['Lower'] } as never)
    const p = deserialize(serialize(b.project))
    expect(operationsOf(p, e).map((o) => o.title)).toEqual(['Lower'])
    expect(deserialize(serialize(p))).toEqual(p)
  })
  it('are cleaned up with their entity, and unlinked from control actions', () => {
    const { b, e, op, ca } = setup()
    expect(deleteItems(b.project, [op]).items[ca]).toMatchObject({ operation: null })
    expect(deleteItems(b.project, [e]).items[op]).toBeUndefined()
  })
})
