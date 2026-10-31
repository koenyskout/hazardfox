import { laneParts, laneText, leaves, mapLeaves } from './variables'
import type { Condition, Id, Item, ItemOf, Kind, Project, Scenario, Trace } from './types'

/** Names of the fields of kind K whose value type is V. */
type Fields<K extends Kind, V> = { [F in keyof ItemOf<K>]-?: ItemOf<K>[F] extends V ? F : never }[keyof ItemOf<K>] & string
type Registry<V> = { [K in Kind]?: readonly Fields<K, V>[] }

/** Required single references: if the target disappears, the item is deleted too. */
export const REQUIRED_REFS: Registry<Id> = {
  relationship: ['from', 'to'],
  ca: ['from', 'to'],
  feedback: ['from', 'to'],
  uca: ['ca'],
}
/** Optional single references: cleared when the target disappears. */
export const OPTIONAL_REFS: Registry<Id | null> = {
  variable: ['about'],
  uca: ['refines'],
  scenario: ['uca', 'ca', 'element'],
}
/** List references: entries are removed when the target disappears. */
export const LIST_REFS: Registry<Id[]> = {
  hazard: ['lossLinks', 'lossExclude', 'variables'],
  constraint: ['hazards'],
  requirement: ['sources'],
  assumption: ['about'],
  node: ['entities'],
  ca: ['affects'],
  uca: ['hazards'],
  scenario: ['hazards'],
}
/** Free-text fields (besides description and notes) that may contain `@[id]` mentions. */
export const TEXT_FIELDS: Registry<string> = {
  variable: ['definition'],
  uca: ['context', 'override', 'constraint'],
  scenario: ['threat'],
}

export const requiredRefs = (kind: Kind): readonly string[] => REQUIRED_REFS[kind] ?? []
export const optionalRefs = (kind: Kind): readonly string[] => OPTIONAL_REFS[kind] ?? []
export const singleRefs = (kind: Kind) => [...requiredRefs(kind), ...optionalRefs(kind)]
export const listRefs = (kind: Kind): readonly string[] => LIST_REFS[kind] ?? []
export const textFields = (kind: Kind): readonly string[] => ['description', 'notes', ...(TEXT_FIELDS[kind] ?? [])]

/** Dynamic field access by a registry field name; the only untyped view on items. */
export const getField = (it: Item, f: string): unknown => (it as unknown as Record<string, unknown>)[f]
export const setField = (it: Item, f: string, v: unknown) => {
  ;(it as unknown as Record<string, unknown>)[f] = v
}
export const getList = (it: Item, f: string) => getField(it, f) as Id[]

const MENTION_RE = /@\[([^\]]+)\]/g
export const mention = (id: Id) => `@[${id}]`
/** Ids mentioned as `@[id]` in a text. */
export const mentions = (text: string): Id[] => [...text.matchAll(MENTION_RE)].map((m) => m[1])
/** Text split into plain strings and `@[id]` references. */
export const splitMentions = (text: string): (string | { id: Id })[] =>
  text.split(/(@\[[^\]]+\])/).filter(Boolean).map((part) => { const m = /^@\[([^\]]+)\]$/.exec(part); return m ? { id: m[1] } : part })
export const replaceMentions = (text: string, f: (id: Id, whole: string) => string) =>
  text.replace(MENTION_RE, (whole, id: string) => f(id, whole))

/** The UCA (type 'uca') or control action (type 'ca') a scenario explains. */
export const scenarioTarget = (s: Scenario): Id | null => (s.scenarioType === 'uca' ? s.uca : s.ca)

/** All ids an item refers to (excluding its tree parent). */
export function refsOf(it: Item): Id[] {
  const out: Id[] = []
  for (const f of singleRefs(it.kind)) {
    const v = getField(it, f)
    if (typeof v === 'string' && v) out.push(v)
  }
  for (const f of listRefs(it.kind)) out.push(...getList(it, f))
  if (it.kind === 'uca' || it.kind === 'hazard') for (const c of it.conditions) { if (c.variable) out.push(c.variable); if (c.other) out.push(c.other) }
  if (it.kind === 'variable') for (const r of it.rules) out.push(...leaves(r.when).flatMap((c) => [c.variable, c.other ?? '']).filter(Boolean))
  if (it.kind === 'scenario') out.push(...traceRefs(it.trace))
  for (const f of textFields(it.kind)) out.push(...mentions(getField(it, f) as string))
  return out
}

/** Variables, control actions and feedback a trace mentions. */
export const traceRefs = (t: Trace): Id[] => [...new Set([...t.lanes, ...t.steps.flatMap((s) => [...Object.keys(s.values), ...s.events.map((e) => e.on)])])].map((k) => laneParts(k).id).filter((k) => laneText(k) === null)

/** Items that refer to `id` (via parent, refs or mentions). */
export function incoming(p: Project, id: Id): Item[] {
  return Object.values(p.items).filter((o) => o.id !== id && (o.parent === id || refsOf(o).includes(id)))
}

/** Items whose list references contain `id`. */
export function linkedTo(p: Project, id: Id): Item[] {
  return Object.values(p.items).filter((o) => listRefs(o.kind).some((f) => getList(o, f).includes(id)))
}

/** The condition with variable `from` replaced by `to`; none when it is removed (a comparison with a removed variable is dropped). */
const reref = (c: Condition, from: Id, to: Id | null): Condition[] =>
  c.variable !== from && c.other !== from ? [c] : to ? [{ ...c, ...(c.variable === from ? { variable: to } : {}), ...(c.other === from ? { other: to } : {}) }] : []

/** Replace (to !== null) or remove (to === null) every reference to `from` in the draft item. */
export function rewriteRefs(it: Item, from: Id, to: Id | null) {
  for (const f of requiredRefs(it.kind)) if (to && getField(it, f) === from) setField(it, f, to)
  for (const f of optionalRefs(it.kind)) if (getField(it, f) === from) setField(it, f, to)
  for (const f of listRefs(it.kind)) {
    const next: Id[] = []
    for (const x of getList(it, f)) {
      const y = x === from ? to : x
      if (y && !next.includes(y)) next.push(y)
    }
    setField(it, f, next)
  }
  if (it.kind === 'uca' || it.kind === 'hazard') {
    it.conditions = it.conditions.flatMap((c) => reref(c, from, to))
  }
  if (it.kind === 'variable') for (const r of it.rules) r.when = mapLeaves(r.when, (c) => reref(c, from, to)[0] ?? null)
  if (it.kind === 'scenario' && traceRefs(it.trace).includes(from)) {
    const t = it.trace
    // lanes of single instances ("<variable>@t1") follow their variable
    const move = (k: string): string | null => { const { id } = laneParts(k); return id !== from ? k : to ? to + k.slice(from.length) : null }
    t.lanes = [...new Set(t.lanes.flatMap((x) => move(x) ?? []))]
    for (const st of t.steps) {
      st.values = Object.fromEntries(Object.entries(st.values).flatMap(([k, v]) => { const m = move(k); return m ? [[m, v]] : [] }))
      st.events = st.events.flatMap((e) => (e.on !== from ? [e] : to ? [{ ...e, on: to }] : []))
    }
  }
  if (to) {
    for (const f of textFields(it.kind)) setField(it, f, (getField(it, f) as string).split(mention(from)).join(mention(to)))
  }
}

/** Replace `from` by several ids in every list reference of the draft item. */
export function replaceInLists(it: Item, from: Id, tos: Id[]) {
  for (const f of listRefs(it.kind)) {
    const list = getList(it, f)
    const at = list.indexOf(from)
    if (at >= 0) setField(it, f, [...new Set([...list.slice(0, at), ...tos, ...list.slice(at + 1)])])
  }
}

/** Ids whose required refs or owners point into `dead` (transitively) – cascade set. */
export function cascadeSet(p: Project, seed: Iterable<Id>): Set<Id> {
  const dead = new Set<Id>(seed)
  const ownerDead = (it: Item) =>
    (it.kind === 'variable' && !!it.parent && dead.has(it.parent)) ||
    (it.kind === 'scenario' && dead.has(scenarioTarget(it) ?? '')) ||
    requiredRefs(it.kind).some((f) => dead.has(getField(it, f) as Id))
  let changed = true
  while (changed) {
    changed = false
    for (const it of Object.values(p.items)) {
      if (dead.has(it.id) || !ownerDead(it)) continue
      dead.add(it.id)
      changed = true
    }
  }
  return dead
}
