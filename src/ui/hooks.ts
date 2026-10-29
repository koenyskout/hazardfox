import { useMemo } from 'react'
import { computeLabels } from '../model/labels'
import { createItem } from '../model/ops'
import { useStore } from '../model/store'
import type { Id, Kind, Labels, Patch, Project } from '../model/types'

export const useProject = () => useStore((s) => s.project)
export const useLabels = (): Labels => {
  const p = useProject()
  return useMemo(() => computeLabels(p), [p])
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
