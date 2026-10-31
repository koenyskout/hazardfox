import { shortName } from './labels'
import { type Condition, type Id, type Quantifier, type ConditionOp, type Group, type Project, type Variable, type When } from './types'

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
export const conditionComplete = (c: Condition) => isText(c) ? !!c.text?.trim() : isVarCmp(c) ? !!c.variable : (isSetOp(c.op) ? !!c.set?.length : !!c.state) && (!isRangeOp(c.op) || !!c.to)

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
export function condInstances(p: Project, c: Condition): { entity: Id; name: string; intro: boolean; end: 1 | 2 }[] {
  const v = isText(c) ? undefined : p.items[c.variable]
  if (v?.kind !== 'variable') return []
  const e1 = boundEntity(p, v), e2 = otherEnd(p, v)
  const out: { entity: Id; name: string; intro: boolean; end: 1 | 2 }[] = []
  if (e1 && instName(c)) out.push({ entity: e1, name: instName(c), intro: c.as !== undefined, end: 1 })
  if (e2 && instName2(c)) out.push({ entity: e2, name: instName2(c), intro: c.as2 !== undefined, end: 2 })
  return out
}
/** Trace lane key of a condition about named instances ("<variable>@t1" or "<variable>@t1|c1"), else the variable. */
export const instLane = (c: Condition): string => (isText(c) ? condKey(c) : instName(c) || instName2(c) ? `${c.variable}@${instName(c)}${instName2(c) ? '|' + instName2(c) : ''}` : c.variable)
/** Variable and instance names of a lane key. */
export const laneParts = (key: string): { id: Id; names: string[] } => { const i = key.indexOf('@'); return i < 0 || laneText(key) !== null ? { id: key, names: [] } : { id: key.slice(0, i), names: key.slice(i + 1).split('|') } }
export const QUANT_LABELS: Record<Quantifier, string> = { some: 'some', all: 'every', none: 'no' }

/** `earlier`: the conditions before this one; a named some-instance of an entity already named differently there reads "another …" (different names stand for different instances). */
export function conditionText(p: Project, c: Condition, earlier: Condition[] = []): string {
  const q = quantOf(p, c)
  const intro = condInstances(p, c).filter((x) => x.intro)
  const prior = earlier.flatMap((o) => condInstances(p, o))
  // another: it introduces a name for an entity whose instance an earlier condition already named differently
  const another = (end: 1 | 2) => { const x = intro.find((i) => i.end === end); return !!x && prior.some((o) => o.entity === x.entity && o.name !== x.name) }
  if (q) return quantText(p, c, q, another(1), another(2))
  return plainText(p, c)
}
/** The sentences of a list of conditions, each knowing the ones before it. */
export const conditionTexts = (p: Project, cs: Condition[]) => cs.map((c, i) => conditionText(p, c, cs.slice(0, i)))

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
  if (c.other) { const o = p.items[c.other]; return o?.kind === 'variable' ? `${name} ${OP_LABELS[c.op]} ${o.title}` : '' }
  if (isSetOp(c.op)) return `${name} ${OP_LABELS[c.op]} {${(c.set ?? []).join(', ')}}`
  return isRangeOp(c.op) ? `${name} ${OP_LABELS[c.op]} ${c.state} and ${c.to}${u}` : `${name} ${OP_LABELS[c.op]} ${c.state}${u}`
}

/** Problem with the condition's value for the variable's type, or null. */
export function conditionError(v: Variable, c: Condition, p?: Project): string | null {
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
/** The tree with each condition replaced (null drops it). */
export const mapLeaves = (g: Group, f: (c: Condition) => Condition | null): Group =>
  ({ ...g, of: g.of.flatMap((w) => { const x = isGroup(w) ? mapLeaves(w, f) : f(w); return x ? [x] : [] }) })
/** "A and (B or C)", from complete conditions only. */
export function whenText(p: Project, w: When, top = true): string {
  if (!isGroup(w)) return conditionComplete(w) ? conditionText(p, w) : ''
  const parts = w.of.map((x) => whenText(p, x, false)).filter(Boolean)
  const s = parts.join(w.any ? ' or ' : ' and ')
  return !top && parts.length > 1 ? `(${s})` : s
}
