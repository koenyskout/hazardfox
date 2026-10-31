import { produce } from 'immer'
import { makeItem } from './create'
import { effectiveLosses } from './derived'
import { cascadeSet, getList, listRefs, replaceInLists, rewriteRefs, setField } from './refs'
import { children, descendants, groupKey, isTreeKind, ownerKinds, parentKinds, siblings } from './tree'
import type { Id, Item, ItemOf, Kind, Patch, Project, RangeType, StructField, StructType } from './types'

type Draft = Project

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
  if (parent !== undefined && parentKinds(it.kind).length) it.parent = parent
  renormalize(d)
  const sibs = siblings(d, it).filter((s) => s.id !== id)
  const i = Math.max(0, Math.min(index, sibs.length))
  sibs.splice(i, 0, it)
  sibs.forEach((s, n) => (d.items[s.id].rank = n))
  renormalize(d)
}

export function createItem<K extends Kind>(
  p: Project,
  kind: K,
  init: Patch<K> = {} as Patch<K>,
  index?: number,
): { project: Project; id: Id } {
  const item = makeItem(kind, init)
  const project = produce(p, (d) => {
    d.items[item.id] = item
    placeAt(d, item.id, undefined, index ?? Number.MAX_SAFE_INTEGER)
    // A relationship is a time-varying predicate R(from, to): it owns a boolean world variable (untitled; named after the relationship).
    if (kind === 'relationship') { const v = makeItem('variable', { parent: item.id, type: 'boolean' }); d.items[v.id] = v; placeAt(d, v.id, undefined, 0) }
  })
  return { project, id: item.id }
}

export function updateItem(p: Project, id: Id, patch: Patch): Project {
  if (!p.items[id]) return p
  return produce(p, (d) => {
    Object.assign(d.items[id], patch)
    const v = d.items[id]
    if (v.kind === 'variable') {
      const t = d.rangeTypes?.[v.rangeType]
      if (v.type !== 'range' || !t) v.rangeType = ''
      else if ('rangeType' in patch) Object.assign(v, t)
      else if ('min' in patch || 'max' in patch || 'unit' in patch) setRangeType(d, v.rangeType, { min: v.min, max: v.max, unit: v.unit })
    }
    if (v.kind === 'variable') {
      const e = d.enumTypes?.[v.enumType]
      if (v.type !== 'enum' || !e) v.enumType = ''
      else if ('enumType' in patch) v.states = [...e]
      else if ('states' in patch) setEnumType(d, v.enumType, v.states)
    }
    renormalize(d)
  })
}

/** Create or change a named enum type; variables using it follow. Works on a draft. */
function setEnumType(d: Draft, name: string, states: string[]) {
  ;(d.enumTypes ??= {})[name] = [...states]
  for (const it of Object.values(d.items)) if (it.kind === 'variable' && it.enumType === name) it.states = [...states]
}
export const defineEnumType = (p: Project, name: string, states: string[]): Project => produce(p, (d) => setEnumType(d, name, states))
export const renameEnumType = (p: Project, from: string, to: string): Project => {
  if (!to || to === from || !p.enumTypes?.[from] || p.enumTypes[to]) return p
  return produce(p, (d) => {
    d.enumTypes![to] = d.enumTypes![from]
    delete d.enumTypes![from]
    for (const it of Object.values(d.items)) if (it.kind === 'variable' && it.enumType === from) it.enumType = to
  })
}
/** Remove an enum type; its variables keep their states as their own. */
export const deleteEnumType = (p: Project, name: string): Project =>
  produce(p, (d) => {
    delete d.enumTypes?.[name]
    for (const it of Object.values(d.items)) if (it.kind === 'variable' && it.enumType === name) it.enumType = ''
  })

/** Create or change a named range type; variables using it follow. Works on a draft. */
function setRangeType(d: Draft, name: string, t: RangeType) {
  ;(d.rangeTypes ??= {})[name] = t
  for (const it of Object.values(d.items)) if (it.kind === 'variable' && it.rangeType === name) Object.assign(it, t)
}

export const defineRangeType = (p: Project, name: string, t: RangeType): Project => produce(p, (d) => setRangeType(d, name, t))

/** Rename a range type (no-op when the new name is taken). */
export const renameRangeType = (p: Project, from: string, to: string): Project => {
  if (!to || to === from || !p.rangeTypes?.[from] || p.rangeTypes[to]) return p
  return produce(p, (d) => {
    d.rangeTypes![to] = d.rangeTypes![from]
    delete d.rangeTypes![from]
    for (const it of Object.values(d.items)) if (it.kind === 'variable' && it.rangeType === from) it.rangeType = to
  })
}

/** Remove a range type; its variables keep their current bounds as custom ones. */
export const deleteRangeType = (p: Project, name: string): Project =>
  produce(p, (d) => {
    delete d.rangeTypes?.[name]
    for (const it of Object.values(d.items)) if (it.kind === 'variable' && it.rangeType === name) it.rangeType = ''
  })

export const blankField = (): StructField => ({ name: '', type: 'enum', states: [], min: null, max: null, unit: '', rangeType: '', enumType: '' })
export const defineStructType = (p: Project, name: string, t: StructType): Project => produce(p, (d) => { (d.structTypes ??= {})[name] = t })
export const renameStructType = (p: Project, from: string, to: string): Project => {
  if (!to || to === from || !p.structTypes?.[from] || p.structTypes[to]) return p
  return produce(p, (d) => { d.structTypes![to] = d.structTypes![from]; delete d.structTypes![from] })
}
export const deleteStructType = (p: Project, name: string): Project => produce(p, (d) => { delete d.structTypes?.[name] })

/** Apply a struct type: one world variable per field under `parent`, titled "<name>.<field>", sharing the field's range / enum type. */
export function applyStructType(p: Project, type: string, name: string, parent: Id): Project {
  const t = p.structTypes?.[type]
  if (!t) return p
  let q = p
  for (const f of t.fields.filter((x) => x.name.trim())) {
    const patch: Patch<'variable'> = { layer: 'domain', parent, title: `${name}.${f.name}`, type: f.type, states: [...f.states], min: f.min, max: f.max, unit: f.unit }
    const r = createItem(q, 'variable', patch)
    q = r.project
    if (f.type === 'range' && f.rangeType && q.rangeTypes?.[f.rangeType]) q = updateItem(q, r.id, { rangeType: f.rangeType })
    if (f.type === 'enum' && f.enumType && q.enumTypes?.[f.enumType]) q = updateItem(q, r.id, { enumType: f.enumType })
  }
  return q
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
  const pk = it && ownerKinds(it)
  if (!pk) return p
  if (parent) {
    const par = p.items[parent]
    if (!par || par.id === id || !pk.includes(par.kind) || descendants(p, id).some((x) => x.id === parent)) return p
  } else if (!isTreeKind(it.kind)) return p
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
      ;(d.items[parent.id] as ItemOf<'hazard'>).lossLinks = union
      const parentEff = effectiveLosses(d, parent.id)
      for (const h of ordered) {
        const hz = d.items[h.id] as ItemOf<'hazard'>
        const keep = before.get(h.id)!
        hz.lossExclude = [...new Set([...hz.lossExclude, ...parentEff.filter((l) => !keep.includes(l))])]
      }
    }
  })
  return { project, id: parent.id }
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
      if (target && ids.length) replaceInLists(target, id, ids)
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
    const k = d.items[keep.id]
    const losses = kind === 'hazard' ? [...new Set(items.flatMap((h) => effectiveLosses(p, h.id)))] : []
    for (const o of rest) {
      const other = d.items[o.id]
      for (const c of children(d, o.id, kind)) placeAt(d, c.id, keep.id, Number.MAX_SAFE_INTEGER)
      for (const f of listRefs(kind)) {
        if (f === 'lossExclude') continue
        setField(k, f, [...new Set([...getList(k, f), ...getList(other, f)])])
      }
      if (other.description && other.description !== k.description)
        k.description = [k.description, other.description].filter(Boolean).join('\n\n')
      if (other.notes) k.notes = [k.notes, other.notes].filter(Boolean).join('\n\n')
      k.tags = [...new Set([...k.tags, ...other.tags])]
      for (const x of Object.values(d.items)) if (x.id !== o.id) rewriteRefs(x, o.id, keep.id)
      delete d.items[o.id]
    }
    if (k.kind === 'hazard') {
      const inherited = k.parent ? effectiveLosses(d, k.parent) : []
      k.lossLinks = losses.filter((l) => !inherited.includes(l))
      k.lossExclude = []
    }
    if (title !== undefined) k.title = title
    renormalize(d)
  })
}
