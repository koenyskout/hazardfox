import { endName, readRel, shortName } from './labels'
import type { Expr } from './lang'
import { mention } from './refs'
import { OP_LABELS, timeText } from './variables'
import { QUANT_LABELS } from './types'
import type { ConditionOp, Project, TimeBound, Variable } from './types'

const OPS: Record<string, ConditionOp> = { '=': '=', '≠': '≠', '<': '<', '≤': '≤', '>': '>', '≥': '≥' }
const isPred = (p: Project, v: Variable) => p.items[v.parent ?? '']?.kind === 'relationship' && !v.title.trim()

/** A variable with the instances it is read at: "speed of t1", "Train t1 approaches Crossing c1" (a relationship's predicate). */
function varText(p: Project, e: Extract<Expr, { k: 'var' }>, bare = true): string {
  const v = p.items[e.id]
  if (v?.kind !== 'variable') return ''
  const at = e.at ?? []
  const par = p.items[v.parent ?? '']
  if (par?.kind === 'relationship' && !v.title.trim() && bare) return readRel(par, par.ends.map((x, i) => at[i] || endName(p, x)))
  const names = at.filter(Boolean)
  return shortName(p, v) + (names.length ? ' of ' + names.join(' and ') : '')
}
function operand(p: Project, e: Expr): string {
  switch (e.k) {
    case 'const': return e.unit ? `${e.v} ${e.unit}` : e.v
    case 'var': return varText(p, e, false)
    case 'name': return e.name
    case 'param': return e.name
    case 'event': return mention(e.id)
    case 'app': return e.args.length === 2 && '+−×'.includes(e.fn) ? `${operand(p, e.args[0])} ${e.fn} ${operand(p, e.args[1])}` : `${e.fn}(${e.args.map((x) => operand(p, x)).join(', ')})`
    default: return say(p, e)
  }
}
const unitOf = (p: Project, e: Expr): string => { const v = e.k === 'var' ? p.items[e.id] : null; return v?.kind === 'variable' && v.type === 'range' && v.unit ? ' ' + v.unit : '' }
const time = (e: Extract<Expr, { k: 'cmp' }>): string => (e.r.k === 'const' ? timeText({ op: e.op as TimeBound['op'], amount: e.r.v, unit: e.r.unit ?? 's' }) : '')

/** A condition as a sentence ("speed of t1 is 0 and Train t1 approaches Crossing c1"); `@[id]` references stay for rendering with labels. */
export function say(p: Project, e: Expr | null, top = true): string {
  if (!e) return ''
  if ((e.k === 'and' || e.k === 'or') && e.of.length === 1) return say(p, e.of[0], top)
  switch (e.k) {
    case 'and': { const t = e.of.map((x) => say(p, x, false)).filter(Boolean); return !top && t.length > 1 ? `(${t.join(' and ')})` : t.join(' and ') }
    case 'or': { const t = e.of.map((x) => say(p, x, false)).filter(Boolean); return !top && t.length > 1 ? `(${t.join(' or ')})` : t.join(' or ') }
    case 'not': { const t = say(p, e.e, false); return t ? `not (${t})` : '' }
    case 'quant': { const t = say(p, e.body, true); const ent = (p.items[e.entity]?.title ?? '').trim() || 'instance'; return `${QUANT_LABELS[e.q]} ${ent} ${e.name}${t ? ': ' + t : ''}` }
    case 'text': return e.text.trim()
    case 'hole': case 'const': case 'name': case 'param': case 'event': case 'app': return e.k === 'hole' ? '' : operand(p, e)
    case 'var': return varText(p, e)
    case 'between': return `${operand(p, e.e)} is between ${operand(p, e.lo)} and ${operand(p, e.hi)}${unitOf(p, e.e)}`
    case 'in': return `${operand(p, e.e)} is one of {${e.set.map((x) => operand(p, x)).join(', ')}}`
    case 'cmp': {
      if (e.l.k === 'app' && e.l.fn === 'heldFor') return `${say(p, e.l.args[0], false)} for ${time(e)}`
      if (e.l.k === 'app' && e.l.fn === 'since') return `${time(e)} after ${operand(p, e.l.args[0])}`
      if (e.l.k === 'var' && e.r.k === 'const' && (e.r.v === 'true' || e.r.v === 'false') && isPred(p, p.items[e.l.id] as Variable) && (e.op === '=' || e.op === '≠')) {
        const t = varText(p, e.l)
        return (e.r.v === 'true') === (e.op === '=') ? t : `not (${t})`
      }
      return `${operand(p, e.l)} ${OP_LABELS[OPS[e.op]]} ${operand(p, e.r)}${e.r.k === "const" ? unitOf(p, e.l) : ""}`
    }
  }
}
