import { describe, expect, it } from 'vitest'
import { allNames, isEvent, isOnVariable, isText, isValueCmp, isVarCmp, nameAt, renameSame, sidesOf, toValue, toVarCmp, withBinding, withInstanceName } from './variables'
import type { Condition, ValueCondition } from './types'
import { endName, relName } from './labels'
import { projectBuilder } from './build'
import { deleteItems } from './ops'

const val: ValueCondition = { kind: 'value', variable: 'v', op: '<', state: '5', quant: 'all', names: [{ declare: 't1' }, { use: 'c1' }], time: { op: '≥', amount: '2', unit: 's' } }

describe('condition forms', () => {
  it('tells the forms apart', () => {
    const forms: Condition[] = [val, toVarCmp(val, 'w'), { kind: 'text', op: '=', text: 'x' }, { kind: 'event', event: 'e' }]
    expect(forms.map((c) => [isValueCmp(c), isVarCmp(c), isText(c), isEvent(c), isOnVariable(c)])).toEqual([
      [true, false, false, false, true], [false, true, false, false, true], [false, false, true, false, false], [false, false, false, true, false],
    ])
  })
  it('converts between value and variable comparison keeping instances and timing', () => {
    const v = toVarCmp(val, '')
    expect(isVarCmp(v)).toBe(true)
    expect(v).toMatchObject({ kind: 'var', variable: 'v', other: '', op: '<', quant: 'all', names: [{ declare: 't1' }, { use: 'c1' }], time: val.time })
    expect('state' in v).toBe(false)
    const back = toValue(v, { state: '' })
    expect(back).toMatchObject({ kind: 'value', variable: 'v', state: '', quant: 'all', names: [{ declare: 't1' }, { use: 'c1' }] })
    expect('other' in back).toBe(false)
  })
  it('names and renames instances', () => {
    expect(withInstanceName(val, 0, 'x')).toMatchObject({ names: [{ declare: 'x' }, { use: 'c1' }] })
    expect(withInstanceName(val, 1, 'y')).toMatchObject({ names: [{ declare: 't1' }, { declare: 'y' }] })
    expect(withInstanceName({ kind: 'event', event: 'e' }, 0, 'x')).toEqual({ kind: 'event', event: 'e' })
    const cmp = toVarCmp({ ...val, names: [{ use: 'a' }] }, 'w', { otherNames: [{ use: 'a' }]  })
    expect(renameSame(cmp, 'a', 'b')).toMatchObject({ names: [{ use: 'b' }], otherNames: [{ use: 'b' }]  })
    expect(withBinding(val.names, 0, { use: 't0' })).toEqual([{ use: 't0' }, { use: 'c1' }])
    expect(withBinding([{ declare: 'a' }], 0, null)).toBeUndefined()
  })
  it('reads the names of both variables of a comparison the same way', () => {
    const cmp = toVarCmp({ ...val, names: [{ declare: 't1' }, { use: 'c1' }] }, 'w', { otherNames: [{ use: 't2' }, { declare: 'c9' }]  })
    expect(sidesOf(cmp)).toHaveLength(2)
    expect(sidesOf(val)).toHaveLength(1)
    expect([nameAt(cmp.names, 0), nameAt(cmp.names, 1), nameAt(cmp.otherNames, 0), nameAt(cmp.otherNames, 1)]).toEqual(['t1', 'c1', 't2', 'c9'])
    expect(allNames(cmp).sort()).toEqual(['c1', 'c9', 't1', 't2'])
    expect(withInstanceName(cmp, 0, 'x', true)).toMatchObject({ names: [{ declare: 't1' }, { use: 'c1' }], otherNames: [{ declare: 'x' }, { declare: 'c9' }] })
  })
})

describe('relationship ends', () => {
  it('names an end by its role, by default the entity title; relationships name all ends', () => {
    const b = projectBuilder()
    const a = b.add('entity', { title: 'Driver' }), v = b.add('entity', { title: 'Vehicle' })
    const r = b.add('relationship', { title: 'drives', ends: [{ entity: a, role: '', card: '1' }, { entity: v, role: 'car', card: '*' }] })
    const rel = b.project.items[r]
    if (rel.kind !== 'relationship') throw new Error('kind')
    expect(rel.ends.map((e) => endName(b.project, e))).toEqual(['Driver', 'car'])
    expect(relName(b.project, rel)).toBe('Driver drives car')
  })
  it('deleting an end entity removes the relationship', () => {
    const b = projectBuilder()
    const a = b.add('entity', { title: 'A' }), c = b.add('entity', { title: 'C' }), d = b.add('entity', { title: 'D' })
    const r = b.add('relationship', { title: 'x', ends: [{ entity: a, role: '', card: '1' }, { entity: c, role: '', card: '1' }, { entity: d, role: '', card: '1' }] })
    expect(deleteItems(b.project, [d]).items[r]).toBeUndefined()
  })
})
