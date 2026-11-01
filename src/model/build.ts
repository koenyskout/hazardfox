import { emptyProject } from './create'
import { createItem, updateItem } from './ops'
import { migrateOperations } from './operations'
import type { Id, Kind, Patch, Project } from './types'

export type Add = <K extends Kind>(kind: K, init?: Patch<K>) => Id

/** Build a project item by item (examples, tests): `add` creates an item and returns its id. */
export function projectBuilder(meta: Partial<Project['meta']> = {}) {
  let project: Project = emptyProject()
  project.meta = { ...project.meta, ...meta }
  const add: Add = (kind, init) => {
    const r = createItem(project, kind, init)
    project = r.project
    return r.id
  }
  const set = (id: Id, patch: Patch | ((p: Project) => Patch)) => { project = updateItem(project, id, typeof patch === 'function' ? patch(project) : patch) }
  return { add, set, get project() { return (project = migrateOperations(project)) } }
}
