import { makeItem } from '../model/create'
import { computeLabels, DELETED, renderText } from '../model/labels'
import { listRefs, mention, optionalRefs, replaceMentions, requiredRefs, singleRefs, textFields } from '../model/refs'
import { parentKinds } from '../model/tree'
import { TIME_UNITS, type TimeBound, type TimeUnit } from '../model/types'
import { exprError } from '../model/expr'
import { allOf, normSym, isGroup, conditionError, isRangeOp, isEvent, isText as inWords, isExpr, isVarCmp, laneText, laneOf, laneEntries, asLane, declare } from '../model/variables'
import { QUANTIFIERS, type Lane, type ExprCondition, type Binding, type EndNames, type Quantifier, CAUSES, CONDITION_OPS, DURATIONS, ENTITY_RELATIONS, GUIDE_WORDS, KINDS, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPES, STATUSES, STRIDE, TRACE_EVENTS, VARIABLE_LAYERS, VARIABLE_TYPES, type VariableType, type Trace, type TraceEventKind, type Condition, type InstanceNames, type ValueCondition, type VarCondition, type ConditionOp, type Rule, type When, type Group, type Id, type Item, type Kind, type Project } from '../model/types'

type Rec = Record<string, unknown>

/** Fields the agent may not set (managed by the model or purely visual). */
const HIDDEN = new Set(['id', 'kind', 'rank', 'nudge', 'bend', 'labelShift', 'wide', 'tall'])

/** Allowed target kinds of reference fields (`null` = any item). */
const TARGETS: Partial<Record<Kind, Record<string, Kind[] | null>>> = {
  hazard: { lossLinks: ['loss'], lossExclude: ['loss'], variables: ['variable'] },
  constraint: { hazards: ['hazard'] },
  requirement: { sources: null },
  assumption: { about: null },
  node: { entities: ['entity'] },
  variable: { about: ['variable'] },
  ca: { from: ['node'], to: ['node'], affects: ['variable'], operation: ['operation'] },
  feedback: { from: ['node'], to: ['node'] },
  uca: { ca: ['ca'], hazards: ['hazard'], refines: ['uca'] },
  scenario: { uca: ['uca'], ca: ['ca'], hazards: ['hazard'], element: ['node'] },
}

const ENUMS: Partial<Record<Kind, Record<string, readonly string[]>>> = {
  requirement: { type: REQUIREMENT_TYPES },
  entity: { relation: ENTITY_RELATIONS },
  node: { role: NODE_ROLES },
  ca: { duration: DURATIONS },
  variable: { type: VARIABLE_TYPES, layer: VARIABLE_LAYERS },
  uca: { guide: GUIDE_WORDS },
  scenario: { scenarioType: SCENARIO_TYPES },
}

const COND = '{variable: ref, names?: [{declare: string, quant?: some | all | none} | {use: string} | null, …] naming the instances of a many-instance entity (one entry per many end: declare introduces a name that ranges over some (default) / all / no instances, nested in the order the names appear in the context, different names being different instances; use refers back to one declared by another condition; null skips an end), text?: string (condition in words instead of variable; with expr: true an expression over @[ref] variables), op?: = | ≠ | in | not in | < | ≤ | > | ≥ | between | not between (default =; in / not in need an enum variable, the order operators and between / not between a range variable), state: string (not for in / not in) (a state of an enum variable, true/false for boolean, a number for range), to?: number (upper bound, only for between / not between), other?: ref (instead of state: compare with another variable of the same type, op = ≠ and for range variables < ≤ > ≥; otherNames?: same format as names, for the instances of the compared variable), set?: string[] (states, only for in / not in)}'

const refFields = (kind: Kind): string[] => [...singleRefs(kind), ...listRefs(kind), ...(parentKinds(kind).length ? ['parent'] : [])]

const isText = (kind: Kind, f: string) => f === 'title' || textFields(kind).includes(f)

export interface FieldInfo { type: string; values?: readonly string[]; targets?: string; required?: boolean }

/** Machine-readable description of the fields of a kind, derived from the model defaults and ref registry. */
export function describeKind(kind: Kind): Record<string, FieldInfo> {
  const defaults = (kind === 'variable' ? Object.assign({}, ...VARIABLE_LAYERS.map((layer) => makeItem('variable', { layer }))) : kind === 'scenario' ? Object.assign({}, ...SCENARIO_TYPES.map((scenarioType) => makeItem('scenario', { scenarioType }))) : makeItem(kind)) as unknown as Rec
  const out: Record<string, FieldInfo> = {}
  for (const f of Object.keys(defaults)) {
    if (HIDDEN.has(f) || (f === 'parent' && !parentKinds(kind).length)) continue
    const v = defaults[f]
    const refs = refFields(kind)
    const target = f === 'parent' ? parentKinds(kind) : TARGETS[kind]?.[f]
    const info: FieldInfo = { type: Array.isArray(v) ? 'string[]' : typeof v === 'object' && v !== null ? 'object' : typeof v }
    if (f === 'parent') info.type = 'ref | null'
    else if (refs.includes(f)) info.type = Array.isArray(v) ? 'ref[]' : 'ref'
    if (f === 'notApplicable') info.type = '{guide: not-provided | provided | too-early-late | stopped-too-soon, reason?: string}[]'
    if (f === 'params' && kind === 'ca') info.type = '{name: string (unique), type: enum | boolean | range | symbolic, states?: string[] (enum), min?: number, max?: number, unit?: string (range), ordered?, unique?, monotonic?, sequential?: boolean (symbolic, default none), enumType?: string, rangeType?: string, symbolicType?: string (names of project types)}[] (typed parameters the control action carries, e.g. a dose)'
    if (f === 'params' && kind === 'operation') info.type = '{name: string (unique), entity?: ref (entity or relationship typed instance parameter), data?: {type, states?, min?, max?, unit?, ...} (value parameter, instead of entity)}[]'
    if (f === 'reading') info.type = 'string: how the relationship reads, with the ends as {1}, {2}, … (default "{1} <title> {2}"), e.g. "{1} is approaching {2}"'
    if (f === 'ends') info.type = '{entity: ref (entity), role?: string (name of this end, default the entity title), card?: string (1, 0..1, *, 1..*)}[] (at least two ends; a relationship is a predicate over its ends, e.g. [{entity: Train, card: "*"}, {entity: Crossing, card: "1"}] with title "approaches"; required)'
    if (f === 'effects') info.type = '{variable: ref (world variable), state: string, on?: string (name of the parameter whose instance the variable belongs to), from?: string (name of a value parameter whose argument becomes the value)}[] (what the operation changes)'
    if (f === 'args') info.type = '{param: string (name of a parameter of the UCA\'s control action), op?: =, ≠, in, not in (set), < ≤ > ≥ between (range), state, to?, set?}[] (conditions on the control action\'s parameters, e.g. {param: "dose", op: ">", state: "5"})'
    if (f === 'conditions') info.type = `(${COND} | Group)[] where Group = {any: boolean, of: (${COND} | Group)[]}: a list means all of; {any: true, of: [...]} is a disjunction (any of)`
    if (f === 'rules') info.type = `{state: string (a value of this variable), when: Group}[] where Group = {any: boolean, of: (${COND} | Group)[]} (all of / any of; a plain ${COND}[] means all of) (refinement of a world variable: the first rule whose condition holds gives its value, else otherwise)`
    if (f === 'min' || f === 'max') info.type = 'number | null'
    if (f === 'stride') info.type = 'string[]'
    if (f === 'trace') info.type = '{lanes: ref[] (variables, or "text:<text>" for a condition in words), steps: {t: string, note: string, values: {<variable ref>: value}, events: {on: ref (ca | feedback | operation), what: occurs | absent | lost, args?: {<parameter name>: instance or value}}[]}[]} (values carry forward to later steps)'
    if (f === 'severity' || f === 'likelihood') info.type = 'integer 0..5 (0 = unrated)'
    if (f === 'tags') info.type = 'string[]'
    if (f === 'status') info.values = STATUSES
    if (f === 'stride') info.values = STRIDE
    if (f === 'cause') info.values = [...new Set(Object.values(CAUSES).flat().map((c) => c.value))]
    if (ENUMS[kind]?.[f]) info.values = ENUMS[kind]![f]
    if (target) info.targets = Array.isArray(target) ? target.join(' | ') : target
    else if (target === null) info.targets = 'any item'
    if (requiredRefs(kind).includes(f)) info.required = true
    out[f] = info
  }
  return out
}

export class RefError extends Error {}

/** Maps labels (case-insensitive), ids and batch aliases (`$name`) to item ids. */
export class Resolver {
  private byLabel = new Map<string, Id>()
  labels: Record<Id, string>
  aliases: Record<string, Id> = {}
  constructor(public p: Project) {
    this.labels = computeLabels(p)
    for (const [id, l] of Object.entries(this.labels)) this.byLabel.set(l.toLowerCase(), id)
  }
  /** Register a freshly created item (labels of the item itself are recomputed by the caller via `refresh`). */
  refresh(p: Project) {
    this.p = p
    this.byLabel.clear()
    this.labels = computeLabels(p)
    for (const [id, l] of Object.entries(this.labels)) this.byLabel.set(l.toLowerCase(), id)
  }
  resolve(s: unknown): Id {
    if (typeof s !== 'string' || !s.trim()) throw new RefError(`Expected an item label like "H-1", an id or a unique title, got ${JSON.stringify(s)}`)
    const t = s.trim()
    if (t.startsWith('$')) {
      const a = this.aliases[t.slice(1)]
      if (!a) throw new RefError(`Unknown alias "${t}" (aliases must be defined by an earlier item of the same call)`)
      return a
    }
    if (this.p.items[t]) return t
    const id = this.byLabel.get(t.toLowerCase())
    if (id) return id
    const byTitle = Object.values(this.p.items).filter((i) => i.title.trim().toLowerCase() === t.toLowerCase())
    if (byTitle.length === 1) return byTitle[0].id
    if (byTitle.length > 1) throw new RefError(`Title "${t}" is ambiguous (${byTitle.map((i) => this.labels[i.id]).join(', ')}); use a label`)
    const near = [...this.byLabel.keys()].filter((l) => l.startsWith(t.toLowerCase().replace(/[.\-\d]+$/, ''))).slice(0, 6)
    throw new RefError(`No item "${t}"${near.length ? `; similar labels: ${near.join(', ').toUpperCase()}` : ''}`)
  }
  /** Replace labels inside `@[...]` mentions by ids. */
  internalText(t: string): string {
    return replaceMentions(t, (x, m) => {
      try { return mention(this.resolve(x)) } catch { return m }
    })
  }
  externalText(t: string): string {
    return replaceMentions(t, (id) => mention(this.labels[id] ?? id))
  }
  label = (id: Id | null | undefined) => (id ? this.labels[id] ?? DELETED : null)
}

/** Bindings of the ends of a variable (`[{declare}|{use}|null, …]`), copied when valid. */
function endNames(v: unknown, field: string): EndNames | undefined {
  if (v === undefined || v === null) return undefined
  if (!Array.isArray(v)) throw new Error(`${field} must be an array of {declare: name, quant?} | {use: name} | null`)
  const out = v.map((x: Rec | null): Binding | null => {
    if (x === null) return null
    if (x && typeof x === 'object' && isStr(x.declare) && x.declare.trim() && x.use === undefined) {
      if (x.quant !== undefined && !(QUANTIFIERS as readonly unknown[]).includes(x.quant)) throw new Error(`quant must be one of ${QUANTIFIERS.join(', ')}`)
      return declare(x.declare.trim(), x.quant as Quantifier | undefined)
    }
    if (x && typeof x === 'object' && isStr(x.use) && x.use.trim() && x.declare === undefined) return { use: x.use.trim() }
    throw new Error(`${field}: each entry is {declare: name, quant?}, {use: name} or null`)
  })
  while (out.length && out[out.length - 1] === null) out.pop()
  return out.length ? out : undefined
}
/** Instance names of a condition (many-instance entities), copied when valid. */
function instanceFields(c: Rec): InstanceNames {
  const names = endNames(c.names, 'names')
  return names ? { names } : {}
}
/** Instance names of the compared variable in a variable-to-variable comparison (`otherNames`). */
function otherInstanceFields(c: Rec): { otherNames?: EndNames } {
  const otherNames = endNames(c.otherNames, 'otherNames')
  return otherNames ? { otherNames } : {}
}

const isStr = (v: unknown): v is string => typeof v === 'string'

/** Data type of a control-action or value parameter: type, enum states, range bounds, named types, symbolic properties. */
function paramData(x: Rec) {
  if (!(VARIABLE_TYPES as readonly string[]).includes(x.type as string)) throw new Error(`type must be one of ${VARIABLE_TYPES.join(', ')}`)
  const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : null)
  return { type: x.type as VariableType, states: Array.isArray(x.states) ? x.states.filter(isStr) : [], min: num(x.min), max: num(x.max), unit: isStr(x.unit) ? x.unit : '', rangeType: isStr(x.rangeType) ? x.rangeType : '', enumType: isStr(x.enumType) ? x.enumType : '', ...(x.type === 'symbolic' ? { symbolicType: isStr(x.symbolicType) ? x.symbolicType : '', ...normSym({ ordered: x.ordered === true, unique: x.unique === true, monotonic: x.monotonic === true, sequential: x.sequential === true }) } : {}) }
}

/**
 * Validate agent-supplied fields for `kind` and convert them to the internal representation
 * (labels → ids). Throws a RefError / Error describing every problem found.
 */
export function internalize(r: Resolver, kind: Kind, fields: Rec, mode: 'create' | 'update'): Rec {
  const info = describeKind(kind)
  const errors: string[] = []
  const out: Rec = {}
  const checkKind = (id: Id, f: string) => {
    const allowed = f === 'parent' ? parentKinds(kind) : TARGETS[kind]?.[f]
    const got = r.p.items[id]?.kind
    if (allowed && got && !allowed.includes(got)) errors.push(`${f}: ${r.labels[id]} is a ${got}, expected ${allowed.join(' | ')}`)
  }
  const parseWhen = (w: unknown): Group => Array.isArray(w) ? allOf(...w.map((x: Rec) => (x && 'of' in x ? parseWhen(x) : parseCond(x))))
    : w && typeof w === 'object' && Array.isArray((w as Rec).of) ? { ...parseWhen((w as Rec).of), any: !!(w as Rec).any } : allOf()
  const timeBound = (t: unknown): TimeBound => {
    const x = t as Rec
    const amount = String(x?.amount ?? '')
    if (!x || (x.op !== '≥' && x.op !== '<') || !(TIME_UNITS as readonly string[]).includes(x.unit as string) || amount === '' || !(Number(amount) >= 0)) throw new Error('time must be {op: ≥ | <, amount: number, unit: ms | s | min | h}')
    return { op: x.op, amount, unit: x.unit as TimeUnit }
  }
  const parseCond = (c: Rec): Condition => {
    const time = c?.time === undefined ? undefined : timeBound(c.time)
    if (c?.event !== undefined) {
      const event = r.resolve(c.event)
      const k = r.p.items[event]?.kind
      if (k !== 'ca' && k !== 'feedback') throw new Error(`event: ${r.labels[event]} is not a control action or feedback`)
      if (!time) throw new Error('an event condition needs "time", e.g. {op: "≥", amount: 3, unit: "s"}: the time since the event occurred')
      return { kind: 'event', event, time }
    }
    const cond = parseBase(c)
    return time ? { ...cond, time } : cond
  }
  const parseBase = (c: Rec): Condition => {
    if (isStr(c?.text) && c.variable === undefined && c.expr === true) {
      const e: ExprCondition = { kind: 'expr', text: r.internalText(c.text) }
      const bad = exprError(r.p, e)
      if (bad) throw new Error(bad)
      return e
    }
    if (isStr(c?.text) && c.variable === undefined) return { kind: 'text', op: c.op === '≠' || c.negate === true ? '≠' : '=', text: c.text }
    const variable = r.resolve(c?.variable)
    checkKind(variable, 'variable')
    if (c.other !== undefined && c.other !== null && c.other !== '') {
      const other = r.resolve(c.other)
      checkKind(other, 'variable')
      const op: ConditionOp = c.op === undefined ? '=' : (c.op as ConditionOp)
      const cmp: VarCondition = { kind: 'var', variable, op, other, ...instanceFields(c), ...otherInstanceFields(c) }
      const vi = r.p.items[variable]
      const bad = vi?.kind === 'variable' ? conditionError(vi, cmp, r.p) : null
      if (bad) throw new Error(`${r.labels[variable]}: ${bad}`)
      return cmp
    }
    const isSet = c.op === 'in' || c.op === 'not in'
    if (isSet ? !Array.isArray(c.set) || !c.set.length || c.set.some((x) => !isStr(x)) : (!isStr(c.state) && typeof c.state !== 'number') || c.state === '') throw new Error(isSet ? 'in / not in need a non-empty "set" of state strings' : 'each condition needs a "state" string')
    const op: ConditionOp = c.op === undefined ? (c.negate === true ? '≠' : '=') : (c.op as ConditionOp)
    if (!(CONDITION_OPS as readonly string[]).includes(op)) throw new Error(`op must be one of ${CONDITION_OPS.join(', ')}`)
    const cond: ValueCondition = { kind: 'value', variable, op, state: isSet ? '' : String(c.state), ...(isSet ? { set: [...new Set(c.set as string[])] } : {}), ...(isRangeOp(op) ? { to: String(c.to ?? '') } : {}), ...instanceFields(c) }
    const vi = r.p.items[variable]
    const bad = vi?.kind === 'variable' ? conditionError(vi, cond, r.p) : null
    if (bad) throw new Error(`${r.labels[variable]}: ${bad}`)
    return cond
  }
  for (const [f, v] of Object.entries(fields)) {
    const spec = info[f]
    if (!spec) { errors.push(`unknown field "${f}" for ${kind}; allowed: ${Object.keys(info).join(', ')}`); continue }
    try {
      if (spec.type.startsWith('ref | null') || spec.type === 'ref') {
        if (v === null || v === '') {
          if (requiredRefs(kind).includes(f)) errors.push(`${f} is required`)
          out[f] = f === 'parent' || optionalRefs(kind).includes(f) ? null : ''
        } else {
          const id = r.resolve(v)
          checkKind(id, f)
          out[f] = id
        }
      } else if (spec.type === 'ref[]') {
        if (!Array.isArray(v)) throw new Error('expected an array of labels')
        out[f] = [...new Set(v.map((x) => { const id = r.resolve(x); checkKind(id, f); return id }))]
      } else if (f === 'conditions') {
        if (!Array.isArray(v)) throw new Error('expected an array')
        out[f] = v.map((x: Rec) => (x && Array.isArray(x.of) ? parseWhen(x) : parseCond(x)))
      } else if (f === 'rules') {
        if (!Array.isArray(v)) throw new Error('expected an array')
        out[f] = v.map((x: Rec) => ({ state: String(x?.state ?? ''), when: parseWhen(x?.when) }))
      } else if (f === 'trace') {
        const t = v as Rec
        const isVar = (id: Id) => { if (r.p.items[id]?.kind !== 'variable') throw new Error(`${r.labels[id]} is not a variable`) }
        // A lane "text:<condition in words>" is a boolean for that condition, not a variable.
        const lane = (x: unknown) => { if (isStr(x) && laneText(x) !== null) return asLane(x); const id = r.resolve(x); isVar(id); return laneOf(id) }
        if (!t || !Array.isArray(t.steps)) throw new Error('expected {lanes, steps}')
        const lanes = Array.isArray(t.lanes) ? t.lanes.map(lane) : []
        out[f] = {
          lanes: [...new Set(lanes)],
          steps: (t.steps as Rec[]).map((st) => ({
            t: isStr(st.t) ? st.t : '',
            note: isStr(st.note) ? r.internalText(st.note) : '',
            values: Object.fromEntries(Object.entries((st.values ?? {}) as Rec).map(([k, x]) => [lane(k), String(x)])),
            events: ((st.events ?? []) as Rec[]).map((e) => {
              const on = r.resolve(e.on)
              if (!['ca', 'feedback', 'operation'].includes(r.p.items[on]?.kind)) throw new Error(`event on ${r.labels[on]}: expected a control action, feedback or operation`)
              if (!(TRACE_EVENTS as readonly unknown[]).includes(e.what ?? 'occurs')) throw new Error(`event "what" must be one of ${TRACE_EVENTS.join(', ')}`)
              const args = e.args && typeof e.args === 'object' ? Object.fromEntries(Object.entries(e.args as Rec).map(([k, x]) => [k, String(x)])) : undefined
              return { on, what: (e.what ?? 'occurs') as TraceEventKind, ...(args && Object.keys(args).length ? { args } : {}) }
            }),
          })),
        }
      } else if (f === 'params' && kind === 'operation') {
        if (!Array.isArray(v) || v.some((x: Rec) => !isStr(x?.name) || !x.name.trim())) throw new Error('expected [{name, entity?, data?}]')
        if (new Set(v.map((x: Rec) => (x.name as string).trim())).size !== v.length) throw new Error('parameter names must be unique')
        out[f] = v.map((x: Rec) => {
          const entity = x.entity ? r.resolve(x.entity) : ''
          if (entity && !['entity', 'relationship'].includes(r.p.items[entity]?.kind)) throw new Error(`${r.labels[entity]} is not an entity or relationship`)
          if (!entity && !x.data) throw new Error(`parameter ${x.name} needs an entity (instance parameter) or data (value parameter)`)
          return { name: (x.name as string).trim(), entity, ...(x.data ? { data: paramData(x.data as Rec) } : {}) }
        })
      } else if (f === 'ends') {
        if (!Array.isArray(v) || v.length < 2) throw new Error('expected at least two ends [{entity, role?, card?}]')
        out[f] = v.map((x: Rec) => {
          const entity = r.resolve(x?.entity)
          checkKind(entity, 'entity')
          return { entity, role: isStr(x.role) ? x.role.trim() : '', card: isStr(x.card) && x.card ? x.card : '1' }
        })
      } else if (f === 'effects') {
        if (!Array.isArray(v)) throw new Error('expected an array')
        out[f] = v.map((x: Rec) => {
          const variable = r.resolve(x?.variable)
          checkKind(variable, 'variable')
          return { variable, state: x.state === undefined ? '' : String(x.state), ...(isStr(x.on) && x.on ? { on: x.on } : {}), ...(isStr(x.from) && x.from ? { from: x.from } : {}) }
        })
      } else if (f === 'params') {
        if (!Array.isArray(v) || v.some((x: Rec) => !isStr(x?.name) || !x.name.trim() || !(VARIABLE_TYPES as readonly string[]).includes(x.type as string))) throw new Error(`expected [{name, type}] with type among ${VARIABLE_TYPES.join(', ')}`)
        if (new Set(v.map((x: Rec) => (x.name as string).trim())).size !== v.length) throw new Error('parameter names must be unique')
        out[f] = v.map((x: Rec) => ({ name: (x.name as string).trim(), ...paramData(x) }))
      } else if (f === 'args') {
        if (!Array.isArray(v) || v.some((x: Rec) => !isStr(x?.param))) throw new Error('expected [{param, op?, state, to?, set?}]')
        out[f] = v.map((x: Rec) => {
          const op = (x.op ?? '=') as ConditionOp
          if (!(CONDITION_OPS as readonly string[]).includes(op)) throw new Error(`op must be one of ${CONDITION_OPS.join(', ')}`)
          return { param: x.param, op, state: x.state === undefined ? '' : String(x.state), ...(x.to !== undefined ? { to: String(x.to) } : {}), ...(Array.isArray(x.set) ? { set: x.set.filter(isStr) } : {}) }
        })
      } else if (f === 'notApplicable') {
        if (!Array.isArray(v) || v.some((n: Rec) => !(GUIDE_WORDS as readonly string[]).includes(n?.guide as string))) throw new Error(`expected [{guide, reason}] with guide among ${GUIDE_WORDS.join(', ')}`)
        out[f] = [...new Map(v.map((n: Rec) => [n.guide, { guide: n.guide, reason: isStr(n.reason) ? n.reason : '' }])).values()]
      } else if (spec.type === 'string[]') {
        if (!Array.isArray(v) || v.some((x) => !isStr(x))) throw new Error('expected an array of strings')
        if (f === 'stride' && v.some((x) => !(STRIDE as readonly string[]).includes(x))) throw new Error(`values must be among ${STRIDE.join(', ')}`)
        out[f] = v
      } else if (spec.type === 'number | null') {
        if (v !== null && !(typeof v === 'number' && Number.isFinite(v))) throw new Error('expected a number or null')
        out[f] = v
      } else if (spec.type === 'boolean') {
        if (typeof v !== 'boolean') throw new Error('expected a boolean')
        out[f] = v
      } else if (spec.type.startsWith('integer')) {
        if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 5) throw new Error('expected an integer 0..5')
        out[f] = v
      } else {
        if (!isStr(v)) throw new Error('expected a string')
        if (spec.values && !spec.values.includes(v)) throw new Error(`must be one of ${spec.values.join(', ')}`)
        out[f] = isText(kind, f) ? r.internalText(v) : v
      }
    } catch (e) {
      errors.push(`${f}: ${(e as Error).message}`)
    }
  }
  if (mode === 'create') {
    for (const f of requiredRefs(kind)) if (!out[f]) errors.push(`${f} is required`)
    if (kind === 'relationship' && !out.ends) errors.push('ends is required (at least two)')
    if (kind === 'scenario') {
      const t = (out.scenarioType as string) ?? 'uca'
      if (t === 'uca' && !out.uca) errors.push('scenarioType "uca" needs the field "uca"')
      if (t === 'ca' && !out.ca) errors.push('scenarioType "ca" needs the field "ca"')
    }
  }
  if (kind === 'scenario' && out.cause !== undefined && out.cause !== '') {
    const t = (out.scenarioType as string) ?? 'uca'
    if (!CAUSES[t as 'uca' | 'ca'].some((c) => c.value === out.cause))
      errors.push(`cause "${out.cause}" does not fit scenarioType "${t}"; use ${CAUSES[t as 'uca' | 'ca'].map((c) => c.value).join(' | ')}`)
  }
  if (errors.length) throw new Error(errors.join('; '))
  return out
}

const empty = (v: unknown) => v === '' || v === null || v === false || v === 0 || (Array.isArray(v) && v.length === 0)

const omitKind = <T extends { kind: string }>({ kind: _k, ...rest }: T) => rest

/** Agent-facing view of an item: labels instead of ids, empty fields left out. */
export function view(r: Resolver, it: Item, extra: Rec = {}): Rec {
  const raw = it as unknown as Rec
  const refs = new Set(refFields(it.kind))
  const out: Rec = { ref: r.labels[it.id], id: it.id, kind: it.kind }
  const cond = (c: Condition) => (isEvent(c) ? { event: r.label(c.event) ?? c.event, time: c.time } : isExpr(c) ? { text: r.externalText(c.text), op: '=', expr: true, ...(c.time ? { time: c.time } : {}) } : inWords(c) ? { text: r.externalText(c.text), op: c.op, ...(c.time ? { time: c.time } : {}) } : { ...omitKind(c), variable: r.label(c.variable) ?? c.variable, ...(isVarCmp(c) ? { other: r.label(c.other) ?? c.other } : {}) })
  const whenView = (w: When): Rec => (isGroup(w) ? { any: w.any, ...(w.not ? { not: true } : {}), of: w.of.map(whenView) } : cond(w))
  const lane = (k: Lane) => (laneText(k) !== null ? k : r.label(k))
  for (const f of Object.keys(describeKind(it.kind))) {
    const v = raw[f]
    if (f !== 'title' && empty(v)) continue
    if (f === 'status' && v === 'draft') continue
    if (f === 'parent') out.parent = r.label(v as Id)
    else if (refs.has(f)) out[f] = Array.isArray(v) ? v.map((x) => r.label(x as Id)) : r.label(v as Id)
    else if (f === 'conditions') out[f] = (v as When[]).map(whenView)
    else if (f === 'params' && it.kind === 'operation') out[f] = it.params.map((x) => ({ ...x, entity: x.entity ? r.label(x.entity) : '' }))
    else if (f === 'ends' && it.kind === 'relationship') out[f] = it.ends.map((x) => ({ entity: r.label(x.entity), ...(x.role ? { role: x.role } : {}), card: x.card }))
    else if (f === 'effects' && it.kind === 'operation') out[f] = it.effects.map((x) => ({ ...x, variable: r.label(x.variable) }))
    else if (f === 'rules') out[f] = (v as Rule[]).map((x) => ({ ...x, when: whenView(x.when) }))
    else if (f === 'trace') {
      const t = v as Trace
      if (!t.steps.length) continue
      out[f] = { lanes: t.lanes.map(lane), steps: t.steps.map((st) => ({ ...st, note: r.externalText(st.note), values: Object.fromEntries(laneEntries(st.values).map(([k, x]) => [lane(k), x])), events: st.events.map((e) => ({ ...e, on: r.label(e.on) })) })) }
    }
    else out[f] = isStr(v) && isText(it.kind, f) ? r.externalText(v) : v
  }
  return { ...out, ...extra }
}

export { renderText, KINDS }
