import { CONDITION_OPS, type Condition, type ConditionOp, type Project, type Variable } from './types'

/** Operators that make sense for the variable's type. */
export const opsFor = (v: Variable | undefined): readonly ConditionOp[] => (v?.type === 'range' ? CONDITION_OPS : ['=', '≠'])

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

/** Whether the condition is complete enough to appear in a sentence. */
export const conditionComplete = (c: Condition) => !!c.state && (c.op !== 'between' || !!c.to)

export function conditionText(p: Project, c: Condition): string {
  const v = p.items[c.variable]
  if (v?.kind !== 'variable') return ''
  const u = v.type === 'range' && v.unit ? ' ' + v.unit : ''
  const name = v.title
  return c.op === 'between' ? `${name} between ${c.state} and ${c.to}${u}` : `${name} ${c.op} ${c.state}${u}`
}

/** Problem with the condition's value for the variable's type, or null. */
export function conditionError(v: Variable, c: Condition): string | null {
  if (!opsFor(v).includes(c.op)) return `operator ${c.op} does not apply to ${v.type} variables`
  const vals = valuesOf(v)
  if (vals) return !vals.length || vals.includes(c.state) ? null : `"${c.state}" is not one of ${vals.join(', ')}`
  const bad = [c.state, ...(c.op === 'between' ? [c.to ?? ''] : [])].find((x) => x.trim() === '' || !Number.isFinite(Number(x)))
  if (bad !== undefined) return `"${bad}" is not a number`
  if (c.op === 'between' && Number(c.state) > Number(c.to)) return 'lower bound exceeds upper bound'
  return null
}
