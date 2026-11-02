import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { createItem, defineSymbolicType, deleteSymbolicType, renameSymbolicType, updateItem } from './ops'
import { deserialize, serialize } from './serialize'
import { holds, pickValue } from './traces'
import { conditionError, opsFor, opsForVar, describeStates } from './variables'
import { paramVar } from './params'
import type { Condition, Project, Variable } from './types'

const setup = () => {
  let p: Project = emptyProject()
  const ent = createItem(p, 'entity', { title: 'Clock' }); p = ent.project
  p = defineSymbolicType(p, 'Timestamp', { ordered: true, equatable: true })
  p = defineSymbolicType(p, 'ID', { ordered: false, equatable: true })
  const mk = (title: string, symbolicType: string) => { const r = createItem(p, 'variable', { title, parent: ent.id, type: 'symbolic' }); p = updateItem(r.project, r.id, { symbolicType }); return r.id }
  const t1 = mk('Sent at', 'Timestamp'), t2 = mk('Received at', 'Timestamp'), id = mk('Request id', 'ID')
  const v = (i: string) => p.items[i] as Variable
  return { p: () => p, v, t1, t2, id, set: (f: (q: Project) => Project) => { p = f(p) } }
}
const c = (variable: string, op: Condition['op'], state: string, other?: string): Condition => ({ variable, op, state, ...(other !== undefined ? { other } : {}) })

describe('symbolic types', () => {
  it('a named type gives its properties to the variables', () => {
    const s = setup()
    expect(s.v(s.t1)).toMatchObject({ ordered: true, equatable: true })
    expect(s.v(s.id)).toMatchObject({ ordered: false, equatable: true })
    expect(opsFor(s.v(s.t1))).toContain('<')
    expect(opsFor(s.v(s.id))).toEqual(['=', '≠'])
    s.set((q) => defineSymbolicType(q, 'ID', { ordered: true, equatable: false }))
    expect(s.v(s.id)).toMatchObject({ ordered: true, equatable: true }) // ordered implies equatable
    s.set((q) => defineSymbolicType(q, 'ID', { ordered: false, equatable: false }))
    expect(opsFor(s.v(s.id))).toEqual([])
    expect(conditionError(s.v(s.id), c(s.id, '=', 'a'))).toMatch(/cannot be compared/)
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
    expect(s.p().symbolicTypes!.ID).toEqual({ ordered: true, equatable: true })
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
    expect(paramVar(s.p(), pa)).toMatchObject({ ordered: true, equatable: true })
    const q = deserialize(serialize(s.p()))
    expect(q.symbolicTypes).toEqual(s.p().symbolicTypes)
    expect((q.items[s.t1] as Variable).symbolicType).toBe('Timestamp')
  })
})
