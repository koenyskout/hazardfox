import { describe, expect, it } from 'vitest'
import { projectBuilder } from './build'
import { deserialize, serialize } from './serialize'
import { computeLabels } from './labels'
import { updateItem } from './ops'
import { argError } from './params'
import { generateUcaText } from './uca'
import { validate } from './validate'
import type { ControlAction, Param, Uca } from './types'
import { typeSpec } from './create'

const dose: Param = { name: 'dose', ...typeSpec({ type: 'range', min: 0, max: 10, unit: 'mg' }) }
const mode: Param = { name: 'mode', ...typeSpec({ states: ['auto', 'manual'] }) }
function setup() {
  const b = projectBuilder()
  const n = b.add('node', { title: 'Nurse', role: 'controller' })
  const pr = b.add('node', { title: 'Patient', role: 'process' })
  const ca = b.add('ca', { from: n, to: pr, title: 'Set dose', params: [dose, mode] })
  const u = b.add('uca', { ca, guide: 'provided', args: [{ param: 'dose', op: '>', state: '5' }] })
  return { b, ca, u }
}

describe('control action parameters', () => {
  it('appear in the UCA statement', () => {
    const { b, u } = setup()
    expect(generateUcaText(b.project, computeLabels(b.project), b.project.items[u] as Uca)).toBe('Nurse provides Set dose (dose is greater than 5 mg)')
  })
  it('are checked against their type', () => {
    const { b, ca } = setup()
    const c = b.project.items[ca] as ControlAction
    expect(argError(b.project, c, { param: 'dose', op: '>', state: '5' })).toBeNull()
    expect(argError(b.project, c, { param: 'dose', op: '>', state: '50' })).not.toBeNull()
    expect(argError(b.project, c, { param: 'mode', op: '=', state: 'fast' })).not.toBeNull()
    expect(argError(b.project, c, { param: 'speed', op: '=', state: '1' })).toMatch(/not a parameter/)
  })
  it('follow a rename and drop on removal', () => {
    const { b, ca, u } = setup()
    const r = updateItem(b.project, ca, { params: [{ ...dose, name: 'amount' }, mode] })
    expect((r.items[u] as Uca).args[0].param).toBe('amount')
    const d = updateItem(b.project, ca, { params: [mode] })
    expect((d.items[u] as Uca).args).toEqual([])
  })
  it('are validated and saved', () => {
    const { b, ca, u } = setup()
    const bad = updateItem(b.project, u, { args: [{ param: 'speed', op: '=', state: '1' }] })
    expect(validate(bad).some((i) => i.rule === 'arg-invalid')).toBe(true)
    expect(validate(b.project).some((i) => i.rule === 'arg-invalid')).toBe(false)
    const q = deserialize(serialize(b.project))
    expect((q.items[ca] as ControlAction).params).toEqual([dose, mode])
    expect((q.items[u] as Uca).args).toHaveLength(1)
  })
})

describe('parameter types', () => {
  it('flags range, enumeration and symbolic parameters without a named type', () => {
    const { b, ca } = setup()
    const p = b.project
    expect(validate(p).some((i) => i.rule === 'param-type' && i.item === ca)).toBe(true)
    const typed = updateItem(p, ca, { params: [{ ...dose, rangeType: 'Dose' }, { ...mode, type: 'boolean' }] })
    expect(validate({ ...typed, rangeTypes: { Dose: { min: 0, max: 10, unit: 'mg' } } }).some((i) => i.rule === 'param-type')).toBe(false)
  })
})
