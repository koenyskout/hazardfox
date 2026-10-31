import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { createItem, updateItem } from './ops'
import { deserialize, serialize } from './serialize'
import { condHolds } from './traces'
import { consistent, expand } from './refinement'
import { generateUcaText } from './uca'
import { computeLabels } from './labels'
import { validate } from './validate'
import { conditionText, isMany, quantOf } from './variables'
import type { Condition, Id, Project } from './types'

function setup() {
  let p = emptyProject()
  const add = <K extends 'entity' | 'relationship' | 'variable' | 'node' | 'ca' | 'uca'>(k: K, patch: object) => { const r = createItem(p, k, patch as never); p = r.project; return r.id }
  const train = add('entity', { title: 'Train' })
  const station = add('entity', { title: 'Station' })
  const speed = add('variable', { layer: 'domain', parent: train, title: 'speed', type: 'range', min: 0, max: 100 })
  const rel = add('relationship', { from: train, to: station, title: 'at', fromCard: '*', toCard: '1' })
  return { get p() { return p }, set p(x: Project) { p = x }, add, train, station, speed, rel }
}
const cond = (variable: Id, extra: Partial<Condition> = {}): Condition => ({ variable, op: '=', state: '0', ...extra })

describe('instance quantification', () => {
  it('defaults to a single instance: nothing changes', () => {
    const s = setup()
    expect(isMany(s.p, s.p.items[s.speed] as never)).toBe(false)
    expect(quantOf(s.p, cond(s.speed))).toBeNull()
    expect(conditionText(s.p, cond(s.speed))).toBe('speed is 0')
  })
  it('reads quantified conditions as sentences', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    expect(conditionText(s.p, cond(s.speed))).toBe('speed of some Train is 0')
    expect(conditionText(s.p, cond(s.speed, { quant: 'all' }))).toBe('speed of every Train is 0')
    expect(conditionText(s.p, cond(s.speed, { quant: 'none' }))).toBe('speed of no Train is 0')
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id
    expect(conditionText(s.p, { variable: pred, op: '=', state: 'true' })).toBe('some Train at Station')
    expect(conditionText(s.p, { variable: pred, op: '=', state: 'true', quant: 'none' })).toBe('no Train at Station')
    const uca = s.add('uca', { conditions: [cond(s.speed, { quant: 'all' })] })
    expect(generateUcaText(s.p, computeLabels(s.p), s.p.items[uca] as never)).toContain('when speed of every Train is 0')
  })
  it('a many-cardinality relationship quantifies its variables', () => {
    const s = setup()
    const pred = Object.values(s.p.items).find((i) => i.kind === 'variable' && i.parent === s.rel)!.id
    expect(quantOf(s.p, { variable: pred, op: '=', state: 'true' })).toBe('some')
  })
  it('none flips a trace value', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const get = (id: Id) => (id === s.speed ? '0' : undefined)
    expect(condHolds(s.p, cond(s.speed), get)).toBe(true)
    expect(condHolds(s.p, cond(s.speed, { quant: 'none' }), get)).toBe(false)
    expect(condHolds(s.p, cond(s.speed, { quant: 'none' }), () => undefined)).toBeNull()
  })
  it('some conditions have independent witnesses, none is every-not', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    expect(consistent(s.p, [cond(s.speed), cond(s.speed, { op: '≠' })])).toBe(true)
    expect(consistent(s.p, [cond(s.speed, { quant: 'all' }), cond(s.speed, { op: '≠', quant: 'all' })])).toBe(false)
    expect(consistent(s.p, [cond(s.speed, { quant: 'all' }), cond(s.speed, { quant: 'none' })])).toBe(false)
  })
  it('does not expand refinement rules through a quantifier', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    const v = createItem(s.p, 'variable', { layer: 'domain', parent: s.train, title: 'moving', type: 'boolean', rules: [{ state: 'true', when: { any: false, of: [cond(s.speed, { op: '>', state: '0' })] } }], otherwise: 'false' } as never)
    expect(expand(v.project, v.project.items[v.id] as never, { variable: v.id, op: '=', state: 'true', quant: 'none' })).toBeNull()
  })
  it('round-trips and old files load', () => {
    const s = setup()
    s.p = updateItem(s.p, s.train, { many: true })
    s.add('uca', { conditions: [cond(s.speed, { quant: 'all' })] })
    const q = deserialize(serialize(s.p))
    expect((q.items[s.train] as { many?: boolean }).many).toBe(true)
    const u = Object.values(q.items).find((i) => i.kind === 'uca') as { conditions: Condition[] }
    expect(u.conditions[0].quant).toBe('all')
    const plain = setup()
    expect(serialize(plain.p)).not.toContain('"many"')
    expect(serialize(plain.p)).not.toContain('quant')
  })
  it('flags a quantifier on a single-instance variable only', () => {
    const s = setup()
    s.add('uca', { conditions: [cond(s.speed, { quant: 'all' })] })
    expect(validate(s.p).some((i) => i.rule === 'quantifier-single')).toBe(true)
    s.p = updateItem(s.p, s.train, { many: true })
    expect(validate(s.p).some((i) => i.rule === 'quantifier-single')).toBe(false)
  })
  it('never nags text-only or unquantified projects', () => {
    const s = setup()
    s.add('uca', { conditions: [cond(s.speed)] })
    expect(validate(s.p).some((i) => i.rule === 'quantifier-single')).toBe(false)
  })
})

describe('level crossing example', () => {
  it('is valid, uses quantifiers and survives a file round trip', async () => {
    const { crossingExampleProject } = await import('./crossingExample')
    const p = crossingExampleProject()
    expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
    const texts = Object.values(p.items).flatMap((i) => (i.kind === 'uca' ? i.conditions.map((c) => conditionText(p, c)) : []))
    expect(texts).toContain('Position of some Train is approaching')
    expect(texts).toContain('Position of every Train is far')
    expect(texts).toContain('no Train approaches Crossing')
    const hz = Object.values(p.items).flatMap((i) => (i.kind === 'hazard' ? [i.conditions.map((c) => conditionText(p, c)).join(' and ')] : []))
    expect(hz).toContain('Gate position is open and some Train approaches Crossing')
    expect(hz).toContain('Gate position is closed and no Train approaches Crossing')
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
  })
})
