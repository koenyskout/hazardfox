import { createItem } from './ops'
import { itemsOfKind } from './tree'
import type { Effect, Id, ItemOf, Project, TraceStep } from './types'

/** Operation items of an entity, in order. */
export const operationsOf = (p: Project, entity: Id): ItemOf<'operation'>[] => itemsOfKind(p, 'operation').filter((o) => o.entity === entity).sort((a, b) => a.rank - b.rank)

/** The operation a control action realizes, if it exists. */
export const operationOfCa = (p: Project, ca: Id): ItemOf<'operation'> | null => {
  const c = p.items[ca]
  const o = c?.kind === 'ca' && c.operation ? p.items[c.operation] : undefined
  return o?.kind === 'operation' ? o : null
}

/** The operation an event target stands for: the operation itself, or the one a control action realizes. */
const operationOf = (p: Project, on: Id): ItemOf<'operation'> | null => (p.items[on]?.kind === 'operation' ? (p.items[on] as ItemOf<'operation'>) : operationOfCa(p, on))

/** Effects that follow when `on` (a control action or an operation) occurs. */
export const effectsOf = (p: Project, on: Id): Effect[] => operationOf(p, on)?.effects ?? []

/** Whether a trace event on `e` counts as an occurrence of `target`: the same item, or a control action realizing the target operation. */
export const isOccurrence = (p: Project, e: TraceStep['events'][number], target: Id): boolean =>
  e.what === 'occurs' && (e.on === target || (p.items[target]?.kind === 'operation' && operationOfCa(p, e.on)?.id === target))

/** Effect as text, e.g. "@[v] = down". */
export const effectText = (ef: Effect) => `@[${ef.variable}] = ${ef.state}`

/** Older files kept operation names on entities, and `ca.operation` as "<entityId>:<name>": turn them into operation items. */
export function migrateOperations(p0: Project): Project {
  let p = p0
  for (const e of itemsOfKind(p0, 'entity')) {
    const names = e.operations
    if (!names) continue
    for (const name of names) p = createItem(p, 'operation', { title: name, entity: e.id }).project
    const { operations: _, ...rest } = p.items[e.id] as typeof e
    p = { ...p, items: { ...p.items, [e.id]: rest as typeof e } }
  }
  for (const c of itemsOfKind(p, 'ca')) {
    if (!c.operation || p.items[c.operation]) continue
    const [eid, ...name] = c.operation.split(':')
    const o = itemsOfKind(p, 'operation').find((x) => x.entity === eid && x.title === name.join(':'))
    p = { ...p, items: { ...p.items, [c.id]: { ...c, operation: o?.id ?? null } } }
  }
  return p
}
