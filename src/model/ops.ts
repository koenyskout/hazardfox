import { normSym } from './variables'
import { produce } from 'immer'
import { makeItem } from './create'
import { effectiveLosses } from './derived'
import { cascadeSet, getList, listRefs, replaceInLists, rewriteRefs, setField } from './refs'
import { children, descendants, groupKey, isTreeKind, ownerKinds, parentKinds, siblings } from './tree'
import { isWorld, structOf } from './types'
import type { Id, Item, ItemOf, Kind, Patch, Project, RangeType, StructField, SymbolicType, StructType, ScenarioType, Variable, WorldVariable } from './types'

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

/** Turn a scenario into one of the other type, pointing at `target` (a UCA or control action); the fields of the old type are dropped, hazards start empty. */
export const setScenarioType = (p: Project, id: Id, type: ScenarioType, target: Id | null): Project =>
  produce(p, (d) => {
    const s = d.items[id]
    if (s?.kind !== 'scenario') return
    const { uca: _u, ca: _c, hazards: _h, ...rest } = s as typeof s & { uca?: Id | null; ca?: Id | null; hazards?: Id[] }
    d.items[id] = type === 'uca' ? { ...rest, scenarioType: 'uca', uca: target } : { ...rest, scenarioType: 'ca', ca: target, hazards: [] }
  })

export function updateItem(p: Project, id: Id, patch: Patch): Project {
  if (!p.items[id]) return p
  const before = p.items[id]
  return produce(p, (d) => {
    Object.assign(d.items[id], patch)
    const v = d.items[id]
    // renaming a parameter renames it in the UCAs' arguments, removing one drops them
    if (before.kind === 'ca' && v.kind === 'ca' && 'params' in patch) {
      const names = before.params.map((x) => x.name), now = v.params.map((x) => x.name)
      const rename = new Map(names.flatMap((n, i) => (now.length === names.length && now[i] !== n ? [[n, now[i]] as const] : [])))
      for (const u of Object.values(d.items)) if (u.kind === 'uca' && u.ca === id)
        u.args = u.args.flatMap((a) => { const n = rename.get(a.param) ?? a.param; return now.includes(n) ? [{ ...a, param: n }] : [] })
    }
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
    if (v.kind === 'variable') {
      Object.assign(v, normSym(v))
      const s = d.symbolicTypes?.[v.symbolicType]
      if (v.type !== 'symbolic' || !s) v.symbolicType = ''
      else if ('symbolicType' in patch) Object.assign(v, s)
      else if (SYM_KEYS.some((k) => k in patch)) setSymbolicType(d, v.symbolicType, v)
    }
    renormalize(d)
  })
}

/** The three kinds of named, reusable types that variables (and parameters) refer to by name. */
interface NamedKind<T> {
  registry: 'rangeTypes' | 'enumTypes' | 'symbolicTypes'
  /** field holding the type name on variables, parameters and struct fields */
  field: 'rangeType' | 'enumType' | 'symbolicType'
  /** a variable following the type takes its definition */
  apply: (v: Variable, t: T) => void
  normalize: (t: T) => T
}
type TypeField = NamedKind<unknown>['field']
/** Where a named type is stored and referred to. */
type Where = Pick<NamedKind<unknown>, 'registry' | 'field'>
type NameHolder = { [F in TypeField]?: string }

const RANGE: NamedKind<RangeType> = { registry: 'rangeTypes', field: 'rangeType', apply: (v, t) => Object.assign(v, t), normalize: (t) => ({ ...t }) }
const ENUM: NamedKind<string[]> = { registry: 'enumTypes', field: 'enumType', apply: (v, t) => { v.states = [...t] }, normalize: (t) => [...t] }
const SYMBOLIC: NamedKind<SymbolicType> = { registry: 'symbolicTypes', field: 'symbolicType', apply: (v, t) => Object.assign(v, t), normalize: normSym }
const SYM_KEYS = ['ordered', 'unique', 'monotonic', 'sequential']

/** Everything that names a type: variables, control-action parameters, value parameters of operations and struct fields. */
function* nameHolders(d: Draft): Generator<NameHolder> {
  for (const it of Object.values(d.items)) {
    if (it.kind === 'variable') yield it
    else if (it.kind === 'ca') yield* it.params
    else if (it.kind === 'operation') for (const x of it.params) if (x.data) yield x.data
  }
  for (const t of Object.values(d.structTypes ?? {})) yield* t.fields
}

/** Create or change a named type; variables using it follow. Works on a draft. */
function setNamed<T>(d: Draft, k: NamedKind<T>, name: string, t: T) {
  const def = k.normalize(t)
  ;((d[k.registry] ??= {}) as Record<string, T>)[name] = def
  for (const it of Object.values(d.items)) if (it.kind === 'variable' && it[k.field] === name) k.apply(it, def)
}
const defineNamed = <T>(k: NamedKind<T>) => (p: Project, name: string, t: T): Project => produce(p, (d) => setNamed(d, k, name, t))
/** Rename a type everywhere it is used (no-op when the new name is taken). */
const renameNamed = (k: Where) => (p: Project, from: string, to: string): Project => {
  const reg = p[k.registry] as Record<string, unknown> | undefined
  if (!to || to === from || !reg?.[from] || reg[to]) return p
  return produce(p, (d) => {
    const r = d[k.registry] as Record<string, unknown>
    r[to] = r[from]
    delete r[from]
    for (const h of nameHolders(d)) if (h[k.field] === from) h[k.field] = to
  })
}
/** Remove a type; whatever used it keeps its current definition as its own. */
const deleteNamed = (k: Where) => (p: Project, name: string): Project =>
  produce(p, (d) => {
    delete (d[k.registry] as Record<string, unknown> | undefined)?.[name]
    for (const h of nameHolders(d)) if (h[k.field] === name) h[k.field] = ''
  })

const setRangeType = (d: Draft, name: string, t: RangeType) => setNamed(d, RANGE, name, t)
const setEnumType = (d: Draft, name: string, states: string[]) => setNamed(d, ENUM, name, states)
const setSymbolicType = (d: Draft, name: string, t: SymbolicType) => setNamed(d, SYMBOLIC, name, t)
export const defineRangeType = defineNamed(RANGE)
export const renameRangeType = renameNamed(RANGE)
export const deleteRangeType = deleteNamed(RANGE)
export const defineEnumType = defineNamed(ENUM)
export const renameEnumType = renameNamed(ENUM)
export const deleteEnumType = deleteNamed(ENUM)
export const defineSymbolicType = defineNamed(SYMBOLIC)
export const renameSymbolicType = renameNamed(SYMBOLIC)
export const deleteSymbolicType = deleteNamed(SYMBOLIC)

export const blankField = (): StructField => ({ name: '', type: 'enum', states: [], min: null, max: null, unit: '', rangeType: '', enumType: '' })
export const defineStructType = (p: Project, name: string, t: StructType): Project => syncStructs(produce(p, (d) => { (d.structTypes ??= {})[name] = t }))
export const renameStructType = (p: Project, from: string, to: string): Project => {
  if (!to || to === from || !p.structTypes?.[from] || p.structTypes[to]) return p
  return produce(p, (d) => { d.structTypes![to] = d.structTypes![from]; delete d.structTypes![from]; for (const t of Object.values(d.structTypes!)) for (const f of t.fields) if (f.structType === from) f.structType = to; for (const it of Object.values(d.items)) if (it.kind === 'variable' && isWorld(it) && it.struct?.type === from) it.struct.type = to })
}
/** Remove a struct type; instances of it, or of types containing it, are unlinked and keep their variables. */
export const deleteStructType = (p: Project, name: string): Project => {
  const uses = (t: string, seen: string[] = []): boolean => t === name || (!seen.includes(t) && (p.structTypes?.[t]?.fields ?? []).some((f) => !!f.structType && uses(f.structType, [...seen, t])))
  return produce(p, (d) => {
    for (const it of Object.values(d.items)) if (it.kind === 'variable' && isWorld(it) && it.struct && uses(it.struct.type)) delete it.struct
    delete d.structTypes?.[name]
    for (const t of Object.values(d.structTypes ?? {})) for (const f of t.fields) if (f.structType === name) f.structType = ''
  })
}
/** Struct types that can be used as a field of `name` without making it contain itself. */
export const nestableStructs = (p: Project, name: string): string[] => {
  const uses = (t: string, seen: string[] = []): boolean => t === name || (!seen.includes(t) && (p.structTypes?.[t]?.fields ?? []).some((f) => !!f.structType && uses(f.structType, [...seen, t])))
  return Object.keys(p.structTypes ?? {}).filter((t) => !uses(t)).sort()
}

/** The plain (non-struct) fields of a struct type, nested ones flattened with dotted paths. */
const structLeaves = (p: Project, type: string, prefix = '', seen: string[] = []): { path: string; f: StructField }[] => {
  const t = p.structTypes?.[type]
  if (!t || seen.includes(type)) return []
  return t.fields.filter((x) => x.name.trim()).flatMap((f) => (f.structType ? structLeaves(p, f.structType, prefix + f.name + '.', [...seen, type]) : [{ path: prefix + f.name, f }]))
}

/** Bring every struct instance in line with its type: update, add and remove field variables; instances of a deleted type are unlinked (variables stay). */
export function syncStructs(p: Project): Project {
  const inst = new Map<string, Variable[]>()
  for (const it of Object.values(p.items)) if (it.kind === 'variable' && isWorld(it) && it.struct) inst.set(it.struct.id, [...(inst.get(it.struct.id) ?? []), it])
  let q = p
  for (const vars of inst.values()) {
    const { id, type, name } = structOf(vars[0])!
    if (!q.structTypes?.[type]) { q = produce(q, (d) => { for (const v of vars) delete (d.items[v.id] as WorldVariable).struct }); continue }
    const want = structLeaves(q, type)
    const have = new Map(vars.map((v) => [structOf(v)!.path, v]))
    for (const { path, f } of want) {
      const patch: Patch<'variable'> = { title: `${name}.${path}`, type: f.type, states: [...f.states], min: f.min, max: f.max, unit: f.unit, rangeType: f.type === 'range' && q.rangeTypes?.[f.rangeType] ? f.rangeType : '', enumType: f.type === 'enum' && q.enumTypes?.[f.enumType] ? f.enumType : '' }
      const v = have.get(path)
      if (v) q = updateItem(q, v.id, patch)
      else q = createItem(q, 'variable', { ...patch, layer: 'domain', parent: vars[0].parent, struct: { id, type, name, path } }).project
    }
    const gone = vars.filter((v) => !want.some((w) => w.path === structOf(v)!.path)).map((v) => v.id)
    if (gone.length) q = deleteItems(q, gone)
  }
  return q
}

/** Apply a struct type to an owner: its field variables stay linked to the type and follow its edits. */
export function applyStructType(p: Project, type: string, name: string, parent: Id): Project {
  const id = crypto.randomUUID()
  let q = p
  for (const { path } of structLeaves(p, type)) q = createItem(q, 'variable', { layer: 'domain', parent, title: `${name}.${path}`, struct: { id, type, name, path } }).project
  return syncStructs(q)
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
