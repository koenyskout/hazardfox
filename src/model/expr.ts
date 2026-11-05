import { variableName } from './labels'
import { mention, mentions } from './refs'
import { itemsOfKind } from './tree'
import { NEGATE } from './traces'
import { compareSymbols, conditionError, isEvent, isExpr, isGroup, isOnVariable, isText, isVarCmp, isSetOp, symbolAfter, symbolBefore } from './variables'
import type { Id, Project, Variable } from './types'
import type { Condition, ExprCondition, Group, ValueCondition, VarCondition, When } from './legacy'

/** Arithmetic comparisons ("Gap − 2 × Speed < 5", "Door state = prev(Door state)"): a condition with `text` (variables as `@[id]`) and `expr: true`.
 *  Terms: numbers, symbols, variables, `prev(x)` (value at the previous trace step), `succ(x)` / `pred(x)` (sequential symbols), `+ − ×`, `min` `max` `abs`. */
export type Expr =
  | { k: 'n'; v: string }
  | { k: 'c'; v: string }
  | { k: 'v'; id: Id<'variable'> }
  | { k: 'f'; f: string; a: Expr[] }
  | { k: 'b'; o: '+' | '−' | '×'; l: Expr; r: Expr }
export const CMP_OPS = ['=', '≠', '<', '≤', '>', '≥'] as const
export type CmpOp = (typeof CMP_OPS)[number]
export interface Cmp { l: Expr; op: CmpOp; r: Expr }
const FNS: Record<string, number> = { prev: 1, succ: 1, pred: 1, abs: 1, min: 2, max: 2 }

/** An expression condition: a text condition whose text is a comparison. */

type Tok = { t: 'n' | 'c' | 'v' | 'w' | 'op'; v: string }
type Names = [string, Id<'variable'>][]
/** Variable names (as written) sorted longest first, for reading text that names variables instead of using references. */
export const namesOf = (p: Project, filter: (v: Variable) => boolean = () => true): Names =>
  itemsOfKind(p, 'variable').filter(filter).map((v) => [variableName(p, v).trim(), v.id] as [string, Id<'variable'>]).filter(([n]) => n).sort((a, b) => b[0].length - a[0].length)

function tokens(src: string, names: Names): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if (/^\s/.test(rest)) { i++; continue }
    if ((m = /^@\[([^\]]+)\]/.exec(rest))) { out.push({ t: 'v', v: m[1] }); i += m[0].length; continue }
    const nm = names.find(([n]) => rest.startsWith(n) && !/[\p{L}\p{N}_]/u.test(rest[n.length] ?? ''))
    if (nm) { out.push({ t: 'v', v: nm[1] }); i += nm[0].length; continue }
    if ((m = /^\d+(\.\d+)?/.exec(rest))) { out.push({ t: 'n', v: m[0] }); i += m[0].length; continue }
    if ((m = /^"([^"]*)"/.exec(rest))) { out.push({ t: 'c', v: m[1] }); i += m[0].length; continue }
    if ((m = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(rest))) { out.push({ t: 'w', v: m[0] }); i += m[0].length; continue }
    if ((m = /^(<=|>=|!=|≠|≤|≥|∈|∉|[=<>+\-−×*(),{}])/.exec(rest))) { out.push({ t: 'op', v: ({ '<=': '≤', '>=': '≥', '!=': '≠', '-': '−', '*': '×' } as Record<string, string>)[m[1]] ?? m[1] }); i += m[0].length; continue }
    throw new Error(`unexpected "${rest[0]}"`)
  }
  return out
}

class Parser {
  i = 0
  constructor(readonly ts: Tok[]) {}
  peek = () => this.ts[this.i]
  is = (v: string) => this.peek()?.t === 'op' && this.peek().v === v
  eat = (v: string) => { if (!this.is(v)) throw new Error(`expected "${v}"`); this.i++ }
  sum(): Expr {
    let l = this.prod()
    while (this.is('+') || this.is('−')) { const o = this.ts[this.i++].v as '+' | '−'; l = { k: 'b', o, l, r: this.prod() } }
    return l
  }
  prod(): Expr {
    let l = this.unary()
    while (this.is('×')) { this.i++; l = { k: 'b', o: '×', l, r: this.unary() } }
    return l
  }
  unary(): Expr {
    if (this.is('−')) { this.i++; return { k: 'b', o: '−', l: { k: 'n', v: '0' }, r: this.unary() } }
    return this.atom()
  }
  atom(): Expr {
    const t = this.ts[this.i++]
    if (!t) throw new Error('expression ends too early')
    if (t.t === 'n') return { k: 'n', v: t.v }
    if (t.t === 'v') return { k: 'v', id: t.v }
    if (t.t === 'c') return { k: 'c', v: t.v }
    if (t.t === 'w') {
      if (t.v in FNS && this.is('(')) {
        this.i++
        const a = [this.sum()]
        while (this.is(',')) { this.i++; a.push(this.sum()) }
        this.eat(')')
        if (a.length !== FNS[t.v]) throw new Error(`${t.v} takes ${FNS[t.v]} argument${FNS[t.v] > 1 ? 's' : ''}`)
        return { k: 'f', f: t.v, a }
      }
      return { k: 'c', v: t.v }
    }
    if (t.v === '(') { const e = this.sum(); this.eat(')'); return e }
    throw new Error(`unexpected "${t.v}"`)
  }
}

export type Parsed = { cmp: Cmp } | { between: { v: Id<'variable'>; not: boolean; a: string; b: string } } | { set: { v: Id<'variable'>; not: boolean; of: string[] } }

/** Reads one comparison; `names` also lets variables be written by name. Throws an Error with a readable message. */
export function parseComparison(src: string, names: Names = []): Parsed {
  const ts = tokens(src, names)
  if (!ts.length) throw new Error('empty')
  const w = (k: number, v: string) => ts[k]?.t === 'w' && ts[k].v === v
  const lit = (k: number) => ts[k] && (ts[k].t === 'n' || ts[k].t === 'c' || ts[k].t === 'w') ? ts[k].v : null
  if (ts[0].t === 'v') {
    const not = w(1, 'not'), o = not ? 2 : 1
    if (w(o, 'between') && lit(o + 1) !== null && w(o + 2, 'and') && lit(o + 3) !== null && ts.length === o + 4) return { between: { v: ts[0].v, not, a: lit(o + 1)!, b: lit(o + 3)! } }
    if (((w(o, 'in') || (!not && ts[1]?.t === 'op' && (ts[1].v === '∈' || ts[1].v === '∉'))) && ts.some((x) => x.t === 'op' && x.v === '{'))) {
      const neg = not || ts[1].v === '∉'
      const open = ts.findIndex((x) => x.t === 'op' && x.v === '{')
      if (ts[ts.length - 1].v === '}') return { set: { v: ts[0].v, not: neg, of: ts.slice(open + 1, -1).filter((x) => !(x.t === 'op' && x.v === ',')).map((x) => x.v) } }
    }
  }
  const ps = new Parser(ts)
  const l = ps.sum()
  const t = ps.peek()
  if (!t || t.t !== 'op' || !(CMP_OPS as readonly string[]).includes(t.v)) throw new Error('a comparison needs one of = ≠ < ≤ > ≥')
  ps.i++
  const r = ps.sum()
  if (ps.peek()) throw new Error(`unexpected "${ps.peek().v}"`)
  return { cmp: { l, op: t.v as CmpOp, r } }
}

const PREC = { '+': 1, '−': 1, '×': 2 }
const constText = (v: string) => (/^[\p{L}_][\p{L}\p{N}_.]*$/u.test(v) || /^-?\d+(\.\d+)?$/.test(v) ? v : `"${v}"`)
/** Text of an expression; `name` writes a variable (as a reference `@[id]` when stored). */
export function printExpr(e: Expr, name: (id: Id) => string = mention, parent = 0, right = false): string {
  switch (e.k) {
    case 'n': return e.v
    case 'c': return constText(e.v)
    case 'v': return name(e.id)
    case 'f': return `${e.f}(${e.a.map((x) => printExpr(x, name)).join(', ')})`
    case 'b': {
      const s = `${printExpr(e.l, name, PREC[e.o])} ${e.o} ${printExpr(e.r, name, PREC[e.o], true)}`
      return PREC[e.o] < parent || (PREC[e.o] === parent && right && e.o !== '+' && e.o !== '×') ? `(${s})` : s
    }
  }
}
export const printCmp = (c: Cmp, name?: (id: Id) => string) => `${printExpr(c.l, name)} ${c.op} ${printExpr(c.r, name)}`

const cache = new Map<string, Cmp | null>()
/** The comparison stored in an expression condition (null when it does not read). */
export function cmpOf(c: ExprCondition): Cmp | null {
  const s = c.text
  if (!cache.has(s)) { try { const r = parseComparison(s); cache.set(s, 'cmp' in r ? r.cmp : null) } catch { cache.set(s, null) } }
  return cache.get(s)!
}
export const exprCondition = (cmp: Cmp, name?: (id: Id) => string): ExprCondition => ({ kind: 'expr', text: printCmp(cmp, name) })

// ---- types

type Ty = { t: 'num'; unit: string } | { t: 'sym'; name: string; ordered: boolean; sequential: boolean } | { t: 'enum' | 'bool' } | { t: 'n' | 'c' }
const tyOf = (v: Variable): Ty => v.type === 'range' ? { t: 'num', unit: v.unit.trim() } : v.type === 'symbolic' ? { t: 'sym', name: v.symbolicType, ordered: !!v.ordered, sequential: !!v.sequential } : v.type === 'boolean' ? { t: 'bool' } : { t: 'enum' }

function infer(p: Project, e: Expr): Ty {
  switch (e.k) {
    case 'n': return { t: 'n' }
    case 'c': return { t: 'c' }
    case 'v': {
      const v = p.items[e.id]
      if (v?.kind !== 'variable') throw new Error('a variable no longer exists')
      return tyOf(v)
    }
    case 'f': {
      const a = e.a.map((x) => infer(p, x))
      if (e.f === 'prev') return a[0]
      if (e.f === 'succ' || e.f === 'pred') {
        if (a[0].t !== 'sym' || !a[0].sequential) throw new Error(`${e.f} needs a sequential symbolic type`)
        return a[0]
      }
      const nums = a.filter((x) => x.t === 'num') as { t: 'num'; unit: string }[]
      if (a.some((x) => x.t !== 'num' && x.t !== 'n')) throw new Error(`${e.f} needs numbers`)
      return nums[0] ?? { t: 'n' }
    }
    case 'b': {
      const l = infer(p, e.l), r = infer(p, e.r)
      if ((l.t !== 'num' && l.t !== 'n') || (r.t !== 'num' && r.t !== 'n')) throw new Error(`${e.o} needs numbers`)
      if (l.t === 'num' && r.t === 'num' && e.o !== '×' && l.unit !== r.unit) throw new Error(`units differ: ${l.unit || 'none'} and ${r.unit || 'none'}`)
      return l.t === 'num' ? (e.o === '×' && r.t === 'num' ? { t: 'num', unit: [l.unit, r.unit].filter(Boolean).join('·') } : l) : r
    }
  }
}
/** Why a comparison does not make sense (undefined variable, mismatched types or units, order on unordered symbols), else null. */
export function cmpError(p: Project, c: Cmp): string | null {
  try {
    const l = infer(p, c.l), r = infer(p, c.r)
    const lit = (t: Ty) => t.t === 'n' || t.t === 'c'
    const order = c.op !== '=' && c.op !== '≠'
    if (!lit(l) && !lit(r)) {
      if (l.t !== r.t) return 'both sides must have the same type'
      if (l.t === 'sym' && r.t === 'sym' && l.name !== r.name) return 'different symbolic types'
      if (l.t === 'num' && r.t === 'num' && l.unit !== r.unit) return `units differ: ${l.unit || 'none'} and ${r.unit || 'none'}`
    } else if (lit(l) && lit(r)) return 'compares two constants'
    else {
      const [v, k] = lit(r) ? [l, r] : [r, l]
      if (k.t === 'n' && v.t !== 'num') return 'a number is compared with a non-numeric value'
    }
    if (order) {
      const t = lit(l) ? r : l
      if (t.t === 'sym' ? !t.ordered : t.t !== 'num' && t.t !== 'n') return 'this type has no order'
    }
    return null
  } catch (e) { return (e as Error).message }
}
/** Error of an expression condition (null when fine). */
export function exprError(p: Project, c: ExprCondition): string | null {
  const m = cmpOf(c)
  return m ? cmpError(p, m) : 'does not read as a comparison'
}

// ---- evaluation

export type Val = number | string | null
const num = (x: Val): number | null => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
export function evalExpr(p: Project, e: Expr, get: (id: Id) => string | undefined, prev?: (id: Id) => string | undefined): Val {
  switch (e.k) {
    case 'n': return Number(e.v)
    case 'c': return e.v
    case 'v': {
      const x = get(e.id)
      return x === undefined || x === '' ? null : p.items[e.id]?.kind === 'variable' && (p.items[e.id] as Variable).type === 'range' ? num(x) : x
    }
    case 'f': {
      if (e.f === 'prev') return prev ? evalExpr(p, e.a[0], prev) : null
      const a = e.a.map((x) => evalExpr(p, x, get, prev))
      if (e.f === 'succ' || e.f === 'pred') return typeof a[0] === 'string' ? (e.f === 'succ' ? symbolAfter(a[0]) : symbolBefore(a[0]) || null) : null
      const n = a.map(num)
      if (n.includes(null)) return null
      return e.f === 'abs' ? Math.abs(n[0]!) : e.f === 'min' ? Math.min(...(n as number[])) : Math.max(...(n as number[]))
    }
    case 'b': {
      const l = num(evalExpr(p, e.l, get, prev)), r = num(evalExpr(p, e.r, get, prev))
      return l === null || r === null ? null : e.o === '+' ? l + r : e.o === '−' ? l - r : l * r
    }
  }
}
const ordered = (p: Project, e: Expr): boolean => e.k === 'v' ? (p.items[e.id] as Variable | undefined)?.ordered === true : e.k === 'f' ? e.a.some((x) => ordered(p, x)) : e.k === 'b' ? ordered(p, e.l) || ordered(p, e.r) : false
/** Whether a comparison holds (null when a value is unknown). */
export function cmpHolds(p: Project, c: Cmp, get: (id: Id) => string | undefined, prev?: (id: Id) => string | undefined): boolean | null {
  const l = evalExpr(p, c.l, get, prev), r = evalExpr(p, c.r, get, prev)
  if (l === null || r === null) return null
  const a = num(l), b = num(r)
  if (a !== null && b !== null) return c.op === '=' ? a === b : c.op === '≠' ? a !== b : c.op === '<' ? a < b : c.op === '≤' ? a <= b : c.op === '>' ? a > b : a >= b
  const x = String(l), y = String(r)
  if (c.op === '=') return x === y
  if (c.op === '≠') return x !== y
  if (!ordered(p, c.l) && !ordered(p, c.r)) return null
  const k = compareSymbols(x, y)
  return c.op === '<' ? k < 0 : c.op === '≤' ? k <= 0 : c.op === '>' ? k > 0 : k >= 0
}
/** Whether an expression condition holds: undefined when it does not read. */
export function exprHolds(p: Project, c: ExprCondition, get: (id: Id) => string | undefined, prev?: (id: Id) => string | undefined): boolean | null | undefined {
  const m = cmpOf(c)
  return m ? cmpHolds(p, m, get, prev) : undefined
}
export const exprVars = (c: ExprCondition): Id<'variable'>[] => [...new Set(mentions(c.text))]
/** Variables a condition reads (both sides of a comparison, or those in an expression). */
export const condVars = (c: Condition): Id<'variable'>[] => (isExpr(c) ? exprVars(c) : !isOnVariable(c) ? [] : isVarCmp(c) ? [c.variable, c.other].filter(Boolean) : [c.variable].filter(Boolean))

// ---- plain-text form of a condition tree

const SIMPLE = (c: ValueCondition | VarCondition) => !c.names && !c.time && (!isVarCmp(c) || !c.otherNames)
/** One line for a condition, or null when it needs the rows editor (quantifiers, instance names, timing, events, words). */
export function conditionLine(p: Project, c: Condition): string | null {
  if (isEvent(c) || (isOnVariable(c) && !SIMPLE(c)) || (isText(c) && c.time)) return null
  const name = (id: Id) => { const v = p.items[id]; return v?.kind === 'variable' ? variableName(p, v).trim() : '?' }
  if (isExpr(c)) { const m = cmpOf(c); return m ? printCmp(m, name) : null }
  if (isText(c) || isEvent(c)) return null
  const v = p.items[c.variable]
  if (v?.kind !== 'variable') return null
  const n = name(c.variable), q = (s: string) => constText(s)
  if (isVarCmp(c)) return `${n} ${c.op} ${name(c.other)}`
  if (c.op === 'between' || c.op === 'not between') return `${n} ${c.op} ${q(c.state)} and ${q(c.to ?? '')}`
  if (isSetOp(c.op)) return `${n} ${c.op === 'in' ? '∈' : '∉'} {${(c.set ?? []).map(q).join(', ')}}`
  return `${n} ${c.op} ${q(c.state)}`
}
/** Whether a whole tree can be written as text. */
export const textable = (p: Project, ws: When[]): boolean => ws.every((w) => ('of' in w ? textable(p, w.of) : conditionLine(p, w) !== null))

const HEADER = (g: Group) => (g.not ? 'not:' : g.any ? 'any of:' : 'all of:')
/** The tree as text: `all of:` / `any of:` / `not:` headers, members marked `&` (all of) or `|` (any of). */
export function whenToText(p: Project, ws: When[]): string {
  const lines: string[] = []
  const walk = (w: When, depth: number, mark: string) => {
    const pad = '  '.repeat(depth) + (mark ? mark + ' ' : '')
    if (!('of' in w)) { lines.push(pad + (conditionLine(p, w) ?? '')); return }
    if (w.not && w.of.length === 1 && !('of' in w.of[0])) { lines.push(`${pad}not: ${conditionLine(p, w.of[0]) ?? ''}`); return }
    lines.push(pad + HEADER(w))
    for (const x of w.of) walk(x, depth + 1, w.any ? '|' : '&')
  }
  if (ws.length === 1 && 'of' in ws[0]) walk(ws[0], 0, '')
  else if (ws.length) { lines.push('all of:'); for (const x of ws) walk(x, 1, '&') }
  return lines.join('\n')
}

/** A condition from one line; a comparison of a variable with a constant (or another variable) becomes an ordinary condition, anything else an expression. */
export function lineCondition(p: Project, src: string, names: Names = namesOf(p)): Condition {
  const r = parseComparison(src, names)
  const nameOf = (id: Id) => mention(id)
  const bad = (c: ValueCondition | VarCondition) => { const v = p.items[c.variable]; return v?.kind === 'variable' ? conditionError(v, c, p) : 'unknown variable' }
  let c: Condition
  if ('between' in r) c = { kind: 'value', variable: r.between.v, op: r.between.not ? 'not between' : 'between', state: r.between.a, to: r.between.b }
  else if ('set' in r) c = { kind: 'value', variable: r.set.v, op: r.set.not ? 'not in' : 'in', state: '', set: r.set.of }
  else {
    const { l, op, r: rr } = r.cmp
    const k = (e: Expr): string | null => (e.k === 'n' || e.k === 'c' ? e.v : e.k === 'b' && e.o === '−' && e.l.k === 'n' && e.l.v === '0' && e.r.k === 'n' ? '-' + e.r.v : null)
    if (l.k === 'v' && k(rr) !== null) c = { kind: 'value', variable: l.id, op, state: k(rr)! }
    else if (l.k === 'v' && rr.k === 'v') c = { kind: 'var', variable: l.id, op, other: rr.id }
    else c = exprCondition(r.cmp, nameOf)
  }
  const e = isExpr(c) ? exprError(p, c) : bad(c as ValueCondition | VarCondition)
  if (e) throw new Error(e)
  return c
}

/** The negation of a tree with the negation pushed to the leaves (De Morgan, opposite operators); only leaves without an opposite (timing, events, quantifiers) keep a `not` group. */
export function negate(w: When): When {
  if (isGroup(w)) return w.not ? { kind: 'group', any: false, of: w.of } : { kind: 'group', any: !w.any, of: w.of.map(negate) }
  const m = isExpr(w) ? cmpOf(w) : null
  if (m) return exprCondition({ ...m, op: NEGATE[m.op] as typeof m.op })
  if (isEvent(w) || isExpr(w) || w.time || (isOnVariable(w) && w.names)) return { kind: 'group', any: false, not: true, of: [w] }
  return isText(w) ? { ...w, op: w.op === '=' ? '≠' : '=' } : { ...w, op: NEGATE[w.op] }
}

/** Reads the text form of a tree (markers `&` `|` `-` `and` `or` `∧` `∨` are optional and ignored; nesting is by indentation). */
export function textToWhen(p: Project, text: string): When[] {
  const names = namesOf(p)
  const rows = text.split('\n').map((l) => ({ indent: l.length - l.trimStart().length, body: l.trim().replace(/^(&|\||-|∧|∨|and\b|or\b)\s+/, '') })).filter((r) => r.body)
  let i = 0
  const header = (s: string) => /^(all of|any of|not):$/i.exec(s)?.[1].toLowerCase()
  const parse = (indent: number): When[] => {
    const out: When[] = []
    while (i < rows.length && rows[i].indent >= indent) {
      const row = rows[i++]
      const h = header(row.body)
      if (h) {
        const kids = i < rows.length && rows[i].indent > row.indent ? parse(rows[i].indent) : []
        out.push(h === 'any of' ? { kind: 'group', any: true, of: kids } : h === 'not' ? negate({ kind: 'group', any: false, of: kids }) : { kind: 'group', any: false, of: kids })
      } else if (/^not:\s/i.test(row.body)) out.push(negate(lineCondition(p, row.body.replace(/^not:\s*/i, ''), names)))
      else out.push(lineCondition(p, row.body, names))
    }
    return out
  }
  if (!rows.length) return []
  const top = parse(rows[0].indent)
  return top.length === 1 && 'of' in top[0] && !top[0].any && !top[0].not ? top[0].of : top
}
