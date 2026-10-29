import type { GuideWord, Id, Item, Kind, Project } from './types'

export const newId = (): Id =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

export const emptyProject = (): Project => ({
  schema: 1,
  meta: { name: 'Untitled analysis', description: '', author: '', strideEnabled: true },
  items: {},
})

type Init = Partial<Item> & Record<string, unknown>

/** Build a fully defaulted item of the given kind. */
export function makeItem(kind: Kind, init: Init = {}): Item {
  const base = {
    id: newId(),
    parent: null,
    rank: Number.MAX_SAFE_INTEGER,
    title: '',
    description: '',
    notes: '',
    status: 'draft' as const,
    tags: [] as string[],
  }
  const extra: Record<Kind, Record<string, unknown>> = {
    loss: {},
    hazard: { lossLinks: [], lossExclude: [], security: false },
    constraint: { hazards: [] },
    requirement: { sources: [], type: 'requirement' },
    assumption: { about: [] },
    entity: { attributes: [], operations: [] },
    relationship: { from: '', to: '', fromCard: '1', toCard: '*' },
    variable: { states: [] },
    node: { role: 'controller', processModel: [], entity: null, nudge: null, wide: 0 },
    ca: { from: '', to: '', operation: '', bend: null },
    feedback: { from: '', to: '', variables: [], bend: null },
    uca: {
      ca: '',
      guide: 'not-provided' as GuideWord,
      conditions: [],
      context: '',
      override: '',
      hazards: [],
      constraint: '',
    },
    scenario: { scenarioType: 'uca', uca: null, ca: null, hazards: [], cause: '', element: null, stride: [], threat: '', adversarial: false, severity: 0, likelihood: 0 },
  }
  return { ...base, ...extra[kind], ...init, kind } as Item
}
