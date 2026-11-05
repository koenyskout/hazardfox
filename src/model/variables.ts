import { endName, shortName } from './labels'
import { QUANT_LABELS, UNIT_S, type Binding, type EndNames, type Condition, type EventCondition, type TextCondition, type ValueCondition, type VarCondition, type TimeBound, type TimeUnit, type Id, type Quantifier, type ConditionOp, type Group, type Item, type Project, type RelEnd, type Relationship, type SymbolicType, type Variable, type When } from './types'

const RANGE_OPS: readonly ConditionOp[] = ['=', '≠', '<', '≤', '>', '≥', 'between', 'not between']
const ENUM_OPS: readonly ConditionOp[] = ['=', '≠', 'in', 'not in']
/** Operators as they read in a sentence. */
export const OP_LABELS: Record<ConditionOp, string> = { '=': 'is', '≠': 'is not', in: 'is one of', 'not in': 'is not one of', '<': 'is less than', '≤': 'is at most', '>': 'is greater than', '≥': 'is at least', between: 'is between', 'not between': 'is not between' }
export const isRangeOp = (op: ConditionOp) => op === 'between' || op === 'not between'
export const isSetOp = (op: ConditionOp) => op === 'in' || op === 'not in'

/** Operators that make sense for the variable's type. */
export const opsFor = (v: Variable | undefined): readonly ConditionOp[] => (v?.type === 'range' ? RANGE_OPS : v?.type === 'boolean' ? ['=', '≠'] : v?.type === 'symbolic' ? symbolicOps(v) : ENUM_OPS)

export const isSymbolic = (v: Variable | undefined) => v?.type === 'symbolic'
/** Symbolic properties made consistent: monotonic / sequential imply ordered. */
export const normSym = (t: Partial<SymbolicType>): SymbolicType => {
  const monotonic = !!t.monotonic, sequential = !!t.sequential, ordered = !!t.ordered || monotonic || sequential, unique = !!t.unique
  return { ordered, unique, monotonic, sequential }
}
export const SYMBOLIC_DEFAULT: SymbolicType = { ordered: false, unique: false, monotonic: false, sequential: false }
export const symProps = (v: Partial<SymbolicType>): SymbolicType => normSym({ ...SYMBOLIC_DEFAULT, ...v })
/** Operators of a symbolic type: = / ≠, plus the order operators when ordered. */
const symbolicOps = (v: Variable): readonly ConditionOp[] => (v.ordered ? ['=', '≠', '<', '≤', '>', '≥'] : ['=', '≠'])
const NATURAL = new Intl.Collator(undefined, { numeric: true })
/** Order of two symbolic constants: natural order of the symbols (t2 < t10). */
export const compareSymbols = (a: string, b: string) => NATURAL.compare(a, b)
const SYM = /^(.*?)(\d+)$/
/** A symbol that sorts after `s` (t3 → t4). */
export const symbolAfter = (s: string) => { const m = SYM.exec(s); return m ? m[1] + (Number(m[2]) + 1) : s + '1' }
/** A symbol that sorts before `s` (t3 → t2; '' when there is none to name). */
export const symbolBefore = (s: string) => { const m = SYM.exec(s); return m && Number(m[2]) > 0 ? m[1] + (Number(m[2]) - 1) : '' }

/** Values a condition on this variable may compare with, or null when free numeric input. */
export const valuesOf = (v: Variable | undefined): string[] | null => (v?.type === 'boolean' ? ['true', 'false'] : v?.type === 'range' || v?.type === 'symbolic' ? null : v?.states ?? [])

const num = (n: number) => String(n)

/** "running | stopped", "true | false" or "0–100 %". */
export function describeStates(v: Variable): string {
  if (v.type === 'boolean') return 'true | false'
  if (v.type === 'symbolic') return `${v.symbolicType || 'symbolic'} (${[v.ordered && 'ordered', v.unique && 'unique', v.monotonic && 'monotonic', v.sequential && 'sequential'].filter(Boolean).join(', ')})`
  if (v.type !== 'range') return v.states.join(' | ')
  const u = v.unit ? ' ' + v.unit : ''
  if (v.min !== null && v.max !== null) return `${num(v.min)}–${num(v.max)}${u}`
  if (v.min !== null) return `≥ ${num(v.min)}${u}`
  if (v.max !== null) return `≤ ${num(v.max)}${u}`
  return v.unit ? `number (${v.unit})` : 'number'
}

/** Step for number inputs and sliders: 1 for integer bounds, else a power of ten giving about 100 steps. */
export function stepOf(v: Variable): number {
  if (v.min === null || v.max === null) return 1
  const span = v.max - v.min
  if (Number.isInteger(v.min) && Number.isInteger(v.max) && span >= 20) return 1
  return 10 ** Math.floor(Math.log10(span / 100 || 1))
}

/** A condition in words (no variable). */
export const isText = (c: Condition): c is TextCondition => c.kind === 'text'
/** A condition on the time since an event (control action or feedback) occurred. */
export const isEvent = (c: Condition): c is EventCondition => c.kind === 'event'
/** A condition comparing the variable with another variable instead of a constant. */
export const isVarCmp = (c: Condition): c is VarCondition => c.kind === 'var'
/** A condition on a variable: compared with a constant or with another variable. */
export const isOnVariable = (c: Condition): c is ValueCondition | VarCondition => c.kind === 'value' || c.kind === 'var'
/** A condition comparing a variable with constants. */
export const isValueCmp = (c: Condition): c is ValueCondition => c.kind === 'value'
/** The same condition on another variable, compared with a constant; instance names and timing stay. */
export const toValue = (c: ValueCondition | VarCondition, to: Partial<ValueCondition> = {}): ValueCondition => {
  const { variable, quant, names, time, op } = c
  return { kind: 'value', variable, op: op, state: '', quant, names, time, ...to }
}
/** The same condition compared with the variable `other`; instance names and timing stay (the compared variable's own instance names start empty). */
export const toVarCmp = (c: ValueCondition | VarCondition, other: Id, to: Partial<VarCondition> = {}): VarCondition => {
  const { variable, quant, names, time, op } = c
  return { kind: 'var', variable, op, other, quant, names, time, ...to }
}
/** What the condition does with the name of an end (0-based). */
export const bindingAt = (n: EndNames | undefined, end: number): Binding | null => n?.[end] ?? null
export const declares = (n: EndNames | undefined, end: number): boolean => { const b = bindingAt(n, end); return !!b && 'declare' in b }
export const uses = (n: EndNames | undefined, end: number): boolean => { const b = bindingAt(n, end); return !!b && 'use' in b }
/** The name used at an end, declared or referred to ('' if none). */
/** The name of a binding. */
export const nameOf = (b: Binding): string => ('declare' in b ? b.declare : b.use).trim()
/** The name declared at an end, if it declares one. */
export const declaredAt = (n: EndNames | undefined, end: number): string | undefined => (declares(n, end) ? nameAt(n, end) : undefined)
/** The name an end refers to, if it uses one. */
export const usedAt = (n: EndNames | undefined, end: number): string | undefined => (uses(n, end) ? nameAt(n, end) : undefined)
export const nameAt = (n: EndNames | undefined, end: number): string => { const b = bindingAt(n, end); return b ? nameOf(b) : '' }
/** The names with one end's binding replaced (`null` clears it); undefined when no end is bound. */
export const withBinding = (n: EndNames | undefined, end: number, b: Binding | null): EndNames | undefined => {
  const out = [...(n ?? [])]
  while (out.length <= end) out.push(null)
  out[end] = b
  while (out.length && out[out.length - 1] === null) out.pop()
  return out.length ? out : undefined
}
/** `c` with the binding at one end set (or cleared). */
export const bindAt = <C extends { names?: EndNames }>(c: C, end: number, b: Binding | null): C => ({ ...c, names: withBinding(c.names, end, b) })
/** The name sets of a condition: its variable's and, in a variable comparison, the compared variable's. */
export const sidesOf = (c: ValueCondition | VarCondition): EndNames[] => (isVarCmp(c) && c.otherNames ? [c.names ?? [], c.otherNames] : [c.names ?? []])
/** Every instance name a condition uses. */
export const allNames = (c: ValueCondition | VarCondition): string[] => sidesOf(c).flatMap((n) => n.map((_, i) => nameAt(n, i))).filter(Boolean)
/** The condition with the name declared at one end set (`cmp`: at the compared variable's end) or cleared. */
export const withInstanceName = (c: Condition, end: number, name: string | undefined, cmp = false): Condition => {
  if (!isOnVariable(c)) return c
  const b = name === undefined ? null : { declare: name }
  if (!cmp) return { ...c, names: withBinding(c.names, end, b) }
  return isVarCmp(c) ? { ...c, otherNames: withBinding(c.otherNames, end, b) } : c
}
/** The condition with references to the instance name `old` changed to `to`. */
export const renameSame = (c: Condition, old: string, to: string | undefined): Condition => {
  if (!isOnVariable(c)) return c
  const r = (n: EndNames | undefined) => n?.map((b) => (b && 'use' in b && b.use === old ? (to === undefined ? null : { use: to }) : b))
  return isVarCmp(c) ? { ...c, names: r(c.names), ...(c.otherNames ? { otherNames: r(c.otherNames) } : {}) } : { ...c, names: r(c.names) }
}
const timeOk = (t: TimeBound | undefined) => !!t && t.amount.trim() !== '' && Number.isFinite(Number(t.amount)) && Number(t.amount) >= 0
/** Seconds of a time bound. */
export const boundSeconds = (t: TimeBound) => Number(t.amount) * UNIT_S[t.unit]
/** A trace step time: "5", "5 s", "200ms", "1.5 min" (a bare number is seconds); null for other labels such as "t1". */
export function parseTime(s: string): number | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(ms|s|min|h)?\s*$/.exec(s)
  return m ? Number(m[1]) * UNIT_S[(m[2] ?? 's') as TimeUnit] : null
}
export const timeText = (t: TimeBound) => `${t.op === '≥' ? 'at least' : 'less than'} ${t.amount} ${t.unit}`
const TEXT_KEY = 'text:'
/** Trace lane / state key of a condition: its variable, or for a condition in words its text. */
export const condKey = (c: TextCondition | ValueCondition | VarCondition): string => (isText(c) ? TEXT_KEY + c.text.trim() : c.variable)
/** The text of a lane key of a condition in words, else null. */
export const laneText = (key: string): string | null => (key.startsWith(TEXT_KEY) ? key.slice(TEXT_KEY.length) : null)

/** Operators for comparing two variables. */
export const opsForVar = (v: Variable | undefined): readonly ConditionOp[] => (v?.type === 'range' ? ['=', '≠', '<', '≤', '>', '≥'] : v?.type === 'symbolic' ? symbolicOps(v) : ['=', '≠'])

/** Whether the condition is complete enough to appear in a sentence. */
export const conditionComplete = (c: Condition): boolean => (isEvent(c) ? !!c.event && timeOk(c.time) : (!c.time || timeOk(c.time)) && baseComplete(c))
const baseComplete = (c: Exclude<Condition, EventCondition>) => isText(c) ? !!c.text.trim() : isVarCmp(c) ? !!c.variable : (isSetOp(c.op) ? !!c.set?.length : !!c.state) && (!isRangeOp(c.op) || !!c.to)

/** Whether an entity has several instances; a specialisation of a many-instance entity does too. */
export function manyEntity(p: Project, id: Id): boolean {
  const seen = new Set<Id>()
  let x: Item | undefined = p.items[id]
  while (x?.kind === 'entity' && !seen.has(x.id)) { if (x.many) return true; seen.add(x.id); x = x.relation === 'specialisation' && x.parent ? p.items[x.parent] : undefined }
  return false
}
/** Whether an end of a relationship ranges over several instances: its entity is `many` or its cardinality says so. */
export const manyEnd = (p: Project, e: RelEnd): boolean => manyEntity(p, e.entity) || e.card === '*' || e.card === '1..*'
/** The many ends of a relationship (entity ends only), in order. */
const manyEnds = (p: Project, r: Relationship): RelEnd[] => r.ends.filter((e) => p.items[e.entity]?.kind === 'entity' && manyEnd(p, e))
/** Whether a world variable describes several instances: it belongs to a `many` entity, or to a relationship with a `many` end (entity or cardinality). */
export function isMany(p: Project, v: Variable): boolean {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  if (o?.kind === 'entity') return manyEntity(p, o.id)
  return o?.kind === 'relationship' && o.ends.some((e) => manyEnd(p, e))
}

/** The quantifier a condition effectively carries: null when it is about a single instance (also for text / variable comparisons), else its own or `some`. */
export function quantOf(p: Project, c: Condition): Quantifier | null {
  if (!isOnVariable(c)) return null
  const v = p.items[c.variable]
  return v?.kind === 'variable' && isMany(p, v) ? (nameAt(c.names, 0) ? 'some' : c.quant ?? 'some') : null
}
/** The entity whose instances a many variable ranges over (a relationship's first many end). */
export function boundEntity(p: Project, v: Variable): Id | null {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  if (o?.kind === 'entity') return o.id
  if (o?.kind !== 'relationship') return null
  return manyEnds(p, o)[0]?.entity ?? null
}
/** The second many end of a relationship variable (the one `boundEntity` leaves out), else null. */
export function otherEnd(p: Project, v: Variable): Id | null {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  return o?.kind === 'relationship' ? manyEnds(p, o)[1]?.entity ?? null : null
}
/** The instances a condition introduces or refers to: [entity, name, introduces]. */
export function condInstances(p: Project, c: Condition): { entity: Id; name: string; intro: boolean; end: number; cmp?: boolean }[] {
  const v = isOnVariable(c) ? p.items[c.variable] : undefined
  if (!isOnVariable(c) || v?.kind !== 'variable') return []
  const out: { entity: Id; name: string; intro: boolean; end: number; cmp?: boolean }[] = []
  const side = (n: EndNames | undefined, x: Variable, cmp: boolean) => {
    [boundEntity(p, x), otherEnd(p, x)].forEach((entity, end) => {
      const name = nameAt(n, end)
      if (entity && name) out.push({ entity, name, intro: declares(n, end), end, ...(cmp ? { cmp } : {}) })
    })
  }
  side(c.names, v, false)
  const ov = isVarCmp(c) ? p.items[c.other] : undefined
  if (ov?.kind === 'variable') side(isVarCmp(c) ? c.otherNames : undefined, ov, true)
  return out
}
const laneOf = (id: Id, n: EndNames | undefined): string => {
  const names = (n ?? []).map((_, i) => nameAt(n, i))
  while (names.length && !names[names.length - 1]) names.pop()
  return names.length ? `${id}@${names.join('|')}` : id
}
export const instLane = (c: TextCondition | ValueCondition | VarCondition): string => (isText(c) ? condKey(c) : laneOf(c.variable, c.names))
export const otherLane = (c: VarCondition): string => laneOf(c.other, c.otherNames)
/** Variable and instance names of a lane key. */
export const laneParts = (key: string): { id: Id; names: string[] } => { const i = key.indexOf('@'); return i < 0 || laneText(key) !== null ? { id: key, names: [] } : { id: key.slice(0, i), names: key.slice(i + 1).split('|') } }

/** `earlier`: the conditions before this one; a named some-instance of an entity already named differently there reads "another …" (different names stand for different instances). */
export function conditionText(p: Project, c: Condition, earlier: Condition[] = []): string {
  if (isEvent(c)) return c.time ? `${timeText(c.time)} after @[${c.event}]` : ''
  const s = baseText(p, c, earlier)
  return c.time && s ? `${s} for ${timeText(c.time)}` : s
}
function baseText(p: Project, c: Exclude<Condition, EventCondition>, earlier: Condition[]): string {
  const q = quantOf(p, c)
  const intro = condInstances(p, c).filter((x) => x.intro && !x.cmp)
  const prior = earlier.flatMap((o) => condInstances(p, o))
  // another: it introduces a name for an entity whose instance an earlier condition already named differently
  const another = (end: number) => { const x = intro.find((i) => i.end === end); return !!x && prior.some((o) => o.entity === x.entity && o.name !== x.name) }
  if (q && isOnVariable(c)) return quantText(p, c, q, another(0), another(1))
  return plainText(p, c)
}
/** The sentences of a list of conditions, each knowing the ones before it. */
export const conditionTexts = (p: Project, cs: Condition[]) => cs.map((c, i) => conditionText(p, c, cs.slice(0, i)))
/** The sentences of a list of conditions and groups (all must hold), skipping incomplete ones. */
export const whenTexts = (p: Project, ws: When[]): string[] => ws.map((w, i) => whenText(p, w, false, ws.slice(0, i).flatMap(leaves))).filter(Boolean)

/** "speed of every Train is 0", "speed of some Train t1 is 0", "speed of t1 is 0", "some Train t1 at Station", "no Train at Station", "some Train t1 approaches Crossing c1". */
function quantText(p: Project, c: ValueCondition | VarCondition, q: Quantifier, another = false, another2 = false): string {
  const v = p.items[c.variable] as Variable
  const o = p.items[v.parent!]
  const name = shortName(p, v)
  const title = (id: Id | null) => p.items[id ?? '']?.title.trim()
  const ent = title(boundEntity(p, v)) || (o.kind === 'entity' ? 'instance' : 'link')
  const n = nameAt(c.names, 0), n2 = nameAt(c.names, 1)
  const label = another ? 'another' : QUANT_LABELS[q]
  const who = uses(c.names, 0) ? n : `${label} ${ent}${n ? ' ' + n : ''}`
  const e2 = otherEnd(p, v)
  const who2 = !e2 || !n2 ? '' : uses(c.names, 1) ? n2 : `${another2 ? 'another ' : ''}${title(e2) || 'instance'} ${n2}`
  if (o.kind === 'entity') return `${name} of ${who} ${plainText(p, c).slice(name.length).trim()}`
  if (!v.title.trim() && o.kind === 'relationship' && !isVarCmp(c)) {
    const bare = c.op === '=' && c.state === 'true'
    const parts = o.ends.map((e) => endName(p, e))
    const first = Math.max(0, o.ends.findIndex((e) => e.entity === boundEntity(p, v)))
    parts[first] = who
    if (who2) parts[o.ends.findIndex((e, i) => i !== first && e.entity === otherEnd(p, v))] = who2
    parts.splice(1, 0, o.title.trim() || '?')
    const text = parts.join(' ')
    return bare ? text : `${text} ${OP_LABELS[c.op]} ${c.state}`
  }
  return `${who}${who2 ? ' and ' + who2 : ''} where ${plainText(p, c)}`
}

function plainText(p: Project, c: Exclude<Condition, EventCondition>): string {
  if (isEvent(c)) return ''
  if (isText(c)) return c.op === '≠' && !c.expr ? `not (${c.text.trim()})` : c.text.trim()
  const v = p.items[c.variable]
  if (v?.kind !== 'variable') return ''
  const u = v.type === 'range' && v.unit ? ' ' + v.unit : ''
  const name = shortName(p, v)
  if (isVarCmp(c)) { const o = p.items[c.other]; return o?.kind === 'variable' ? `${name} ${OP_LABELS[c.op]} ${o.title}${[nameAt(c.otherNames, 0), nameAt(c.otherNames, 1)].filter(Boolean).map((n, i) => (i ? ' and ' : ' of ') + n).join('')}` : '' }
  if (isSetOp(c.op)) return `${name} ${OP_LABELS[c.op]} {${(c.set ?? []).join(', ')}}`
  return isRangeOp(c.op) ? `${name} ${OP_LABELS[c.op]} ${c.state} and ${c.to}${u}` : `${name} ${OP_LABELS[c.op]} ${c.state}${u}`
}

/** Problem with the condition's value for the variable's type, or null. */
export function conditionError(v: Variable, c: ValueCondition | VarCondition, p?: Project): string | null {
  if (c.time && !timeOk(c.time)) return 'the duration is not a number'
  if (isVarCmp(c)) {
    const o = p?.items[c.other]
    if (p && o?.kind !== 'variable') return 'compared variable not found'
    if (!opsForVar(v).includes(c.op)) return `operator ${c.op} does not apply to ${v.type} variables`
    if (o?.kind === 'variable' && o.type !== v.type) return `cannot compare ${v.type} ${v.title} with ${o.type} ${o.title}`
    if (o?.kind === 'variable' && v.type === 'range' && v.unit && o.unit && v.unit !== o.unit) return `units differ (${v.unit} vs ${o.unit})`
    if (o?.kind === 'variable' && v.type === 'symbolic' && v.symbolicType !== o.symbolicType) return `${v.title} (${v.symbolicType || 'untyped'}) and ${o.title} (${o.symbolicType || 'untyped'}) are of different symbolic types`
    if (o?.kind === 'variable' && v.type === 'enum' && !v.states.some((s) => o.states.includes(s))) return `${v.title} and ${o.title} share no states`
    return null
  }
  if (!opsFor(v).includes(c.op)) return `operator ${c.op} does not apply to ${v.type} variables`
  if (v.type === 'symbolic') return c.state.trim() === '' ? 'a symbol is required' : null
  const vals = valuesOf(v)
  if (isSetOp(c.op)) { const bad = (c.set ?? []).find((x) => !vals?.includes(x)); return bad === undefined ? null : `"${bad}" is not one of ${(vals ?? []).join(', ')}` }
  if (vals) return !vals.length || vals.includes(c.state) ? null : `"${c.state}" is not one of ${vals.join(', ')}`
  const bad = [c.state, ...(isRangeOp(c.op) ? [c.to ?? ''] : [])].find((x) => x.trim() === '' || !Number.isFinite(Number(x)))
  if (bad !== undefined) return `"${bad}" is not a number`
  if (isRangeOp(c.op) && Number(c.state) > Number(c.to)) return 'lower bound exceeds upper bound'
  const out = [c.state, ...(isRangeOp(c.op) ? [c.to ?? ''] : [])].find((x) => (v.min !== null && Number(x) < v.min) || (v.max !== null && Number(x) > v.max))
  if (out !== undefined) return `${out} is outside the range ${describeStates(v)}`
  return null
}

export const isGroup = (w: When): w is Group => 'of' in w
export const allOf = (...of: When[]): Group => ({ any: false, of })
export const anyOf = (...of: When[]): Group => ({ any: true, of })
/** The conditions in a condition tree. */
export const leaves = (w: When): Condition[] => (isGroup(w) ? w.of.flatMap(leaves) : [w])
/** The conditions to make true to satisfy a tree: all of an all-of group, the first branch of an any-of group (to draft traces). */
export const required = (w: When): Condition[] => (isGroup(w) ? (w.not ? [] : w.any ? w.of.slice(0, 1) : w.of).flatMap(required) : [w])
/** The tree with each condition replaced (null drops it). */
export const mapLeaves = (g: Group, f: (c: Condition) => Condition | null): Group =>
  ({ ...g, of: g.of.flatMap((w) => { const x = isGroup(w) ? mapLeaves(w, f) : f(w); return x ? [x] : [] }) })
/** "A and (B or C)", from complete conditions only. */
export function whenText(p: Project, w: When, top = true, before: Condition[] = []): string {
  if (!isGroup(w)) return conditionComplete(w) ? conditionText(p, w, before) : ''
  const parts = w.of.map((x, i) => whenText(p, x, false, [...before, ...w.of.slice(0, i).flatMap(leaves)])).filter(Boolean)
  const s = parts.join(w.any ? ' or ' : ' and ')
  if (w.not) return parts.length ? `not (${s})` : ''
  return !top && parts.length > 1 ? `(${s})` : s
}

/** A short unused instance name for an entity: t1, t2, … */
export function autoName(p: Project, entity: Id | null, scope: Condition[], taken: string[] = []): string {
  const base = ((p.items[entity ?? '']?.title.trim().replace(/[^\p{L}]/gu, '').slice(0, 2)) || 'x').toLowerCase()
  const used = new Set([...scope.filter(isOnVariable).flatMap(allNames), ...taken])
  let n = 1
  while (used.has(base + n)) n++
  return base + n
}
/** Every instance a condition introduces gets a name, so conditions and traces can always refer to it. */
export function nameInstances(p: Project, ws: When[]): When[] {
  const copy = (w: When): When => (isGroup(w) ? { ...w, of: w.of.map(copy) } : { ...w })
  const out = ws.map(copy)
  const all = out.flatMap(leaves)
  for (const c of all) {
    if (!isOnVariable(c)) continue
    const v = p.items[c.variable]
    if (v?.kind !== 'variable') continue
    const bound = quantOf(p, c) === 'some' && !uses(c.names, 0) ? boundEntity(p, v) : null
    if (bound && !nameAt(c.names, 0)) c.names = withBinding(c.names, 0, { declare: autoName(p, bound, all) })
    const other = !uses(c.names, 1) ? otherEnd(p, v) : null
    if (other && !nameAt(c.names, 1)) c.names = withBinding(c.names, 1, { declare: autoName(p, other, all) })
  }
  return out
}
/** The project with every "some" instance in UCA and hazard conditions named (files and tool calls may leave names out). */
export function nameAllInstances(p: Project): Project {
  let q = p
  for (const it of Object.values(p.items)) {
    if (it.kind !== 'uca' && it.kind !== 'hazard') continue
    const cs = nameInstances(p, it.conditions)
    if (JSON.stringify(cs) !== JSON.stringify(it.conditions)) q = { ...q, items: { ...q.items, [it.id]: { ...it, conditions: cs } } }
  }
  return q
}
