import { OP_LABELS, comparisonError, describeStates, isRangeOp, isSetOp, opsFor } from './variables'
import type { ArgCondition, ControlAction, Param, Project, Uca, Variable } from './types'

/** The parameter as a variable-like value (named range / enum types applied), to reuse the condition helpers. */
export function paramVar(p: Project, pa: Param): Variable {
  const r = pa.rangeType ? p.rangeTypes?.[pa.rangeType] : undefined, e = pa.enumType ? p.enumTypes?.[pa.enumType] : undefined
  const s = pa.symbolicType ? p.symbolicTypes?.[pa.symbolicType] : undefined
  return { ...pa, ...(r && pa.type === 'range' ? r : {}), ...(e && pa.type === 'enum' ? { states: e } : {}), ...(s && pa.type === 'symbolic' ? s : {}), id: '', kind: 'variable', title: pa.name } as unknown as Variable
}

export const paramOf = (ca: ControlAction | undefined, name: string): Param | undefined => ca?.params.find((x) => x.name === name)
export const argOps = (p: Project, pa: Param | undefined) => opsFor(pa && paramVar(p, pa))

/** Problem with an argument condition for the action's parameters, or null. */
export function argError(p: Project, ca: ControlAction | undefined, a: ArgCondition): string | null {
  const pa = paramOf(ca, a.param)
  if (!pa) return `"${a.param}" is not a parameter of ${ca?.title || 'the control action'}`
  return comparisonError(paramVar(p, pa), { op: a.op, state: a.state, to: a.to, set: a.set })
}

export function argText(p: Project, ca: ControlAction | undefined, a: ArgCondition): string {
  const pa = paramOf(ca, a.param)
  const u = pa && paramVar(p, pa).type === 'range' && paramVar(p, pa).unit ? ' ' + paramVar(p, pa).unit : ''
  if (isSetOp(a.op)) return `${a.param} ${OP_LABELS[a.op]} {${(a.set ?? []).join(', ')}}`
  return isRangeOp(a.op) ? `${a.param} ${OP_LABELS[a.op]} ${a.state} and ${a.to}${u}` : `${a.param} ${OP_LABELS[a.op]} ${a.state}${u}`
}

/** "dose (0–10 mg)", "mode {auto, manual}". */
export function paramSummary(p: Project, pa: Param): string {
  const v = paramVar(p, pa)
  return v.type === 'enum' ? `${pa.name} {${v.states.join(', ')}}` : v.type === 'symbolic' ? `${pa.name} (${describeStates(v)})` : v.type === 'boolean' ? `${pa.name} (true/false)` : `${pa.name} (${v.min ?? '…'}–${v.max ?? '…'}${v.unit ? ' ' + v.unit : ''})`
}

/** Arguments of the UCA that are filled in and valid, as text. */
export const argTexts = (p: Project, u: Uca): string[] => {
  const ca = p.items[u.ca]
  return u.args.filter((a) => ca?.kind === 'ca' && !argError(p, ca, a) && (a.state !== '' || a.set?.length)).map((a) => argText(p, ca as ControlAction, a))
}
