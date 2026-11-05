import { createItem } from './ops'
import { holds } from './traces'
import { itemsOfKind } from './tree'
import { litExpr, litOf, negateOp, requiredAtoms, type Atom, type Binder } from './atoms'
import { and, mapChildren, quant, type Expr } from './lang'
import { isMany, laneText, stepOf, textLane, valuesOf, symbolAfter, symbolBefore } from './variables'
import { rulesOf, otherwiseOf } from './types'
import type { Comparison, Id, Project, Variable } from './types'

/** Conjunctions of literals: a context in disjunctive normal form (quantifiers are pulled out front while normalising). */
type Dnf = Expr[][]
interface Binding extends Binder { name: string }

const key = (e: Expr) => JSON.stringify(e)
const dedupe = (cs: Expr[]) => [...new Map(cs.map((c) => [key(c), c])).values()]

/** Whether some assignment satisfies all required conditions (checked per variable on its values, or on candidate numbers around the bounds).
 *  Conditions on the same named instance share a witness; "no instance" is "every instance not". */
export function consistent(p: Project, atoms: Atom[]): boolean {
  const by = new Map<string, { v?: Variable; cs: Comparison[]; words?: boolean[] }>()
  for (const a of atoms) {
    const l = a.lit
    if (a.time || !l) continue
    if (l.kind === 'text') {
      const k = textLane(l.text)
      const g = by.get(k) ?? { cs: [], words: [] }
      g.words!.push(l.neg); by.set(k, g)
    } else if (l.kind === 'value') {
      const v = p.items[l.id]
      if (v?.kind !== 'variable') continue
      const none = l.at.some((n) => a.binders[n]?.q === 'none')
      const k = l.id + '@' + l.at.join('|')
      const g = by.get(k) ?? { v, cs: [] }
      g.cs.push(none ? { ...l.c, op: negateOp(l.c.op) } : l.c); by.set(k, g)
    }
  }
  for (const [k, g] of by) {
    if (laneText(k) !== null) { if (!g.words!.every((x) => x === g.words![0])) return false; continue }
    const v = g.v!
    const d = stepOf(v) / 10
    const cand = valuesOf(v) ?? (v.type === 'symbolic' ? g.cs.flatMap((c) => (c.state ? [symbolBefore(c.state), c.state, symbolAfter(c.state)] : [])).filter(Boolean) : [v.min, v.max, ...g.cs.flatMap((c) => [c.state, c.to ?? ''].filter(Boolean).map(Number).flatMap((x) => [x - d, x, x + d]))]
      .filter((x): x is number => x !== null && Number.isFinite(x)).map(String))
    if (!cand.some((x) => g.cs.every((c) => holds(v, c, x) !== false))) return false
  }
  return true
}
const asAtoms = (es: Expr[], binders: Record<string, Binder> = {}): Atom[] => es.map((e) => ({ e, ...litOf(e), binders }))

const conj = (p: Project, a: Dnf, b: Dnf, bind: Record<string, Binder>): Dnf => a.flatMap((x) => b.map((y) => dedupe([...x, ...y]))).filter((x) => consistent(p, asAtoms(x, bind)))

/** The negation of one literal; on a two-valued variable, "≠ a" reads better as "= b". */
function negateLit(p: Project, e: Expr): Expr {
  if (e.k === 'not') return e.e
  if (e.k === 'cmp' && e.l.k === 'app' && (e.l.fn === 'heldFor' || e.l.fn === 'since')) return { ...e, op: e.op === '≥' ? '<' : '≥' }
  const { lit } = litOf(e)
  if (lit?.kind === 'text') return litExpr({ ...lit, neg: !lit.neg })
  if (lit?.kind === 'var') return litExpr({ ...lit, op: negateOp(lit.op) })
  if (lit?.kind === 'value') {
    const v = p.items[lit.id]
    const vals = v?.kind === 'variable' ? valuesOf(v) : null
    const other = vals?.length === 2 && lit.c.op === '=' ? vals.find((x) => x !== lit.c.state) : undefined
    return litExpr({ ...lit, c: other !== undefined ? { ...lit.c, state: other } : { ...lit.c, op: negateOp(lit.c.op) } })
  }
  return { k: 'not', e }
}

const names = (e: Expr): string[] => { const out: string[] = []; const go = (x: Expr) => { if (x.k === 'var') out.push(...(x.at ?? [])); else if (x.k === 'name') out.push(x.name); mapChildren(x, (c) => (go(c), c)) }; go(e); return out.filter(Boolean) }
const rename = (e: Expr, from: string, to: string): Expr => {
  const m = mapChildren(e, (c) => rename(c, from, to))
  if (m.k === 'var' && m.at?.includes(from)) return { ...m, at: m.at.map((n) => (n === from ? to : n)) }
  if (m.k === 'name' && m.name === from) return { ...m, name: to }
  if (m.k === 'quant' && m.name === from) return m
  return m
}

/** A condition (or its negation) in DNF: quantifiers are pulled in front (`all` / `some`; `none` is "all … not"), names renamed apart. */
function dnf(p: Project, e: Expr, neg: boolean, prefix: Binding[]): Dnf {
  const lits = (x: Expr): Expr[][] => [[x]]
  switch (e.k) {
    case 'not': return dnf(p, e.e, !neg, prefix)
    case 'and': case 'or': {
      const conjunctive = (e.k === 'and') !== neg
      const parts = e.of.map((x) => dnf(p, x, neg, prefix))
      const bind = Object.fromEntries(prefix.map((b) => [b.name, b]))
      return conjunctive ? parts.reduce((a, b) => conj(p, a, b, bind), [[]] as Dnf) : simplify(parts.flat())
    }
    case 'quant': {
      const q = e.q === 'none' ? (neg ? 'some' : 'all') : neg ? (e.q === 'some' ? 'all' : 'some') : e.q
      const bodyNeg = e.q === 'none' ? !neg : neg
      let name = e.name, body = e.body
      const taken = new Set([...prefix.map((b) => b.name), ...names(body)])
      if (prefix.some((b) => b.name === name)) { let n = 2; while (taken.has(name + n)) n++; body = rename(body, name, name + n); name += n }
      prefix.push({ q, name, entity: e.entity })
      return dnf(p, body, bodyNeg, prefix)
    }
    case 'hole': return lits(e)
    default: return lits(neg ? negateLit(p, e) : e)
  }
}
/** Drop duplicate alternatives and those that contain another one (absorption). */
const simplify = (d: Dnf): Dnf => {
  const ks = d.map((x) => new Set(x.map(key)))
  return d.filter((_, i) => !ks.some((k, j) => j !== i && [...k].every((y) => ks[i].has(y)) && (k.size < ks[i].size || j < i)))
}
/** One alternative as an expression, with the quantifiers of the names it uses around it. */
function build(prefix: Binding[], alt: Expr[]): Expr {
  const used = new Set(alt.flatMap(names))
  let e: Expr = alt.length === 1 ? alt[0] : and(...alt)
  for (const b of [...prefix].reverse()) if (used.has(b.name)) e = quant(b.q, b.name, b.entity, e)
  return e
}

/** Values a refined variable can take: those its rules give. */
export const ruleValues = (v: Variable) => [...new Set([...rulesOf(v).map((r) => r.state), otherwiseOf(v)].filter(Boolean))]

/** The contexts over v's parts in which v satisfies c (rules are tried in order, so earlier rules for other values must not hold). Null if v has no rules. */
export function expand(p: Project, v: Variable, c: Comparison, max = 64): Expr[] | null {
  if (!rulesOf(v).length || isMany(p, v)) return null
  const out: { prefix: Binding[]; alt: Expr[] }[] = []
  const rules = rulesOf(v)
  for (const s of ruleValues(v).filter((x) => holds(v, c, x))) {
    const guard = (upto: number, prefix: Binding[]): Dnf => rules.slice(0, upto).filter((r) => r.state !== s).reduce<Dnf>((acc, r) => conj(p, acc, dnf(p, r.when, true, prefix), Object.fromEntries(prefix.map((b) => [b.name, b]))), [[]])
    const mine = (prefix: Binding[], d: Dnf) => d.forEach((alt) => out.push({ prefix, alt }))
    rules.forEach((r, i) => {
      if (r.state !== s) return
      const prefix: Binding[] = []
      const own = dnf(p, r.when, false, prefix)
      mine(prefix, conj(p, own, guard(i, prefix), Object.fromEntries(prefix.map((b) => [b.name, b]))))
    })
    if (otherwiseOf(v) === s) { const prefix: Binding[] = []; mine(prefix, guard(rules.length, prefix)) }
    if (out.length > max) break
  }
  const seen = new Set<string>()
  return out.slice(0, max).map((o) => build(o.prefix, o.alt)).filter((e) => !seen.has(key(e)) && seen.add(key(e)))
}

/** Flatten nested conjunctions and drop repeated members. */
const flat = (e: Expr): Expr => {
  if (e.k !== 'and') return mapChildren(e, flat)
  return and(...dedupe(e.of.map(flat).flatMap((x) => (x.k === 'and' ? x.of : [x]))))
}

/** Lower-level UCAs from substituting the rules of the refined variable in the condition at `path` of a UCA's context; existing identical refinements are kept. */
export function refineUca(p: Project, uca: Id, path: number[]): { project: Project; ids: Id[] } {
  const u = p.items[uca]
  if (u?.kind !== 'uca' || !u.when) return { project: p, ids: [] }
  const at = (e: Expr, path: number[]): Expr | undefined => path.reduce<Expr | undefined>((x, i) => (x?.k === 'and' ? x.of[i] : x?.k === 'quant' ? x.body : undefined), e)
  const target = at(u.when, path)
  const c = target ? litOf(target).lit : null
  const v = c?.kind === 'value' ? p.items[c.id] : undefined
  if (c?.kind !== 'value' || v?.kind !== 'variable') return { project: p, ids: [] }
  const replaceAt = (e: Expr, path: number[], to: Expr): Expr => !path.length ? to : e.k === 'and' ? and(...e.of.map((x, i) => (i === path[0] ? replaceAt(x, path.slice(1), to) : x))) : e.k === 'quant' ? { ...e, body: replaceAt(e.body, path.slice(1), to) } : e
  const used = new Set(names(u.when))
  const have = itemsOfKind(p, 'uca').filter((x) => x.refines === uca)
  const ids: Id[] = []
  for (const alt of expand(p, v, c.c) ?? []) {
    // names of the alternative clash with those already in the context: rename apart
    let a = alt
    for (const n of new Set(names(alt))) if (used.has(n)) { let k = 2; while (used.has(n + k)) k++; a = rename(a, n, n + k) }
    const when = flat(replaceAt(u.when, path, a))
    if (!consistent(p, requiredAtoms(when))) continue
    const old = have.find((x) => x.when && key(x.when) === key(when))
    if (old) { ids.push(old.id); continue }
    const r = createItem(p, 'uca', { ca: u.ca, guide: u.guide, when, context: u.context, hazards: [...u.hazards], refines: uca })
    p = r.project
    ids.push(r.id)
  }
  return { project: p, ids }
}
