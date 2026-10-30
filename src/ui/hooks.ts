import { useMemo } from 'react'
import { computeLabels, displayLabels } from '../model/labels'
import { createItem } from '../model/ops'
import { useStore } from '../model/store'
import { refines } from '../model/formal'
import type { Id, Kind, Labels, Patch, Project, Variable } from '../model/types'

export const useProject = () => useStore((s) => s.project)
/** Stable ids (V-n for variables). */
export const useIds = (): Labels => {
  const p = useProject()
  return useMemo(() => computeLabels(p), [p])
}
/** Labels as shown in the UI: variables by name. */
export const useLabels = (): Labels => {
  const p = useProject()
  const ids = useIds()
  return useMemo(() => displayLabels(p, ids), [p, ids])
}
export const commit = (fn: (p: Project) => Project, key?: string) => useStore.getState().commit(fn, key)
export const select = (id: Id | null) => useStore.getState().select(id)

/** Create an item as one undo step, select it and return its id. */
export function addItem<K extends Kind>(kind: K, init?: Patch<K>, index?: number): Id {
  let id = ''
  commit((q) => {
    const r = createItem(q, kind, init, index)
    id = r.id
    return r.project
  })
  select(id)
  return id
}

/** Create an item as one undo step and open it in the edit dialog (no selection change). */
export function addItemInDialog<K extends Kind>(kind: K, init?: Patch<K>): Id {
  let id = ''
  commit((q) => {
    const r = createItem(q, kind, init)
    id = r.id
    return r.project
  })
  useStore.getState().openEditor(id)
  return id
}

/** A world variable defined from lower-level ones (refinement rules or a definition mentioning them) rather than observed directly. */
export const isComputed = (p: Project, v: Variable) => v.layer === 'domain' && (v.rules.length > 0 || refines(p, v).length > 0)
