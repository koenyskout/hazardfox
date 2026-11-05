import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { cmpError, cmpOf, conditionLine, lineCondition, negate, textToWhen, whenToText, parseComparison, printCmp, exprCondition, isExpr } from './expr'
import { createItem, defineSymbolicType, updateItem } from './ops'
import { clockAt, getter, traceState, whenHolds } from './traces'
import { whenText } from './variables'
import type { Project, Trace, When } from './types'

const setup = () => {
  let p: Project = emptyProject()
  const ent = createItem(p, 'entity', { title: 'Train' }); p = ent.project
  p = defineSymbolicType(p, 'Seq', { ordered: true, sequential: true })
  const mk = (title: string, extra: object) => { const r = createItem(p, 'variable', { title, parent: ent.id, ...extra } as never); p = r.project; return r.id }
  const speed = mk('Speed', { type: 'range', min: 0, max: 100, unit: 'm' })
  const el = mk('Elapsed', { type: 'range', min: 0, max: 100, unit: 's' })
  const gap = mk('Gap', { type: 'range', min: 0, max: 500, unit: 'm' })
  const door = mk('Door state', { type: 'enum', states: ['open', 'closed'] })
  const n = mk('Seq no', { type: 'symbolic' }); p = updateItem(p, n, { symbolicType: 'Seq' })
  return { p, el, speed, gap, door, n }
}
const trace = (steps: Record<string, string>[]): Trace => ({ lanes: [], steps: steps.map((values) => ({ t: '', values, events: [], note: '' })) }) as never

describe('expression conditions', () => {
  it('parses, prints canonically and reads names', () => {
    const s = setup()
    const r = parseComparison('Gap - 2 * Speed < 5', [['Gap', s.gap], ['Speed', s.speed]])
    expect(printCmp((r as never as { cmp: never }).cmp, (id) => (id === s.gap ? 'Gap' : 'Speed'))).toBe('Gap − 2 × Speed < 5')
    expect(() => parseComparison('Gap +', [])).toThrow()
  })

  it('evaluates arithmetic, prev and succ', () => {
    const s = setup()
    const c = lineCondition(s.p, 'Gap − 2 × Speed < 5')
    expect(isExpr(c)).toBe(true)
    const t = trace([{ [s.gap]: '30', [s.speed]: '10' }, { [s.gap]: '30', [s.speed]: '14' }])
    const at = (i: number, w: When) => whenHolds(s.p, w, getter(traceState(s.p, t, i), clockAt(s.p, t, i)))
    expect(at(0, c)).toBe(false)
    expect(at(1, c)).toBe(true)
    const chg = lineCondition(s.p, 'Door state ≠ prev(Door state)')
    const t2 = trace([{ [s.door]: 'open' }, { [s.door]: 'closed' }, { [s.door]: 'closed' }])
    const at2 = (i: number) => whenHolds(s.p, chg, getter(traceState(s.p, t2, i), clockAt(s.p, t2, i)))
    expect([at2(0), at2(1), at2(2)]).toEqual([null, true, false])
    const seq = lineCondition(s.p, 'Seq no = succ(prev(Seq no))')
    const t3 = trace([{ [s.n]: 'n1' }, { [s.n]: 'n2' }])
    expect(whenHolds(s.p, seq, getter(traceState(s.p, t3, 1), clockAt(s.p, t3, 1))))  .toBe(true)
  })

  it('checks types and units', () => {
    const s = setup()
    const err = (src: string) => { try { lineCondition(s.p, src); return null } catch (e) { return (e as Error).message } }
    expect(err('Gap + Elapsed < 5')).toMatch(/units differ/)
    expect(err('Door state < 3')).toBeTruthy()
    expect(err('Gap = Door state')).toBeTruthy()
    expect(err('Gap < 5')).toBeNull()
    expect(cmpError(s.p, cmpOf(exprCondition((parseComparison('Gap − 1 < Elapsed', [['Gap', s.gap], ['Elapsed', s.el]]) as { cmp: never }).cmp))!)).toMatch(/units differ/)
  })

  it('simple comparisons become ordinary conditions', () => {
    const s = setup()
    expect(lineCondition(s.p, 'Speed > 0')).toMatchObject({ variable: s.speed, op: '>', state: '0' })
    expect(lineCondition(s.p, 'Door state ∈ {open, closed}')).toMatchObject({ op: 'in', set: ['open', 'closed'] })
    expect(lineCondition(s.p, 'Gap between 1 and 5')).toMatchObject({ op: 'between', state: '1', to: '5' })
    expect(lineCondition(s.p, 'Gap = Speed' .replace('Speed', 'Gap'))).toMatchObject({ other: s.gap })
  })

  it('round-trips a tree through text and evaluates not', () => {
    const s = setup()
    const text = 'all of:\n  & Speed > 0\n  & any of:\n    | Door state = closed\n    | Gap − 2 × Speed < 5\n  & not: Door state = open'
    const ws = textToWhen(s.p, text)
    expect(whenToText(s.p, ws)).toBe(text.replace('not: Door state = open', 'Door state ≠ open'))
    expect(textToWhen(s.p, 'all of:\n  - Speed > 0\n  and any of:\n    or Door state = closed\n    ∨ Gap − 2 × Speed < 5\n  - not: Door state = open')).toEqual(ws)
    const get = (v: Record<string, string>) => getter(v)
    const ok = { [s.speed]: '3', [s.door]: 'closed', [s.gap]: '100' }
    expect(whenHolds(s.p, { any: false, of: ws }, get(ok))).toBe(true)
    expect(whenHolds(s.p, { any: false, of: ws }, get({ ...ok, [s.door]: 'open' }))).toBe(false)
    expect(whenText(s.p, ws[1] as never)).toContain(' or ')
    // negation is pushed to the leaves; a timed leaf has no opposite and keeps a not group
    const nots = textToWhen(s.p, 'not:\n  & Speed > 0\n  & Door state = open')
    expect(whenToText(s.p, nots)).toBe('any of:\n  | Speed ≤ 0\n  | Door state ≠ open')
    expect(negate({ variable: s.speed, op: '=', state: '1', time: { op: '≥', amount: '1', unit: 's' } })).toMatchObject({ not: true })
    expect(conditionLine(s.p, { variable: s.speed, op: '=', state: '1', time: { op: '≥', amount: '1', unit: 's' } })).toBeNull()
  })
})
