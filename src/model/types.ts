export type Id = string
/** Display labels per item id (derived, see `labels.ts`). */
export type Labels = Record<Id, string>

export const GUIDE_WORDS = [
  'not-provided',
  'provided',
  'too-early-late',
  'stopped-too-soon',
] as const
export type GuideWord = (typeof GUIDE_WORDS)[number]

export const GUIDE_WORD_LABELS: Record<GuideWord, string> = {
  'not-provided': 'Not provided',
  provided: 'Provided causes hazard',
  'too-early-late': 'Too early / too late / wrong order',
  'stopped-too-soon': 'Stopped too soon / applied too long',
}

export const VARIABLE_TYPES = ['enum', 'boolean', 'range'] as const
export type VariableType = (typeof VARIABLE_TYPES)[number]
export const VARIABLE_TYPE_LABELS: Record<VariableType, string> = { enum: 'Enumeration (named states)', boolean: 'Boolean (true / false)', range: 'Numeric range' }

/** Where a variable lives (formalization: actual state x, observation o, process-model belief x̂, controller-internal state q). */
export const VARIABLE_LAYERS = ['domain', 'signal', 'belief', 'internal'] as const
export type VariableLayer = (typeof VARIABLE_LAYERS)[number]
export const VARIABLE_LAYER_LABELS: Record<VariableLayer, string> = {
  domain: 'World (actual process state)',
  signal: 'Signal (observation carried by a feedback)',
  belief: 'Belief (process model of a controller)',
  internal: 'Controller internal state (mode, timer, memory)',
}
export const LAYER_SHORT: Record<VariableLayer, string> = { domain: 'World', signal: 'Signal', belief: 'Belief', internal: 'Internal' }

export const CONDITION_OPS = ['=', '≠', 'in', 'not in', '<', '≤', '>', '≥', 'between', 'not between'] as const
export type ConditionOp = (typeof CONDITION_OPS)[number]

export const DURATIONS = ['continuous', 'instantaneous'] as const
export type Duration = (typeof DURATIONS)[number]
export const DURATION_LABELS: Record<Duration, string> = {
  continuous: 'Continuous (has a duration)',
  instantaneous: 'Instantaneous / discrete (no duration)',
}

export const STRIDE = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information disclosure',
  'Denial of service',
  'Elevation of privilege',
] as const
export type Stride = (typeof STRIDE)[number]

export const STATUSES = ['draft', 'review', 'approved'] as const
export type Status = (typeof STATUSES)[number]

/** Sensors and actuators are not nodes: they are attached to feedback (`sensor`) and control action (`actuator`) arrows. */
export const NODE_ROLES = ['controller', 'process', 'external'] as const
export type NodeRole = (typeof NODE_ROLES)[number]

export const REQUIREMENT_TYPES = ['requirement', 'mitigation'] as const
export type RequirementType = (typeof REQUIREMENT_TYPES)[number]

/** Manual layout offset in px. */
export interface Offset { dx: number; dy: number }

export interface Base {
  id: Id
  /** Parent in the item's tree (null = root). Flat kinds use it for their owner where noted. */
  parent: Id | null
  /** Sibling order; kept normalised to 0..n-1 by the operations. */
  rank: number
  title: string
  /** Rich text; may contain `@[id]` references. */
  description: string
  notes: string
  status: Status
  tags: string[]
}

export interface Loss extends Base {
  kind: 'loss'
}
export interface Hazard extends Base {
  kind: 'hazard'
  /** Explicit loss links (in addition to inherited ones). */
  lossLinks: Id[]
  /** Inherited loss links that are switched off for this hazard. */
  lossExclude: Id[]
  /** World (domain) variables describing the system state or environment conditions that make this a hazard. */
  variables: Id[]
  /** Logical definition of the hazardous state over world variables (all must hold). */
  conditions: Condition[]
  /** STPA-Sec: hazard is caused by / relevant for adversarial actions. */
  security: boolean
}
export interface Constraint extends Base {
  kind: 'constraint'
  hazards: Id[]
}
export interface Requirement extends Base {
  kind: 'requirement'
  /** constraints, scenarios or UCAs this requirement / mitigation derives from */
  sources: Id[]
  type: RequirementType
}
export interface Assumption extends Base {
  kind: 'assumption'
  about: Id[]
}

/** Predefined multiplicities of a relationship end (`*` = zero or more); other text from older files is kept as is. */
export const CARDINALITIES = ['1', '0..1', '*', '1..*'] as const

/** Domain model entity (tree: a child may be a part/specialisation of its parent). Its attributes are its world variables V(e). */
export interface Entity extends Base {
  kind: 'entity'
  operations: string[]
}
/** A relationship R(from, to) between entities; whether it holds over time is its predicate, a boolean world variable it owns (see `predicateOf`). */
export interface Relationship extends Base {
  kind: 'relationship'
  from: Id
  to: Id
  /** `title` is the relationship name */
  fromCard: string
  toCard: string
}
/** A variable; its owner (`parent`) depends on the layer: domain → entity, signal → feedback, belief / internal → controller node. */
export interface Variable extends Base {
  kind: 'variable'
  layer: VariableLayer
  /** signal / belief: the world variable it observes / stands for (designation δ) */
  about: Id | null
  /** Rich text. domain: abstraction of other variables (e.g. moving := |@speed| > ε); signal: interface semantics; belief: world predicate it designates; internal: meaning */
  definition: string
  /** enum: named `states`; boolean: true / false; range: numeric, optional `min`/`max` bounds and `unit` */
  type: VariableType
  states: string[]
  unit: string
  min: number | null
  max: number | null
  /** Name of the project's `rangeTypes` entry that `min`/`max`/`unit` follow ('' = custom bounds) */
  rangeType: string
  /** Refinement ρ (domain): the value as a function of lower-level world variables. The first rule whose condition tree holds gives the value, else `otherwise` ('' = undefined). */
  rules: Rule[]
  otherwise: string
}
/** A reusable numeric type: bounds and unit shared by every variable that uses it. */
export interface RangeType { min: number | null; max: number | null; unit: string }
/** Condition tree: all (`any` false) or any of its conditions and nested groups hold. */
export interface Group { any: boolean; of: When[] }
export type When = Condition | Group
/** The refined variable has value `state` when `when` holds. */
export interface Rule { state: string; when: Group }

/** Control structure node; `parent` nests nodes (hierarchy / subsystems). */
export interface CsNode extends Base {
  kind: 'node'
  role: NodeRole
  /** Domain entities this node represents (a physical process may comprise several) */
  entities: Id[]
  /** Manual layout nudge, relative offset applied on top of the auto layout */
  nudge: Offset | null
  /** Extra width in px added to the box in the diagram (0 = automatic) */
  wide: number
  /** Extra height in px (0 = automatic). */
  tall: number
}
/** Control action edge. */
export interface ControlAction extends Base {
  kind: 'ca'
  from: Id
  to: Id
  /** Instantaneous (discrete) actions have no duration, so "stopped too soon / applied too long" does not apply (Handbook, step 3) */
  duration: Duration
  /** World variables this action is meant to change (controlled variables) */
  affects: Id[]
  /** Optional domain operation (`<entityId>:<operation>`) */
  operation: string
  /** Actuator that carries this control action out (name; an attribute of the arrow, not a node) */
  actuator: string
  /** Guide words that make no sense for this control action (with a reason); not to be analysed */
  notApplicable: { guide: GuideWord; reason: string }[]
  bend: Offset | null
  /** Manual label offset from its automatic place beside the arrow */
  labelShift: Offset | null
}
export interface Feedback extends Base {
  kind: 'feedback'
  from: Id
  to: Id
  /** Sensor that produces this feedback (name; an attribute of the arrow, not a node) */
  sensor: string
  bend: Offset | null
  labelShift: Offset | null
}

/** `state` is the compared value (a state name, true/false, or a number); `to` is the upper bound of `between`; `set` the states of `in` / `not in` (enumerations).
 *  With `text` (and no variable) it is a condition in words that holds (`=`) or not (`≠`); traces treat it as a boolean lane keyed by its text. */
export interface Condition {
  variable: Id
  op: ConditionOp
  state: string
  to?: string
  set?: string[]
  text?: string
  /** Compare with the value of this other variable instead of a constant (`state` / `to` / `set` unused); ops `=`, `≠` and, for numbers, `<` `≤` `>` `≥` */
  other?: Id
}
export interface Uca extends Base {
  kind: 'uca'
  ca: Id
  guide: GuideWord
  conditions: Condition[]
  /** Free text refinement */
  context: string
  /** If set, replaces the generated sentence */
  override: string
  /** Leaf hazards */
  hazards: Id[]
  /** Controller constraint */
  constraint: string
  /** Higher-level UCA whose context this one refines (by substituting a refined variable's rules) */
  refines: Id | null
}
/** Type 1: why an UCA may occur. Type 2: why a control action is not executed / improperly executed. */
export const SCENARIO_TYPES = ['uca', 'ca'] as const
export type ScenarioType = (typeof SCENARIO_TYPES)[number]
export const SCENARIO_TYPE_LABELS: Record<ScenarioType, string> = {
  uca: 'Why an unsafe control action occurs',
  ca: 'Why a control action is not executed properly',
}
/** Causal-factor categories (STPA Handbook, step 4). */
export const CAUSES = {
  uca: [
    { value: 'controller-failure', label: 'Controller failure (physical / software)' },
    { value: 'control-algorithm', label: 'Inadequate control algorithm' },
    { value: 'process-model', label: 'Incorrect / outdated process model' },
    { value: 'feedback', label: 'Missing or inadequate feedback / inputs' },
    { value: 'other-controller', label: 'Conflicting controllers / external influence' },
  ],
  ca: [
    { value: 'actuator', label: 'Actuator failure / degradation' },
    { value: 'controlled-process', label: 'Controlled process: conflicting or disturbing inputs' },
    { value: 'delivery', label: 'Control action lost, delayed or corrupted in transit' },
    { value: 'receiver', label: 'Receiver / lower-level controller does not act on it' },
    { value: 'environment', label: 'Environmental disturbance' },
  ],
} as const satisfies Record<ScenarioType, readonly { value: string; label: string }[]>
export type Cause = (typeof CAUSES)[ScenarioType][number]['value']
export const CAUSE_LABELS = Object.fromEntries(
  Object.values(CAUSES).flat().map((c) => [c.value, c.label]),
) as Record<Cause, string>
export const isCauseOf = (t: ScenarioType, c: string): c is Cause => CAUSES[t].some((x) => x.value === c)
/** What happens to a control action or feedback in a trace step. */
export const TRACE_EVENTS = ['occurs', 'absent', 'lost'] as const
export type TraceEventKind = (typeof TRACE_EVENTS)[number]
export const TRACE_EVENT_LABELS: Record<TraceEventKind, string> = { occurs: 'sent', absent: 'not sent', lost: 'sent but lost / not executed' }
export interface TraceEvent { on: Id; what: TraceEventKind }
/** `values` sets variables at this step (unset ones keep their previous value). */
export interface TraceStep { t: string; note: string; values: Record<Id, string>; events: TraceEvent[] }
/** A finite run σ of the system (world, signals, beliefs, internal state) that exhibits the scenario. */
export interface Trace { lanes: Id[]; steps: TraceStep[] }

export interface Scenario extends Base {
  kind: 'scenario'
  scenarioType: ScenarioType
  /** type 'uca': the unsafe control action explained */
  uca: Id | null
  /** type 'ca': the control action that is not executed properly */
  ca: Id | null
  /** type 'ca' only: leaf hazards it may lead to (type 'uca' inherits them from the UCA) */
  hazards: Id[]
  /** '' = unspecified */
  cause: Cause | ''
  /** Control structure element where the cause lies (optional) */
  element: Id | null
  stride: Stride[]
  threat: string
  adversarial: boolean
  severity: number // 1..5, 0 = unrated
  likelihood: number // 1..5, 0 = unrated
  trace: Trace
}

export type Item =
  | Loss
  | Hazard
  | Constraint
  | Requirement
  | Assumption
  | Entity
  | Relationship
  | Variable
  | CsNode
  | ControlAction
  | Feedback
  | Uca
  | Scenario

export type Kind = Item['kind']
export type ItemOf<K extends Kind> = Extract<Item, { kind: K }>
/** Changeable fields of an item of kind K (distributes over unions of kinds). */
export type Patch<K extends Kind = Kind> = K extends Kind ? Partial<Omit<ItemOf<K>, 'id' | 'kind'>> : never

export const KIND_NAMES: Record<Kind, string> = {
  loss: 'Loss',
  hazard: 'Hazard',
  constraint: 'System constraint',
  requirement: 'Requirement',
  assumption: 'Assumption',
  entity: 'Entity',
  relationship: 'Relationship',
  variable: 'Variable',
  node: 'Control structure element',
  ca: 'Control action',
  feedback: 'Feedback',
  uca: 'Unsafe control action',
  scenario: 'Loss scenario',
}
/** All kinds, in canonical order (Step 1 → Step 4). */
export const KINDS = Object.keys(KIND_NAMES) as Kind[]

export interface SavedReview { key: string; p: Record<string, number> }

export interface Project {
  schema: 1
  meta: { name: string; description: string; author: string; strideEnabled: boolean }
  items: Record<Id, Item>
  /** Saved AI-check results per item (`key` = hash of what was checked); outside undo history. */
  reviews?: Record<Id, SavedReview>
  /** Named numeric types (min / max / unit) that range variables can share. */
  rangeTypes?: Record<string, RangeType>
  /** Mentioned tags registry is derived; nothing stored. */
}
