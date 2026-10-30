import { emptyProject, makeItem } from './create'
import { addBelief, addSignal, predicateOf } from './formal'
import { createItem } from './ops'
import { groupKey } from './tree'
import { KINDS, type Condition, type Id, type Item, type NodeRole, type Project, type VariableType } from './types'

const sortKeys = (_: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    : v

/** Stable, diff-friendly JSON: items as an ordered array, keys sorted. */
export function serialize(p: Project): string {
  const items = Object.values(p.items).sort(
    (a, b) =>
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
      (groupKey(a) < groupKey(b) ? -1 : groupKey(a) > groupKey(b) ? 1 : 0) ||
      a.rank - b.rank,
  )
  return JSON.stringify({ app: 'hazardfox', schema: p.schema, meta: p.meta, items, ...(Object.keys(p.reviews ?? {}).length ? { reviews: p.reviews } : {}) }, sortKeys, 2) + '\n'
}

export function deserialize(text: string): Project {
  const raw = JSON.parse(text)
  if (raw?.app !== 'hazardfox') throw new Error('Not a HazardFox project file')
  if (raw.schema !== 1) throw new Error(`Unsupported schema version ${raw.schema}`)
  const p = emptyProject()
  p.meta = { ...p.meta, ...raw.meta }
  for (const it of raw.items as Item[]) p.items[it.id] = it.kind === 'scenario' || it.kind === 'node' || it.kind === 'ca' || it.kind === 'feedback' ? ({ ...makeItem(it.kind), ...it } as Item) : it
  // Nodes linked one domain entity (`entity`); now a list.
  for (const n of Object.values(p.items)) {
    if (n.kind !== 'node' || !('entity' in n)) continue
    const { entity, ...rest } = n as typeof n & { entity: Id | null }
    p.items[n.id] = { ...rest, entities: n.entities.length ? n.entities : entity ? [entity] : [] }
  }
  // Older files modelled sensors and actuators as nodes: keep their name on the arrows into / out of them, and make them plain elements.
  const old: Record<string, NodeRole> = { actuator: 'process', sensor: 'external' }
  for (const n of Object.values(p.items)) {
    if (n.kind !== 'node' || !(n.role as string in old)) continue
    for (const a of Object.values(p.items)) {
      if (a.kind === 'ca' && a.to === n.id && !a.actuator) a.actuator = n.title
      if (a.kind === 'feedback' && a.from === n.id && !a.sensor) a.sensor = n.title
    }
    n.role = old[n.role as string]
  }
  for (const it of Object.values(p.items)) {
    if (it.kind === 'variable') Object.assign(it, { ...makeItem('variable'), ...it })
    if (it.kind === 'uca') it.conditions = it.conditions.map((c) => { const { negate, ...rest } = c as Condition & { negate?: boolean }; return { ...rest, op: rest.op ?? (negate ? '≠' : '=') } })
  }
  for (const [id, r] of Object.entries((raw.reviews ?? {}) as NonNullable<Project['reviews']>)) if (p.items[id]) (p.reviews ??= {})[id] = r
  return migrateLayers(p, raw.items as Item[])
}

/** Older files listed process-model variables on controllers (`processModel`) and on feedback (`variables`); these become beliefs and signals.
 *  Entity attributes become world variables of the entity; relationships get their predicate variable. */
function migrateLayers(p0: Project, raw: Item[]): Project {
  let p = p0
  for (const it of raw) {
    const attrs = (it as Item & { attributes?: { name: string; type: string }[] }).attributes
    if (it.kind === 'entity' && attrs) {
      for (const a of attrs) {
        const type: VariableType = /bool/i.test(a.type) ? 'boolean' : /int|num|float|real|double|decimal/i.test(a.type) ? 'range' : 'enum'
        p = createItem(p, 'variable', { parent: it.id, title: a.name, type, definition: type === 'enum' ? a.type : '' }).project
      }
      const { attributes: _, ...rest } = p.items[it.id] as typeof it & { attributes?: unknown }
      p = { ...p, items: { ...p.items, [it.id]: rest as Item } }
    }
    if (it.kind === 'relationship' && !predicateOf(p, it.id)) p = createItem(p, 'variable', { parent: it.id, type: 'boolean' }, 0).project
    const old = it as Item & { processModel?: string[]; variables?: string[] }
    for (const v of old.processModel ?? []) p = addBelief(p, it.id, v).project
    for (const v of old.variables ?? []) p = addSignal(p, it.id, v).project
    if (old.processModel || old.variables) {
      const { processModel: _a, variables: _b, ...rest } = p.items[it.id] as typeof old
      p = { ...p, items: { ...p.items, [it.id]: rest as Item } }
    }
  }
  return p
}
