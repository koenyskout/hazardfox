import type { Id, Item, ItemOf, Kind, Project, VariableLayer } from './types'

/** Kinds that form their own hierarchy through `parent`. */
export const TREE_KINDS = ['loss', 'hazard', 'constraint', 'requirement', 'entity', 'node'] as const satisfies readonly Kind[]
export type TreeKind = (typeof TREE_KINDS)[number]

export const isTreeKind = (k: Kind): k is TreeKind => (TREE_KINDS as readonly Kind[]).includes(k)

/** Owner kind of a variable per layer. */
export const VARIABLE_OWNER: Record<VariableLayer, Kind> = { domain: 'entity', signal: 'feedback', belief: 'node', internal: 'node' }

/** Kinds a `parent` may have: tree kinds nest under their own kind, variables belong to an entity, feedback or node (by layer); others have none. */
export const parentKinds = (k: Kind): Kind[] => (k === 'variable' ? ['entity', 'feedback', 'node'] : isTreeKind(k) ? [k] : [])
/** Required owner kind of this item's parent. */
export const ownerKind = (it: Item): Kind | null => (it.kind === 'variable' ? VARIABLE_OWNER[it.layer] : isTreeKind(it.kind) ? it.kind : null)

/** Items that are siblings share a group key; ranks are 0..n-1 within a group. */
export function groupKey(it: Item): string {
  switch (it.kind) {
    case 'uca':
      return `uca:${it.ca}`
    case 'scenario':
      return `scenario:${it.scenarioType === 'ca' ? it.ca : it.uca}`
    default:
      return parentKinds(it.kind).length ? `${it.kind}:${it.parent}` : it.kind
  }
}

const byRank = (a: Item, b: Item) => a.rank - b.rank || (a.id < b.id ? -1 : 1)

const isKind = <K extends Kind>(kind: K) => (i: Item): i is ItemOf<K> => i.kind === kind

export function itemsOfKind<K extends Kind>(p: Project, kind: K): ItemOf<K>[] {
  return Object.values(p.items).filter(isKind(kind))
}

/** Ordered siblings (including the item itself) in the item's group. */
export function siblings(p: Project, it: Item): Item[] {
  const key = groupKey(it)
  return Object.values(p.items)
    .filter((o) => groupKey(o) === key)
    .sort(byRank)
}

export function children<K extends Kind>(p: Project, id: Id | null, kind: K): ItemOf<K>[] {
  return itemsOfKind(p, kind)
    .filter((o) => o.parent === id)
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
export function flatten<K extends Kind>(p: Project, kind: K): { item: ItemOf<K>; depth: number }[] {
  const out: { item: ItemOf<K>; depth: number }[] = []
  const walk = (pid: Id | null, depth: number) => {
    for (const c of children(p, pid, kind)) {
      out.push({ item: c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}
