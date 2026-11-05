// The former condition hierarchy. Kept only as an authoring format for the example builders and old tests;
// stored conditions are `Expr`s (lang.ts); `whenToExpr` (bridge.ts) converts.
import { autoName, isOnVariable, leaves, manyEndsOf, nameAt, withBinding } from './variables'
import type { Comparison, ConditionOp, Id, Project, Quantifier, TimeBound } from './types'

/** Condition tree: all (`any` false) or any of its conditions and nested groups hold; with `not` the group is negated (not all of its members hold). */
export interface Group { kind: 'group'; any: boolean; of: When[]; not?: boolean }
export type When = Condition | Group

/** Shared by every form of condition: how long it must have held (needs numeric step times in traces). With an event condition, the time since that event instead. */
interface CondBase { time?: TimeBound }
/** What a condition does with the name of one instance: `declare` introduces the name, ranging over the instances as `quant` says (default `some`); `use` refers to an instance declared by another condition of the same context (the same instance, not just some). Different names of one entity are different instances. */
export type Binding = { declare: string; quant?: Quantifier } | { use: string }
/** Bindings of the many ends of a variable, in order (an entity variable has one; a relationship variable one per many end); `null` leaves an end unnamed. */
export type EndNames = (Binding | null)[]
/** The names a condition gives to / takes from the instances of its variable. */
export interface InstanceNames { names?: EndNames }
/** A variable compared with a constant: `state` is the value, `to` the upper bound of `between`, `set` the states of `in` / `not in`. */
export interface ValueCondition extends CondBase, Comparison, InstanceNames { kind: 'value'; variable: Id<'variable'> }
/** A variable compared with the value of `other` (ops `=`, `≠` and, for numbers, `<` `≤` `>` `≥`). */
export interface VarCondition extends CondBase, InstanceNames {
  kind: 'var'
  variable: Id<'variable'>
  op: ConditionOp
  other: Id<'variable'>
  /** Names for the instances of the compared variable, e.g. speed of t1 > speed of t2 */
  otherNames?: EndNames
}
/** A condition in words: it holds (`=`) or not (`≠`); traces treat it as a boolean lane keyed by its text. */
export interface TextCondition extends CondBase { kind: 'text'; text: string; op: '=' | '≠' }
/** An arithmetic comparison (variables as `@[id]`, `prev(x)`, `+ − ×`, `min/max/abs`, `= ≠ < ≤ > ≥`) in canonical text, see `model/expr.ts`. */
export interface ExprCondition extends CondBase { kind: 'expr'; text: string }
/** A timing condition on an event: the time since this control action / feedback last occurred (`time` says how long). It has no variable. */
export interface EventCondition extends CondBase { kind: 'event'; event: Id<'ca' | 'feedback' | 'operation'> }
export type Condition = ValueCondition | VarCondition | TextCondition | ExprCondition | EventCondition

/** Every instance a condition introduces gets a name, so conditions and traces can always refer to it. */
export function nameInstances(p: Project, ws: When[]): When[] {
  const copy = (w: When): When => (w.kind === 'group' ? { ...w, of: w.of.map(copy) } : { ...w })
  const out = ws.map(copy)
  const all = out.flatMap(leaves)
  for (const c of all) {
    if (!isOnVariable(c)) continue
    const v = p.items[c.variable]
    if (v?.kind !== 'variable') continue
    for (const e of manyEndsOf(p, v)) if (!nameAt(c.names, e.end)) c.names = withBinding(c.names, e.end, { declare: autoName(p, e.entity, all) })
  }
  return out
}
