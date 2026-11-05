import { emptyProject } from './create'
import { createItem, updateItem } from './ops'
import type { Id, Kind, Patch, Project } from './types'

export type Add = <K extends Kind>(kind: K, init?: Patch<K> & { operations?: string[] }) => Id<K>

/** Build a project item by item (examples, tests): `add` creates an item and returns its id. */
export function projectBuilder(meta: Partial<Project['meta']> = {}) {
  let project: Project = emptyProject()
  project.meta = { ...project.meta, ...meta }
  const add: Add = (kind, init) => {
    const { operations, ...rest } = (init ?? {}) as { operations?: string[] }
    const r = createItem(project, kind, rest as typeof init)
    project = r.project
    // Shorthand: an entity's `operations` names become operations with one parameter of that entity.
    const own = project.items[r.id]
    for (const name of operations ?? []) project = createItem(project, 'operation', { title: name, params: [{ name: own.title.trim().split(/\s+/).pop()!.toLowerCase(), entity: r.id as Id<'entity'> }] }).project
    return r.id as Id<typeof kind>
  }
  const set = (id: Id, patch: Patch | ((p: Project) => Patch)) => { project = updateItem(project, id, typeof patch === 'function' ? patch(project) : patch) }
  return { add, set, get project() { return project } }
}
