import { describe, expect, it } from 'vitest'
import { allNames, isEvent, isOnVariable, isText, isValueCmp, isVarCmp, nameAt, renameSame, sidesOf, toValue, toVarCmp, withEnd, withInstanceName } from './variables'
import type { Condition, ValueCondition } from './types'

const val: ValueCondition = { kind: 'value', variable: 'v', op: '<', state: '5', quant: 'all', as: 't1', same2: 'c1', time: { op: '≥', amount: '2', unit: 's' } }

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
    expect(v).toMatchObject({ kind: 'var', variable: 'v', other: '', op: '<', quant: 'all', as: 't1', same2: 'c1', time: val.time })
    expect('state' in v).toBe(false)
    const back = toValue(v, { state: '' })
    expect(back).toMatchObject({ kind: 'value', variable: 'v', state: '', quant: 'all', as: 't1' })
    expect('other' in back).toBe(false)
  })
  it('names and renames instances', () => {
    expect(withInstanceName(val, 1, 'x')).toMatchObject({ as: 'x' })
    expect(withInstanceName(val, 2, 'y')).toMatchObject({ as2: 'y' })
    expect(withInstanceName({ kind: 'event', event: 'e' }, 1, 'x')).toEqual({ kind: 'event', event: 'e' })
    const cmp = toVarCmp({ ...val, same: 'a' }, 'w', { otherAt: { same: 'a' } })
    expect(renameSame(cmp, 'a', 'b')).toMatchObject({ same: 'b', otherAt: { same: 'b' } })
    expect(withEnd(val, 1, { same: 't0' })).toMatchObject({ as: undefined, same: 't0' })
  })
  it('reads the names of both variables of a comparison the same way', () => {
    const cmp = toVarCmp({ ...val, as: 't1' }, 'w', { otherAt: { as2: 'c9', same: 't2' } })
    expect(sidesOf(cmp)).toHaveLength(2)
    expect(sidesOf(val)).toHaveLength(1)
    expect([nameAt(cmp, 1), nameAt(cmp, 2), nameAt(cmp.otherAt!, 1), nameAt(cmp.otherAt!, 2)]).toEqual(['t1', 'c1', 't2', 'c9'])
    expect(allNames(cmp).sort()).toEqual(['c1', 'c9', 't1', 't2'])
    expect(withInstanceName(cmp, 1, 'x', true)).toMatchObject({ as: 't1', otherAt: { as: 'x', same: 't2' } })
  })
})
