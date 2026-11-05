import { and, between, cmp, heldFor, inWords, not, num, or, parseExpr, since, some, every, none, variable, val, HOLE, type Expr } from './lang'
import { condInstances, conditionComplete, isEvent, isExpr, isGroup, isText, isVarCmp, leaves, nameAt } from './variables'
import type { Condition, EndNames, Id, Project, When } from './types'

/** Old condition trees as `Expr` (migration bridge: same meaning, instance names quantified outermost in order of appearance). */
const at = (n: EndNames | undefined, len: number) => Array.from({ length: len }, (_, i) => nameAt(n, i))
function leaf(p: Project, c: Condition): Expr | null {
  if (!isEvent(c) && !isText(c) && !isExpr(c) && !conditionComplete(c)) return null
  let e: Expr
  if (isEvent(c)) {
    if (!conditionComplete(c)) return null
    return cmp(c.time!.op, since(c.event as Id<'ca'>), num(c.time!.amount, c.time!.unit))
  } else if (isText(c)) {
    if (!conditionComplete(c)) return null
    e = inWords(c.text); if (c.op === '≠') e = not(e)
  } else if (isExpr(c)) {
    if (!conditionComplete(c)) return null
    try { e = parseExpr(p, c.text) } catch { e = HOLE }
  } else if (isVarCmp(c)) {
    e = cmp(c.op as never, variable(c.variable, ...at(c.names, 4)), variable(c.other, ...at(c.otherNames, 4)))
  } else {
    const x = variable(c.variable, ...at(c.names, 4))
    switch (c.op) {
      case 'between': e = between(x, num(c.state), num(c.to ?? '')); break
      case 'not between': e = not(between(x, num(c.state), num(c.to ?? ''))); break
      case 'in': case 'not in': { const s = { k: 'in' as const, e: x, set: (c.set ?? []).map(val) }; e = c.op === 'in' ? s : not(s); break }
      default: e = cmp(c.op, x, val(c.state))
    }
  }
  if (!isEvent(c) && c.time && conditionComplete(c)) return cmp(c.time.op, heldFor(e), num(c.time.amount, c.time.unit))
  return e
}
const tree = (p: Project, w: When): Expr | null => {
  if (!isGroup(w)) return leaf(p, w)
  const of = w.of.map((x) => tree(p, x)).filter((x): x is Expr => !!x)
  if (!of.length) return null
  return w.not ? not(and(...of)) : w.any ? or(...of) : and(...of)
}
/** The conjunction of `ws`, with the names its leaves declare quantified around it (`scope`: the whole list the names are declared in). */
export function whenToExpr(p: Project, ws: When[], scope: When[] = ws): Expr | null {
  const body = tree(p, and_(ws))
  const mine = new Set(ws.flatMap(leaves).flatMap((c) => condInstances(p, c).map((i) => i.name)))
  const decls: { name: string; entity: Id<'entity'>; q: 'some' | 'all' | 'none' }[] = []
  for (const c of scope.flatMap(leaves)) for (const i of condInstances(p, c)) if (i.intro && mine.has(i.name) && !decls.some((d) => d.name === i.name)) decls.push({ name: i.name, entity: i.entity as Id<'entity'>, q: i.quant })
  if (!body) return null
  let e = body
  for (const d of [...decls].reverse()) e = (d.q === 'some' ? some : d.q === 'all' ? every : none)(d.name, d.entity, e)
  return e
}
const and_ = (ws: When[]): When => ({ kind: 'group', any: false, of: ws })
