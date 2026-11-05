import { describe, expect, it } from 'vitest'
import { isEvent, isOnVariable, isText, isValueCmp, isVarCmp, renameSame, toValue, toVarCmp, withEnd, withInstanceName } from './variables'
import type { Condition, ValueCondition } from './types'

const val: ValueCondition = { variable: 'v', op: '<', state: '5', quant: 'all', as: 't1', same2: 'c1', time: { op: '≥', amount: '2', unit: 's' } }

describe('condition forms', () => {
  it('tells the forms apart', () => {
    const forms: Condition[] = [val, toVarCmp(val, 'w'), { op: '=', text: 'x' }, { event: 'e' }]
    expect(forms.map((c) => [isValueCmp(c), isVarCmp(c), isText(c), isEvent(c), isOnVariable(c)])).toEqual([
      [true, false, false, false, true], [false, true, false, false, true], [false, false, true, false, false], [false, false, false, true, false],
    ])
  })
  it('converts between value and variable comparison keeping instances and timing', () => {
    const v = toVarCmp(val, '')
    expect(isVarCmp(v)).toBe(true)
    expect(v).toMatchObject({ variable: 'v', other: '', op: '<', quant: 'all', as: 't1', same2: 'c1', time: val.time })
    expect('state' in v).toBe(false)
    const back = toValue(v, { state: '' })
    expect(back).toMatchObject({ variable: 'v', state: '', quant: 'all', as: 't1' })
    expect('other' in back).toBe(false)
  })
  it('names and renames instances', () => {
    expect(withInstanceName(val, 1, 'x')).toMatchObject({ as: 'x' })
    expect(withInstanceName(val, 2, 'y')).toMatchObject({ as2: 'y' })
    expect(withInstanceName({ event: 'e' }, 1, 'x')).toEqual({ event: 'e' })
    const cmp = toVarCmp({ ...val, same: 'a' }, 'w', { oSame: 'a' })
    expect(renameSame(cmp, 'a', 'b')).toMatchObject({ same: 'b', oSame: 'b' })
    expect(withEnd(val, 1, { same: 't0' })).toMatchObject({ as: undefined, same: 't0' })
  })
})
