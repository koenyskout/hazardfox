import { ancestors, descendants, itemsOfKind } from './tree'
import type { Id, Item, ItemOf, Project, Scenario } from './types'

/** Losses of a hazard: its own links plus inherited ones, minus exclusions along the way. */
export function effectiveLosses(p: Project, hazardId: Id<'hazard'>): Id<'loss'>[] {
  const chain = [...ancestors(p, hazardId), p.items[hazardId]]
  let set: Id<'loss'>[] = []
  for (const h of chain) {
    if (h?.kind !== 'hazard') continue
    set = set.filter((x) => !h.lossExclude.includes(x))
    for (const l of h.lossLinks) if (!set.includes(l)) set.push(l)
  }
  return set
}

/** Loss links a hazard inherits from its ancestors. */
export function inheritedLosses(p: Project, hazardId: Id<'hazard'>): Id<'loss'>[] {
  const it = p.items[hazardId]
  if (it?.kind !== 'hazard' || !it.parent) return []
  return effectiveLosses(p, it.parent)
}

/** Leaf hazards a scenario relates to: via its UCA (type 'uca') or directly (type 'ca'). */
export function scenarioHazards(p: Project, s: Scenario): Id<'hazard'>[] {
  if (s.scenarioType === 'ca') return s.hazards
  const u = s.uca ? p.items[s.uca] : null
  return u?.kind === 'uca' ? u.hazards : []
}

export interface HazardTrace {
  losses: Id<'loss'>[]
  constraints: ItemOf<'constraint'>[]
  ucas: ItemOf<'uca'>[]
  scenarios: ItemOf<'scenario'>[]
  requirements: ItemOf<'requirement'>[]
}

/** A hazard and all its sub-hazards. */
export const hazardScope = (p: Project, hazardId: Id<'hazard'>) => new Set([hazardId, ...descendants(p, hazardId).map((d) => d.id)])

/** Everything that traces to a hazard or one of its sub-hazards. */
export function hazardTrace(p: Project, hazardId: Id<'hazard'>): HazardTrace {
  const scope = hazardScope(p, hazardId)
  const hits = (ids: Id[]) => ids.some((h) => scope.has(h))
  const constraints = itemsOfKind(p, 'constraint').filter((c) => hits(c.hazards))
  const ucas = itemsOfKind(p, 'uca').filter((u) => hits(u.hazards))
  const scenarios = itemsOfKind(p, 'scenario').filter((s) => hits(scenarioHazards(p, s)))
  const sources = new Set([...constraints, ...ucas, ...scenarios].map((x) => x.id))
  const requirements = itemsOfKind(p, 'requirement').filter((r) => r.sources.some((x) => sources.has(x as never)))
  return { losses: effectiveLosses(p, hazardId), constraints, ucas, scenarios, requirements }
}

/** Leaf hazards an item traces back to (via constraints, UCAs, scenarios or requirement sources) and their losses. */
export function upstream(p: Project, it: Item): { hazards: Id<'hazard'>[]; losses: Id<'loss'>[] } {
  const seen = new Set<Id>()
  const hazards = new Set<Id>()
  const walk = (x: Item | undefined) => {
    if (!x || seen.has(x.id)) return
    seen.add(x.id)
    if (x.kind === 'hazard') hazards.add(x.id)
    else if (x.kind === 'constraint' || x.kind === 'uca') x.hazards.forEach((h) => hazards.add(h))
    else if (x.kind === 'scenario') scenarioHazards(p, x).forEach((h) => hazards.add(h))
    else if (x.kind === 'requirement') x.sources.forEach((s) => walk(p.items[s]))
  }
  walk(it)
  const hs = [...hazards].filter((h) => p.items[h])
  return { hazards: hs, losses: [...new Set(hs.flatMap((h) => effectiveLosses(p, h)))] }
}
