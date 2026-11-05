import { emptyProject } from './create'
import { createItem, updateItem } from './ops'
import { whenToExpr } from './bridge'
import type { When } from './legacy'
import type { Id, Kind, Patch, Project } from './types'

/** Examples author conditions in the old tree form; the builder turns them into expressions. */
type DOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type Legacy = { conditions?: When[]; rules?: { state: string; when: When }[] }
export type Init<K extends Kind> = (DOmit<Patch<K>, 'rules'> & Legacy & { operations?: string[] }) | (Patch<K> & { operations?: string[] })
const isExpr = (w: unknown) => !!w && typeof w === 'object' && 'k' in w
export function upgrade(p: Project, init: Record<string, unknown>): Record<string, unknown> {
  const { conditions, rules, ...rest } = init as { conditions?: When[]; rules?: { state: string; when: unknown }[] }
  const out: Record<string, unknown> = rest
  if (conditions) out.when = whenToExpr(p, conditions)
  if (rules) out.rules = rules.map((r) => ({ state: r.state, when: isExpr(r.when) ? r.when : whenToExpr(p, [r.when as When]) ?? { k: 'hole' } }))
  return out
}

export type Add = <K extends Kind>(kind: K, init?: Init<K>) => Id<K>

/** Build a project item by item (examples, tests): `add` creates an item and returns its id. */
export function projectBuilder(meta: Partial<Project['meta']> = {}) {
  let project: Project = emptyProject()
  project.meta = { ...project.meta, ...meta }
  const add: Add = (kind, init) => {
    const { operations, ...rest } = upgrade(project, (init ?? {}) as Record<string, unknown>) as { operations?: string[] }
    const r = createItem(project, kind, rest as Patch<typeof kind>)
    project = r.project
    // Shorthand: an entity's `operations` names become operations with one parameter of that entity.
    const own = project.items[r.id]
    for (const name of operations ?? []) project = createItem(project, 'operation', { title: name, params: [{ name: own.title.trim().split(/\s+/).pop()!.toLowerCase(), entity: r.id as Id<'entity'> }] }).project
    return r.id as Id<typeof kind>
  }
  const set = (id: Id, patch: Patch | Legacy | ((p: Project) => Patch | Legacy)) => { project = updateItem(project, id, upgrade(project, (typeof patch === 'function' ? patch(project) : patch) as Record<string, unknown>) as Patch) }
  return { add, set, get project() { return project } }
}
