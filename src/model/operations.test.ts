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
  const op = b.add('operation', { title: 'Stop', params: [{ name: 'pump', entity: e }], effects: [{ variable: v, state: 'off', on: 'pump' }] })
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
  it('apply effects to the instance named in the event', () => {
    const { b, v, op } = setup()
    const t: Trace = { lanes: [], steps: [{ t: '0', note: '', values: { [v]: 'on', [v + '@p2']: 'on' }, events: [] }, { t: '1', note: '', values: {}, events: [{ on: op, what: 'occurs', args: { pump: 'p2' } }] }] }
    const st = traceState(b.project, t, 1)
    expect(st[v + '@p2']).toBe('off')
    expect(st[v]).toBe('on')
  })
  it('set a variable to the value argument of a value parameter', () => {
    const b = projectBuilder()
    const e = b.add('entity', { title: 'Pump' })
    const v = b.add('variable', { layer: 'domain', parent: e, title: 'rate', type: 'range', min: 0, max: 10 })
    const op = b.add('operation', { title: 'Set rate', params: [{ name: 'r', entity: '', data: { type: 'range', states: [], min: 0, max: 10, unit: 'ml/h', rangeType: '', enumType: '' } }], effects: [{ variable: v, state: '', from: 'r' }] })
    const t: Trace = { lanes: [], steps: [{ t: '0', note: '', values: {}, events: [{ on: op, what: 'occurs', args: { r: '7' } }] }] }
    expect(traceState(b.project, t, 0)[v]).toBe('7')
  })
  it('count as events for the control actions that realize them', () => {
    const { b, e, op, ca } = setup()
    const t: Trace = { lanes: [], steps: [{ t: '0', note: '', values: {}, events: [{ on: ca, what: 'occurs' }] }, { t: '4', note: '', values: {}, events: [] }] }
    expect(clockAt(b.project, t, 1).since(op)).toBe(4)
    expect(operationOfCa(b.project, ca)?.id).toBe(op)
    expect(operationsOf(b.project, e).length).toBe(1)
  })
  it('round-trip', () => {
    const b = projectBuilder()
    const e = b.add('entity', { title: 'Gate', operations: ['Lower'] })
    const p = deserialize(serialize(b.project))
    expect(operationsOf(p, e).map((o) => o.title)).toEqual(['Lower'])
    expect(operationsOf(p, e)[0].params).toEqual([{ name: 'gate', entity: e }])
    expect(deserialize(serialize(p))).toEqual(p)
  })
  it('lose the parameter and its effects when the entity is deleted, and are unlinked from control actions', () => {
    const { b, e, op, ca } = setup()
    expect(deleteItems(b.project, [op]).items[ca]).toMatchObject({ operation: null })
    expect(deleteItems(b.project, [e]).items[op]).toMatchObject({ params: [], effects: [] })
  })
})
