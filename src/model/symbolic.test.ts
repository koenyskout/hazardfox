import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { blankField, createItem, defineEnumType, defineRangeType, defineStructType, defineSymbolicType, deleteEnumType, deleteRangeType, deleteSymbolicType, renameEnumType, renameRangeType, renameSymbolicType, updateItem } from './ops'
import { deserialize, serialize } from './serialize'
import { holds, pickValue, symbolViolations } from './traces'
import { conditionError, opsFor, opsForVar, describeStates } from './variables'
import { paramVar } from './params'
import type { Condition, ItemOf, Project, Variable } from './types'

const setup = () => {
  let p: Project = emptyProject()
  const ent = createItem(p, 'entity', { title: 'Clock' }); p = ent.project
  p = defineSymbolicType(p, 'Timestamp', { ordered: true })
  p = defineSymbolicType(p, 'ID', { ordered: false })
  const mk = (title: string, symbolicType: string) => { const r = createItem(p, 'variable', { title, parent: ent.id, type: 'symbolic' }); p = updateItem(r.project, r.id, { symbolicType }); return r.id }
  const t1 = mk('Sent at', 'Timestamp'), t2 = mk('Received at', 'Timestamp'), id = mk('Request id', 'ID')
  const v = (i: string) => p.items[i] as Variable
  return { p: () => p, v, t1, t2, id, set: (f: (q: Project) => Project) => { p = f(p) } }
}
const c = (variable: string, op: Condition['op'], state: string, other?: string): Condition => ({ variable, op, state, ...(other !== undefined ? { other } : {}) })

describe('symbolic types', () => {
  it('a named type gives its properties to the variables', () => {
    const s = setup()
    expect(s.v(s.t1)).toMatchObject({ ordered: true })
    expect(s.v(s.id)).toMatchObject({ ordered: false })
    expect(opsFor(s.v(s.t1))).toContain('<')
    expect(opsFor(s.v(s.id))).toEqual(['=', '≠'])
    s.set((q) => defineSymbolicType(q, 'ID', { ordered: true }))
    expect(s.v(s.id)).toMatchObject({ ordered: true })
    s.set((q) => defineSymbolicType(q, 'ID', { ordered: false }))
    expect(opsFor(s.v(s.id))).toEqual(['=', '≠'])
    expect(conditionError(s.v(s.id), c(s.id, '<', 'a'))).toMatch(/does not apply/)
  })

  it('rename and delete keep variables consistent', () => {
    const s = setup()
    s.set((q) => renameSymbolicType(q, 'Timestamp', 'Time'))
    expect(s.v(s.t1).symbolicType).toBe('Time')
    s.set((q) => deleteSymbolicType(q, 'Time'))
    expect(s.v(s.t1)).toMatchObject({ symbolicType: '', ordered: true })
  })

  it('editing properties of a variable on a named type updates the type', () => {
    const s = setup()
    s.set((q) => updateItem(q, s.id, { ordered: true }))
    expect(s.p().symbolicTypes!.ID).toMatchObject({ ordered: true })
  })

  it('conditions compare symbols; order is natural', () => {
    const s = setup()
    const t = s.v(s.t1)
    expect(holds(t, c(s.t1, '<', 't10'), 't2')).toBe(true)
    expect(holds(t, c(s.t1, '≥', 't10'), 't2')).toBe(false)
    expect(holds(s.v(s.id), c(s.id, '=', 'a1'), 'a1')).toBe(true)
    expect(holds(s.v(s.id), c(s.id, '<', 'a1'), 'a0')).toBeNull()
    for (const op of ['=', '≠', '<', '≤', '>', '≥'] as const) {
      const cond = c(s.t1, op, 't5')
      expect(holds(t, cond, pickValue(t, cond))).toBe(true)
      expect(holds(t, cond, pickValue(t, cond, true))).toBe(false)
    }
  })

  it('variables compare only within the same symbolic type', () => {
    const s = setup()
    expect(conditionError(s.v(s.t1), c(s.t1, '<', '', s.t2), s.p())).toBeNull()
    expect(conditionError(s.v(s.t1), c(s.t1, '=', '', s.id), s.p())).toMatch(/different symbolic types/)
    expect(opsForVar(s.v(s.id))).toEqual(['=', '≠'])
    expect(describeStates(s.v(s.t1))).toBe('Timestamp (ordered)')
  })

  it('parameters resolve named types and the file round-trips', () => {
    const s = setup()
    const pa = { name: 'at', type: 'symbolic' as const, states: [], min: null, max: null, unit: '', rangeType: '', enumType: '', symbolicType: 'Timestamp' }
    expect(paramVar(s.p(), pa)).toMatchObject({ ordered: true })
    const q = deserialize(serialize(s.p()))
    expect(q.symbolicTypes).toEqual(s.p().symbolicTypes)
    expect((q.items[s.t1] as Variable).symbolicType).toBe('Timestamp')
  })

  it('monotonic / sequential imply ordered', () => {
    let p = defineSymbolicType(emptyProject(), 'Seq', { ordered: false, sequential: true })
    expect(p.symbolicTypes!.Seq).toMatchObject({ ordered: true, sequential: true })
    p = defineSymbolicType(p, 'Id', { ordered: false, unique: true })
    expect(p.symbolicTypes!.Id).toMatchObject({ ordered: false, unique: true })
  })

  it('traces flag repeated, decreasing and skipped values', () => {
    const s = setup()
    s.set((q) => defineSymbolicType(q, 'Timestamp', { ordered: true, monotonic: true }))
    s.set((q) => defineSymbolicType(q, 'ID', { ordered: false, unique: true }))
    const seq = createItem(s.p(), 'variable', { title: 'Seq', parent: (s.v(s.t1)).parent!, type: 'symbolic' })
    s.set(() => updateItem(seq.project, seq.id, { sequential: true }))
    const step = (values: Record<string, string>) => ({ t: '', values, events: {}, note: '' })
    const trace = { lanes: [s.t1, s.id, seq.id], steps: [
      step({ [s.t1]: 't5', [s.id]: 'a1', [seq.id]: 'n1' }), step({ [s.t1]: 't7', [s.id]: 'a2', [seq.id]: 'n2' }),
      step({ [s.t1]: 't6', [s.id]: 'a1', [seq.id]: 'n4' }),
    ] }
    expect(symbolViolations(s.p(), trace as never).map((x) => [x.step, x.property])).toEqual([[2, 'monotonic'], [2, 'unique'], [2, 'sequential']])
  })
})

describe('named types follow renames and deletes everywhere', () => {
  it('updates control-action params, operation value params and struct fields', () => {
    let p = defineRangeType(emptyProject(), 'Pct', { min: 0, max: 100, unit: '%' })
    p = defineEnumType(p, 'Mode', ['a', 'b'])
    const ca = createItem(p, 'ca', { params: [{ name: 'x', type: 'range', states: [], min: 0, max: 100, unit: '%', rangeType: 'Pct', enumType: '' }] })
    p = ca.project
    const op = createItem(p, 'operation', { params: [{ name: 'm', entity: '', data: { type: 'enum', states: ['a', 'b'], min: null, max: null, unit: '', rangeType: '', enumType: 'Mode' } }] })
    p = defineStructType(op.project, 'S', { fields: [{ ...blankField(), name: 'f', type: 'range', rangeType: 'Pct' }] })
    const read = (q: typeof p) => ({
      ca: (q.items[ca.id] as ItemOf<'ca'>).params[0].rangeType,
      op: (q.items[op.id] as ItemOf<'operation'>).params[0].data!.enumType,
      field: q.structTypes!.S.fields[0].rangeType,
    })
    const renamed = renameEnumType(renameRangeType(p, 'Pct', 'Percent'), 'Mode', 'Gear')
    expect(read(renamed)).toEqual({ ca: 'Percent', op: 'Gear', field: 'Percent' })
    expect(renamed.rangeTypes).toHaveProperty('Percent')
    expect(renamed.rangeTypes).not.toHaveProperty('Pct')
    const gone = deleteEnumType(deleteRangeType(p, 'Pct'), 'Mode')
    expect(read(gone)).toEqual({ ca: '', op: '', field: '' })
  })
})
