import { itemsOfKind } from './tree'
import { generalisations } from './formal'
import { paramSummary } from './params'
import type { Effect, Id, OpParam, ItemOf, Project, TraceEvent } from './types'

/** Operations with a parameter of this entity or relationship, in order. */
export const operationsOf = (p: Project, entity: Id): ItemOf<'operation'>[] => itemsOfKind(p, 'operation').filter((o) => o.params.some((x) => x.entity === entity)).sort((a, b) => a.rank - b.rank)
/** Operations an entity inherits from the entities it specialises, with the entity that declares them. */
export const inheritedOperations = (p: Project, entity: Id) => generalisations(p, entity).flatMap((g) => operationsOf(p, g).map((o) => ({ o, from: g })))

/** "gate: Gate" or "level: 0–10 mm". */
export const paramText = (p: Project, x: OpParam) => (x.data ? paramSummary(p, { ...x.data, name: x.name || '?' }) : `${x.name || '?'}: ${p.items[x.entity]?.title || '?'}`)

/** "Lower(gate: Gate)" with the parameter types as plain text. */
export const opSignature = (p: Project, o: ItemOf<'operation'>) => `${o.title || 'operation'}(${o.params.map((x) => `${paramText(p, x)}`).join(', ')})`

/** The operation a control action realizes, if it exists. */
export const operationOfCa = (p: Project, ca: Id): ItemOf<'operation'> | null => {
  const c = p.items[ca]
  const o = c?.kind === 'ca' && c.operation ? p.items[c.operation] : undefined
  return o?.kind === 'operation' ? o : null
}

/** The operation an event target stands for: the operation itself, or the one a control action realizes. */
export const operationOf = (p: Project, on: Id): ItemOf<'operation'> | null => (p.items[on]?.kind === 'operation' ? (p.items[on] as ItemOf<'operation'>) : operationOfCa(p, on))

/** Variable keys (lane keys: a per-instance variable is "<id>@<instance>") and values that follow when the event `e` (on a control action or an operation) occurs. */
export const appliedEffects = (p: Project, e: TraceEvent): { key: string; state: string }[] =>
  (operationOf(p, e.on)?.effects ?? []).filter((x) => x.variable && (x.from || x.state !== '')).map((x) => ({ key: x.variable + (x.on && e.args?.[x.on] ? '@' + e.args[x.on] : ''), state: x.from ? e.args?.[x.from] ?? '' : x.state })).filter((x) => x.state !== '')

/** Whether a trace event on `e` counts as an occurrence of `target`: the same item, or a control action realizing the target operation. */
export const isOccurrence = (p: Project, e: TraceEvent, target: Id): boolean =>
  e.what === 'occurs' && (e.on === target || (p.items[target]?.kind === 'operation' && operationOfCa(p, e.on)?.id === target))

/** Effect as text, e.g. "@[v] = down". */
export const effectText = (ef: Effect) => `@[${ef.variable}] = ${ef.from ? `<${ef.from}>` : ef.state}${ef.on ? ` (of ${ef.on})` : ''}`
