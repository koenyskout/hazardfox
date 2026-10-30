import { createItem } from './ops'
import { holds, NEGATE } from './traces'
import { itemsOfKind } from './tree'
import { stepOf, valuesOf } from './variables'
import type { Condition, Id, Project, Variable } from './types'

/** Conjunctions of conditions: a context in disjunctive normal form. */
type Dnf = Condition[][]

const key = (c: Condition) => JSON.stringify([c.variable, c.op, c.state, c.to ?? '', [...(c.set ?? [])].sort()])
const dedupe = (cs: Condition[]) => [...new Map(cs.map((c) => [key(c), c])).values()]

/** Whether some assignment satisfies all conditions (checked per variable on its values, or on candidate numbers around the bounds). */
export function consistent(p: Project, cs: Condition[]): boolean {
  const by = new Map<Id, Condition[]>()
  for (const c of cs) by.set(c.variable, [...(by.get(c.variable) ?? []), c])
  for (const [id, group] of by) {
    const v = p.items[id]
    if (v?.kind !== 'variable') continue
    const d = stepOf(v) / 10
    const cand = valuesOf(v) ?? [v.min, v.max, ...group.flatMap((c) => [c.state, c.to ?? ''].filter(Boolean).map(Number).flatMap((x) => [x - d, x, x + d]))]
      .filter((x): x is number => x !== null && Number.isFinite(x)).map(String)
    if (!cand.some((x) => group.every((c) => holds(v, c, x) !== false))) return false
  }
  return true
}

const and = (p: Project, a: Dnf, b: Dnf): Dnf => a.flatMap((x) => b.map((y) => dedupe([...x, ...y]))).filter((x) => consistent(p, x))
/** ¬(c1 ∧ c2 …) = ¬c1 ∨ ¬c2 …; on a two-valued variable, "≠ a" reads better as "= b". */
const not = (p: Project, cs: Condition[]): Dnf => cs.map((c) => {
  const v = p.items[c.variable]
  const vals = v?.kind === 'variable' ? valuesOf(v) : null
  const other = vals?.length === 2 && c.op === '=' ? vals.find((x) => x !== c.state) : undefined
  return [other !== undefined ? { ...c, state: other } : { ...c, op: NEGATE[c.op] }]
})
/** Drop duplicate alternatives and those that contain another one (absorption). */
const simplify = (d: Dnf): Dnf => {
  const ks = d.map((x) => new Set(x.map(key)))
  return d.filter((_, i) => !ks.some((k, j) => j !== i && [...k].every((y) => ks[i].has(y)) && (k.size < ks[i].size || j < i)))
}

/** Values a refined variable can take: those its rules give. */
export const ruleValues = (v: Variable) => [...new Set([...v.rules.map((r) => r.state), v.otherwise].filter(Boolean))]

/** The contexts over v's parts in which v satisfies c (rules are tried in order, so earlier rules for other values must not hold). Null if v has no rules. */
export function expand(p: Project, v: Variable, c: Condition, max = 64): Dnf | null {
  if (!v.rules.length) return null
  const out: Dnf = []
  for (const s of ruleValues(v).filter((x) => holds(v, c, x))) {
    const guard = (upto: number): Dnf => v.rules.slice(0, upto).filter((r) => r.state !== s).reduce<Dnf>((acc, r) => and(p, acc, not(p, r.when)), [[]])
    v.rules.forEach((r, i) => { if (r.state === s) out.push(...and(p, [r.when], guard(i))) })
    if (v.otherwise === s) out.push(...guard(v.rules.length))
    if (out.length > max) break
  }
  return simplify(out).slice(0, max)
}

/** Lower-level UCAs from substituting the rules of the refined variable in condition `index` of a UCA; existing identical refinements are kept. */
export function refineUca(p: Project, uca: Id, index: number): { project: Project; ids: Id[] } {
  const u = p.items[uca]
  const c = u?.kind === 'uca' ? u.conditions[index] : undefined
  const v = c ? p.items[c.variable] : undefined
  if (u?.kind !== 'uca' || !c || v?.kind !== 'variable') return { project: p, ids: [] }
  const rest = u.conditions.filter((_, i) => i !== index)
  const same = (a: Condition[], b: Condition[]) => a.length === b.length && a.every((x) => b.some((y) => key(x) === key(y)))
  const have = itemsOfKind(p, 'uca').filter((x) => x.refines === uca)
  const ids: Id[] = []
  for (const alt of expand(p, v, c) ?? []) {
    const conditions = dedupe([...rest, ...alt])
    if (!consistent(p, conditions)) continue
    const old = have.find((x) => same(x.conditions, conditions))
    if (old) { ids.push(old.id); continue }
    const r = createItem(p, 'uca', { ca: u.ca, guide: u.guide, conditions, context: u.context, hazards: [...u.hazards], refines: uca })
    p = r.project
    ids.push(r.id)
  }
  return { project: p, ids }
}
