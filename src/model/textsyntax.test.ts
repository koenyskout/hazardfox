import { describe, expect, it } from 'vitest'
import { complete, highlight } from './textsyntax'
import { crossingExampleProject } from './crossingExample'

const p = crossingExampleProject()
describe('text syntax', () => {
  it('highlight keeps the text and colours kinds', () => {
    const src = 'some tr1 in Train: Gate position = open and not tr1 approaches Crossing'
    const segs = highlight(p, src)
    expect(segs.map((s) => s.text).join('')).toBe(src)
    const cls = (t: string) => segs.find((s) => s.text === t)?.cls
    expect(cls('some')).toBe('tx-kw')
    expect(cls('Train')).toBe('tx-ent')
    expect(cls('Gate position')).toBe('tx-var')
    expect(cls('and')).toBe('tx-and')
    expect(cls('tr1')).toBe('tx-inst')
  })
  it('never throws', () => { expect(highlight(p, 'a ¤ "open').map((s) => s.text).join('')).toBe('a ¤ "open') })
  it('completes names, keywords and values', () => {
    expect(complete(p, 'Gate po', 7).map((c) => c.text)).toContain('Gate position')
    expect(complete(p, 'x an', 4).map((c) => c.text)).toContain('and')
    const v = complete(p, 'Gate position = ', 16)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((c) => c.kind === 'value')).toBe(true)
  })
})

import { parseExpr, printExpr, num, cmp } from './lang'
describe('incomplete amounts', () => {
  it('print and parse back an empty time amount', () => {
    const e = cmp('≥', { k: 'app', fn: 'heldFor', args: [{ k: 'text', text: 'x' }] }, num('', 's'))
    const t = printExpr(e)
    expect(t).toContain('? s')
    expect(parseExpr(crossingExampleProject(), t)).toEqual(e)
  })
})

import { formatExpr, and, or, namesOf, type Expr } from './lang'
describe('TLA+ block format', () => {
  it('round-trips nested lists and quantifiers', () => {
    const p = crossingExampleProject()
    const vs = namesOf(p).filter(([, id]) => p.items[id].kind === 'variable').slice(0, 4).map(([, id]) => ({ k: 'var', id } as const))
    const ent = namesOf(p).find(([, id]) => p.items[id].kind === 'entity')![1]
    const b = (v: (typeof vs)[number], x: string) => cmp('=', v, num(x))
    const e = and(b(vs[0], 'true'), or(b(vs[1], 'true'), and(b(vs[2], 'true'), b(vs[3], 'true'))), { k: 'quant', q: 'some', name: 'tr2', entity: ent, body: or(b(vs[0], 'false'), b(vs[1], 'false')) }, b(vs[3], 'false'))
    const t = formatExpr(e, (id) => '@[' + id + ']')
    expect(t).toContain('∧ ')
    expect(t).toContain('∨ ')
    expect(t).toMatch(/^∧ ∨ .*\n {2}∨ /m)
    expect(parseExpr(p, t)).toEqual(e)
  })
})

describe('not as a block', () => {
  it('round-trips not over lists and quantifiers', () => {
    const p = crossingExampleProject()
    const vs = namesOf(p).filter(([, id]) => p.items[id].kind === 'variable').slice(0, 3).map(([, id]) => ({ k: 'var', id } as const))
    const ent = namesOf(p).find(([, id]) => p.items[id].kind === 'entity')![1]
    const b = (v: (typeof vs)[number]) => cmp('=', v, num('true'))
    const q: Expr = { k: 'quant', q: 'all', name: 'x', entity: ent, body: or(b(vs[0]), b(vs[1])) }
    const e = and(b(vs[2]), { k: 'not', e: q }, { k: 'not', e: or(b(vs[0]), and(b(vs[1]), b(vs[2]))) }, b(vs[0]))
    const t = formatExpr(e, (id) => '@[' + id + ']')
    expect(t).not.toContain('(')
    expect(parseExpr(p, t)).toEqual(e)
  })
})

describe('unicode and ASCII connectives', () => {
  it('parse alike', () => {
    const p = crossingExampleProject()
    const a = parseExpr(p, 'text("a") and text("b") or text("c")')
    expect(parseExpr(p, 'text("a") ∧ text("b") ∨ text("c")')).toEqual(a)
    expect(parseExpr(p, '/\\ text("a")\n/\\ text("b")')).toEqual(parseExpr(p, '∧ text("a")\n∧ text("b")'))
    expect(formatExpr(a)).toContain('∨')
  })
})
