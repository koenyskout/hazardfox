import { describe, expect, it } from 'vitest'
import { emptyProject, relEnds } from './create'
import { deleteItems } from './ops'
import { upgrade } from './build'
import { createItem as create0, updateItem as update0 } from './ops'
// legacy condition authoring in tests: converted to Expr on the way in
const createItem = ((p: Project, k: Kind, init?: object) => create0(p, k, upgrade(p, (init ?? {}) as Record<string, unknown>) as never)) as <K extends Kind>(p: Project, k: K, init?: object) => { project: Project; id: Id<K> }
const updateItem = ((p: Project, id: Id, patch: object) => update0(p, id, upgrade(p, patch as Record<string, unknown>) as never)) as (p: Project, id: Id, patch: object) => Project
import { addSignal, beliefsAbout, signalsOf } from './formal'
import { say } from './say'
import { whenToExpr } from './bridge'
import { varsOf } from './atoms'
import { deserialize, serialize } from './serialize'
import { whenHolds, diagnose, draftTrace, getter, mismatches } from './traces'
import { generateUcaText } from './uca'
import { computeLabels } from './labels'
import { validate } from './validate'
import { isMany, declare } from './variables'
import { mention, refsOf } from './refs'
import type { Id, Kind, Project, Scenario } from './types'
import type { Condition, ValueCondition } from './legacy'

function setup() {
  let p = emptyProject()
  const add = <K extends 'hazard' | 'entity' | 'feedback' | 'relationship' | 'variable' | 'node' | 'ca' | 'uca'>(k: K, patch: object) => { const r = createItem(p, k, patch as never); p = r.project; return r.id }
  const train = add('entity', { title: 'Train' })
  const station = add('entity', { title: 'Station' })
  const speed = add('variable', { layer: 'domain', parent: train, title: 'speed', type: 'range', min: 0, max: 100 })
  const rel = add('relationship', { title: 'at', ends: relEnds(train, station, '*', '1') })
  return { get p() { return p }, set p(x: Project) { p = x }, add, train, station, speed, rel }
}

const cond = (variable: Id, extra: Partial<ValueCondition> = {}): ValueCondition => ({ kind: 'value', variable, op: '=', state: '0', ...extra })
const txt = (p: Project, ...cs: Condition[]) => say(p, whenToExpr(p, cs))
const predOf = (s: ReturnType<typeof setup>, rel: Id) => Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === rel)!.id as Id<'variable'>

describe('instance quantification', () => {
  it('defaults to a single instance: nothing changes', () => {
    const s = setup()
    expect(isMany(s.p, s.p.items[s.speed] as never)).toBe(false)
    expect(txt(s.p, cond(s.speed))).toBe('speed is 0')
  })
  it('reads quantified conditions as sentences', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    expect(txt(s.p, cond(s.speed, { names: [declare('t1', 'all')] }))).toBe('every Train t1: speed of t1 is 0')
    expect(txt(s.p, cond(s.speed, { names: [declare('t1', 'none')] }))).toBe('no Train t1: speed of t1 is 0')
    expect(txt(s.p, cond(s.speed, { names: [declare('t1')] }))).toBe('some Train t1: speed of t1 is 0')
    const pred = predOf(s, s.rel)
    expect(txt(s.p, { kind: 'value', variable: pred, op: '=', state: 'true', names: [declare('t1', 'none')] })).toBe('no Train t1: t1 at Station')
    const uca = s.add('uca', { conditions: [cond(s.speed, { names: [declare('t1', 'all')] })] })
    expect(generateUcaText(s.p, computeLabels(s.p), s.p.items[uca] as never)).toContain('when every Train t1: speed of t1 is 0')
  })
  it('none flips a trace value', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const get = getter({ [`${s.speed}@a`]: '0' })
    const w = (q: 'some' | 'none') => whenToExpr(s.p, [cond(s.speed, { names: [declare('t1', q)] })])
    expect(whenHolds(s.p, w('some'), get)).toBe(true)
    expect(whenHolds(s.p, w('none'), get)).toBe(false)
    expect(whenHolds(s.p, w('none'), getter({}))).toBeNull()
  })
  it('round-trips and plain projects carry no quantifier data', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const u = s.add('uca', { conditions: [cond(s.speed, { names: [declare('t1', 'all')] })] })
    const q = deserialize(serialize(s.p))
    expect((q.items[s.train] as { many?: boolean }).many).toBe(true)
    expect((q.items[u] as { when: unknown }).when).toEqual((s.p.items[u] as { when: unknown }).when)
    const plain = setup()
    expect(serialize(plain.p)).not.toContain('"many": true')
    expect(serialize(plain.p)).not.toContain('quant')
  })
  it('evaluates every-train / some-crossing by nesting the quantifiers', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing', many: true })
    const appr = s.add('relationship', { title: 'approaches', ends: relEnds(s.train, crossing, '*', '*') })
    const pred = predOf(s, appr)
    const open = s.add('variable', { layer: 'domain', parent: crossing, title: 'open', type: 'boolean' })
    const w = whenToExpr(s.p, [
      { kind: 'value', variable: pred, op: '=', state: 'true', names: [declare('t1', 'all'), declare('c1')] },
      { kind: 'value', variable: open, op: '=', state: 'true', names: [{ use: 'c1' }] },
    ])
    const lane = (t: string, c: string) => `${pred}@${t}|${c}`
    const holds = (v: Record<string, string>) => whenHolds(s.p, w, getter(v))
    expect(holds({ [lane('t1', 'c1')]: 'true', [lane('t2', 'c1')]: 'true', [`${open}@c1`]: 'true' })).toBe(true)
    expect(holds({ [lane('t1', 'c1')]: 'true', [lane('t1', 'c2')]: 'false', [lane('t2', 'c1')]: 'false', [lane('t2', 'c2')]: 'true', [`${open}@c1`]: 'true', [`${open}@c2`]: 'false' })).toBe(false)
    expect(holds({ [lane('t1', 'c1')]: 'true', [lane('t1', 'c2')]: 'false', [lane('t2', 'c2')]: 'true', [`${open}@c1`]: 'true', [`${open}@c2`]: 'true' })).toBe(true)
  })
  it('distinct names are distinct instances; the aggregate lane cannot supply two', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const w = whenToExpr(s.p, [cond(s.speed, { names: [declare('t1')] }), cond(s.speed, { names: [declare('t2')] })])
    expect(whenHolds(s.p, w, getter({ [s.speed]: '0' }))).toBeNull()
    expect(whenHolds(s.p, w, getter({ [`${s.speed}@a`]: '0' }))).toBe(false)
    expect(whenHolds(s.p, w, getter({ [`${s.speed}@a`]: '0', [`${s.speed}@b`]: '0' }))).toBe(true)
  })
  it('a named instance can be used again, in a comparison with another variable', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing' })
    const min = s.add('variable', { layer: 'domain', parent: crossing, title: 'minimum speed', type: 'range', min: 0, max: 100 })
    const appr = s.add('relationship', { title: 'approaches', ends: relEnds(s.train, crossing, '*', '1') })
    const pred = predOf(s, appr)
    const a: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't1' }] }
    const b: Condition = { kind: 'var', variable: s.speed, op: '>', other: min, names: [{ use: 't1' }] }
    const uca = s.add('uca', { conditions: [a, b] })
    expect(txt(s.p, a, b)).toBe('some Train t1: t1 approaches Crossing and speed of t1 is greater than minimum speed')
    expect(validate(s.p).filter((i) => i.rule === 'expr-type' && i.item === uca)).toEqual([])
    const get = (id: Id) => ({ [pred]: 'true', [s.speed]: '60', [min]: '40' } as Record<Id, string>)[id]
    expect(whenHolds(s.p, (s.p.items[uca] as unknown as { when: never }).when, get)).toBe(true)
  })
})

describe('level crossing example', () => {
  it('is valid, uses quantifiers and survives a file round trip', async () => {
    const { crossingExampleProject } = await import('./crossingExample')
    const p = crossingExampleProject()
    expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
    const ucas = Object.values(p.items).flatMap((i) => (i.kind === 'uca' ? [say(p, i.when)] : []))
    expect(ucas.some((t) => t.startsWith('some Train tr1'))).toBe(true)
    expect(ucas.some((t) => t.startsWith('every Train t1'))).toBe(true)
    expect(ucas.some((t) => t.startsWith('no Train t1'))).toBe(true)
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
  })
})

describe('relationship reading', () => {
  it('phrases conditions by the template, falls back when an end is missing', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id as Id<'variable'>
    const c: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [declare('t1')] }
    expect(txt(s.p, c)).toBe('some Train t1: t1 at Station')
    s.p = updateItem(s.p, s.rel, { reading: '{2} is where {1} stops' })
    expect(txt(s.p, c)).toBe('some Train t1: Station is where t1 stops')
    s.p = updateItem(s.p, s.rel, { reading: '{1} stops' })
    expect(txt(s.p, c)).toBe('some Train t1: t1 at Station')
    expect(validate(s.p).some((i) => i.rule === 'relationship-reading')).toBe(true)
  })
})

describe('per-instance signals and beliefs', () => {
  function world() {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const ctrl = s.add('node', { title: 'Ctrl', role: 'controller' })
    const proc = s.add('node', { title: 'Plant', role: 'process' })
    const ca = s.add('ca', { title: 'Brake', from: ctrl, to: proc, affects: [s.speed] })
    const fb = s.add('feedback', { title: 'Speed reading', from: proc, to: ctrl })
    s.p = addSignal(s.p, fb, s.speed).project
    const uca = s.add('uca', { ca, guide: 'provided', conditions: [cond(s.speed, { names: [{ declare: 't1' }], op: '>', state: '10' })] })
    return { ...s, ctrl, ca, fb, uca }
  }
  it('drafts signal and belief lanes for the named instance and diagnoses them', () => {
    const w = world()
    const sig = signalsOf(w.p, w.fb)[0].id, bel = beliefsAbout(w.p, w.ctrl, w.speed)[0].id
    for (const cause of ['feedback', 'process-model'] as const) {
      const r = createItem(w.p, 'scenario', { uca: w.uca, cause })
      const sc = r.project.items[r.id] as Scenario
      const t = draftTrace(r.project, sc)
      expect(t.lanes).toEqual(expect.arrayContaining([`${w.speed}@t1`, `${sig}@t1`, `${bel}@t1`]))
      expect(t.lanes).not.toContain(sig)
      const withTrace = updateItem(r.project, r.id, { trace: t }) as Project
      const sc2 = withTrace.items[r.id] as Scenario
      expect(mismatches(withTrace, t, 1).map((m) => m.id)).toContain(cause === 'feedback' ? `${sig}@t1` : `${bel}@t1`)
      expect(diagnose(withTrace, sc2)?.cause).toBe(cause)
    }
  })
  it('instance lanes follow the variable when it is deleted', () => {
    const w = world()
    const r = createItem(w.p, 'scenario', { uca: w.uca, cause: 'feedback' })
    const p = deleteItems(updateItem(r.project, r.id, { trace: draftTrace(r.project, r.project.items[r.id] as Scenario) }), [w.speed])
    const t = (p.items[r.id] as Scenario).trace
    expect(t.lanes.some((k) => k.startsWith(w.speed))).toBe(false)
    expect(t.steps.every((x) => Object.keys(x.values).every((k) => !k.startsWith(w.speed)))).toBe(true)
  })
})

describe('variable mentions in free-text conditions', () => {
  it('count as references, survive a round trip', () => {
    const s = setup()
    const v2 = s.add('variable', { layer: 'domain', parent: s.train, title: 'brake', type: 'boolean' })
    const hz = s.add('hazard', {})
    s.p = updateItem(s.p, hz, { conditions: [{ kind: 'text', op: '=', text: `alert while ${mention(s.speed)} is high` }] }) as Project
    expect(refsOf(s.p.items[hz])).toContain(s.speed)
    expect(refsOf(s.p.items[v2])).not.toContain(s.speed)
    const rt = deserialize(serialize(s.p))
    expect(varsOf(null)).toEqual([])
    expect(say(rt, (rt.items[hz] as unknown as { when: never }).when)).toContain(mention(s.speed))
  })
})
