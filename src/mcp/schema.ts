import { makeItem } from '../model/create'
import { computeLabels, DELETED, renderText } from '../model/labels'
import { listRefs, mention, optionalRefs, replaceMentions, requiredRefs, singleRefs, textFields } from '../model/refs'
import { parentKinds } from '../model/tree'
import { allOf, isGroup, conditionError, isRangeOp, isText as inWords, laneText, mapLeaves } from '../model/variables'
import { CAUSES, CONDITION_OPS, DURATIONS, GUIDE_WORDS, KINDS, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPES, STATUSES, STRIDE, TRACE_EVENTS, VARIABLE_LAYERS, VARIABLE_TYPES, type Trace, type TraceEventKind, type Condition, type ConditionOp, type Rule, type When, type Group, type Id, type Item, type Kind, type Project } from '../model/types'

type Rec = Record<string, unknown>

/** Fields the agent may not set (managed by the model or purely visual). */
const HIDDEN = new Set(['id', 'kind', 'rank', 'nudge', 'bend', 'labelShift', 'wide', 'tall'])

/** Allowed target kinds of reference fields (`null` = any item). */
const TARGETS: Partial<Record<Kind, Record<string, Kind[] | null>>> = {
  hazard: { lossLinks: ['loss'], lossExclude: ['loss'], variables: ['variable'] },
  constraint: { hazards: ['hazard'] },
  requirement: { sources: null },
  assumption: { about: null },
  relationship: { from: ['entity'], to: ['entity'] },
  node: { entities: ['entity'] },
  variable: { about: ['variable'] },
  ca: { from: ['node'], to: ['node'], affects: ['variable'] },
  feedback: { from: ['node'], to: ['node'] },
  uca: { ca: ['ca'], hazards: ['hazard'], refines: ['uca'] },
  scenario: { uca: ['uca'], ca: ['ca'], hazards: ['hazard'], element: ['node'] },
}

const ENUMS: Partial<Record<Kind, Record<string, readonly string[]>>> = {
  requirement: { type: REQUIREMENT_TYPES },
  node: { role: NODE_ROLES },
  ca: { duration: DURATIONS },
  variable: { type: VARIABLE_TYPES, layer: VARIABLE_LAYERS },
  uca: { guide: GUIDE_WORDS },
  scenario: { scenarioType: SCENARIO_TYPES },
}

const COND = '{variable: ref, op?: = | ≠ | in | not in | < | ≤ | > | ≥ | between | not between (default =; in / not in need an enum variable, the order operators and between / not between a range variable), state: string (not for in / not in) (a state of an enum variable, true/false for boolean, a number for range), to?: number (upper bound, only for between / not between), other?: ref (instead of state: compare with another variable of the same type, op = ≠ and for range variables < ≤ > ≥), set?: string[] (states, only for in / not in)}'

const refFields = (kind: Kind): string[] => [...singleRefs(kind), ...listRefs(kind), ...(parentKinds(kind).length ? ['parent'] : [])]

const isText = (kind: Kind, f: string) => f === 'title' || textFields(kind).includes(f)

export interface FieldInfo { type: string; values?: readonly string[]; targets?: string; required?: boolean }

/** Machine-readable description of the fields of a kind, derived from the model defaults and ref registry. */
export function describeKind(kind: Kind): Record<string, FieldInfo> {
  const defaults = makeItem(kind) as unknown as Rec
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
    if (f === 'conditions') info.type = `(${COND} | Group)[] where Group = {any: boolean, of: (${COND} | Group)[]}: a list means all of; {any: true, of: [...]} is a disjunction (any of)`
    if (f === 'rules') info.type = `{state: string (a value of this variable), when: Group}[] where Group = {any: boolean, of: (${COND} | Group)[]} (all of / any of; a plain ${COND}[] means all of) (refinement of a world variable: the first rule whose condition holds gives its value, else otherwise)`
    if (f === 'min' || f === 'max') info.type = 'number | null'
    if (f === 'stride') info.type = 'string[]'
    if (f === 'trace') info.type = '{lanes: ref[] (variables, or "text:<text>" for a condition in words), steps: {t: string, note: string, values: {<variable ref>: value}, events: {on: ref (ca | feedback), what: occurs | absent | lost}[]}[]} (values carry forward to later steps)'
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

const isStr = (v: unknown): v is string => typeof v === 'string'

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
  const parseCond = (c: Rec): Condition => {
    if (isStr(c?.text) && c.variable === undefined) return { variable: '', op: c.op === '≠' || c.negate === true ? '≠' : '=', state: 'true', text: c.text }
    const variable = r.resolve(c?.variable)
    checkKind(variable, 'variable')
    if (c.other !== undefined && c.other !== null && c.other !== '') {
      const other = r.resolve(c.other)
      checkKind(other, 'variable')
      const op: ConditionOp = c.op === undefined ? '=' : (c.op as ConditionOp)
      const cmp: Condition = { variable, op, state: '', other }
      const vi = r.p.items[variable]
      const bad = vi?.kind === 'variable' ? conditionError(vi, cmp, r.p) : null
      if (bad) throw new Error(`${r.labels[variable]}: ${bad}`)
      return cmp
    }
    const isSet = c.op === 'in' || c.op === 'not in'
    if (isSet ? !Array.isArray(c.set) || !c.set.length || c.set.some((x) => !isStr(x)) : (!isStr(c.state) && typeof c.state !== 'number') || c.state === '') throw new Error(isSet ? 'in / not in need a non-empty "set" of state strings' : 'each condition needs a "state" string')
    const op: ConditionOp = c.op === undefined ? (c.negate === true ? '≠' : '=') : (c.op as ConditionOp)
    if (!(CONDITION_OPS as readonly string[]).includes(op)) throw new Error(`op must be one of ${CONDITION_OPS.join(', ')}`)
    const cond: Condition = { variable, op, state: isSet ? '' : String(c.state), ...(isSet ? { set: [...new Set(c.set as string[])] } : {}), ...(isRangeOp(op) ? { to: String(c.to ?? '') } : {}) }
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
        const lane = (x: unknown) => { if (isStr(x) && laneText(x) !== null) return x; const id = r.resolve(x); isVar(id); return id }
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
              if (!['ca', 'feedback'].includes(r.p.items[on]?.kind)) throw new Error(`event on ${r.labels[on]}: expected a control action or feedback`)
              if (!(TRACE_EVENTS as readonly unknown[]).includes(e.what ?? 'occurs')) throw new Error(`event "what" must be one of ${TRACE_EVENTS.join(', ')}`)
              return { on, what: (e.what ?? 'occurs') as TraceEventKind }
            }),
          })),
        }
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
  if (kind === 'ca' && isStr(out.operation) && out.operation.includes(':')) {
    const [ent, ...op] = out.operation.split(':')
    try { out.operation = `${r.resolve(ent)}:${op.join(':')}` } catch { /* keep as given */ }
  }
  if (mode === 'create') {
    for (const f of requiredRefs(kind)) if (!out[f]) errors.push(`${f} is required`)
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

/** Agent-facing view of an item: labels instead of ids, empty fields left out. */
export function view(r: Resolver, it: Item, extra: Rec = {}): Rec {
  const raw = it as unknown as Rec
  const refs = new Set(refFields(it.kind))
  const out: Rec = { ref: r.labels[it.id], id: it.id, kind: it.kind }
  const cond = (c: Condition) => (inWords(c) ? { text: c.text, op: c.op } : { ...c, variable: r.label(c.variable) ?? c.variable })
  const lane = (k: Id) => (laneText(k) !== null ? k : r.label(k))
  for (const f of Object.keys(describeKind(it.kind))) {
    const v = raw[f]
    if (f !== 'title' && empty(v)) continue
    if (f === 'status' && v === 'draft') continue
    if (f === 'parent') out.parent = r.label(v as Id)
    else if (refs.has(f)) out[f] = Array.isArray(v) ? v.map((x) => r.label(x as Id)) : r.label(v as Id)
    else if (f === 'conditions') out[f] = (v as When[]).map((w) => (isGroup(w) ? mapLeaves(w, cond as (c: Condition) => Condition) : cond(w)))
    else if (f === 'rules') out[f] = (v as Rule[]).map((x) => ({ ...x, when: mapLeaves(x.when, cond as (c: Condition) => Condition) }))
    else if (f === 'trace') {
      const t = v as Trace
      if (!t.steps.length) continue
      out[f] = { lanes: t.lanes.map(lane), steps: t.steps.map((st) => ({ ...st, note: r.externalText(st.note), values: Object.fromEntries(Object.entries(st.values).map(([k, x]) => [lane(k), x])), events: st.events.map((e) => ({ ...e, on: r.label(e.on) })) })) }
    }
    else out[f] = isStr(v) && isText(it.kind, f) ? r.externalText(v) : v
  }
  if (it.kind === 'ca' && isStr(raw.operation) && raw.operation.includes(':')) {
    const [ent, ...op] = raw.operation.split(':')
    out.operation = `${r.label(ent) ?? ent}:${op.join(':')}`
  }
  return { ...out, ...extra }
}

export { renderText, KINDS }
