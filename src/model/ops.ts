import { produce } from 'immer'
import { makeItem } from './create'
import { cascadeSet, LIST_REFS, rewriteRefs } from './refs'
import { ancestors, children, descendants, groupKey, isTreeKind, siblings } from './tree'
import type { Id, Item, Kind, Project } from './types'

type Draft = Project
type Rec = Record<string, unknown>

/** Rewrite ranks to 0..n-1 in every sibling group. */
function renormalize(d: Draft) {
  const groups = new Map<string, Item[]>()
  for (const it of Object.values(d.items)) {
    const k = groupKey(it)
    const g = groups.get(k)
    if (g) g.push(it)
    else groups.set(k, [it])
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1)).forEach((it, i) => (it.rank = i))
  }
}

/** Put item at `index` among its (new) siblings, optionally changing its tree parent first. */
function placeAt(d: Draft, id: Id, parent: Id | null | undefined, index: number) {
  const it = d.items[id]
  if (parent !== undefined && (isTreeKind(it.kind) || it.kind === 'variable')) it.parent = parent
  renormalize(d)
  const sibs = siblings(d, it).filter((s) => s.id !== id)
  const i = Math.max(0, Math.min(index, sibs.length))
  sibs.splice(i, 0, it)
  sibs.forEach((s, n) => (d.items[s.id].rank = n))
  renormalize(d)
}

export function effectiveLosses(p: Project, hazardId: Id): Id[] {
  const chain = [...ancestors(p, hazardId), p.items[hazardId]]
  let set: Id[] = []
  for (const h of chain) {
    if (h?.kind !== 'hazard') continue
    set = set.filter((x) => !h.lossExclude.includes(x))
    for (const l of h.lossLinks) if (!set.includes(l)) set.push(l)
  }
  return set
}

/** Loss links a hazard inherits from its ancestors. */
export const inheritedLosses = (p: Project, hazardId: Id): Id[] => {
  const it = p.items[hazardId]
  if (it?.kind !== 'hazard' || !it.parent) return []
  return effectiveLosses(p, it.parent)
}

export function createItem(
  p: Project,
  kind: Kind,
  init: Partial<Item> & Rec = {},
  index?: number,
): { project: Project; id: Id } {
  const item = makeItem(kind, init)
  const project = produce(p, (d) => {
    d.items[item.id] = item
    placeAt(d, item.id, undefined, index ?? Number.MAX_SAFE_INTEGER)
  })
  return { project, id: item.id }
}

export function updateItem(p: Project, id: Id, patch: Partial<Item> & Rec): Project {
  if (!p.items[id]) return p
  return produce(p, (d) => {
    Object.assign(d.items[id], patch)
    renormalize(d)
  })
}

export function updateMeta(p: Project, patch: Partial<Project['meta']>): Project {
  return produce(p, (d) => {
    Object.assign(d.meta, patch)
  })
}

export function deleteItems(p: Project, ids: Id[], opts: { promote?: boolean } = {}): Project {
  return produce(p, (d) => {
    const seed = new Set<Id>()
    for (const id of ids) {
      const it = d.items[id]
      if (!it) continue
      seed.add(id)
      if (!isTreeKind(it.kind)) continue
      if (opts.promote) {
        children(d, id, it.kind).forEach((c, i) => {
          d.items[c.id].parent = it.parent
          d.items[c.id].rank = it.rank + (i + 1) / 1000
        })
      } else {
        for (const x of descendants(d, id)) seed.add(x.id)
      }
    }
    const dead = cascadeSet(d, seed)
    for (const id of dead) delete d.items[id]
    for (const it of Object.values(d.items)) for (const id of dead) rewriteRefs(it, id, null)
    renormalize(d)
  })
}

export function moveItem(p: Project, id: Id, parent: Id | null, index: number): Project {
  const it = p.items[id]
  if (!it || !(isTreeKind(it.kind) || it.kind === 'variable')) return p
  if (parent) {
    const par = p.items[parent]
    if (!par || par.id === id || descendants(p, id).some((x) => x.id === parent)) return p
    if (it.kind !== 'variable' && par.kind !== it.kind) return p
    if (it.kind === 'variable' && par.kind !== 'entity') return p
  } else if (it.kind === 'variable') return p
  return produce(p, (d) => placeAt(d, id, parent, index))
}

/** Reorder within the current sibling group. */
export function reorder(p: Project, id: Id, index: number): Project {
  if (!p.items[id]) return p
  return produce(p, (d) => placeAt(d, id, undefined, index))
}

export function shift(p: Project, id: Id, delta: number): Project {
  const it = p.items[id]
  if (!it) return p
  const i = siblings(p, it).findIndex((s) => s.id === id)
  return reorder(p, id, i + delta)
}

export function indent(p: Project, id: Id): Project {
  const it = p.items[id]
  if (!it || !isTreeKind(it.kind)) return p
  const sibs = siblings(p, it)
  const i = sibs.findIndex((s) => s.id === id)
  if (i <= 0) return p
  const prev = sibs[i - 1]
  return moveItem(p, id, prev.id, children(p, prev.id, it.kind).length)
}

export function outdent(p: Project, id: Id): Project {
  const it = p.items[id]
  if (!it || !isTreeKind(it.kind) || !it.parent) return p
  const par = p.items[it.parent]
  const idx = siblings(p, par).findIndex((s) => s.id === par.id)
  return moveItem(p, id, par.parent, idx + 1)
}

/** Group sibling items under a new parent of the same kind. */
export function group(p: Project, ids: Id[], title: string): { project: Project; id: Id } {
  const items = ids.map((i) => p.items[i]).filter(Boolean)
  if (items.length === 0) throw new Error('Nothing to group')
  const kind = items[0].kind
  if (!isTreeKind(kind) || items.some((i) => i.kind !== kind || i.parent !== items[0].parent))
    throw new Error('Items to group must be siblings of the same kind')
  const ordered = [...items].sort((a, b) => a.rank - b.rank)
  const index = ordered[0].rank
  const parent = makeItem(kind, { title, parent: items[0].parent })
  const before = new Map<Id, Id[]>()
  if (kind === 'hazard') for (const h of ordered) before.set(h.id, effectiveLosses(p, h.id))
  const project = produce(p, (d) => {
    d.items[parent.id] = parent
    placeAt(d, parent.id, undefined, index)
    ordered.forEach((it, i) => placeAt(d, it.id, parent.id, i))
    if (kind === 'hazard') {
      const old = parent.parent ? effectiveLosses(p, parent.parent) : []
      const union = [...new Set([...before.values()].flat())].filter((l) => !old.includes(l))
      ;(d.items[parent.id] as Extract<Item, { kind: 'hazard' }>).lossLinks = union
      const parentEff = effectiveLosses(d, parent.id)
      for (const h of ordered) {
        const hz = d.items[h.id] as Extract<Item, { kind: 'hazard' }>
        const keep = before.get(h.id)!
        hz.lossExclude = [...new Set([...hz.lossExclude, ...parentEff.filter((l) => !keep.includes(l))])]
      }
    }
  })
  return { project, id: parent.id }
}

/** Replace `from` by several ids in every list reference of the draft item. */
function replaceWithMany(it: Item, from: Id, tos: Id[]) {
  const r = it as unknown as Rec
  for (const f of LIST_REFS[it.kind] ?? []) {
    const list = r[f] as Id[]
    const at = list.indexOf(from)
    if (at < 0) continue
    const next = [...list.slice(0, at), ...tos, ...list.slice(at + 1)]
    r[f] = [...new Set(next)]
  }
}

/** Items whose list references point at `id` (candidates for reassignment on split). */
/** Leaf hazards a scenario relates to: via its UCA (type 1) or directly (type 2). */
export function scenarioHazards(p: Project, s: Extract<Item, { kind: 'scenario' }>): Id[] {
  if (s.scenarioType === 'ca') return s.hazards
  const u = s.uca ? p.items[s.uca] : null
  return u?.kind === 'uca' ? u.hazards : []
}

export function linkedTo(p: Project, id: Id): Item[] {
  return Object.values(p.items).filter((o) => {
    const fields = LIST_REFS[o.kind] ?? []
    return fields.some((f) => ((o as unknown as Rec)[f] as Id[]).includes(id))
  })
}

/**
 * Split an item into sub-items. The original stays as the parent; `assign` maps referrer id →
 * indices of the new children that should take over the link (unassigned links stay on the parent).
 */
export function split(
  p: Project,
  id: Id,
  titles: string[],
  assign: Record<Id, number[]> = {},
): { project: Project; ids: Id[] } {
  const it = p.items[id]
  if (!it || !isTreeKind(it.kind)) throw new Error('Cannot split this item')
  const kids = titles.map((t) =>
    makeItem(it.kind, {
      title: t,
      parent: id,
      description: it.description,
      status: it.status,
      tags: [...it.tags],
      ...(it.kind === 'hazard' ? { security: it.security } : {}),
    }),
  )
  const project = produce(p, (d) => {
    for (const k of kids) {
      d.items[k.id] = k
      placeAt(d, k.id, undefined, Number.MAX_SAFE_INTEGER)
    }
    for (const [ref, idxs] of Object.entries(assign)) {
      const target = d.items[ref]
      const ids = idxs.map((i) => kids[i]?.id).filter(Boolean)
      if (target && ids.length) replaceWithMany(target, id, ids)
    }
  })
  return { project, ids: kids.map((k) => k.id) }
}

/** Merge items into the first one (its id and links are kept; everything else is folded in). */
export function merge(p: Project, ids: Id[], title?: string): Project {
  const items = ids.map((i) => p.items[i]).filter(Boolean)
  if (items.length < 2) return p
  const kind = items[0].kind
  if (!isTreeKind(kind) || items.some((i) => i.kind !== kind)) throw new Error('Can only merge tree items of one kind')
  for (const a of items)
    for (const b of items)
      if (a !== b && descendants(p, a.id).some((x) => x.id === b.id))
        throw new Error('Cannot merge an item with its own descendant')
  const [keep, ...rest] = items
  return produce(p, (d) => {
    const k = d.items[keep.id] as Item & Rec
    const losses = kind === 'hazard' ? [...new Set(items.flatMap((h) => effectiveLosses(p, h.id)))] : []
    for (const o of rest) {
      const other = d.items[o.id] as Item & Rec
      for (const c of children(d, o.id, kind)) placeAt(d, c.id, keep.id, Number.MAX_SAFE_INTEGER)
      for (const f of LIST_REFS[kind] ?? []) {
        if (f === 'lossExclude') continue
        k[f] = [...new Set([...(k[f] as Id[]), ...(other[f] as Id[])])]
      }
      if (other.description && other.description !== k.description)
        k.description = [k.description, other.description].filter(Boolean).join('\n\n')
      if (other.notes) k.notes = [k.notes, other.notes].filter(Boolean).join('\n\n')
      k.tags = [...new Set([...k.tags, ...other.tags])]
      for (const x of Object.values(d.items)) if (x.id !== o.id) rewriteRefs(x, o.id, keep.id)
      delete d.items[o.id]
    }
    if (kind === 'hazard') {
      const inherited = k.parent ? effectiveLosses(d, k.parent as Id) : []
      k.lossLinks = losses.filter((l) => !inherited.includes(l))
      k.lossExclude = []
    }
    if (title !== undefined) k.title = title
    renormalize(d)
  })
}
