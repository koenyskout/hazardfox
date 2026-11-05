import { relEnds } from '../create'
import { addSignal, predicateOf } from '../formal'
import { createItem, updateItem } from '../ops'
import { itemsOfKind } from '../tree'
import { varsOf } from '../atoms'
import { rulesOf } from '../types'
import type { Id, Item, ItemOf, Project, Variable } from '../types'
import { and, check, inWords, is, isNot, mapChildren, none, or, some, type Expr } from '../lang'

/**
 * Formalizes the published examples `pub-train-door` and `pub-vtt-am` as far as the model allows: domain model (entities with
 * several instances, relationship predicates, typed world variables, one refined variable each), conditions on every leaf
 * hazard and UCA, signals and beliefs for the world variables a UCA context uses. Pure, idempotent, adds only what is missing.
 * See docs/formalize-train-vtt.md for what was formal before, what was added and what could not be expressed.
 */
export function formalizeTrainVtt(id: 'pub-train-door' | 'pub-vtt-am', p: Project): Project {
  return id === 'pub-train-door' ? train(p) : vtt(p)
}

type Box = { p: Project }
const all = (b: Box) => Object.values(b.p.items)
const named = <T extends Item>(xs: T[], title: string) => xs.find((x) => x.title.trim() === title)
function ensure<K extends 'entity' | 'relationship' | 'variable'>(b: Box, kind: K, title: string, init: Record<string, unknown>, owner?: Id): Id {
  const have = all(b).find((i) => i.kind === kind && i.title.trim() === title && (!owner || i.parent === owner || (i.kind === 'relationship' && i.ends[0]?.entity === owner)))
  if (have) return have.id
  const r = createItem(b.p, kind, { title, ...init } as never)
  b.p = r.project
  return r.id
}
const set = (b: Box, id: Id, patch: Record<string, unknown>) => { b.p = updateItem(b.p, id, patch as never) }
const all_ = (cs: Expr[]): Expr => (cs.length > 1 ? and(...cs) : cs[0])
const isEmpty = (e: Expr | null) => !e
const world = (b: Box, ids: Id[]) => ids.filter((v) => b.p.items[v]?.kind === 'variable')

/** Gives the first condition on a variable of `many` entity `e` the name, later ones refer to it (`same`): all describe one instance. */
function oneInstance(e: Expr | null, vars: Id[], name: string, entity: Id<'entity'>): Expr | null {
  if (!e) return e
  let hit = false
  const go = (x: Expr): Expr => { const m = mapChildren(x, go); if (m.k === 'var' && vars.includes(m.id) && !m.at?.some(Boolean)) { hit = true; return { ...m, at: [name] } } return m }
  const out = go(e)
  return hit ? some(name, entity, out) : e
}

function signalFor(b: Box, fbTitle: string, worlds: Id[]) {
  const fb = named(itemsOfKind(b.p, 'feedback'), fbTitle)
  if (!fb) return
  for (const w of worlds) b.p = addSignal(b.p, fb.id, w).project
}

/* ------------------------------------------------------------------ train door */

function train(p0: Project): Project {
  const b: Box = { p: p0 }
  const vars = itemsOfKind(b.p, 'variable')
  const v = (t: string, layer: Variable['layer'] = 'domain') => vars.find((x) => x.title === t && x.layer === layer)!.id
  const trainE = named(itemsOfKind(b.p, 'entity'), 'Train')!.id
  const doorE = named(itemsOfKind(b.p, 'entity'), 'Door')!.id
  const motion = v('Train motion'), pos = v('Train position'), em = v('Emergency'), doorPos = v('Door position'), way = v('Door state')

  // A train has several doors: conditions on door variables say which door.
  if (!(b.p.items[doorE] as ItemOf<'entity'>).many) set(b, doorE, { many: true })
  const doorVars = [doorPos, way]
  const d1 = 'do1'

  // Hierarchical variable: is it unsafe to open the doors (hazard H2 is "moving OR not aligned")?
  const sit = ensure(b, 'variable', 'Door-opening situation', {
    layer: 'domain', parent: trainE, states: ['safe for opening', 'unsafe for opening'],
    definition: 'Opening the doors is unsafe while the train is moving or not aligned with a platform. Refines train motion and train position.',
    rules: [{ state: 'unsafe for opening', when: or(is(motion, 'moving'), is(pos, 'not aligned with platform')) }], otherwise: 'safe for opening',
  })

  // The existing UCA conditions on door variables are about the door the controller drives: one named instance.
  for (const u of itemsOfKind(b.p, 'uca')) {
    const w = oneInstance(u.when, doorVars, d1, (b.p.items[doorVars[0]] as Variable).parent as Id<'entity'>)
    if (w !== u.when) set(b, u.id, { when: w })
  }

  const [h1, h2, h3] = ['Doors close on a person in the doorway', 'Doors open when the train is moving or not aligned with a platform', 'Passengers or personnel are unable to exit the train during an emergency']
    .map((t) => named(itemsOfKind(b.p, 'hazard'), t)!)
  const hz: [typeof h1, Expr][] = [
    [h1, some(d1, doorE, and(is(way, 'person in doorway', d1), isNot(doorPos, 'fully open', d1)))],
    [h2, some(d1, doorE, and(is(sit, 'unsafe for opening'), isNot(doorPos, 'fully closed', d1)))],
    [h3, none('do1', doorE, and(is(em, 'evacuation required'), is(doorPos, 'fully open', 'do1')))],
  ]
  for (const [h, when] of hz) if (isEmpty(h.when)) set(b, h.id, { when, ...(h.variables.length ? {} : { variables: world(b, [...new Set(varsOf(when))]) }) })
  return b.p
}

/* ------------------------------------------------------------------ VTT autonomous machine */

function vtt(p0: Project): Project {
  const b: Box = { p: p0 }
  const E = (title: string, init: Record<string, unknown> = {}) => ensure(b, 'entity', title, init)
  const am = E('Autonomous machine'), person = E('Person', { many: true }), thing = E('Vehicle or object', { many: true }), env = E('Environment')
  const V = (title: string, owner: Id, states: string[], definition: string) => ensure(b, 'variable', title, { layer: 'domain', parent: owner, states, definition }, owner)
  const motion = V('AM motion', am, ['stationary', 'moving'], 'Whether the AM is driving.')
  const loc = V('AM location', am, ['inside operating area', 'outside operating area'], 'Whether the AM is within the area where it is intended to operate.')
  const prog = V('Route progress', am, ['at a route point', 'on the path to a route point'], 'Whether the AM is standing at a route point or already driving along the path between two.')
  const cnd = V('Environmental condition', env, ['normal', 'extraordinary'], 'Extraordinary environmental conditions are those where the AM must change its driving parameters (the source lists no values).')
  const rel = (title: string, from: Id) => { const id = ensure(b, 'relationship', title, { ends: relEnds(from, am, '*', '1') }, from); return predicateOf(b.p, id)!.id }
  const near = rel('near', person), inWay = rel('in the way of', thing)

  // Hierarchical: "operational context" the drive command has to be adjusted to (people near, objects in the way, extraordinary environment).
  const ctx = V('Operational context', am, ['normal', 'adjusted driving required'], 'The situation the drive command must be adjusted to: people nearby, vehicles or objects in the way or extraordinary environmental conditions.')
  if (!rulesOf((b.p.items[ctx] as Variable)).length)
    set(b, ctx, { rules: [{ state: 'adjusted driving required', when: or(some('pe1', person, is(near, 'true', 'pe1')), some('ve1', thing, is(inWay, 'true', 've1')), is(cnd, 'extraordinary')) }], otherwise: 'normal' })

  // Elements know their entities; the movement control action changes the AM's world state.
  const node = (t: string) => named(itemsOfKind(b.p, 'node'), t)
  for (const [t, es] of [['AM movement in the operating area', [am]], ['Other traffic and items (people, manual vehicles, traffic lights)', [person, thing]], ['Environmental conditions', [env]]] as [string, Id[]][]) {
    const n = node(t)
    if (n && !n.entities.length) set(b, n.id, { entities: es })
  }
  const move = named(itemsOfKind(b.p, 'ca'), 'Movement')
  if (move && !move.affects.length) set(b, move.id, { affects: [motion, loc, prog] })

  // Signals reaching the traffic and mission control system (and its beliefs about them).
  signalFor(b, 'Status / diagnostic data', [motion])
  signalFor(b, 'Machine location', [loc, prog])
  signalFor(b, 'Locations of tagged entities within range', [near, inWay])
  signalFor(b, 'Environmental conditions', [cnd])

  const hz = (re: RegExp) => itemsOfKind(b.p, 'hazard').find((h) => re.test(h.title))!
  const hzs: [ReturnType<typeof hz>, Expr][] = [
    [hz(/people nearby/), some('pe1', person, and(is(motion, 'moving'), is(near, 'true', 'pe1')))],
    [hz(/vehicles or other objects/), some('ve1', thing, and(is(motion, 'moving'), is(inWay, 'true', 've1')))],
    [hz(/leaves the area/), is(loc, 'outside operating area')],
  ]
  for (const [h, when] of hzs) if (isEmpty(h.when)) set(b, h.id, { when, ...(h.variables.length ? {} : { variables: world(b, [...new Set(varsOf(when))]) }) })

  const uca = (ca: string, guide: string, re = /./) => itemsOfKind(b.p, 'uca').find((u) => (b.p.items[u.ca] as { title: string }).title === ca && u.guide === guide && re.test(u.override))!
  const ucs: [ReturnType<typeof uca>, Expr[]][] = [
    [uca('Drive command to route point', 'provided', /incorrect route point/), [inWords('the route point in the drive command is not the intended one')]],
    [uca('Drive command to route point', 'provided', /not adjusted/), [is(ctx, 'adjusted driving required'), inWords('the drive command is not adjusted to this operational context')]],
    [uca('Drive command to route point', 'not-provided'), [is(prog, 'on the path to a route point')]],
    [uca('Environmental data', 'provided'), [is(motion, 'moving'), inWords('the environmental data does not match the actual environmental condition')]],
    [uca('Environmental data', 'not-provided'), [is(cnd, 'extraordinary')]],
    [uca('Environmental data', 'too-early-late'), [is(motion, 'moving'), is(cnd, 'extraordinary')]],
  ]
  for (const [u, cs] of ucs) if (isEmpty(u.when)) set(b, u.id, { when: all_(cs) })
  return b.p
}

/** What is wrong with a condition (empty, unfinished, ill-typed), or null (used by the tests). */
export const problem = (p: Project, e: Expr | null): string | null => (e ? check({ p }, e).find((d) => d.level === 'error' || d.msg === 'incomplete')?.msg ?? null : 'empty')
