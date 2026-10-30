import type { Base, Id, ItemOf, Kind, Patch, Project } from './types'

export const newId = (): Id =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

export const emptyProject = (): Project => ({
  schema: 1,
  meta: { name: 'Untitled analysis', description: '', author: '', strideEnabled: true },
  items: {},
})

/** Default values of the kind-specific fields. */
const DEFAULTS: { [K in Kind]: () => Omit<ItemOf<K>, keyof Base | 'kind'> } = {
  loss: () => ({}),
  hazard: () => ({ lossLinks: [], lossExclude: [], variables: [], security: false }),
  constraint: () => ({ hazards: [] }),
  requirement: () => ({ sources: [], type: 'requirement' }),
  assumption: () => ({ about: [] }),
  entity: () => ({ operations: [] }),
  relationship: () => ({ from: '', to: '', fromCard: '1', toCard: '*' }),
  variable: () => ({ layer: 'domain', about: null, definition: '', type: 'enum', states: [], unit: '', min: null, max: null }),
  node: () => ({ role: 'controller', entities: [], nudge: null, wide: 0, tall: 0 }),
  ca: () => ({ from: '', to: '', duration: 'continuous', affects: [], operation: '', actuator: '', notApplicable: [], bend: null, labelShift: null }),
  feedback: () => ({ from: '', to: '', sensor: '', bend: null, labelShift: null }),
  uca: () => ({ ca: '', guide: 'not-provided', conditions: [], context: '', override: '', hazards: [], constraint: '' }),
  scenario: () => ({
    scenarioType: 'uca', uca: null, ca: null, hazards: [], cause: '', element: null,
    stride: [], threat: '', adversarial: false, severity: 0, likelihood: 0, trace: { lanes: [], steps: [] },
  }),
}

/** Build a fully defaulted item of the given kind. */
export function makeItem<K extends Kind>(kind: K, init: Patch<K> = {} as Patch<K>): ItemOf<K> {
  const base: Base = {
    id: newId(),
    parent: null,
    rank: Number.MAX_SAFE_INTEGER,
    title: '',
    description: '',
    notes: '',
    status: 'draft',
    tags: [],
  }
  return { ...base, ...DEFAULTS[kind](), ...init, kind } as unknown as ItemOf<K>
}
