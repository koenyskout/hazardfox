import type { Base, Id, ItemOf, Kind, Patch, Project, RelEnd } from './types'

export const newId = (): Id =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

/** The ends of a binary relationship (roles default to the entity titles). */
export const relEnds = (from: Id, to: Id, fromCard = '1', toCard = '*'): RelEnd[] => [{ entity: from, role: '', card: fromCard }, { entity: to, role: '', card: toCard }]

export const emptyProject = (): Project => ({
  schema: 1,
  meta: { name: 'Untitled analysis', description: '', author: '', strideEnabled: true },
  items: {},
})

/** Generic range types every new analysis starts with; editable and deletable like any other. */
export const DEFAULT_RANGE_TYPES: NonNullable<Project['rangeTypes']> = {
  Percentage: { min: 0, max: 100, unit: '%' },
  Temperature: { min: -50, max: 150, unit: '°C' },
  Length: { min: 0, max: 100, unit: 'm' },
  Speed: { min: 0, max: 100, unit: 'm/s' },
  Time: { min: 0, max: 3600, unit: 's' },
}

/** A fresh analysis: empty, with the default range types. */
export const newProject = (): Project => ({ ...emptyProject(), rangeTypes: structuredClone(DEFAULT_RANGE_TYPES) })

/** Default values of the kind-specific fields. */
const DEFAULTS: { [K in Kind]: () => Omit<ItemOf<K>, keyof Base | 'kind'> } = {
  loss: () => ({}),
  hazard: () => ({ lossLinks: [], lossExclude: [], variables: [], conditions: [], security: false }),
  constraint: () => ({ hazards: [] }),
  requirement: () => ({ sources: [], type: 'requirement' }),
  assumption: () => ({ about: [] }),
  entity: () => ({ nudge: null, relation: 'specialisation', many: false }),
  operation: () => ({ params: [], effects: [] }),
  relationship: () => ({ ends: relEnds('', '', '1', '*'), nudge: null }),
  variable: () => ({ layer: 'domain', definition: '', type: 'enum', states: [], unit: '', min: null, max: null, rangeType: '', enumType: '', ordered: false, unique: false, monotonic: false, sequential: false, symbolicType: '', rules: [], otherwise: '' }),
  node: () => ({ role: 'controller', entities: [], nudge: null, wide: 0, tall: 0 }),
  ca: () => ({ from: '', to: '', duration: 'continuous', affects: [], params: [], operation: null, actuator: '', notApplicable: [], bend: null, labelShift: null }),
  feedback: () => ({ from: '', to: '', sensor: '', bend: null, labelShift: null }),
  uca: () => ({ ca: '', guide: 'not-provided', conditions: [], args: [], context: '', override: '', hazards: [], constraint: '', refines: null }),
  scenario: () => ({
    scenarioType: 'uca', uca: null, ca: null, hazards: [], cause: '', element: null,
    stride: [], threat: '', adversarial: false, severity: 0, likelihood: 0, trace: { lanes: [], steps: [] },
  }),
}

/** Keep only the fields that belong to a variable's layer: rules / otherwise / struct on world variables, `about` on signals and beliefs. */
function layerFields(v: Record<string, unknown>) {
  const layer = v.layer
  if (layer !== 'domain') { delete v.rules; delete v.otherwise; delete v.struct }
  if (layer === 'signal' || layer === 'belief') v.about ??= null
  else delete v.about
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
  const it = { ...base, ...DEFAULTS[kind](), ...init, kind } as unknown as Record<string, unknown>
  if (kind === 'variable') layerFields(it)
  return it as unknown as ItemOf<K>
}
