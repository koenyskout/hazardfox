import { useMemo } from 'react'
import { computeLabels } from '../model/labels'
import { useStore } from '../model/store'
import type { Id, Project } from '../model/types'

export const useProject = () => useStore((s) => s.project)
export const useLabels = (): Record<Id, string> => {
  const p = useProject()
  return useMemo(() => computeLabels(p), [p])
}
export const commit = (fn: (p: Project) => Project, key?: string) => useStore.getState().commit(fn, key)
export const select = (id: Id | null) => useStore.getState().select(id)
