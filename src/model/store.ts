import { create } from 'zustand'
import { emptyProject } from './create'
import type { Id, Project, SavedReview } from './types'

const MAX_HISTORY = 200

export type View =
  | 'review'
  | 'overview'
  | 'step1'
  | 'domain'
  | 'structure'
  | 'ucas'
  | 'scenarios'
  | 'requirements'
  | 'trace'
  | 'validation'
  | 'export'

interface State {
  project: Project
  past: Project[]
  future: Project[]
  dirty: boolean
  fileName: string | null
  fileHandle: unknown
  view: View
  selected: Id | null
  paletteOpen: boolean
  lastKey: string
  lastAt: number

  /** Apply a project transformation as one undo step (same `key` within 1.2s coalesces). */
  commit: (fn: (p: Project) => Project, key?: string) => void
  /** Store AI-check results; not an undo step, but the project counts as changed. */
  saveReviews: (r: Record<Id, SavedReview>) => void
  undo: () => void
  redo: () => void
  load: (p: Project, fileName: string | null, handle?: unknown, markDirty?: boolean) => void
  setFile: (name: string | null, handle: unknown) => void
  markSaved: () => void
  setView: (v: View) => void
  select: (id: Id | null) => void
  goto: (view: View, id: Id | null) => void
  setPalette: (o: boolean) => void
}

export const useStore = create<State>((set, get) => ({
  project: emptyProject(),
  past: [],
  future: [],
  dirty: false,
  fileName: null,
  fileHandle: null,
  view: 'overview',
  selected: null,
  paletteOpen: false,
  lastKey: '',
  lastAt: 0,

  commit(fn, key = '') {
    const s = get()
    const next = fn(s.project)
    if (next === s.project) return
    const now = Date.now()
    const coalesce = key !== '' && key === s.lastKey && now - s.lastAt < 1200
    set({
      project: next,
      past: coalesce ? s.past : [...s.past, s.project].slice(-MAX_HISTORY),
      future: [],
      dirty: true,
      lastKey: key,
      lastAt: now,
    })
  },
  saveReviews(r) {
    const s = get()
    const reviews = Object.fromEntries(Object.entries({ ...s.project.reviews, ...r }).filter(([id]) => s.project.items[id]))
    set({ project: { ...s.project, reviews }, dirty: true })
  },
  undo() {
    const s = get()
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    set({ project: { ...prev, reviews: s.project.reviews }, past: s.past.slice(0, -1), future: [s.project, ...s.future], dirty: true, lastKey: '' })
  },
  redo() {
    const s = get()
    const [next, ...rest] = s.future
    if (!next) return
    set({ project: { ...next, reviews: s.project.reviews }, past: [...s.past, s.project], future: rest, dirty: true, lastKey: '' })
  },
  load(p, fileName, handle = null, markDirty = false) {
    set({ project: p, past: [], future: [], dirty: markDirty, fileName, fileHandle: handle, selected: null, lastKey: '' })
  },
  setFile: (fileName, fileHandle) => set({ fileName, fileHandle }),
  markSaved: () => set({ dirty: false }),
  setView: (view) => set({ view }),
  select: (selected) => set({ selected }),
  goto: (view, selected) => set({ view, selected }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
}))
