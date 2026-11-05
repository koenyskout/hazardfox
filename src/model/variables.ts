import { UNIT_S, type TimeBound, type TimeUnit, type Id, type Lane, type Comparison, type ConditionOp, type Item, type Project, type RelEnd, type SymbolicType, type Variable } from './types'

const RANGE_OPS: readonly ConditionOp[] = ['=', '≠', '<', '≤', '>', '≥', 'between', 'not between']
const ENUM_OPS: readonly ConditionOp[] = ['=', '≠', 'in', 'not in']
/** Operators as they read in a sentence. */
export const OP_LABELS: Record<ConditionOp, string> = { '=': 'is', '≠': 'is not', in: 'is one of', 'not in': 'is not one of', '<': 'is less than', '≤': 'is at most', '>': 'is greater than', '≥': 'is at least', between: 'is between', 'not between': 'is not between' }
export const isRangeOp = (op: ConditionOp) => op === 'between' || op === 'not between'
export const isSetOp = (op: ConditionOp) => op === 'in' || op === 'not in'

/** Operators that make sense for the variable's type. */
export const opsFor = (v: Variable | undefined): readonly ConditionOp[] => (v?.type === 'range' ? RANGE_OPS : v?.type === 'boolean' ? ['=', '≠'] : v?.type === 'symbolic' ? symbolicOps(v) : ENUM_OPS)

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
/** The text of a lane key of a condition in words, else null. */
export const laneText = (key: string): string | null => (key.startsWith(TEXT_KEY) ? key.slice(TEXT_KEY.length) : null)



/** Whether an entity has several instances; a specialisation of a many-instance entity does too. */
export function manyEntity(p: Project, id: Id): boolean {
  const seen = new Set<Id>()
  let x: Item | undefined = p.items[id]
  while (x?.kind === 'entity' && !seen.has(x.id)) { if (x.many) return true; seen.add(x.id); x = x.relation === 'specialisation' && x.parent ? p.items[x.parent] : undefined }
  return false
}
/** Whether an end of a relationship ranges over several instances: its entity is `many` or its cardinality says so. */
export const manyEnd = (p: Project, e: RelEnd): boolean => manyEntity(p, e.entity) || e.card === '*' || e.card === '1..*'
/** One end of what a world variable is about: an entity variable has one, a relationship variable one per relationship end (same index). `many`: it ranges over several instances. */
export interface VarEnd { entity: Id; many: boolean }
export function endsOf(p: Project, v: Variable): VarEnd[] {
  const o = v.layer === 'domain' && v.parent ? p.items[v.parent] : null
  if (o?.kind === 'entity') return [{ entity: o.id, many: manyEntity(p, o.id) }]
  return o?.kind === 'relationship' ? o.ends.map((e) => ({ entity: e.entity, many: p.items[e.entity]?.kind === 'entity' && manyEnd(p, e) })) : []
}
/** The ends that can be named or quantified, with their index. */
export const manyEndsOf = (p: Project, v: Variable): (VarEnd & { end: number })[] => endsOf(p, v).flatMap((e, end) => (e.many ? [{ ...e, end }] : []))
/** Whether a world variable describes several instances: some of its ends is `many`. */
export const isMany = (p: Project, v: Variable): boolean => endsOf(p, v).some((e) => e.many)

/** The lane of variable `id` for the instances written `names` ("t1", "t1|c1"; empty: all alike). */
/** The lane of a variable (all instances alike). */
export const laneOf = (id: Id): Lane => id as Lane
export const laneAt = (id: Id, names: string): Lane => (names ? `${id}@${names}` : id) as Lane
/** A lane key read from outside the model (file, MCP input). */
export const asLane = (s: string): Lane => s as Lane
/** Lanes set in a trace step or state. */
export const laneKeys = (r: Record<Lane, string>): Lane[] => Object.keys(r) as Lane[]
export const laneEntries = (r: Record<Lane, string>): [Lane, string][] => Object.entries(r) as [Lane, string][]
/** Lane of a condition in words. */
export const textLane = (text: string): Lane => (TEXT_KEY + text.trim()) as Lane
/** The lane of variable `id` for the same instances as lane `like`. */
export const laneLike = (id: Id, like: Lane): Lane => (id + like.slice(laneParts(like).id.length)) as Lane
/** Variable and instance names of a lane key. */
export const laneParts = (key: Lane): { id: Id; names: string[] } => { const i = key.indexOf('@'); return i < 0 || laneText(key) !== null ? { id: key, names: [] } : { id: key.slice(0, i), names: key.slice(i + 1).split('|') } }

/** Problem with a comparison's value for the variable's type, or null. */
export function comparisonError(v: Variable, c: Comparison): string | null {
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

