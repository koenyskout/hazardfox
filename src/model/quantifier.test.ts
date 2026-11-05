import { describe, expect, it } from 'vitest'
import { emptyProject, relEnds } from './create'
import { createItem, deleteItems, updateItem } from './ops'
import { addSignal, beliefsAbout, signalsOf } from './formal'
import { deserialize, serialize } from './serialize'
import { condHolds, contextHolds, whenHolds, diagnose, draftTrace, getter, mismatches } from './traces'
import { consistent, expand } from './refinement'
import { generateUcaText } from './uca'
import { computeLabels } from './labels'
import { validate } from './validate'
import { nameAt, isValueCmp, leaves, nameAllInstances, condInstances, conditionText, conditionTexts, instLane, isMany, laneParts, quantAt, declare, endsOf, manyEndsOf, nameKey } from './variables'
import { mention, refsOf } from './refs'
import type { Id, Project, Scenario } from './types'
import type { Condition, ValueCondition, VarCondition } from './legacy'
import { laneAt } from './variables'

const valueOf = (c: Condition): ValueCondition => { if (!isValueCmp(c)) throw new Error('not a value comparison'); return c }

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

describe('instance quantification', () => {
  it('defaults to a single instance: nothing changes', () => {
    const s = setup()
    expect(isMany(s.p, s.p.items[s.speed] as never)).toBe(false)
    expect(conditionText(s.p, cond(s.speed))).toBe('speed is 0')
  })
  it('names "some" instances when a file or tool leaves them out, but not "every" or "no"', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const made = createItem(s.p, 'uca')
    const u = made.id
    let p = updateItem(made.project, u, { conditions: [cond(s.speed), cond(s.speed, { names: [declare('t1', 'all')] }), cond(s.speed, { names: [declare('t1', 'none')] })] } as never)
    p = deserialize(serialize(p))
    const cs = (p.items[u] as { conditions: Condition[] }).conditions.filter(isValueCmp)
    expect(cs[0].names).toEqual([{ declare: 'tr1' }])
    expect(cs[1].names).toEqual([{ declare: 't1', quant: 'all' }])
    expect(cs[2].names).toEqual([{ declare: 't1', quant: 'none' }])
    expect(nameAllInstances(p)).toBe(p)
  })
  it('reads quantified conditions as sentences', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    expect(conditionText(s.p, cond(s.speed))).toBe('speed of some Train is 0')
    expect(conditionText(s.p, cond(s.speed, { names: [declare('t1', 'all')] }))).toBe('speed of every Train t1 is 0')
    expect(conditionText(s.p, cond(s.speed, { names: [declare('t1', 'none')] }))).toBe('speed of no Train t1 is 0')
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id as Id<'variable'>
    expect(conditionText(s.p, { kind: 'value', variable: pred, op: '=', state: 'true' })).toBe('some Train at Station')
    expect(conditionText(s.p, { kind: 'value', variable: pred, op: '=', state: 'true', names: [declare('t1', 'none')] })).toBe('no Train t1 at Station')
    const uca = s.add('uca', { conditions: [cond(s.speed, { names: [declare('t1', 'all')] })] })
    expect(generateUcaText(s.p, computeLabels(s.p), s.p.items[uca] as never)).toContain('when speed of every Train t1 is 0')
  })
  it('a many-cardinality relationship quantifies its variables', () => {
    const s = setup()
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id as Id<'variable'>
    expect(quantAt(undefined, 0)).toBe('some')
    expect(conditionText(s.p, { kind: 'value', variable: pred, op: '=', state: 'true' })).toBe('some Train at Station')
  })
  it('none flips a trace value', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const get = (id: Id) => (id === s.speed ? '0' : undefined)
    expect(condHolds(s.p, cond(s.speed), get)).toBe(true)
    expect(condHolds(s.p, cond(s.speed, { names: [declare('t1', 'none')] }), get)).toBe(false)
    expect(condHolds(s.p, cond(s.speed, { names: [declare('t1', 'none')] }), () => undefined)).toBeNull()
  })
  it('some conditions have independent witnesses, none is every-not', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    expect(consistent(s.p, [cond(s.speed), cond(s.speed, { op: '≠' })])).toBe(true)
    expect(consistent(s.p, [cond(s.speed, { names: [declare('t1', 'all')] }), cond(s.speed, { op: '≠', names: [declare('t1', 'all')] })])).toBe(false)
    expect(consistent(s.p, [cond(s.speed, { names: [declare('t1', 'all')] }), cond(s.speed, { names: [declare('t1', 'none')] })])).toBe(false)
  })
  it('does not expand refinement rules through a quantifier', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const v = createItem(s.p, 'variable', { layer: 'domain', parent: s.train, title: 'moving', type: 'boolean', rules: [{ state: 'true', when: { any: false, of: [cond(s.speed, { op: '>', state: '0' })] } }], otherwise: 'false' } as never)
    expect(expand(v.project, v.project.items[v.id] as never, { kind: 'value', variable: v.id, op: '=', state: 'true', names: [declare('t1', 'none')] })).toBeNull()
  })
  it('round-trips and old files load', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    s.add('uca', { conditions: [cond(s.speed, { names: [declare('t1', 'all')] })] })
    const q = deserialize(serialize(s.p))
    expect((q.items[s.train] as { many?: boolean }).many).toBe(true)
    const u = Object.values(q.items).find((i) => i.kind === 'uca') as { conditions: Condition[] }
    expect(valueOf(u.conditions[0]).names).toEqual([{ declare: 't1', quant: 'all' }])
    const plain = setup()
    expect(serialize(plain.p)).not.toContain('"many": true')
    expect(serialize(plain.p)).not.toContain('quant')
  })
  it('evaluates every-train / some-crossing by nesting the quantifiers', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing', many: true })
    const appr = s.add('relationship', { title: 'approaches', ends: relEnds(s.train, crossing, '*', '*') })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === appr)!.id as Id<'variable'>
    const open = s.add('variable', { layer: 'domain', parent: crossing, title: 'open', type: 'boolean' })
    const w = { kind: 'group', any: false, of: [
      { kind: 'value', variable: pred, op: '=', state: 'true', names: [declare('t1', 'all'), declare('c1')] },
      { kind: 'value', variable: open, op: '=', state: 'true', names: [{ use: 'c1' }] },
    ] } as never
    const lane = (t: string, c: string) => `${pred}@${t}|${c}`
    const holds = (v: Record<string, string>) => whenHolds(s.p, w, getter(v))
    // every train approaches a crossing that is open
    expect(holds({ [lane('t1', 'c1')]: 'true', [lane('t2', 'c1')]: 'true', [`${open}@c1`]: 'true' })).toBe(true)
    expect(holds({ [lane('t1', 'c1')]: 'true', [lane('t1', 'c2')]: 'false', [lane('t2', 'c1')]: 'false', [lane('t2', 'c2')]: 'true', [`${open}@c1`]: 'true', [`${open}@c2`]: 'false' })).toBe(false)
    // the witness crossing may differ per train
    expect(holds({ [lane('t1', 'c1')]: 'true', [lane('t1', 'c2')]: 'false', [lane('t2', 'c2')]: 'true', [`${open}@c1`]: 'true', [`${open}@c2`]: 'true' })).toBe(true)
  })
  it('distinct names are distinct instances; the aggregate lane cannot supply two', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const w = { kind: 'group', any: false, of: [cond(s.speed, { names: [declare('t1')] }), cond(s.speed, { names: [declare('t2')] })] } as never
    expect(whenHolds(s.p, w, getter({ [s.speed]: '0' }))).toBeNull()
    expect(whenHolds(s.p, w, getter({ [`${s.speed}@a`]: '0' }))).toBe(false)
    expect(whenHolds(s.p, w, getter({ [`${s.speed}@a`]: '0', [`${s.speed}@b`]: '0' }))).toBe(true)
  })
})

describe('level crossing example', () => {
  it('is valid, uses quantifiers and survives a file round trip', async () => {
    const { crossingExampleProject } = await import('./crossingExample')
    const p = crossingExampleProject()
    expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
    const texts = Object.values(p.items).flatMap((i) => (i.kind === 'uca' ? i.conditions.flatMap(leaves).map((c) => conditionText(p, c)) : []))
    expect(texts).toContain('Position of some Train tr1 is approaching')
    expect(texts).toContain('Position of every Train t1 is far')
    expect(texts).toContain('no Train t1 approaches Crossing')
    const hz = Object.values(p.items).flatMap((i) => (i.kind === 'hazard' ? [i.conditions.flatMap(leaves).map((c) => conditionText(p, c)).join(' and ')] : []))
    expect(hz).toContain('Gate position is open and some Train tr1 approaches Crossing')
    expect(hz).toContain('Gate position is closed and no Train t1 approaches Crossing')
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
  })
  it('names an instance and refers to it again', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id as Id<'variable'>
    const a: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't1' }] }
    const b = cond(s.speed, { names: [{ use: 't1' }], op: '>', state: '10' })
    expect(conditionText(s.p, a)).toBe('some Train t1 at Station')
    expect(conditionText(s.p, b)).toBe('speed of t1 is greater than 10')
    expect(conditionText(s.p, cond(s.speed, { names: [{ declare: 't2' }] }))).toBe('speed of some Train t2 is 0')
    // same witness cannot be both; an unnamed some can (only in hand-edited files; validation warns)
    expect(consistent(s.p, [cond(s.speed, { names: [{ declare: 't1' }] }), cond(s.speed, { names: [{ use: 't1' }], op: '≠' })])).toBe(false)
    expect(consistent(s.p, [cond(s.speed, { names: [{ declare: 't1' }] }), cond(s.speed, { names: [{ declare: 't2' }], op: '≠' })])).toBe(true)
    const ok = s.add('uca', { conditions: [a, b] })
    expect(validate(s.p).some((i) => i.rule === 'instance-name')).toBe(false)
    s.p = updateItem(s.p, ok, { conditions: [b] })
    expect(validate(s.p).some((i) => i.rule === 'instance-name')).toBe(true)
    const q = deserialize(serialize(s.p))
    expect((q.items[ok] as { conditions: Condition[] }).conditions[0]).toMatchObject({ names: [{ use: 't1' }] })
  })
  it('another instance of the same entity: some train t1 approaches the crossing and another train t2 approaches it', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing' })
    const appr = s.add('relationship', { title: 'approaches', ends: relEnds(s.train, crossing, '*', '1') })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === appr)!.id as Id<'variable'>
    const a: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't1' }] }
    const b: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't2' }] }
    expect(conditionTexts(s.p, [a, b])).toEqual(['some Train t1 approaches Crossing', 'another Train t2 approaches Crossing'])
    expect(consistent(s.p, [a, b])).toBe(true)
  })
  it('expresses: some train t1 approaches the crossing and t1 is faster than the minimum speed', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing' })
    const min = s.add('variable', { layer: 'domain', parent: crossing, title: 'minimum speed', type: 'range', min: 0, max: 100 })
    const appr = s.add('relationship', { title: 'approaches', ends: relEnds(s.train, crossing, '*', '1') })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === appr)!.id as Id<'variable'>
    const a: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't1' }] }
    const b: Condition = { kind: 'var', variable: s.speed, op: '>', other: min, names: [{ use: 't1' }] }
    expect(conditionText(s.p, a)).toBe('some Train t1 approaches Crossing')
    expect(conditionText(s.p, b)).toBe('speed of t1 is greater than minimum speed')
    const uca = s.add('uca', { conditions: [a, b] })
    expect(validate(s.p).some((i) => i.rule === 'instance-name')).toBe(false)
    const get = (id: Id) => ({ [pred]: 'true', [s.speed]: '60', [min]: '40' } as Record<Id, string>)[id]
    expect(condHolds(s.p, a, get)).toBe(true)
    expect(condHolds(s.p, b, get)).toBe(true)
    expect(generateUcaText(s.p, computeLabels(s.p), s.p.items[uca] as never)).toContain('some Train t1 approaches Crossing and speed of t1 is greater than minimum speed')
  })
  it('names the second end of a relationship and reads instance lanes', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing', many: true })
    const appr = s.add('relationship', { title: 'approaches', ends: relEnds(s.train, crossing, '*', '*') })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === appr)!.id as Id<'variable'>
    const a: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't1' }, { declare: 'c1' }] }
    const b: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [{ declare: 't2' }, { use: 'c1' }] }
    expect(conditionTexts(s.p, [a, b])).toEqual(['some Train t1 approaches Crossing c1', 'another Train t2 approaches c1'])
    expect(instLane(a)).toBe(`${pred}@t1|c1`)
    expect(laneParts(laneAt(pred, 't1|c1'))).toEqual({ id: pred, names: ['t1', 'c1'] })
    // named reads its lane, falling back to the bare lane; unnamed is quantified over all instance lanes
    const named: Condition = cond(s.speed, { names: [{ declare: 't1' }], op: '>', state: '10' })
    expect(condHolds(s.p, named, getter({ [`${s.speed}@t1`]: '50' }))).toBe(true)
    expect(condHolds(s.p, named, getter({ [`${s.speed}@a`]: '50', [`${s.speed}@b`]: '5' }))).toBe(true)
    expect(condHolds(s.p, named, getter({ [`${s.speed}@a`]: '5', [`${s.speed}@b`]: '5' }))).toBe(false)
    expect(condHolds(s.p, named, getter({ [s.speed]: '50' }))).toBe(true)
    const some = cond(s.speed, { op: '>', state: '10' })
    expect(condHolds(s.p, some, getter({ [`${s.speed}@t1`]: '5', [`${s.speed}@t2`]: '50' }))).toBe(true)
    expect(condHolds(s.p, cond(s.speed, { op: '>', state: '10', names: [declare('t1', 'all')] }), getter({ [`${s.speed}@t1`]: '5', [`${s.speed}@t2`]: '50' }))).toBe(false)
    expect(condHolds(s.p, cond(s.speed, { op: '>', state: '10', names: [declare('t1', 'none')] }), getter({ [`${s.speed}@t1`]: '5', [`${s.speed}@t2`]: '50' }))).toBe(false)
    // lanes survive a round trip
    const sc = s.add('uca', { conditions: [a, b] })
    expect(validate(s.p).some((i) => i.rule === 'instance-name')).toBe(false)
    expect(deserialize(serialize(s.p)).items[sc]).toBeTruthy()
  })
})

describe('relationship reading', () => {
  it('phrases conditions by the template, falls back when an end is missing', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id as Id<'variable'>
    const c: Condition = { kind: 'value', variable: pred, op: '=', state: 'true', names: [declare('t1')] }
    expect(conditionText(s.p, c)).toBe('some Train t1 at Station')
    s.p = updateItem(s.p, s.rel, { reading: '{2} is where {1} stops' })
    expect(conditionText(s.p, c)).toBe('Station is where some Train t1 stops')
    s.p = updateItem(s.p, s.rel, { reading: '{1} stops' })
    expect(conditionText(s.p, c)).toBe('some Train t1 at Station')
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
    expect((rt.items[hz] as unknown as { conditions: Condition[] }).conditions[0]).toMatchObject({ kind: 'text', text: expect.stringContaining(mention(s.speed)) })
  })
})

describe('another instance is a separate instance in traces', () => {
  it('needs a lane of its own instead of the common one', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const u = s.add('uca', { conditions: [cond(s.speed, { names: [{ declare: 't1' }] }), cond(s.speed, { names: [{ declare: 't2' }] })] }) as Id
    const uca = () => s.p.items[u] as never
    // one common lane would satisfy both names; strict reading leaves t2 unknown
    expect(contextHolds(s.p, uca(), { [s.speed]: '0' })).toBeNull()
    expect(contextHolds(s.p, uca(), { [`${s.speed}@t1`]: '0' })).toBe(false)
    expect(contextHolds(s.p, uca(), { [`${s.speed}@t1`]: '0', [`${s.speed}@t2`]: '0' })).toBe(true)
    expect(contextHolds(s.p, uca(), { [`${s.speed}@t1`]: '0', [`${s.speed}@t2`]: '5' })).toBe(false)
    // a single named instance still falls back to the common lane
    const one = s.add('uca', { conditions: [cond(s.speed, { names: [{ declare: 't1' }] })] }) as Id
    expect(contextHolds(s.p, s.p.items[one] as never, { [s.speed]: '0' })).toBe(true)
  })
  it('compares a named instance with the value of another variable at a named instance', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const limit = s.add('variable', { layer: 'domain', parent: s.train, title: 'limit', type: 'range', min: 0, max: 100 })
    const c: VarCondition = { kind: 'var', variable: s.speed, op: '>', names: [{ declare: 't1' }], other: limit, otherNames: [{ use: 't2' }]  }
    expect(conditionText(s.p, c)).toBe('speed of some Train t1 is greater than limit of t2')
    expect(instLane({ ...c })).toBe(`${s.speed}@t1`)
    const get = getter({ [`${s.speed}@t1`]: '50', [`${limit}@t2`]: '40', [`${limit}@t1`]: '90' })
    expect(condHolds(s.p, c, get)).toBe(true)
    expect(condHolds(s.p, { ...c, otherNames: [{ use: 't1' }]  }, get)).toBeNull()
    const back = deserialize(serialize({ ...s.p, items: { ...s.p.items } }))
    expect(back.items[s.speed]).toBeTruthy()
  })

  it('a comparison can introduce a second named instance on its compared side', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const c: VarCondition = { kind: 'var', variable: s.speed, op: '>', names: [{ declare: 't1' }], other: s.speed, otherNames: [{ declare: 't2' }]  }
    expect(nameAt(c.otherNames, 0)).toBe('t2')
    expect(condInstances(s.p, c).map((x) => [x.name, x.intro, !!x.cmp])).toEqual([['t1', true, false], ['t2', true, true]])
    expect(conditionText(s.p, c)).toBe('speed of some Train t1 is greater than speed of t2')
    const get = getter({ [`${s.speed}@t1`]: '50', [`${s.speed}@t2`]: '40' })
    expect(condHolds(s.p, c, get)).toBe(true)
    expect(condHolds(s.p, { ...c, otherNames: [{ declare: 't3' }]  }, get)).toBe(true)
  })
})

describe('instance names are keyed by relationship end', () => {
  function world() {
    const s = setup()
    const plant = s.add('entity', { title: 'Plant' })
    s.p = updateItem(s.p, s.train, { many: true })
    const crossing = s.add('entity', { title: 'Crossing', many: true })
    const route = s.add('entity', { title: 'Route', many: true })
    const pred = (r: Id) => Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === r)!
    const serves = s.add('relationship', { title: 'serves', ends: relEnds(plant, crossing, '1', '*') })
    const meets = s.add('relationship', { title: 'meets', ends: [{ entity: s.train, role: 'Train', card: '*' }, { entity: crossing, role: 'Crossing', card: '*' }, { entity: route, role: 'Route', card: '*' }] })
    return Object.assign(s, { plant, crossing, route, serves: pred(serves), meets: pred(meets) })
  }
  const val = (variable: Id, extra: Partial<ValueCondition>): ValueCondition => ({ kind: 'value', variable, op: '=', state: 'true', ...extra })
  it('a single end before a many end keeps its index, so the many end is end 1', () => {
    const w = world()
    expect(endsOf(w.p, w.serves as never).map((e) => e.many)).toEqual([false, true])
    expect(manyEndsOf(w.p, w.serves as never).map((e) => e.end)).toEqual([1])
    const c = val(w.serves.id, { names: [null, { declare: 'c1' }] })
    expect(condInstances(w.p, c).map((x) => [x.name, x.end])).toEqual([['c1', 1]])
    expect(quantAt(c.names, 1)).toBe('some')
    expect(conditionText(w.p, c)).toBe('Plant serves some Crossing c1')
  })
  it('naming a single-instance end is reported', () => {
    const w = world()
    const u = w.add('uca', { conditions: [val(w.serves.id, { names: [{ declare: 'p1' }, { declare: 'c1' }] })] })
    expect(u).toBeTruthy()
    expect(validate(w.p).some((i) => i.rule === 'instance-name' && /single instance/.test(i.message))).toBe(true)
  })
  it('relationships with three ends: every many end gets a name, lanes carry them in end order', () => {
    const w = world()
    expect(manyEndsOf(w.p, w.meets as never).map((e) => e.end)).toEqual([0, 1, 2])
    const u = w.add('uca', { conditions: [val(w.meets.id, {})] })
    const q = nameAllInstances(w.p)
    const c = (q.items[u] as { conditions: Condition[] }).conditions[0] as ValueCondition
    expect(c.names?.map((b) => !!b)).toEqual([true, true, true])
    expect(nameKey(c.names)).toMatch(/^\w+\|\w+\|\w+$/)
    expect(instLane(c)).toBe(`${w.meets.id}@${nameKey(c.names)}`)
  })
  it('each end has its own quantifier', () => {
    const w = world()
    const names = [declare('t1', 'all'), declare('c1'), null]
    expect([0, 1].map((e) => quantAt(names, e))).toEqual(['all', 'some'])
    expect(conditionText(w.p, val(w.meets.id, { names: [declare('t1', 'all'), declare('c1'), declare('r1', 'none')] }))).toBe('every Train t1 meets some Crossing c1 no Route r1')
  })
})
