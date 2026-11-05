import { createItem } from './ops'
import { holds, NEGATE } from './traces'
import { itemsOfKind } from './tree'
import { cmpOf, exprCondition } from './expr'
import { condKey, nameKey, usesAny, isEvent, isExpr, hasText, isGroup, isText, isValueCmp, isVarCmp, laneText, isMany, declare, nameInstances, stepOf, valuesOf, symbolAfter, symbolBefore } from './variables'
import { rulesOf, otherwiseOf } from './types'
import type { Condition, EndNames, ExprCondition, Quantifier, Id, Project, TextCondition, ValueCondition, Variable, When } from './types'

/** Conjunctions of conditions: a context in disjunctive normal form. */
type Dnf = Condition[][]

const key = (c: Condition) => JSON.stringify(
  isEvent(c) ? ['event', c.event, c.time]
  : isText(c) ? [condKey(c), c.op]
  : isExpr(c) ? [condKey(c)]
  : isVarCmp(c) ? [condKey(c), c.op, c.other, c.otherNames, c.names]
  : [condKey(c), c.op, c.state, c.to, c.names, [...(c.set ?? [])].sort()])
const dedupe = (cs: Condition[]) => [...new Map(cs.map((c) => [key(c), c])).values()]

/** The one quantifier all names a condition declares share (`some` when it declares none); undefined when they differ. */
const commonQuant = (c: ValueCondition): Quantifier | undefined => {
  const qs = new Set((c.names ?? []).flatMap((b) => (b && 'declare' in b ? [b.quant ?? 'some'] : [])))
  return qs.size === 0 ? 'some' : qs.size === 1 ? [...qs][0] : undefined
}
/** The quantification of ¬(Q x … P): the same names with their quantifiers dualised (some ↔ all with the operator negated, one `none` becomes `some`); null when it cannot be written that way. */
const dualNames = (c: ValueCondition): { names: EndNames; negateOp: boolean } | null => {
  const q = commonQuant(c)
  const flip = (to: Quantifier) => (c.names ?? []).map((b) => (b && 'declare' in b ? declare(b.declare, to) : b))
  if (q === 'some') return { names: flip('all'), negateOp: true }
  if (q === 'all') return { names: flip('some'), negateOp: true }
  if (q === 'none' && (c.names ?? []).filter((b) => b && 'declare' in b).length === 1) return { names: flip('some'), negateOp: false }
  return null
}

type Plain = ValueCondition | TextCondition | ExprCondition
/** Whether some assignment satisfies all conditions (checked per variable on its values, or on candidate numbers around the bounds). */
export function consistent(p: Project, cs: Condition[]): boolean {
  const by = new Map<Id, Plain[]>()
  // "some instance" conditions have independent witnesses and cannot conflict; "no instance" is "every instance not".
  // Conditions on the same named instance share a witness and can conflict.
  const norm = (c: Plain): Plain => isValueCmp(c) && commonQuant(c) === 'none' ? { ...c, op: NEGATE[c.op] } : c
  const gkey = (c: Plain) => isValueCmp(c) && nameKey(c.names) ? `${nameKey(c.names)}\u0000${condKey(c)}` : condKey(c)
  const plain = cs.filter((c): c is Plain => !isEvent(c) && !isVarCmp(c) && (hasText(c) || !isValueCmp(c) || !isMany(p, p.items[c.variable] as Variable) || commonQuant(c) !== 'some' || !!nameKey(c.names)))
  for (const c of plain.map(norm)) by.set(gkey(c), [...(by.get(gkey(c)) ?? []), c])
  for (const [id, group] of by) {
    if (laneText(id.split('\u0000').pop()!) !== null) { const op = (c: Plain) => (isText(c) ? c.op : '='); if (!group.every((c) => op(c) === op(group[0]))) return false; continue }
    const v = p.items[id.split('\u0000').pop()!]
    if (v?.kind !== 'variable') continue
    const d = stepOf(v) / 10
    const cand = valuesOf(v) ?? (v.type === 'symbolic' ? group.filter(isValueCmp).flatMap((c) => (c.state ? [symbolBefore(c.state), c.state, symbolAfter(c.state)] : [])).filter(Boolean) : [v.min, v.max, ...group.filter(isValueCmp).flatMap((c) => [c.state, c.to ?? ''].filter(Boolean).map(Number).flatMap((x) => [x - d, x, x + d]))]
      .filter((x): x is number => x !== null && Number.isFinite(x)).map(String))
    if (!cand.some((x) => group.every((c) => !isValueCmp(c) || holds(v, c, x) !== false))) return false
  }
  return true
}

const and = (p: Project, a: Dnf, b: Dnf): Dnf => a.flatMap((x) => b.map((y) => dedupe([...x, ...y]))).filter((x) => consistent(p, x))
/** ¬(c1 ∧ c2 …) = ¬c1 ∨ ¬c2 …; on a two-valued variable, "≠ a" reads better as "= b". */
const not = (p: Project, cs: Condition[]): Dnf => cs.map((c): Condition[] => {
  if (isEvent(c)) return [{ ...c, time: c.time && { ...c.time, op: c.time.op === '≥' ? '<' : '≥' } }]
  if (isExpr(c)) { const m = cmpOf(c); return m ? [exprCondition({ ...m, op: NEGATE[m.op] as typeof m.op })] : [c] }
  if (isText(c)) return [{ ...c, op: c.op === '=' ? '≠' : '=' }]
  if (isVarCmp(c)) return [{ ...c, op: NEGATE[c.op] }]
  const v = p.items[c.variable]
  if (v?.kind === 'variable' && isMany(p, v)) {
    if (usesAny(c.names)) return [{ ...c, op: NEGATE[c.op] }]
    const base = nameInstances(p, [c])[0] as ValueCondition
    const d = dualNames(base)
    return [d ? { ...base, names: d.names, op: d.negateOp ? NEGATE[c.op] : c.op } : c]
  }
  const vals = v?.kind === 'variable' ? valuesOf(v) : null
  const other = vals?.length === 2 && c.op === '=' ? vals.find((x) => x !== c.state) : undefined
  return [other !== undefined ? { ...c, state: other } : { ...c, op: NEGATE[c.op] }]
})
/** A condition tree (or its negation) in DNF. */
const dnf = (p: Project, w: When, neg = false): Dnf => {
  if (!isGroup(w)) return neg ? not(p, [w]) : [[w]]
  if (w.not) return dnf(p, { kind: 'group', any: false, of: w.of }, !neg)
  const parts = w.of.map((x) => dnf(p, x, neg))
  return w.any === neg ? parts.reduce((a, b) => and(p, a, b), [[]]) : simplify(parts.flat())
}
/** Drop duplicate alternatives and those that contain another one (absorption). */
const simplify = (d: Dnf): Dnf => {
  const ks = d.map((x) => new Set(x.map(key)))
  return d.filter((_, i) => !ks.some((k, j) => j !== i && [...k].every((y) => ks[i].has(y)) && (k.size < ks[i].size || j < i)))
}

/** Values a refined variable can take: those its rules give. */
export const ruleValues = (v: Variable) => [...new Set([...rulesOf(v).map((r) => r.state), otherwiseOf(v)].filter(Boolean))]

/** The contexts over v's parts in which v satisfies c (rules are tried in order, so earlier rules for other values must not hold). Null if v has no rules. */
export function expand(p: Project, v: Variable, c: ValueCondition, max = 64): Dnf | null {
  if (!rulesOf(v).length || isMany(p, v)) return null
  const out: Dnf = []
  for (const s of ruleValues(v).filter((x) => holds(v, c, x))) {
    const guard = (upto: number): Dnf => rulesOf(v).slice(0, upto).filter((r) => r.state !== s).reduce<Dnf>((acc, r) => and(p, acc, dnf(p, r.when, true)), [[]])
    rulesOf(v).forEach((r, i) => { if (r.state === s) out.push(...and(p, dnf(p, r.when), guard(i))) })
    if (otherwiseOf(v) === s) out.push(...guard(rulesOf(v).length))
    if (out.length > max) break
  }
  return simplify(out).slice(0, max)
}

/** Lower-level UCAs from substituting the rules of the refined variable in condition `index` of a UCA; existing identical refinements are kept. */
export function refineUca(p: Project, uca: Id, index: number): { project: Project; ids: Id[] } {
  const u = p.items[uca]
  const w = u?.kind === 'uca' ? u.conditions[index] : undefined
  const c = w && !isGroup(w) && isValueCmp(w) ? w : undefined
  const v = c ? p.items[c.variable] : undefined
  if (u?.kind !== 'uca' || !c || v?.kind !== 'variable') return { project: p, ids: [] }
  const rest = u.conditions.filter((_, i) => i !== index)
  const wkey = (x: When) => (isGroup(x) ? JSON.stringify(x) : key(x))
  const same = (a: When[], b: When[]) => a.length === b.length && a.every((x) => b.some((y) => wkey(x) === wkey(y)))
  const have = itemsOfKind(p, 'uca').filter((x) => x.refines === uca)
  const ids: Id[] = []
  for (const alt of expand(p, v, c) ?? []) {
    const conditions: When[] = [...new Map([...rest, ...alt].map((x) => [wkey(x), x])).values()]
    if (!consistent(p, conditions.filter((x): x is Condition => !isGroup(x)))) continue
    const old = have.find((x) => same(x.conditions, conditions))
    if (old) { ids.push(old.id); continue }
    const r = createItem(p, 'uca', { ca: u.ca, guide: u.guide, conditions, context: u.context, hazards: [...u.hazards], refines: uca })
    p = r.project
    ids.push(r.id)
  }
  return { project: p, ids }
}
