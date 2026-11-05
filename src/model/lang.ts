import { isA } from './formal'
import { variableName } from './labels'
import { mention } from './refs'
import { itemsOfKind } from './tree'
import { TIME_UNITS, UNIT_S } from './types'
import type { Id, Project, TimeUnit, TypeSpec, Variable } from './types'
import { aboutOf } from './types'
import { compareSymbols, endsOf, manyEntity, symbolAfter, symbolBefore } from './variables'

/** The typed expression language for conditions (see docs/expression-language.md): one boolean AST for hazard states, UCA contexts, refinement rules and trace checks. */

// ---- types

/** `unit: null` is an unknown unit (result of ×); `any` is the type of an unfinished slot. */
export type Ty =
  | { t: 'any' }
  | { t: 'bool' }
  | { t: 'num'; unit: string | null; min?: number | null; max?: number | null }
  | { t: 'enum'; states: string[] }
  | { t: 'sym'; name: string; ordered: boolean; sequential: boolean }
  | { t: 'inst'; entity: Id<'entity'> }
  | { t: 'event' }

export const BOOL: Ty = { t: 'bool' }
export const ANY: Ty = { t: 'any' }
/** The type of a variable, control-action parameter or struct field. */
export const tyOfSpec = (s: TypeSpec): Ty =>
  s.type === 'boolean' ? BOOL : s.type === 'range' ? { t: 'num', unit: s.unit.trim(), min: s.min, max: s.max } : s.type === 'symbolic' ? { t: 'sym', name: s.symbolicType, ordered: !!s.ordered, sequential: !!s.sequential } : { t: 'enum', states: s.states }
export const isTime = (unit: string | null): boolean => !!unit && (TIME_UNITS as readonly string[]).includes(unit)
const unitOk = (a: string | null, b: string | null) => a === null || b === null || a === b || (isTime(a) && isTime(b))
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
/** Whether a value of type `from` may stand where `to` is expected. */
export function assignable(p: Project, from: Ty, to: Ty): boolean {
  if (from.t === 'any' || to.t === 'any') return true
  if (from.t !== to.t) return false
  switch (from.t) {
    case 'num': return unitOk(from.unit, (to as typeof from).unit)
    case 'enum': return sameSet(from.states, (to as typeof from).states)
    case 'sym': return from.name === (to as typeof from).name
    case 'inst': return isA(p, from.entity, (to as typeof from).entity)
    default: return true
  }
}
export function tyName(t: Ty): string {
  switch (t.t) {
    case 'any': return 'anything'
    case 'bool': return 'true / false'
    case 'num': return t.unit ? `number (${t.unit})` : 'number'
    case 'enum': return `one of ${t.states.join(' | ')}`
    case 'sym': return t.name ? `symbol (${t.name})` : 'symbol'
    case 'inst': return 'an instance'
    case 'event': return 'an event'
  }
}

// ---- nodes

export const CMP_OPS = ['=', '≠', '<', '≤', '>', '≥'] as const
export type CmpOp = (typeof CMP_OPS)[number]
export const FNS = ['+', '−', '×', 'min', 'max', 'abs', 'prev', 'succ', 'pred', 'since', 'heldFor'] as const
export type Fn = (typeof FNS)[number]
const ARITY: Record<Fn, number> = { '+': 2, '−': 2, '×': 2, min: 2, max: 2, abs: 1, prev: 1, succ: 1, pred: 1, since: 1, heldFor: 1 }
export const QUANTS = ['some', 'all', 'none'] as const
export type Quant = (typeof QUANTS)[number]
export type EventId = Id<'ca' | 'feedback' | 'operation'>

export type Expr =
  /** A number, state or symbol; its type comes from the context. `unit` marks a duration ("5 s"). */
  | { k: 'const'; v: string; unit?: TimeUnit }
  /** A variable's value; `at[i]` names the instance of the i-th end of its owner ('' = all instances alike). */
  | { k: 'var'; id: Id<'variable'>; at?: string[] }
  | { k: 'name'; name: string }
  | { k: 'param'; name: string }
  | { k: 'app'; fn: Fn; args: Expr[] }
  | { k: 'cmp'; op: CmpOp; l: Expr; r: Expr }
  | { k: 'between'; e: Expr; lo: Expr; hi: Expr }
  | { k: 'in'; e: Expr; set: Expr[] }
  | { k: 'not'; e: Expr }
  | { k: 'and'; of: Expr[] }
  | { k: 'or'; of: Expr[] }
  | { k: 'quant'; q: Quant; name: string; entity: Id<'entity'>; body: Expr }
  | { k: 'text'; text: string }
  | { k: 'event'; id: EventId }
  | { k: 'hole' }

export const children = (e: Expr): Expr[] => {
  switch (e.k) {
    case 'app': return e.args
    case 'cmp': return [e.l, e.r]
    case 'between': return [e.e, e.lo, e.hi]
    case 'in': return [e.e, ...e.set]
    case 'not': return [e.e]
    case 'and': case 'or': return e.of
    case 'quant': return [e.body]
    default: return []
  }
}
/** The same node with its children replaced by `f(child, index)`. */
export function mapChildren(e: Expr, f: (c: Expr, i: number) => Expr): Expr {
  switch (e.k) {
    case 'app': return { ...e, args: e.args.map(f) }
    case 'cmp': return { ...e, l: f(e.l, 0), r: f(e.r, 1) }
    case 'between': return { ...e, e: f(e.e, 0), lo: f(e.lo, 1), hi: f(e.hi, 2) }
    case 'in': return { ...e, e: f(e.e, 0), set: e.set.map((x, i) => f(x, i + 1)) }
    case 'not': return { ...e, e: f(e.e, 0) }
    case 'and': case 'or': return { ...e, of: e.of.map(f) }
    case 'quant': return { ...e, body: f(e.body, 0) }
    default: return e
  }
}
export const walk = (e: Expr, f: (x: Expr) => void): void => { f(e); children(e).forEach((c) => walk(c, f)) }
/** The node at a path of child indices. */
export const at = (e: Expr, path: number[]): Expr | undefined => path.reduce<Expr | undefined>((x, i) => (x ? children(x)[i] : undefined), e)
/** Replace the node at a path. */
export const replaceAt = (e: Expr, path: number[], to: Expr): Expr => (path.length ? mapChildren(e, (c, i) => (i === path[0] ? replaceAt(c, path.slice(1), to) : c)) : to)
/** Items an expression refers to: variables, events, quantified entities. */
export function refsOf(e: Expr): Id[] {
  const out = new Set<Id>()
  walk(e, (x) => { if (x.k === 'var' || x.k === 'event') out.add(x.id); else if (x.k === 'quant') out.add(x.entity) })
  return [...out]
}
/** Rewrite the ids an expression refers to (`f` returns the new id, or null to leave it). */
export function mapRefs(e: Expr, f: (id: Id) => Id | null): Expr {
  const m = mapChildren(e, (c) => mapRefs(c, f))
  if (m.k === 'var' || m.k === 'event') return { ...m, id: (f(m.id) ?? m.id) as never }
  if (m.k === 'quant') return { ...m, entity: (f(m.entity) ?? m.entity) as Id<'entity'> }
  return m
}

// ---- constructors (examples, tests, editors)

export const num = (v: number | string, unit?: TimeUnit): Expr => ({ k: 'const', v: String(v), ...(unit ? { unit } : {}) })
export const val = (v: string): Expr => ({ k: 'const', v })
export const variable = (id: Id<'variable'>, ...atNames: string[]): Expr => ({ k: 'var', id, ...(atNames.some(Boolean) ? { at: atNames } : {}) })
export const nameRef = (name: string): Expr => ({ k: 'name', name })
export const param = (name: string): Expr => ({ k: 'param', name })
export const app = (fn: Fn, ...args: Expr[]): Expr => ({ k: 'app', fn, args })
export const add = (l: Expr, r: Expr) => app('+', l, r)
export const sub = (l: Expr, r: Expr) => app('−', l, r)
export const mul = (l: Expr, r: Expr) => app('×', l, r)
export const min = (l: Expr, r: Expr) => app('min', l, r)
export const max = (l: Expr, r: Expr) => app('max', l, r)
export const abs = (e: Expr) => app('abs', e)
export const prev = (e: Expr) => app('prev', e)
export const succ = (e: Expr) => app('succ', e)
export const pred = (e: Expr) => app('pred', e)
export const since = (id: EventId): Expr => app('since', { k: 'event', id })
export const heldFor = (e: Expr) => app('heldFor', e)
export const cmp = (op: CmpOp, l: Expr, r: Expr): Expr => ({ k: 'cmp', op, l, r })
export const eq = (l: Expr, r: Expr) => cmp('=', l, r)
export const ne = (l: Expr, r: Expr) => cmp('≠', l, r)
export const lt = (l: Expr, r: Expr) => cmp('<', l, r)
export const le = (l: Expr, r: Expr) => cmp('≤', l, r)
export const gt = (l: Expr, r: Expr) => cmp('>', l, r)
export const ge = (l: Expr, r: Expr) => cmp('≥', l, r)
/** `variable = state` / `variable ≠ state` (the commonest condition). */
export const is = (id: Id<'variable'>, state: string, ...atNames: string[]): Expr => eq(variable(id, ...atNames), val(state))
export const isNot = (id: Id<'variable'>, state: string, ...atNames: string[]): Expr => ne(variable(id, ...atNames), val(state))
export const between = (e: Expr, lo: Expr, hi: Expr): Expr => ({ k: 'between', e, lo, hi })
export const oneOf = (e: Expr, ...set: string[]): Expr => ({ k: 'in', e, set: set.map(val) })
export const and = (...of: Expr[]): Expr => ({ k: 'and', of })
export const or = (...of: Expr[]): Expr => ({ k: 'or', of })
export const not = (e: Expr): Expr => ({ k: 'not', e })
export const inWords = (text: string): Expr => ({ k: 'text', text })
export const quant = (q: Quant, name: string, entity: Id<'entity'>, body: Expr): Expr => ({ k: 'quant', q, name, entity, body })
export const some = (name: string, entity: Id<'entity'>, body: Expr) => quant('some', name, entity, body)
export const every = (name: string, entity: Id<'entity'>, body: Expr) => quant('all', name, entity, body)
export const none = (name: string, entity: Id<'entity'>, body: Expr) => quant('none', name, entity, body)
export const HOLE: Expr = { k: 'hole' }

// ---- typing

/** What is in scope for typing: instance names bound by quantifiers (name → entity) and control-action parameters. */
export interface Ctx { p: Project; scope?: Record<string, Id<'entity'>>; params?: Record<string, Ty> }
export interface Diag { path: number[]; msg: string; level: 'error' | 'warning' }

/** The ends of what a variable is about: its owner's, or for a signal / belief those of the world variable it designates. */
function ownerEnds(p: Project, v: Variable) {
  const w = v.layer === 'domain' ? v : aboutOf(v) ? p.items[aboutOf(v)!] : undefined
  return w?.kind === 'variable' ? endsOf(p, w) : []
}

const isConst = (e: Expr) => e.k === 'const' || e.k === 'hole'

function infer(ctx: Ctx, e: Expr, path: number[], d: Diag[], expect: Ty = ANY): Ty {
  const { p } = ctx
  const err = (msg: string, level: Diag['level'] = 'error') => d.push({ path, msg, level })
  const sub = (x: Expr, i: number, ex: Ty = ANY) => infer(ctx, x, [...path, i], d, ex)
  const want = (x: Expr, i: number, ex: Ty): Ty => {
    const t = sub(x, i, ex)
    if (!assignable(p, t, ex)) d.push({ path: [...path, i], msg: `expected ${tyName(ex)}, found ${tyName(t)}`, level: 'error' })
    return t
  }
  /** Two operands of one type: the non-constant one fixes the type of a constant one. */
  const pair = (a: Expr, b: Expr, ia: number, ib: number): [Ty, Ty] => {
    if (isConst(a) && !isConst(b)) { const tb = sub(b, ib); return [sub(a, ia, tb), tb] }
    const ta = sub(a, ia)
    return [ta, sub(b, ib, ta)]
  }
  const nums = (...ts: Ty[]) => ts.every((t) => t.t === 'num' || t.t === 'any')
  switch (e.k) {
    case 'const': {
      if (e.unit) {
        if (!Number.isFinite(Number(e.v))) err(`"${e.v}" is not a number`)
        if (expect.t !== 'any' && !(expect.t === 'num' && (expect.unit === null || isTime(expect.unit)))) err(`a duration is not ${tyName(expect)}`)
        return { t: 'num', unit: e.unit }
      }
      switch (expect.t) {
        case 'any': return ANY
        case 'bool': if (e.v !== 'true' && e.v !== 'false') err(`"${e.v}" is not true or false`); return expect
        case 'num':
          if (e.v.trim() === '' || !Number.isFinite(Number(e.v))) err(`"${e.v}" is not a number`)
          else if ((expect.min != null && Number(e.v) < expect.min) || (expect.max != null && Number(e.v) > expect.max)) err(`${e.v} is outside the range ${expect.min ?? '…'}–${expect.max ?? '…'}`, 'warning')
          return expect
        case 'enum': if (!expect.states.includes(e.v)) err(`"${e.v}" is not one of ${expect.states.join(', ')}`); return expect
        case 'sym': if (!e.v.trim()) err('empty symbol'); return expect
        default: err(`a constant is not ${tyName(expect)}`); return expect
      }
    }
    case 'var': {
      const v = p.items[e.id]
      if (v?.kind !== 'variable') { err('a variable no longer exists'); return ANY }
      const ends = ownerEnds(p, v)
      ;(e.at ?? []).forEach((n, i) => {
        if (!n) return
        const end = ends[i]
        if (!end) return err(`${variableName(p, v)} has no end ${i + 1} to name`)
        if (!end.many) return err(`end ${i + 1} of ${variableName(p, v)} has a single instance and cannot be named`)
        const ent = ctx.scope?.[n]
        if (!ent) return err(`${n} is not introduced by a quantifier`)
        if (!isA(p, ent, end.entity as Id<'entity'>)) err(`${n} is not a ${p.items[end.entity]?.title || 'matching entity'}`)
      })
      if ((e.at?.length ?? 0) > ends.length) err('more instance names than ends')
      return tyOfSpec(v)
    }
    case 'name': { const ent = ctx.scope?.[e.name]; if (!ent) { err(`${e.name} is not introduced by a quantifier`); return ANY } return { t: 'inst', entity: ent } }
    case 'param': { const t = ctx.params?.[e.name]; if (!t) { err(`no parameter ${e.name}`); return ANY } return t }
    case 'app': {
      if (e.args.length !== ARITY[e.fn]) { err(`${e.fn} takes ${ARITY[e.fn]} argument${ARITY[e.fn] > 1 ? 's' : ''}`); return ANY }
      const [a, b] = e.args
      switch (e.fn) {
        case '+': case '−': case 'min': case 'max': {
          const [ta, tb] = pair(a, b, 0, 1)
          if (!nums(ta, tb)) { d.push({ path, msg: `${e.fn} needs numbers`, level: 'error' }); return { t: 'num', unit: null } }
          const ua = ta.t === 'num' ? ta.unit : null, ub = tb.t === 'num' ? tb.unit : null
          if (!unitOk(ua, ub)) err(`units differ: ${ua || 'none'} and ${ub || 'none'}`)
          return { t: 'num', unit: ua ?? ub }
        }
        case '×': {
          const [ta, tb] = pair(a, b, 0, 1)
          if (!nums(ta, tb)) err('× needs numbers')
          return { t: 'num', unit: null }
        }
        case 'abs': { const t = want(a, 0, { t: 'num', unit: null }); return t.t === 'num' ? t : { t: 'num', unit: null } }
        case 'prev': return sub(a, 0, expect)
        case 'succ': case 'pred': {
          const t = sub(a, 0)
          if (t.t !== 'any' && !(t.t === 'sym' && t.sequential)) err(`${e.fn} needs a sequential symbolic type`)
          return t
        }
        case 'since': want(a, 0, { t: 'event' }); return { t: 'num', unit: 's' }
        case 'heldFor': want(a, 0, BOOL); return { t: 'num', unit: 's' }
      }
      return ANY
    }
    case 'cmp': {
      const [tl, tr] = pair(e.l, e.r, 0, 1)
      if (isConst(e.l) && isConst(e.r) && e.l.k === 'const' && e.r.k === 'const') err('compares two constants')
      if (!assignable(p, tl, tr) && !assignable(p, tr, tl)) err(`cannot compare ${tyName(tl)} with ${tyName(tr)}`)
      const t = tl.t === 'any' ? tr : tl
      if (e.op !== '=' && e.op !== '≠' && !(t.t === 'any' || t.t === 'num' || (t.t === 'sym' && t.ordered))) err(`${tyName(t)} has no order`)
      return BOOL
    }
    case 'between': {
      const t = sub(e.e, 0)
      if (!(t.t === 'any' || t.t === 'num' || (t.t === 'sym' && t.ordered))) err(`${tyName(t)} has no order`)
      want(e.lo, 1, t); want(e.hi, 2, t)
      return BOOL
    }
    case 'in': {
      const t = sub(e.e, 0)
      if (t.t === 'bool' || t.t === 'inst' || t.t === 'event') err(`"in" does not apply to ${tyName(t)}`)
      e.set.forEach((x, i) => want(x, i + 1, t))
      return BOOL
    }
    case 'not': want(e.e, 0, BOOL); return BOOL
    case 'and': case 'or': e.of.forEach((x, i) => want(x, i, BOOL)); return BOOL
    case 'quant': {
      const ent = p.items[e.entity]
      if (ent?.kind !== 'entity') err('a quantifier needs an entity')
      else if (!manyEntity(p, ent.id)) err(`${ent.title || 'the entity'} has a single instance`)
      if (!e.name.trim()) err('a quantifier needs a name')
      else if (ctx.scope?.[e.name]) err(`${e.name} is already introduced`)
      infer({ ...ctx, scope: { ...ctx.scope, [e.name]: e.entity } }, e.body, [...path, 0], d, BOOL)
        .t !== 'bool' && d.push({ path: [...path, 0], msg: 'the body must be true / false', level: 'error' })
      return BOOL
    }
    case 'text': if (!e.text.trim()) err('empty text'); return BOOL
    case 'event': { const k = p.items[e.id]?.kind; if (k !== 'ca' && k !== 'feedback' && k !== 'operation') err('not a control action, feedback or operation'); return { t: 'event' } }
    case 'hole': err('incomplete', 'warning'); return expect
  }
}

/** Problems of a condition: it must be true / false. Holes give a warning (incomplete), everything else an error. */
export function check(ctx: Ctx, e: Expr): Diag[] {
  const d: Diag[] = []
  const t = infer(ctx, e, [], d, BOOL)
  if (!assignable(ctx.p, t, BOOL)) d.push({ path: [], msg: `a condition must be true / false, found ${tyName(t)}`, level: 'error' })
  return d
}
/** The first error message, or null when the condition is well typed and complete enough. */
export const checkError = (ctx: Ctx, e: Expr): string | null => check(ctx, e).find((x) => x.level === 'error')?.msg ?? null
export function typeOf(ctx: Ctx, e: Expr, expect: Ty = ANY): Ty { return infer(ctx, e, [], [], expect) }

// ---- type-directed editing: what may go where

/** Scope at a path: the names the quantifiers on the way down introduce. */
export function scopeAt(ctx: Ctx, root: Expr, path: number[]): Ctx {
  let scope = { ...ctx.scope }
  let x: Expr | undefined = root
  for (const i of path) {
    if (!x) break
    if (x.k === 'quant') scope = { ...scope, [x.name]: x.entity }
    x = children(x)[i]
  }
  return { ...ctx, scope }
}
/** The type the slot at `path` expects (any when anything may go there, e.g. the left side of a comparison). */
export function slotType(ctx: Ctx, root: Expr, path: number[]): Ty {
  if (!path.length) return BOOL
  const parent = at(root, path.slice(0, -1))
  const i = path[path.length - 1]
  if (!parent) return ANY
  const c = scopeAt(ctx, root, path.slice(0, -1))
  switch (parent.k) {
    case 'not': case 'and': case 'or': case 'quant': return BOOL
    case 'cmp': return i === 1 ? typeOf(c, parent.l) : ANY
    case 'between': return i === 0 ? ANY : typeOf(c, parent.e)
    case 'in': return i === 0 ? ANY : typeOf(c, parent.e)
    case 'app':
      switch (parent.fn) {
        case 'since': return { t: 'event' }
        case 'heldFor': return BOOL
        case 'abs': return { t: 'num', unit: null }
        case 'succ': case 'pred': case 'prev': return ANY
        default: return i === 1 ? typeOf(c, parent.args[0]) : { t: 'num', unit: null }
      }
    default: return ANY
  }
}
/** Operators that may follow a left side of this type. */
export const opsFor = (t: Ty): readonly (CmpOp | 'between' | 'in')[] =>
  t.t === 'num' ? ['=', '≠', '<', '≤', '>', '≥', 'between', 'in'] : t.t === 'sym' ? (t.ordered ? ['=', '≠', '<', '≤', '>', '≥', 'between', 'in'] : ['=', '≠', 'in']) : t.t === 'enum' ? ['=', '≠', 'in'] : t.t === 'bool' ? ['=', '≠'] : t.t === 'inst' ? ['=', '≠'] : []
export type Candidate =
  | { k: 'var'; id: Id<'variable'>; ends: { end: number; entity: Id<'entity'>; many: boolean; names: string[] }[] }
  | { k: 'const'; v: string }
  | { k: 'number'; min: number | null; max: number | null; unit: string | null }
  | { k: 'duration' }
  | { k: 'symbol' }
  | { k: 'name'; name: string }
  | { k: 'param'; name: string }
  | { k: 'fn'; fn: Fn; args: number }
/** Everything that may fill a slot of type `ty` (always well typed): variables with the instance names their ends accept, constants, instance names, parameters, functions. */
export function fills(ctx: Ctx, ty: Ty): Candidate[] {
  const { p } = ctx
  const out: Candidate[] = []
  for (const v of itemsOfKind(p, 'variable')) {
    if (!assignable(p, tyOfSpec(v), ty)) continue
    const ends = ownerEnds(p, v).map((e, end) => ({ end, entity: e.entity as Id<'entity'>, many: e.many, names: e.many ? Object.entries(ctx.scope ?? {}).filter(([, ent]) => isA(p, ent, e.entity as Id<'entity'>)).map(([n]) => n) : [] }))
    out.push({ k: 'var', id: v.id, ends })
  }
  if (ty.t === 'bool') out.push({ k: 'const', v: 'true' }, { k: 'const', v: 'false' })
  if (ty.t === 'enum') ty.states.forEach((v) => out.push({ k: 'const', v }))
  if (ty.t === 'num') { out.push({ k: 'number', min: ty.min ?? null, max: ty.max ?? null, unit: ty.unit }); if (isTime(ty.unit) || ty.unit === null) out.push({ k: 'duration' }) }
  if (ty.t === 'sym') out.push({ k: 'symbol' })
  if (ty.t === 'any' || ty.t === 'inst') for (const [name, entity] of Object.entries(ctx.scope ?? {})) if (assignable(p, { t: 'inst', entity }, ty)) out.push({ k: 'name', name })
  for (const [name, t] of Object.entries(ctx.params ?? {})) if (assignable(p, t, ty)) out.push({ k: 'param', name })
  const fnResult: [Fn, boolean][] = [['+', ty.t === 'num'], ['−', ty.t === 'num'], ['×', ty.t === 'num'], ['min', ty.t === 'num'], ['max', ty.t === 'num'], ['abs', ty.t === 'num'], ['prev', true], ['succ', ty.t === 'sym' && ty.sequential], ['pred', ty.t === 'sym' && ty.sequential], ['since', ty.t === 'num' && (isTime(ty.unit) || ty.unit === null)], ['heldFor', ty.t === 'num' && (isTime(ty.unit) || ty.unit === null)]]
  for (const [fn, ok] of fnResult) if (ok || ty.t === 'any') out.push({ k: 'fn', fn, args: ARITY[fn] })
  return out
}

// ---- evaluation

export type Val = number | string | boolean | null
/** One trace step as seen by an expression. `get` reads a lane (`<variable>` or `<variable>@<instances>`, `text:<words>`). */
export interface Env {
  get(lane: string): string | undefined
  /** The step before (for `prev`, `heldFor`). */
  before?(): Env | null
  /** Step time in seconds (null: unknown). */
  time?: number | null
  /** Seconds since the event last occurred (null: unknown). */
  since?(id: EventId): number | null
  /** The instances of an entity known at this step; none: the aggregate lane stands for them. */
  instances?(entity: Id<'entity'>): string[]
  param?(name: string): string | undefined
}
type Bind = Record<string, string>

const laneFor = (id: Id, at: string[] | undefined, bind: Bind): string => {
  const names = (at ?? []).map((n) => (n ? bind[n] ?? '' : ''))
  while (names.length && !names[names.length - 1]) names.pop()
  return names.length ? `${id}@${names.join('|')}` : id
}
const tyUnit = (ctx: Ctx, e: Expr): string | null => { const t = infer(ctx, e, [], []); return t.t === 'num' ? t.unit : null }
const secs = (unit: string | null | undefined) => (isTime(unit ?? null) ? UNIT_S[unit as TimeUnit] : 1)
const numeric = (x: Val): number | null => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null)
const kleeneAnd = (xs: (boolean | null)[]): boolean | null => (xs.includes(false) ? false : xs.includes(null) ? null : true)
const kleeneOr = (xs: (boolean | null)[]): boolean | null => (xs.includes(true) ? true : xs.includes(null) ? null : false)
const asBool = (v: Val): boolean | null => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : null)

/** Value of an expression at a step: numbers (times in seconds), strings, booleans (three-valued: null = unknown). */
export function evalExpr(ctx: Ctx, e: Expr, env: Env, bind: Bind = {}, wantUnit: string | null = null): Val {
  const { p } = ctx
  const ev = (x: Expr, u: string | null = null) => evalExpr(ctx, x, env, bind, u)
  const evb = (x: Expr) => asBool(ev(x))
  switch (e.k) {
    case 'const': {
      if (e.unit) return Number(e.v) * UNIT_S[e.unit]
      if (e.v === 'true' || e.v === 'false') return e.v === 'true'
      const n = Number(e.v)
      return e.v.trim() !== '' && Number.isFinite(n) ? n * secs(wantUnit) : e.v
    }
    case 'var': {
      const v = p.items[e.id]
      if (v?.kind !== 'variable') return null
      let raw = env.get(laneFor(e.id, e.at, bind))
      if ((raw === undefined || raw === '') && e.at?.some(Boolean)) raw = env.get(e.id)
      if (raw === undefined || raw === '') return null
      if (v.type === 'range') { const n = numeric(raw); return n === null ? null : n * secs(v.unit.trim()) }
      return v.type === 'boolean' ? raw === 'true' : raw
    }
    case 'name': return bind[e.name] ?? null
    case 'param': return env.param?.(e.name) ?? null
    case 'event': return null
    case 'hole': return null
    case 'text': { const raw = env.get('text:' + e.text.trim()); return raw === 'true' ? true : raw === 'false' ? false : null }
    case 'app': {
      const a = e.args[0]
      switch (e.fn) {
        case 'prev': { const pe = env.before?.(); return pe ? evalExpr(ctx, a, pe, bind, wantUnit) : null }
        case 'succ': case 'pred': { const x = ev(a); return typeof x === 'string' ? (e.fn === 'succ' ? symbolAfter(x) : symbolBefore(x) || null) : null }
        case 'since': return a.k === 'event' ? env.since?.(a.id) ?? null : null
        case 'heldFor': {
          if (evb(a) !== true) return evb(a) === null ? null : 0
          if (env.time == null) return null
          let start = env.time
          for (let s = env.before?.() ?? null; s && evalExpr(ctx, a, s, bind) === true; s = s.before?.() ?? null) { if (s.time == null) return null; start = s.time }
          return env.time - start
        }
        default: {
          const u = e.args.filter((x) => !isConst(x)).map((x) => tyUnit(ctx, x)).find((x) => x !== null) ?? wantUnit
          const n = e.args.map((x) => numeric(ev(x, u)))
          if (n.includes(null)) return null
          const [x, y] = n as number[]
          return e.fn === '+' ? x + y : e.fn === '−' ? x - y : e.fn === '×' ? x * y : e.fn === 'abs' ? Math.abs(x) : e.fn === 'min' ? Math.min(x, y) : Math.max(x, y)
        }
      }
    }
    case 'cmp': {
      const u = isConst(e.l) ? tyUnit(ctx, e.r) : tyUnit(ctx, e.l)
      const l = ev(e.l, u), r = ev(e.r, u)
      if (l === null || r === null) return null
      return compare(ctx, e.op, l, r, e.l, e.r)
    }
    case 'between': {
      const u = tyUnit(ctx, e.e)
      const x = ev(e.e, u), lo = ev(e.lo, u), hi = ev(e.hi, u)
      if (x === null || lo === null || hi === null) return null
      const a = compare(ctx, '≥', x, lo, e.e, e.lo), b = compare(ctx, '≤', x, hi, e.e, e.hi)
      return kleeneAnd([a, b])
    }
    case 'in': {
      const u = tyUnit(ctx, e.e)
      const x = ev(e.e, u)
      if (x === null) return null
      return kleeneOr(e.set.map((s) => { const y = ev(s, u); return y === null ? null : compare(ctx, '=', x, y, e.e, s) }))
    }
    case 'not': { const b = evb(e.e); return b === null ? null : !b }
    case 'and': return kleeneAnd(e.of.map(evb))
    case 'or': return kleeneOr(e.of.map(evb))
    case 'quant': {
      // different names of one entity stand for different instances
      const taken = Object.entries(ctx.scope ?? {}).filter(([n, en]) => n in bind && isA(p, en, e.entity) || n in bind && isA(p, e.entity, en)).map(([n]) => bind[n])
      const all = env.instances?.(e.entity) ?? []
      const inst = all.filter((x) => !taken.includes(x))
      if (all.length && !inst.length) return null
      const rs = (inst.length ? inst : ['']).map((i) => asBool(evalExpr({ ...ctx, scope: { ...ctx.scope, [e.name]: e.entity } }, e.body, env, { ...bind, [e.name]: i })))
      if (e.q === 'all') return kleeneAnd(rs)
      const any = kleeneOr(rs)
      return e.q === 'some' ? any : any === null ? null : !any
    }
  }
}
function compare(ctx: Ctx, op: CmpOp, l: Val, r: Val, el: Expr, er: Expr): boolean | null {
  const a = typeof l === 'boolean' || typeof r === 'boolean' ? null : numeric(l), b = numeric(r)
  if (a !== null && b !== null) return op === '=' ? a === b : op === '≠' ? a !== b : op === '<' ? a < b : op === '≤' ? a <= b : op === '>' ? a > b : a >= b
  const x = String(l), y = String(r)
  if (op === '=') return x === y
  if (op === '≠') return x !== y
  const t = tyOfSide(ctx, el), s = tyOfSide(ctx, er)
  if (!(t.t === 'sym' && t.ordered) && !(s.t === 'sym' && s.ordered)) return null
  const k = compareSymbols(x, y)
  return op === '<' ? k < 0 : op === '≤' ? k <= 0 : op === '>' ? k > 0 : k >= 0
}
const tyOfSide = (ctx: Ctx, e: Expr) => infer(ctx, e, [], [])
/** Whether a condition holds at a step (null: unknown). */
export const holds = (ctx: Ctx, e: Expr, env: Env): boolean | null => asBool(evalExpr(ctx, e, env))

// ---- text

type NameEntry = [string, Id]
/** Names (as written) of the items a text may mention, longest first. */
export function namesOf(p: Project): NameEntry[] {
  const out: NameEntry[] = []
  for (const v of itemsOfKind(p, 'variable')) out.push([variableName(p, v).trim(), v.id])
  for (const k of ['entity', 'ca', 'feedback', 'operation'] as const) for (const x of itemsOfKind(p, k)) out.push([x.title.trim(), x.id])
  return out.filter(([n]) => n).sort((a, b) => b[0].length - a[0].length)
}
type Tok = { t: 'num' | 'str' | 'word' | 'ref' | 'op'; v: string }
const WORD = /^[\p{L}_][\p{L}\p{N}_.]*/u
function tokens(src: string, names: NameEntry[]): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if (/^\s/.test(rest)) { i++; continue }
    if ((m = /^@\[([^\]]+)\]/.exec(rest))) { out.push({ t: 'ref', v: m[1] }); i += m[0].length; continue }
    const nm = names.find(([n]) => rest.startsWith(n) && !/[\p{L}\p{N}_]/u.test(rest[n.length] ?? ''))
    if (nm) { out.push({ t: 'ref', v: nm[1] }); i += nm[0].length; continue }
    if ((m = /^\d+(\.\d+)?/.exec(rest))) { out.push({ t: 'num', v: m[0] }); i += m[0].length; continue }
    if ((m = /^"([^"]*)"/.exec(rest))) { out.push({ t: 'str', v: m[1] }); i += m[0].length; continue }
    if ((m = WORD.exec(rest))) { out.push({ t: 'word', v: m[0] }); i += m[0].length; continue }
    if ((m = /^(<=|>=|!=|≠|≤|≥|[=<>+\-−×*(),{}:?@|$])/.exec(rest))) { out.push({ t: 'op', v: ({ '<=': '≤', '>=': '≥', '!=': '≠', '-': '−', '*': '×' } as Record<string, string>)[m[1]] ?? m[1] }); i += m[0].length; continue }
    throw new Error(`unexpected "${rest[0]}"`)
  }
  return out
}

class Parser {
  i = 0
  scope = new Set<string>()
  constructor(readonly p: Project, readonly ts: Tok[]) {}
  peek = () => this.ts[this.i]
  isOp = (v: string) => this.peek()?.t === 'op' && this.peek().v === v
  isWord = (v: string) => this.peek()?.t === 'word' && this.peek().v === v
  eat = (v: string) => { if (!this.isOp(v)) throw new Error(`expected "${v}"${this.peek() ? `, found "${this.peek().v}"` : ''}`); this.i++ }
  or(): Expr {
    const of = [this.and()]
    while (this.isWord('or')) { this.i++; of.push(this.and()) }
    return of.length === 1 ? of[0] : { k: 'or', of }
  }
  and(): Expr {
    const of = [this.not()]
    while (this.isWord('and')) { this.i++; of.push(this.not()) }
    return of.length === 1 ? of[0] : { k: 'and', of }
  }
  not(): Expr {
    if (this.isWord('not')) { this.i++; return { k: 'not', e: this.not() } }
    const t = this.peek()
    if (t?.t === 'word' && (t.v === 'some' || t.v === 'all' || t.v === 'no') && this.ts[this.i + 1]?.t === 'word' && this.ts[this.i + 2]?.v === 'in') return this.quant()
    return this.cmp()
  }
  quant(): Expr {
    const w = this.ts[this.i++].v
    const name = this.ts[this.i++].v
    this.i++ // in
    const t = this.ts[this.i++]
    const ent = t?.t === 'ref' ? this.p.items[t.v] : undefined
    if (ent?.kind !== 'entity') throw new Error('a quantifier needs an entity')
    this.eat(':')
    const had = this.scope.has(name)
    this.scope.add(name)
    const body = this.or()
    if (!had) this.scope.delete(name)
    return { k: 'quant', q: w === 'some' ? 'some' : w === 'all' ? 'all' : 'none', name, entity: ent.id, body }
  }
  cmp(): Expr {
    const l = this.sum()
    const t = this.peek()
    if (t?.t === 'op' && (CMP_OPS as readonly string[]).includes(t.v)) { this.i++; return { k: 'cmp', op: t.v as CmpOp, l, r: this.sum() } }
    const neg = this.isWord('not') && ['between', 'in'].includes(this.ts[this.i + 1]?.v)
    if (neg) this.i++
    let r: Expr | null = null
    if (this.isWord('between')) { this.i++; const lo = this.sum(); if (!this.isWord('and')) throw new Error('expected "and"'); this.i++; r = { k: 'between', e: l, lo, hi: this.sum() } }
    else if (this.isWord('in')) {
      this.i++; this.eat('{')
      const set = [this.sum()]
      while (this.isOp(',')) { this.i++; set.push(this.sum()) }
      this.eat('}')
      r = { k: 'in', e: l, set }
    }
    return r ? (neg ? { k: 'not', e: r } : r) : l
  }
  sum(): Expr {
    let l = this.prod()
    while (this.isOp('+') || this.isOp('−')) { const o = this.ts[this.i++].v as '+' | '−'; l = { k: 'app', fn: o, args: [l, this.prod()] } }
    return l
  }
  prod(): Expr {
    let l = this.unary()
    while (this.isOp('×')) { this.i++; l = { k: 'app', fn: '×', args: [l, this.unary()] } }
    return l
  }
  unary(): Expr {
    if (this.isOp('−')) { this.i++; return { k: 'app', fn: '−', args: [{ k: 'const', v: '0' }, this.unary()] } }
    return this.atom()
  }
  atom(): Expr {
    const t = this.ts[this.i++]
    if (!t) throw new Error('expression ends too early')
    if (t.t === 'num') {
      const u = this.peek()
      if (u?.t === 'word' && (TIME_UNITS as readonly string[]).includes(u.v)) { this.i++; return { k: 'const', v: t.v, unit: u.v as TimeUnit } }
      return { k: 'const', v: t.v }
    }
    if (t.t === 'str') return { k: 'const', v: t.v }
    if (t.t === 'ref') {
      const it = this.p.items[t.v]
      if (it?.kind === 'variable') {
        if (!this.isOp('@')) return { k: 'var', id: it.id }
        this.i++
        const at: string[] = []
        for (;;) {
          const n = this.peek()
          if (n?.t === 'word' || n?.t === 'ref') { at.push(n.t === 'word' ? n.v : (this.p.items[n.v]?.title ?? n.v)); this.i++ } else at.push('')
          if (this.isOp('|')) { this.i++; continue }
          break
        }
        return { k: 'var', id: it.id, at }
      }
      if (it?.kind === 'ca' || it?.kind === 'feedback' || it?.kind === 'operation') return { k: 'event', id: it.id }
      throw new Error(`${it?.title || t.v} cannot be used here`)
    }
    if (t.t === 'word') {
      if (t.v === 'true' || t.v === 'false') return { k: 'const', v: t.v }
      if (t.v === 'text' && this.isOp('(')) { this.i++; const s = this.ts[this.i++]; if (s?.t !== 'str') throw new Error('text( needs "words"'); this.eat(')'); return { k: 'text', text: s.v } }
      if ((FNS as readonly string[]).includes(t.v) && this.isOp('(')) {
        this.i++
        const args = [this.or()]
        while (this.isOp(',')) { this.i++; args.push(this.or()) }
        this.eat(')')
        const fn = t.v as Fn
        if (args.length !== ARITY[fn]) throw new Error(`${fn} takes ${ARITY[fn]} argument${ARITY[fn] > 1 ? 's' : ''}`)
        return { k: 'app', fn, args }
      }
      if (this.scope.has(t.v)) return { k: 'name', name: t.v }
      return { k: 'const', v: t.v }
    }
    if (t.v === '(') { const e = this.or(); this.eat(')'); return e }
    if (t.v === '?') return { k: 'hole' }
    if (t.v === '$') { const n = this.ts[this.i++]; if (n?.t !== 'word') throw new Error('$ needs a parameter name'); return { k: 'param', name: n.v } }
    throw new Error(`unexpected "${t.v}"`)
  }
}

/** Read a condition from text (`@[id]` references or names as written); throws an Error with a readable message. Not type checked: use `check`. */
export function parseExpr(p: Project, src: string, names: NameEntry[] = namesOf(p)): Expr {
  const ts = tokens(src, names)
  if (!ts.length) throw new Error('empty')
  const ps = new Parser(p, ts)
  const e = ps.or()
  if (ps.peek()) throw new Error(`unexpected "${ps.peek().v}"`)
  return e
}

const PREC: Record<string, number> = { quant: 0, or: 1, and: 2, not: 3, cmp: 4, between: 4, in: 4, '+': 5, '−': 5, '×': 6 }
const precOf = (e: Expr) => (e.k === 'app' ? PREC[e.fn] ?? 7 : PREC[e.k] ?? 7)
const constText = (e: Extract<Expr, { k: 'const' }>) => (e.unit ? `${e.v} ${e.unit}` : /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(e.v) || /^-?\d+(\.\d+)?$/.test(e.v) ? e.v : `"${e.v}"`)
/** Text of an expression; `name` writes the item an id refers to (as a reference `@[id]` by default, as a label in the UI). */
export function printExpr(e: Expr, name: (id: Id) => string = mention, parent = 0, last = true): string {
  const sub = (x: Expr, prec: number, l = true) => printExpr(x, name, prec, l)
  let s: string
  switch (e.k) {
    case 'const': return constText(e)
    case 'var': { const at = [...(e.at ?? [])]; while (at.length && !at[at.length - 1]) at.pop(); return name(e.id) + (at.length ? '@' + at.join('|') : '') }
    case 'name': return e.name
    case 'param': return '$' + e.name
    case 'text': return `text("${e.text}")`
    case 'event': return name(e.id)
    case 'hole': return '?'
    case 'app':
      if (e.fn === '+' || e.fn === '−' || e.fn === '×') {
        const pr = PREC[e.fn]
        s = `${sub(e.args[0], pr)} ${e.fn} ${sub(e.args[1], pr + 1)}`
        return pr < parent ? `(${s})` : s
      }
      return `${e.fn}(${e.args.map((x) => sub(x, 0)).join(', ')})`
    case 'cmp': s = `${sub(e.l, 5)} ${e.op} ${sub(e.r, 5)}`; break
    case 'between': s = `${sub(e.e, 5)} between ${sub(e.lo, 5)} and ${sub(e.hi, 5)}`; break
    case 'in': s = `${sub(e.e, 5)} in {${e.set.map((x) => sub(x, 5)).join(', ')}}`; break
    case 'not': s = `not ${sub(e.e, 4)}`; break
    case 'and': s = e.of.length ? e.of.map((x, i) => sub(x, 3, i === e.of.length - 1)).join(' and ') : 'true'; break
    case 'or': s = e.of.length ? e.of.map((x, i) => sub(x, 2, i === e.of.length - 1)).join(' or ') : 'false'; break
    case 'quant': s = `${e.q === 'some' ? 'some' : e.q === 'all' ? 'all' : 'no'} ${e.name} in ${name(e.entity)}: ${sub(e.body, 0)}`; break
  }
  const pr = precOf(e)
  return pr < parent || (e.k === 'quant' && !last) ? `(${s})` : s
}
