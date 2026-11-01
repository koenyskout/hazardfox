import { createItem } from './ops'
import { itemsOfKind } from './tree'
import type { Effect, Id, ItemOf, Project, TraceEvent } from './types'

/** Operations with a parameter of this entity or relationship, in order. */
export const operationsOf = (p: Project, entity: Id): ItemOf<'operation'>[] => itemsOfKind(p, 'operation').filter((o) => o.params.some((x) => x.entity === entity)).sort((a, b) => a.rank - b.rank)

/** "Lower(gate: Gate)" with the parameter types as plain text. */
export const opSignature = (p: Project, o: ItemOf<'operation'>) => `${o.title || 'operation'}(${o.params.map((x) => `${x.name || '?'}: ${p.items[x.entity]?.title || '?'}`).join(', ')})`

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
  (operationOf(p, e.on)?.effects ?? []).filter((x) => x.variable && x.state !== '').map((x) => ({ key: x.variable + (x.on && e.args?.[x.on] ? '@' + e.args[x.on] : ''), state: x.state }))

/** Whether a trace event on `e` counts as an occurrence of `target`: the same item, or a control action realizing the target operation. */
export const isOccurrence = (p: Project, e: TraceEvent, target: Id): boolean =>
  e.what === 'occurs' && (e.on === target || (p.items[target]?.kind === 'operation' && operationOfCa(p, e.on)?.id === target))

/** Effect as text, e.g. "@[v] = down". */
export const effectText = (ef: Effect) => `@[${ef.variable}] = ${ef.state}${ef.on ? ` (of ${ef.on})` : ''}`

/** Older files kept operation names on entities, `ca.operation` as "<entityId>:<name>" and operations with a single owner: turn them into operation items with parameters. */
export function migrateOperations(p0: Project): Project {
  let p = p0
  for (const e of itemsOfKind(p0, 'entity')) {
    const names = e.operations
    if (!names) continue
    for (const name of names) p = createItem(p, 'operation', { title: name, owner: e.id }).project
    const { operations: _, ...rest } = p.items[e.id] as typeof e
    p = { ...p, items: { ...p.items, [e.id]: rest as typeof e } }
  }
  for (const o of itemsOfKind(p, 'operation')) {
    const owner = o.owner ?? o.entity ?? null
    if (o.owner === undefined && o.entity === undefined) continue
    const { owner: _o, entity: _e, ...rest } = o
    const own = owner && p.items[owner] ? p.items[owner] : null
    const name = own ? (own.title.trim().split(/\s+/).pop() ?? '').toLowerCase() || 'x' : ''
    const params = o.params?.length ? o.params : own ? [{ name, entity: own.id }] : []
    const effects = (o.effects ?? []).map((ef) => (own && !ef.on && (p.items[ef.variable] as { parent?: Id } | undefined)?.parent === own.id ? { ...ef, on: name } : ef))
    p = { ...p, items: { ...p.items, [o.id]: { ...rest, params, effects } as typeof o } }
  }
  for (const c of itemsOfKind(p, 'ca')) {
    if (!c.operation || p.items[c.operation]) continue
    const [eid, ...name] = c.operation.split(':')
    const o = itemsOfKind(p, 'operation').find((x) => x.params.some((q) => q.entity === eid) && x.title === name.join(':'))
    p = { ...p, items: { ...p.items, [c.id]: { ...c, operation: o?.id ?? null } } }
  }
  return p
}
