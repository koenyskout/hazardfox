import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { createItem, defineSymbolicType, updateItem } from './ops'
import { and, between, check, checkError, cmp, eq, every, fills, ge, heldFor, holds, inWords, is, isNot, lt, num, oneOf, opsFor, or, not, parseExpr, printExpr, prev, some, succ, tyOfSpec, typeOf, val, variable, add, mul, since, type Ctx, type Env, type Expr, slotType, mapRefs, refsOf } from './lang'
import type { Id, Project } from './types'

const setup = () => {
  let p: Project = emptyProject()
  const mkE = (title: string, extra: object = {}) => { const r = createItem(p, 'entity', { title, ...extra } as never); p = r.project; return r.id }
  const train = mkE('Train', { many: true })
  const mk = (title: string, parent: Id, extra: object) => { const r = createItem(p, 'variable', { title, parent, ...extra } as never); p = r.project; return r.id as Id<'variable'> }
  p = defineSymbolicType(p, 'Seq', { ordered: true, sequential: true })
  const speed = mk('Speed', train, { type: 'range', min: 0, max: 100, unit: 'm' })
  const el = mk('Elapsed', train, { type: 'range', min: 0, max: 100, unit: 's' })
  const gap = mk('Gap', train, { type: 'range', min: 0, max: 500, unit: 'm' })
  const door = mk('Door', train, { type: 'enum', states: ['open', 'closed'] })
  const flag = mk('Flag', train, { type: 'boolean' })
  const n = mk('Seqno', train, { type: 'symbolic' }); p = updateItem(p, n, { symbolicType: 'Seq' })
  const ca = createItem(p, 'ca', { title: 'Brake' } as never); p = ca.project
  return { p, train: train as Id<'entity'>, speed, el, gap, door, flag, n, ca: ca.id as Id<'ca'> }
}
const steps = (rows: { t?: number; v: Record<string, string>; since?: Record<string, number> }[], i: number): Env => ({
  get: (l) => rows[i].v[l],
  before: () => (i > 0 ? steps(rows, i - 1) : null),
  time: rows[i].t ?? null,
  since: (id) => rows[i].since?.[id] ?? null,
})

describe('typed expression language', () => {
  it('types variables, constants and operators', () => {
    const s = setup()
    const c: Ctx = { p: s.p }
    expect(checkError(c, is(s.door, 'open'))).toBeNull()
    expect(checkError(c, is(s.door, 'ajar'))).toMatch(/not one of/)
    expect(checkError(c, lt(variable(s.door), val('open')))).toMatch(/no order/)
    expect(checkError(c, lt(variable(s.speed), num(5)))).toBeNull()
    expect(checkError(c, lt(variable(s.speed), val('fast')))).toMatch(/not a number/)
    expect(check(c, lt(variable(s.speed), num(500))).map((d) => d.level)).toEqual(['warning'])
    expect(checkError(c, eq(variable(s.door), variable(s.speed)))).toMatch(/cannot compare/)
    expect(checkError(c, lt(variable(s.speed), variable(s.el)))).toMatch(/cannot compare/)
    expect(checkError(c, lt(add(variable(s.speed), variable(s.el)), num(1)))).toMatch(/units differ/)
    expect(checkError(c, lt(mul(variable(s.speed), variable(s.el)), num(1)))).toBeNull()
    expect(checkError(c, lt(variable(s.n), val('n3')))).toBeNull()
    expect(checkError(c, eq(variable(s.n), succ(prev(variable(s.n)))))).toBeNull()
    expect(checkError(c, eq(variable(s.door), succ(variable(s.door))))).toMatch(/sequential/)
    expect(checkError(c, variable(s.flag))).toBeNull()
    expect(checkError(c, variable(s.speed))).toMatch(/true \/ false/)
    expect(checkError(c, between(variable(s.speed), num(1), num(5)))).toBeNull()
    expect(checkError(c, oneOf(variable(s.door), 'open', 'closed'))).toBeNull()
    expect(checkError(c, oneOf(variable(s.door), 'open', 'shut'))).toMatch(/not one of/)
    expect(checkError(c, lt(since(s.ca), num(200, 'ms')))).toBeNull()
    expect(checkError(c, ge(heldFor(is(s.door, 'open')), num(5, 's')))).toBeNull()
    expect(checkError(c, ge(heldFor(variable(s.speed)), num(5, 's')))).toMatch(/true \/ false/)
    expect(checkError(c, lt(variable(s.speed), num(5, 's')))).toMatch(/duration/)
    expect(check(c, and(is(s.door, 'open'), { k: 'hole' })).map((d) => d.level)).toEqual(['warning'])
    expect(checkError(c, inWords('the doors are stuck'))).toBeNull()
    expect(checkError(c, inWords(' '))).toMatch(/empty/)
  })

  it('scopes instance names to their quantifier', () => {
    const s = setup()
    const c: Ctx = { p: s.p }
    expect(checkError(c, some('t1', s.train, is(s.door, 'open', 't1')))).toBeNull()
    expect(checkError(c, is(s.door, 'open', 't1'))).toMatch(/not introduced/)
    expect(checkError(c, some('t1', s.train, some('t1', s.train, inWords('x'))))).toMatch(/already/)
    expect(checkError(c, every('t1', s.train, or(is(s.door, 'open', 't1'), not(is(s.flag, 'true', 't1')))))).toBeNull()
  })

  it('evaluates with Kleene logic, prev, heldFor, since and quantifiers', () => {
    const s = setup()
    const c: Ctx = { p: s.p }
    const rows = [{ t: 0, v: { [s.door]: 'open' } }, { t: 2, v: { [s.door]: 'open', [s.speed]: '10' } }, { t: 5, v: { [s.door]: 'closed', [s.speed]: '10' } }]
    const h = (e: Expr, i: number) => holds(c, e, steps(rows, i))
    expect(h(is(s.door, 'open'), 0)).toBe(true)
    expect(h(and(is(s.door, 'open'), lt(variable(s.speed), num(20))), 0)).toBeNull()
    expect(h(and(is(s.door, 'closed'), lt(variable(s.speed), num(20))), 0)).toBe(false)
    expect(h(or(is(s.door, 'open'), lt(variable(s.speed), num(20))), 0)).toBe(true)
    expect(h(not(is(s.door, 'open')), 2)).toBe(true)
    expect(h(eq(variable(s.door), prev(variable(s.door))), 0)).toBeNull()
    expect([1, 2].map((i) => h(isNot(s.door, 'x'), i))).toEqual([true, true])
    expect(h(ge(heldFor(is(s.door, 'open')), num(2, 's')), 1)).toBe(true)
    expect(h(ge(heldFor(is(s.door, 'open')), num(3, 's')), 1)).toBe(false)
    expect(h(ge(heldFor(is(s.door, 'open')), num(3, 's')), 2)).toBe(false)
    expect(h(between(variable(s.speed), num(5), num(15)), 1)).toBe(true)
    expect(h(oneOf(variable(s.door), 'closed', 'ajar'), 2)).toBe(true)
    const withSince = [{ t: 1, v: {}, since: { [s.ca]: 0.1 } }]
    expect(holds(c, lt(since(s.ca), num(200, 'ms')), steps(withSince, 0))).toBe(true)
    const inst: Env = { ...steps([{ v: { [`${s.door}@t1`]: 'open', [`${s.door}@t2`]: 'closed' } }], 0), instances: () => ['t1', 't2'] }
    expect(holds(c, some('x', s.train, is(s.door, 'open', 'x')), inst)).toBe(true)
    expect(holds(c, every('x', s.train, is(s.door, 'open', 'x')), inst)).toBe(false)
    expect(holds(c, { k: 'quant', q: 'none', name: 'x', entity: s.train, body: is(s.door, 'ajar', 'x') }, inst)).toBe(true)
    // no instances seen: the aggregate lane stands in
    expect(holds(c, some('x', s.train, is(s.door, 'open', 'x')), steps([{ v: { [s.door]: 'open' } }], 0))).toBe(true)
    expect(holds(c, inWords('foo'), steps([{ v: { 'text:foo': 'true' } }], 0))).toBe(true)
  })

  it('prints and parses round-trip', () => {
    const s = setup()
    const label = (id: string) => (id === s.door ? 'Door' : id === s.speed ? 'Speed' : id === s.train ? 'Train' : id === s.flag ? 'Flag' : id === s.ca ? 'Brake' : id)
    const cases: Expr[] = [
      is(s.door, 'open'),
      and(is(s.door, 'open'), or(isNot(s.door, 'open'), lt(variable(s.speed), num(5)))),
      not(and(is(s.door, 'open'), variable(s.flag))),
      between(variable(s.speed), num(1), num(5)),
      oneOf(variable(s.door), 'open', 'closed'),
      some('t1', s.train, is(s.door, 'open', 't1')),
      and(some('t1', s.train, is(s.door, 'open', 't1')), is(s.flag, 'true')),
      cmp('≥', heldFor(is(s.door, 'open')), num(5, 's')),
      lt(since(s.ca), num(200, 'ms')),
      lt(add(variable(s.speed), num(2)), mul(num(2), variable(s.speed))),
      inWords('the doors are stuck'),
    ]
    for (const e of cases) {
      const text = printExpr(e, label)
      const names: [string, string][] = [['Door', s.door], ['Speed', s.speed], ['Train', s.train], ['Flag', s.flag], ['Brake', s.ca]]
      expect(parseExpr(s.p, text, names), text).toEqual(e)
      expect(parseExpr(s.p, printExpr(e)), text).toEqual(e) // @[id] form
    }
    expect(() => parseExpr(s.p, 'Speed <')).toThrow()
  })

  it('offers only well-typed choices', () => {
    const s = setup()
    const c: Ctx = { p: s.p, scope: { t1: s.train } }
    expect(opsFor(typeOf(c, variable(s.door)))).toEqual(['=', '≠', 'in'])
    expect(opsFor(typeOf(c, variable(s.speed)))).toContain('between')
    expect(opsFor(typeOf(c, variable(s.n)))).toContain('<')
    expect(opsFor(typeOf(c, variable(s.flag)))).toEqual(['=', '≠'])
    const root = cmp('=', variable(s.door), { k: 'hole' })
    const ty = slotType({ p: s.p }, root, [1])
    expect(ty).toEqual(tyOfSpec(s.p.items[s.door] as never))
    const fs = fills(c, ty)
    expect(fs.filter((f) => f.k === 'const').map((f) => (f as { v: string }).v)).toEqual(['open', 'closed'])
    const vars = fs.filter((f) => f.k === 'var')
    expect(vars.map((v) => (v as { id: string }).id)).toEqual([s.door])
    expect(vars[0]).toMatchObject({ ends: [{ many: true, names: ['t1'] }] })
    expect(fs.some((f) => f.k === 'fn' && f.fn === 'succ')).toBe(false)
    const seq = fills(c, typeOf(c, variable(s.n)))
    expect(seq.some((f) => f.k === 'fn' && f.fn === 'succ')).toBe(true)
    // every offered candidate type-checks
    for (const f of fs) if (f.k === 'var') expect(checkError(c, cmp('=', variable(s.door), variable(f.id, ...(f.ends[0]?.names.slice(0, 1) ?? [])))) ).toBeNull()
  })

  it('walks and rewrites references', () => {
    const s = setup()
    const e = some('t1', s.train, and(is(s.door, 'open', 't1'), lt(since(s.ca), num(1, 's'))))
    expect(refsOf(e).sort()).toEqual([s.train, s.door, s.ca].sort())
    expect(refsOf(mapRefs(e, (id) => (id === s.door ? s.flag : null)))).toContain(s.flag)
  })
})
