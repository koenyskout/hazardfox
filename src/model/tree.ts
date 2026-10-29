import type { Id, Item, Kind, Project } from './types'

/** Kinds that form their own hierarchy through `parent`. */
export const TREE_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'loss',
  'hazard',
  'constraint',
  'requirement',
  'entity',
  'node',
])

export const isTreeKind = (k: Kind) => TREE_KINDS.has(k)

/** Items that are siblings share a group key; ranks are 0..n-1 within a group. */
export function groupKey(it: Item): string {
  switch (it.kind) {
    case 'uca':
      return `uca:${it.ca}`
    case 'scenario':
      return `scenario:${it.scenarioType === 'ca' ? it.ca : it.uca}`
    case 'variable':
      return `variable:${it.parent}`
    case 'loss':
    case 'hazard':
    case 'constraint':
    case 'requirement':
    case 'entity':
    case 'node':
      return `${it.kind}:${it.parent}`
    default:
      return it.kind
  }
}

const byRank = (a: Item, b: Item) => a.rank - b.rank || (a.id < b.id ? -1 : 1)

export function itemsOfKind<K extends Kind>(p: Project, kind: K): Extract<Item, { kind: K }>[] {
  return Object.values(p.items).filter((i): i is Extract<Item, { kind: K }> => i.kind === kind)
}

/** Ordered siblings (including the item itself) in the item's group. */
export function siblings(p: Project, it: Item): Item[] {
  const key = groupKey(it)
  return Object.values(p.items)
    .filter((o) => groupKey(o) === key)
    .sort(byRank)
}

export function children(p: Project, id: Id | null, kind: Kind): Item[] {
  return Object.values(p.items)
    .filter((o) => o.kind === kind && o.parent === id)
    .sort(byRank)
}

export function ancestors(p: Project, id: Id): Item[] {
  const out: Item[] = []
  let cur = p.items[id]
  const seen = new Set<Id>()
  while (cur && cur.parent && !seen.has(cur.id)) {
    seen.add(cur.id)
    const par = p.items[cur.parent]
    if (!par) break
    out.unshift(par)
    cur = par
  }
  return out
}

export function descendants(p: Project, id: Id): Item[] {
  const it = p.items[id]
  if (!it) return []
  const out: Item[] = []
  const walk = (pid: Id) => {
    for (const c of children(p, pid, it.kind)) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

export const isLeaf = (p: Project, id: Id) => {
  const it = p.items[id]
  return !!it && children(p, id, it.kind).length === 0
}

/** Depth-first ordered list of a tree kind. */
export function flatten(p: Project, kind: Kind): { item: Item; depth: number }[] {
  const out: { item: Item; depth: number }[] = []
  const walk = (pid: Id | null, depth: number) => {
    for (const c of children(p, pid, kind)) {
      out.push({ item: c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
