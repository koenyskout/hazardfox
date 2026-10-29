import type { Id, Item, Kind, Project } from './types'

/** Required single references: if the target disappears, the item is deleted too. */
export const REQUIRED_REFS: Partial<Record<Kind, string[]>> = {
  relationship: ['from', 'to'],
  ca: ['from', 'to'],
  feedback: ['from', 'to'],
  uca: ['ca'],
}
/** Optional single references: cleared when the target disappears. */
export const OPTIONAL_REFS: Partial<Record<Kind, string[]>> = {
  node: ['entity'],
  scenario: ['uca', 'ca', 'element'],
}
/** List references: entries are removed when the target disappears. */
export const LIST_REFS: Partial<Record<Kind, string[]>> = {
  hazard: ['lossLinks', 'lossExclude'],
  constraint: ['hazards'],
  requirement: ['sources'],
  assumption: ['about'],
  node: ['processModel'],
  feedback: ['variables'],
  uca: ['hazards'],
  scenario: ['hazards'],
}
/** Free-text fields that may contain `@[id]` mentions. */
export const TEXT_FIELDS: Partial<Record<Kind, string[]>> = {
  uca: ['context', 'override', 'constraint'],
  scenario: ['threat'],
}
const COMMON_TEXT = ['description', 'notes']

export const MENTION_RE = /@\[([^\]]+)\]/g

type Rec = Record<string, unknown>

const textFields = (kind: Kind) => [...COMMON_TEXT, ...(TEXT_FIELDS[kind] ?? [])]

/** All ids an item refers to (excluding its tree parent). */
export function refsOf(it: Item): Id[] {
  const r = it as unknown as Rec
  const out: Id[] = []
  for (const f of [...(REQUIRED_REFS[it.kind] ?? []), ...(OPTIONAL_REFS[it.kind] ?? [])]) {
    if (typeof r[f] === 'string' && r[f]) out.push(r[f] as Id)
  }
  for (const f of LIST_REFS[it.kind] ?? []) out.push(...((r[f] as Id[]) ?? []))
  if (it.kind === 'uca') for (const c of it.conditions) out.push(c.variable)
  for (const f of textFields(it.kind)) {
    const t = r[f]
    if (typeof t === 'string') for (const m of t.matchAll(MENTION_RE)) out.push(m[1])
  }
  return out
}

/** Items that refer to `id` (via parent, refs or mentions). */
export function incoming(p: Project, id: Id): Item[] {
  return Object.values(p.items).filter((o) => o.id !== id && (o.parent === id || refsOf(o).includes(id)))
}

/** Replace (to !== null) or remove (to === null) every reference to `from` in the draft item. */
export function rewriteRefs(it: Item, from: Id, to: Id | null) {
  const r = it as unknown as Rec
  for (const f of [...(REQUIRED_REFS[it.kind] ?? []), ...(OPTIONAL_REFS[it.kind] ?? [])]) {
    if (r[f] === from) r[f] = to ?? (OPTIONAL_REFS[it.kind]?.includes(f) ? null : from)
  }
  for (const f of LIST_REFS[it.kind] ?? []) {
    const list = r[f] as Id[]
    const next: Id[] = []
    for (const x of list) {
      const y = x === from ? to : x
      if (y && !next.includes(y)) next.push(y)
    }
    r[f] = next
  }
  if (it.kind === 'uca') {
    it.conditions = it.conditions.flatMap((c) =>
      c.variable !== from ? [c] : to ? [{ ...c, variable: to }] : [],
    )
  }
  if (to) {
    for (const f of textFields(it.kind)) {
      if (typeof r[f] === 'string') r[f] = (r[f] as string).split(`@[${from}]`).join(`@[${to}]`)
    }
  }
}

/** Ids whose required refs or parents point into `dead` (transitively) – cascade set. */
export function cascadeSet(p: Project, seed: Iterable<Id>): Set<Id> {
  const dead = new Set<Id>(seed)
  let changed = true
  while (changed) {
    changed = false
    for (const it of Object.values(p.items)) {
      if (dead.has(it.id)) continue
      const r = it as unknown as Rec
      const req = REQUIRED_REFS[it.kind] ?? []
      const ownerDead =
        (it.kind === 'variable' && it.parent && dead.has(it.parent)) ||
        (it.kind === 'scenario' && (dead.has(it.scenarioType === 'uca' ? it.uca ?? '' : it.ca ?? ''))) ||
        req.some((f) => dead.has(r[f] as Id))
      if (ownerDead) {
        dead.add(it.id)
        changed = true
      }
    }
  }
  return dead
}
