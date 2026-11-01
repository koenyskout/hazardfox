import { shortName } from './labels'
import { type Condition, type TimeBound, type TimeUnit, type Id, type Quantifier, type ConditionOp, type Group, type Project, type Variable, type When } from './types'

const RANGE_OPS: readonly ConditionOp[] = ['=', '≠', '<', '≤', '>', '≥', 'between', 'not between']
const ENUM_OPS: readonly ConditionOp[] = ['=', '≠', 'in', 'not in']
/** Operators as they read in a sentence. */
export const OP_LABELS: Record<ConditionOp, string> = { '=': 'is', '≠': 'is not', in: 'is one of', 'not in': 'is not one of', '<': 'is less than', '≤': 'is at most', '>': 'is greater than', '≥': 'is at least', between: 'is between', 'not between': 'is not between' }
export const isRangeOp = (op: ConditionOp) => op === 'between' || op === 'not between'
export const isSetOp = (op: ConditionOp) => op === 'in' || op === 'not in'

/** Operators that make sense for the variable's type. */
export const opsFor = (v: Variable | undefined): readonly ConditionOp[] => (v?.type === 'range' ? RANGE_OPS : v?.type === 'boolean' ? ['=', '≠'] : ENUM_OPS)

/** Values a condition on this variable may compare with, or null when free numeric input. */
export const valuesOf = (v: Variable | undefined): string[] | null => (v?.type === 'boolean' ? ['true', 'false'] : v?.type === 'range' ? null : v?.states ?? [])

const num = (n: number) => String(n)

/** "running | stopped", "true | false" or "0–100 %". */
export function describeStates(v: Variable): string {
  if (v.type === 'boolean') return 'true | false'
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
export const isText = (c: Condition) => c.text !== undefined
/** A condition on the time since an event (control action or feedback) occurred. */
export const isEvent = (c: Condition) => c.event !== undefined
const UNIT_S: Record<TimeUnit, number> = { ms: 0.001, s: 1, min: 60, h: 3600 }
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
export const condKey = (c: Condition): string => (isText(c) ? TEXT_KEY + (c.text ?? '').trim() : c.variable)
/** The text of a lane key of a condition in words, else null. */
export const laneText = (key: string): string | null => (key.startsWith(TEXT_KEY) ? key.slice(TEXT_KEY.length) : null)

/** A condition comparing the variable with another variable instead of a constant. */
export const isVarCmp = (c: Condition) => !!c.other
/** Operators for comparing two variables. */
export const opsForVar = (v: Variable | undefined): readonly ConditionOp[] => (v?.type === 'range' ? ['=', '≠', '<', '≤', '>', '≥'] : ['=', '≠'])

/** Whether the condition is complete enough to appear in a sentence. */
export const conditionComplete = (c: Condition): boolean => (isEvent(c) ? !!c.event && timeOk(c.time) : (!c.time || timeOk(c.time)) && baseComplete(c))
const baseComplete = (c: Condition) => isText(c) ? !!c.text?.trim() : isVarCmp(c) ? !!c.variable : (isSetOp(c.op) ? !!c.set?.length : !!c.state) && (!isRangeOp(c.op) || !!c.to)

/** Whether a world variable describes several instances: it belongs to a `many` entity, or to a relationship with a `many` end (entity or cardinality). */
export function isMany(p: Project, v: Variable): boolean {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  const manyCard = (c: string) => c === '*' || c === '1..*'
  if (o?.kind === 'entity') return !!o.many
  if (o?.kind !== 'relationship') return false
  const e = (id: string) => { const x = p.items[id]; return x?.kind === 'entity' && !!x.many }
  return e(o.from) || e(o.to) || manyCard(o.fromCard) || manyCard(o.toCard)
}

/** The quantifier a condition effectively carries: null when it is about a single instance (also for text / variable comparisons), else its own or `some`. */
export function quantOf(p: Project, c: Condition): Quantifier | null {
  if (isText(c)) return null
  const v = p.items[c.variable]
  return v?.kind === 'variable' && isMany(p, v) ? (c.as || c.same ? 'some' : c.quant ?? 'some') : null
}
/** The entity whose instances a many variable ranges over (a relationship's first many end). */
export function boundEntity(p: Project, v: Variable): Id | null {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  if (o?.kind === 'entity') return o.id
  if (o?.kind !== 'relationship') return null
  const many = (id: string, card: string) => { const x = p.items[id]; return (x?.kind === 'entity' && !!x.many) || card === '*' || card === '1..*' }
  return many(o.from, o.fromCard) ? o.from : many(o.to, o.toCard) ? o.to : null
}
/** The instance name a condition introduces or refers to. */
export const instName = (c: Condition) => (c.as ?? c.same ?? '').trim()
/** The name for the second end of a relationship (see `otherEnd`). */
export const instName2 = (c: Condition) => (c.as2 ?? c.same2 ?? '').trim()
/** The other end of a many-to-many relationship variable (the one `boundEntity` leaves out), else null. */
export function otherEnd(p: Project, v: Variable): Id | null {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  if (o?.kind !== 'relationship') return null
  const many = (id: string, card: string) => { const x = p.items[id]; return x?.kind === 'entity' && (!!x.many || card === '*' || card === '1..*') }
  return many(o.from, o.fromCard) && many(o.to, o.toCard) ? o.to : null
}
/** The instances a condition introduces or refers to: [entity, name, introduces]. */
export function condInstances(p: Project, c: Condition): { entity: Id; name: string; intro: boolean; end: 1 | 2; cmp?: boolean }[] {
  const v = isText(c) ? undefined : p.items[c.variable]
  if (v?.kind !== 'variable') return []
  const e1 = boundEntity(p, v), e2 = otherEnd(p, v)
  const out: { entity: Id; name: string; intro: boolean; end: 1 | 2; cmp?: boolean }[] = []
  if (e1 && instName(c)) out.push({ entity: e1, name: instName(c), intro: c.as !== undefined, end: 1 })
  if (e2 && instName2(c)) out.push({ entity: e2, name: instName2(c), intro: c.as2 !== undefined, end: 2 })
  const ov = c.other ? p.items[c.other] : undefined
  if (ov?.kind === 'variable') {
    const o1 = boundEntity(p, ov), o2 = otherEnd(p, ov)
    if (o1 && oName(c, 1)) out.push({ entity: o1, name: oName(c, 1), intro: c.oAs !== undefined, end: 1, cmp: true })
    if (o2 && oName(c, 2)) out.push({ entity: o2, name: oName(c, 2), intro: c.oAs2 !== undefined, end: 2, cmp: true })
  }
  return out
}
/** Trace lane key of a condition about named instances ("<variable>@t1" or "<variable>@t1|c1"), else the variable. */
export const instLane = (c: Condition): string => (isText(c) ? condKey(c) : instName(c) || instName2(c) ? `${c.variable}@${instName(c)}${instName2(c) ? '|' + instName2(c) : ''}` : c.variable)
/** Trace lane key of the compared variable of a comparison (`other`), at the instances `oSame` / `oSame2` it names. */
/** The instance name a comparison uses at an end of its compared variable (introduced or referred to). */
export const oName = (c: Condition, end: 1 | 2) => ((end === 1 ? c.oAs ?? c.oSame : c.oAs2 ?? c.oSame2) ?? '').trim()
export const otherLane = (c: Condition): string => { const a = oName(c, 1), b = oName(c, 2); return c.other && (a || b) ? `${c.other}@${a ?? ''}${b ? '|' + b : ''}` : c.other ?? '' }
/** Variable and instance names of a lane key. */
export const laneParts = (key: string): { id: Id; names: string[] } => { const i = key.indexOf('@'); return i < 0 || laneText(key) !== null ? { id: key, names: [] } : { id: key.slice(0, i), names: key.slice(i + 1).split('|') } }
export const QUANT_LABELS: Record<Quantifier, string> = { some: 'some', all: 'every', none: 'no' }

/** `earlier`: the conditions before this one; a named some-instance of an entity already named differently there reads "another …" (different names stand for different instances). */
export function conditionText(p: Project, c: Condition, earlier: Condition[] = []): string {
  if (isEvent(c)) return c.time ? `${timeText(c.time)} after @[${c.event}]` : ''
  const s = baseText(p, c, earlier)
  return c.time && s ? `${s} for ${timeText(c.time)}` : s
}
function baseText(p: Project, c: Condition, earlier: Condition[]): string {
  const q = quantOf(p, c)
  const intro = condInstances(p, c).filter((x) => x.intro && !x.cmp)
  const prior = earlier.flatMap((o) => condInstances(p, o))
  // another: it introduces a name for an entity whose instance an earlier condition already named differently
  const another = (end: 1 | 2) => { const x = intro.find((i) => i.end === end); return !!x && prior.some((o) => o.entity === x.entity && o.name !== x.name) }
  if (q) return quantText(p, c, q, another(1), another(2))
  return plainText(p, c)
}
/** The sentences of a list of conditions, each knowing the ones before it. */
export const conditionTexts = (p: Project, cs: Condition[]) => cs.map((c, i) => conditionText(p, c, cs.slice(0, i)))
/** The sentences of a list of conditions and groups (all must hold), skipping incomplete ones. */
export const whenTexts = (p: Project, ws: When[]): string[] => ws.map((w, i) => whenText(p, w, false, ws.slice(0, i).flatMap(leaves))).filter(Boolean)

/** "speed of every Train is 0", "speed of some Train t1 is 0", "speed of t1 is 0", "some Train t1 at Station", "no Train at Station", "some Train t1 approaches Crossing c1". */
function quantText(p: Project, c: Condition, q: Quantifier, another = false, another2 = false): string {
  const v = p.items[c.variable] as Variable
  const o = p.items[v.parent!]
  const name = shortName(p, v)
  const title = (id: Id | null) => p.items[id ?? '']?.title.trim()
  const ent = title(boundEntity(p, v)) || (o.kind === 'entity' ? 'instance' : 'link')
  const n = instName(c), n2 = instName2(c)
  const label = another ? 'another' : QUANT_LABELS[q]
  const who = c.same ? n : `${label} ${ent}${n ? ' ' + n : ''}`
  const e2 = otherEnd(p, v)
  const who2 = !e2 || !n2 ? '' : c.same2 ? n2 : `${another2 ? 'another ' : ''}${title(e2) || 'instance'} ${n2}`
  if (o.kind === 'entity') return `${name} of ${who} ${plainText(p, c).slice(name.length).trim()}`
  if (!v.title.trim() && o.kind === 'relationship') {
    const bare = c.op === '=' && c.state === 'true'
    const parts = [title(o.from) || '?', o.title.trim() || '?', title(o.to) || '?']
    const first = boundEntity(p, v) === o.from ? 0 : 2
    parts[first] = who
    if (who2) parts[2 - first] = who2
    const text = parts.join(' ')
    return bare ? text : `${text} ${OP_LABELS[c.op]} ${c.state}`
  }
  return `${who}${who2 ? ' and ' + who2 : ''} where ${plainText(p, c)}`
}

function plainText(p: Project, c: Condition): string {
  if (isText(c)) return c.op === '≠' ? `not (${c.text!.trim()})` : c.text!.trim()
  const v = p.items[c.variable]
  if (v?.kind !== 'variable') return ''
  const u = v.type === 'range' && v.unit ? ' ' + v.unit : ''
  const name = shortName(p, v)
  if (c.other) { const o = p.items[c.other]; return o?.kind === 'variable' ? `${name} ${OP_LABELS[c.op]} ${o.title}${[oName(c, 1), oName(c, 2)].filter(Boolean).map((n, i) => (i ? ' and ' : ' of ') + n).join('')}` : '' }
  if (isSetOp(c.op)) return `${name} ${OP_LABELS[c.op]} {${(c.set ?? []).join(', ')}}`
  return isRangeOp(c.op) ? `${name} ${OP_LABELS[c.op]} ${c.state} and ${c.to}${u}` : `${name} ${OP_LABELS[c.op]} ${c.state}${u}`
}

/** Problem with the condition's value for the variable's type, or null. */
export function conditionError(v: Variable, c: Condition, p?: Project): string | null {
  if (c.time && !timeOk(c.time)) return 'the duration is not a number'
  if (c.other) {
    const o = p?.items[c.other]
    if (p && o?.kind !== 'variable') return 'compared variable not found'
    if (!opsForVar(v).includes(c.op)) return `operator ${c.op} does not apply to ${v.type} variables`
    if (o?.kind === 'variable' && o.type !== v.type) return `cannot compare ${v.type} ${v.title} with ${o.type} ${o.title}`
    if (o?.kind === 'variable' && v.type === 'range' && v.unit && o.unit && v.unit !== o.unit) return `units differ (${v.unit} vs ${o.unit})`
    if (o?.kind === 'variable' && v.type === 'enum' && !v.states.some((s) => o.states.includes(s))) return `${v.title} and ${o.title} share no states`
    return null
  }
  if (!opsFor(v).includes(c.op)) return `operator ${c.op} does not apply to ${v.type} variables`
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
export const required = (w: When): Condition[] => (isGroup(w) ? (w.any ? w.of.slice(0, 1) : w.of).flatMap(required) : [w])
/** The tree with each condition replaced (null drops it). */
export const mapLeaves = (g: Group, f: (c: Condition) => Condition | null): Group =>
  ({ ...g, of: g.of.flatMap((w) => { const x = isGroup(w) ? mapLeaves(w, f) : f(w); return x ? [x] : [] }) })
/** "A and (B or C)", from complete conditions only. */
export function whenText(p: Project, w: When, top = true, before: Condition[] = []): string {
  if (!isGroup(w)) return conditionComplete(w) ? conditionText(p, w, before) : ''
  const parts = w.of.map((x, i) => whenText(p, x, false, [...before, ...w.of.slice(0, i).flatMap(leaves)])).filter(Boolean)
  const s = parts.join(w.any ? ' or ' : ' and ')
  return !top && parts.length > 1 ? `(${s})` : s
}

/** A short unused instance name for an entity: t1, t2, … */
export function autoName(p: Project, entity: Id | null, scope: Condition[], taken: string[] = []): string {
  const base = ((p.items[entity ?? '']?.title.trim().replace(/[^\p{L}]/gu, '').slice(0, 2)) || 'x').toLowerCase()
  const used = new Set([...scope.flatMap((o) => [o.as, o.same, o.as2, o.same2, o.oAs, o.oAs2, o.oSame, o.oSame2]), ...taken])
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
    const v = isText(c) ? undefined : p.items[c.variable]
    if (v?.kind !== 'variable') continue
    const e1 = quantOf(p, c) === 'some' && !c.same ? boundEntity(p, v) : null
    if (e1 && !c.as) c.as = autoName(p, e1, all)
    const e2 = !c.same2 ? otherEnd(p, v) : null
    if (e2 && !c.as2) c.as2 = autoName(p, e2, all)
    for (const x of condInstances(p, c)) if (x.cmp && x.intro && !x.name) c[x.end === 1 ? 'oAs' : 'oAs2'] = autoName(p, x.entity, all)
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
