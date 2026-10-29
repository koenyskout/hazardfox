import { emptyProject } from './create'
import { createItem } from './ops'
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
  return { add, get project() { return project } }
}
