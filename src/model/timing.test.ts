import { describe, expect, it } from 'vitest'
import { say } from './say'
import { projectBuilder } from './build'
import { deserialize, serialize } from './serialize'
import { clockAt, draftTrace, witness } from './traces'
import { deleteItems } from './ops'
import { refsOf } from './refs'
import { boundSeconds, parseTime, laneOf } from './variables'
import { cmp, heldFor, is, num, since, type Expr } from './lang'
import type { Id, Scenario, Trace, Uca } from './types'

function setup(when: (a: Id<'variable'>, ca: Id<'ca'>, ev: Id<'ca'>) => Expr) {
  const b = projectBuilder()
  const e = b.add('entity', { title: 'Pump' })
  const a = b.add('variable', { layer: 'domain', parent: e, title: 'power', type: 'enum', states: ['on', 'off'] })
  const n = b.add('node', { title: 'Nurse', role: 'controller' })
  const pr = b.add('node', { title: 'Patient', role: 'process' })
  const ca = b.add('ca', { from: n, to: pr, title: 'Stop' })
  const ev = b.add('ca', { from: n, to: pr, title: 'Start' })
  const u = b.add('uca', { ca, guide: 'not-provided', when: when(a, ca, ev) })
  const s = b.add('scenario', { scenarioType: 'uca', uca: u, cause: 'control-algorithm' })
  return { b, a, ca, ev, u, s }
}
const time = (op: '≥' | '<', amount: string, unit: 's' | 'ms' | 'min' | 'h' = 's') => ({ op, amount, unit })
const trace = (a: Id, ca: Id, ts: string[]): Trace => ({
  lanes: [laneOf(a)],
  steps: ts.map((t, i) => ({ t, note: '', values: i === 1 ? { [laneOf(a)]: 'on' } : {}, events: i === ts.length - 1 ? [{ on: ca, what: 'absent' as const }] : [] })),
})

describe('timing conditions', () => {
  it('parses step times', () => {
    expect(parseTime('5')).toBe(5)
    expect(parseTime('200 ms')).toBe(0.2)
    expect(parseTime('1.5min')).toBe(90)
    expect(parseTime('t1')).toBeNull()
    expect(boundSeconds(time('≥', '2', 'min'))).toBe(120)
  })
  it('reads as text', () => {
    const { b, u } = setup((a) => cmp('≥', heldFor(is(a, 'on')), num('3', 's')))
    expect(say(b.project, (b.project.items[u] as Uca).when)).toBe('power is on for at least 3 s')
  })
  it('checks how long a condition has held', () => {
    const mk = (ts: string[], t: ReturnType<typeof time>) => {
      const { b, a, ca, s } = setup((v) => cmp(t.op, heldFor(is(v, 'on')), num(t.amount, t.unit)))
      const sc = b.project.items[s] as Scenario
      return witness(b.project, { ...sc, trace: trace(a, ca, ts) })
    }
    expect(mk(['0', '1', '5'], time('≥', '3'))?.ok).toBe(true)
    expect(mk(['0', '1', '2'], time('≥', '3'))?.ok).toBe(false)
    expect(mk(['0', '1', '2'], time('<', '3'))?.ok).toBe(true)
    expect(mk(['t0', 't1', 't2'], time('≥', '3'))?.ok).toBeNull()
  })
  it('checks the time since an event', () => {
    const { b, a, ca, ev, s } = setup((_, __, e) => cmp('≥', since(e), num('2', 's')))
    const sc = b.project.items[s] as Scenario
    const t: Trace = { lanes: [laneOf(a)], steps: [
      { t: '0', note: '', values: {}, events: [{ on: ev, what: 'occurs' }] },
      { t: '1', note: '', values: {}, events: [] },
      { t: '4', note: '', values: {}, events: [{ on: ca, what: 'absent' }] },
    ] }
    expect(clockAt(b.project, t, 2).since(ev)).toBe(4)
    expect(witness(b.project, { ...sc, trace: t })?.ok).toBe(true)
  })
  it('survives save / load, references and deletion', () => {
    const { b, ca, u } = setup((_, c) => cmp('<', since(c), num('1', 'min')))
    const q = deserialize(serialize(b.project))
    expect((q.items[u] as Uca).when).toEqual((b.project.items[u] as Uca).when)
    expect(refsOf(q.items[u])).toContain(ca)
    expect(deleteItems(b.project, [ca]).items[u]).toBeUndefined()
  })
  it('drafts a trace with numeric times that satisfies a duration', () => {
    const { b, a, u, s } = setup((v) => cmp('≥', heldFor(is(v, 'on')), num('4', 's')))
    const t = draftTrace(b.project, b.project.items[s] as Scenario)
    expect(t.steps.map((x) => x.t)).toEqual(['0', '1', '5'])
    expect(witness(b.project, { ...(b.project.items[s] as Scenario), trace: { ...t, steps: t.steps.map((x, i) => (i === 2 ? { ...x, values: { ...x.values, [a]: 'on' } } : x)) } })?.ok).toBe(true)
    expect(u).toBeTruthy()
  })
})
