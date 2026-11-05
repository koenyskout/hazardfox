import { children, mapChildren, type EventId, type Expr, type Quant } from './lang'
import { nameKey } from './variables'
import type { Comparison, ConditionOp, Id, Lane, TimeBound } from './types'
import { laneAt } from './variables'

/** The shapes of simple conditions (what traces, drafts, diagnosis and refinement understand); anything else is opaque. */
export type Lit =
  | { kind: 'text'; text: string; neg: boolean }
  | { kind: 'value'; id: Id<'variable'>; at: string[]; c: Comparison }
  | { kind: 'var'; id: Id<'variable'>; at: string[]; other: Id<'variable'>; otherAt: string[]; op: ConditionOp }
  | { kind: 'event'; event: EventId }
export interface Binder { q: Quant; entity: Id<'entity'> }
/** A required condition: the expression, its simple shape (if any), a timing bound on it, and the names bound around it. */
export interface Atom { e: Expr; lit: Lit | null; time?: TimeBound; binders: Record<string, Binder> }

const NOT: Record<ConditionOp, ConditionOp> = { '=': '≠', '≠': '=', in: 'not in', 'not in': 'in', '<': '≥', '≥': '<', '≤': '>', '>': '≤', between: 'not between', 'not between': 'between' }
export const negateOp = (op: ConditionOp): ConditionOp => NOT[op]

const lane = (id: string, at: string[] = []) => laneAt(id as Id, at.join('|').replace(/\|+$/, ''))
/** The lane a `var` node reads. */
export const laneOfVar = (e: { id: Id<'variable'>; at?: string[] }): Lane => lane(e.id, e.at)
export { nameKey }

const isConst = (e: Expr): e is Extract<Expr, { k: 'const' }> => e.k === 'const'
const FLIP: Record<string, ConditionOp> = { '<': '>', '≤': '≥', '>': '<', '≥': '≤', '=': '=', '≠': '≠' }
const toVar = (e: Expr): { id: Id<'variable'>; at: string[] } | null => (e.k === 'var' ? { id: e.id, at: e.at ?? [] } : null)

/** The simple shape of a condition expression, if it has one. */
export function litOf(e: Expr): { lit: Lit | null; time?: TimeBound } {
  if (e.k === 'cmp' && e.l.k === 'app' && (e.l.fn === 'heldFor' || e.l.fn === 'since') && isConst(e.r) && (e.op === '≥' || e.op === '<')) {
    const time: TimeBound = { op: e.op, amount: e.r.v, unit: e.r.unit ?? 's' }
    const a = e.l.args[0]
    if (e.l.fn === 'since') return a.k === 'event' ? { lit: { kind: 'event', event: a.id }, time } : { lit: null, time }
    return { ...litOf(a), time }
  }
  if (e.k === 'text') return { lit: { kind: 'text', text: e.text, neg: false } }
  if (e.k === 'not') {
    const x = litOf(e.e).lit
    if (x?.kind === 'text') return { lit: { ...x, neg: !x.neg } }
    if (x?.kind === 'value') return { lit: { ...x, c: { ...x.c, op: NOT[x.c.op] } } }
    if (x?.kind === 'var') return { lit: { ...x, op: NOT[x.op] } }
    return { lit: null }
  }
  if (e.k === 'var') return { lit: { kind: 'value', id: e.id, at: e.at ?? [], c: { op: '=', state: 'true' } } }
  if (e.k === 'between') {
    const v = toVar(e.e)
    return v && isConst(e.lo) && isConst(e.hi) ? { lit: { kind: 'value', ...v, c: { op: 'between', state: e.lo.v, to: e.hi.v } } } : { lit: null }
  }
  if (e.k === 'in') {
    const v = toVar(e.e)
    return v && e.set.every(isConst) ? { lit: { kind: 'value', ...v, c: { op: 'in', state: '', set: e.set.map((x) => (x as { v: string }).v) } } } : { lit: null }
  }
  if (e.k === 'cmp') {
    const l = toVar(e.l), r = toVar(e.r)
    if (l && isConst(e.r)) return { lit: { kind: 'value', ...l, c: { op: e.op, state: e.r.v } } }
    if (r && isConst(e.l)) return { lit: { kind: 'value', ...r, c: { op: FLIP[e.op], state: e.l.v } } }
    if (l && r) return { lit: { kind: 'var', ...l, other: r.id, otherAt: r.at, op: e.op } }
  }
  return { lit: null }
}

/** The expression as a literal: the shape of `lit` back as an expression. */
export function litExpr(l: Lit): Expr {
  switch (l.kind) {
    case 'text': { const t: Expr = { k: 'text', text: l.text }; return l.neg ? { k: 'not', e: t } : t }
    case 'event': return { k: 'hole' }
    case 'var': return { k: 'cmp', op: l.op as never, l: { k: 'var', id: l.id, ...(l.at.some(Boolean) ? { at: l.at } : {}) }, r: { k: 'var', id: l.other, ...(l.otherAt.some(Boolean) ? { at: l.otherAt } : {}) } }
    case 'value': {
      const x: Expr = { k: 'var', id: l.id, ...(l.at.some(Boolean) ? { at: l.at } : {}) }, c = l.c, val = (v: string): Expr => ({ k: 'const', v })
      switch (c.op) {
        case 'between': return { k: 'between', e: x, lo: val(c.state), hi: val(c.to ?? '') }
        case 'not between': return { k: 'not', e: { k: 'between', e: x, lo: val(c.state), hi: val(c.to ?? '') } }
        case 'in': return { k: 'in', e: x, set: (c.set ?? []).map(val) }
        case 'not in': return { k: 'not', e: { k: 'in', e: x, set: (c.set ?? []).map(val) } }
        default: return { k: 'cmp', op: c.op, l: x, r: val(c.state) }
      }
    }
  }
}

/** The conditions an expression requires (its conjuncts; quantifiers are looked through, of an `or` only the first alternative counts; a negated conjunction requires nothing). */
export function requiredAtoms(e: Expr | null, binders: Record<string, Binder> = {}): Atom[] {
  if (!e) return []
  switch (e.k) {
    case 'and': return e.of.flatMap((x) => requiredAtoms(x, binders))
    case 'or': return e.of.length ? requiredAtoms(e.of[0], binders) : []
    case 'quant': return requiredAtoms(e.body, { ...binders, [e.name]: { q: e.q, entity: e.entity } })
    case 'hole': return []
    case 'not': { const x = e.e; return x.k === 'and' || x.k === 'or' || x.k === 'not' || x.k === 'quant' ? [] : [{ e, ...litOf(e), binders }] }
    default: return [{ e, ...litOf(e), binders }]
  }
}
/** Every leaf condition (words, comparisons, …) anywhere in an expression. */
export function leafExprs(e: Expr | null): Expr[] {
  if (!e) return []
  if (e.k === 'and' || e.k === 'or' || e.k === 'not' || e.k === 'quant') return children(e).flatMap(leafExprs)
  return e.k === 'hole' ? [] : [e]
}
/** Words conditions anywhere in an expression, as lanes. */
export const textLanes = (e: Expr | null): string[] => leafExprs(e).flatMap((x) => { const l = litOf(x).lit; return l?.kind === 'text' ? [l.text.trim()] : [] })

/** The names an atom's variable reads that a `none` quantifier binds ("no instance"). */
export const underNone = (a: Atom): boolean => a.lit?.kind === 'value' || a.lit?.kind === 'var' ? a.lit.at.some((n) => a.binders[n]?.q === 'none') : false

/** Every `var` node's lane (for dependency listings). */
export function varsOf(e: Expr | null): Id<'variable'>[] {
  const out: Id<'variable'>[] = []
  const go = (x: Expr) => { if (x.k === 'var') out.push(x.id); children(x).forEach(go) }
  if (e) go(e)
  return [...new Set(out)]
}
export { mapChildren }
