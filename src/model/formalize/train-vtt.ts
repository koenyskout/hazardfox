import { addSignal, predicateOf } from '../formal'
import { createItem, updateItem } from '../ops'
import { itemsOfKind } from '../tree'
import { anyOf, autoName, conditionComplete, isOnVariable, isText, leaves, declare } from '../variables'
import { condVars } from '../expr'
import { rulesOf } from '../types'
import type { Condition, Id, ValueCondition, Item, ItemOf, Project, Variable } from '../types'

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
  const have = all(b).find((i) => i.kind === kind && i.title.trim() === title && (!owner || i.parent === owner || (i as { from?: Id }).from === owner))
  if (have) return have.id
  const r = createItem(b.p, kind, { title, ...init } as never)
  b.p = r.project
  return r.id
}
const set = (b: Box, id: Id, patch: Record<string, unknown>) => { b.p = updateItem(b.p, id, patch as never) }
const cond = (variable: Id, state: string, extra: Partial<ValueCondition> = {}): ValueCondition => ({ kind: 'value', variable, op: '=', state, ...extra })
const words = (text: string): Condition => ({ kind: 'text', op: '=', text })
const isEmpty = (cs: unknown[]) => cs.length === 0
const world = (b: Box, ids: Id[]) => ids.filter((v) => b.p.items[v]?.kind === 'variable')

/** Gives the first condition on a variable of `many` entity `e` the name, later ones refer to it (`same`): all describe one instance. */
function oneInstance(cs: Condition[], vars: Id[], name: string): Condition[] {
  let first = true
  return cs.map((c) => {
    if (!isOnVariable(c) || !vars.includes(c.variable) || c.names) return c
    const out: Condition = { ...c, ...(first ? { names: [{ declare: name }] } : { names: [{ use: name }] }) }
    first = false
    return out
  })
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
  const d1 = autoName(b.p, doorE, [])

  // Hierarchical variable: is it unsafe to open the doors (hazard H2 is "moving OR not aligned")?
  const sit = ensure(b, 'variable', 'Door-opening situation', {
    layer: 'domain', parent: trainE, states: ['safe for opening', 'unsafe for opening'],
    definition: 'Opening the doors is unsafe while the train is moving or not aligned with a platform. Refines train motion and train position.',
    rules: [{ state: 'unsafe for opening', when: anyOf(cond(motion, 'moving'), cond(pos, 'not aligned with platform')) }], otherwise: 'safe for opening',
  })

  // The existing UCA conditions on door variables are about the door the controller drives: one named instance.
  for (const u of itemsOfKind(b.p, 'uca')) {
    const cs = oneInstance(u.conditions.flatMap(leaves), doorVars, d1)
    if (cs.some((c, i) => c !== u.conditions.flatMap(leaves)[i])) set(b, u.id, { conditions: cs })
  }

  const [h1, h2, h3] = ['Doors close on a person in the doorway', 'Doors open when the train is moving or not aligned with a platform', 'Passengers or personnel are unable to exit the train during an emergency']
    .map((t) => named(itemsOfKind(b.p, 'hazard'), t)!)
  const hz: [typeof h1, Condition[]][] = [
    [h1, [cond(way, 'person in doorway', { names: [{ declare: d1 }] }), cond(doorPos, 'fully open', { op: '≠', names: [{ use: d1 }] })]],
    [h2, [cond(sit, 'unsafe for opening'), cond(doorPos, 'fully closed', { op: '≠', names: [{ declare: d1 }] })]],
    [h3, [cond(em, 'evacuation required'), cond(doorPos, 'fully open', { names: [declare('do1', 'none')] })]],
  ]
  for (const [h, cs] of hz) if (isEmpty(h.conditions)) set(b, h.id, { conditions: cs, ...(h.variables.length ? {} : { variables: world(b, [...new Set(cs.flatMap(condVars))]) }) })
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
  const rel = (title: string, from: Id) => { const id = ensure(b, 'relationship', title, { from, to: am, fromCard: '*', toCard: '1', description: '' }, from); return predicateOf(b.p, id)!.id }
  const near = rel('near', person), inWay = rel('in the way of', thing)

  // Hierarchical: "operational context" the drive command has to be adjusted to (people near, objects in the way, extraordinary environment).
  const ctx = V('Operational context', am, ['normal', 'adjusted driving required'], 'The situation the drive command must be adjusted to: people nearby, vehicles or objects in the way or extraordinary environmental conditions.')
  if (!rulesOf((b.p.items[ctx] as Variable)).length)
    set(b, ctx, { rules: [{ state: 'adjusted driving required', when: anyOf(cond(near, 'true', { names: [{ declare: 'pe1' }] }), cond(inWay, 'true', { names: [{ declare: 've1' }] }), cond(cnd, 'extraordinary')) }], otherwise: 'normal' })

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
  const hzs: [ReturnType<typeof hz>, Condition[]][] = [
    [hz(/people nearby/), [cond(motion, 'moving'), cond(near, 'true', { names: [{ declare: 'pe1' }] })]],
    [hz(/vehicles or other objects/), [cond(motion, 'moving'), cond(inWay, 'true', { names: [{ declare: 've1' }] })]],
    [hz(/leaves the area/), [cond(loc, 'outside operating area')]],
  ]
  for (const [h, cs] of hzs) if (isEmpty(h.conditions)) set(b, h.id, { conditions: cs, ...(h.variables.length ? {} : { variables: world(b, [...new Set(cs.flatMap(condVars))]) }) })

  const uca = (ca: string, guide: string, re = /./) => itemsOfKind(b.p, 'uca').find((u) => (b.p.items[u.ca] as { title: string }).title === ca && u.guide === guide && re.test(u.override))!
  const ucs: [ReturnType<typeof uca>, Condition[]][] = [
    [uca('Drive command to route point', 'provided', /incorrect route point/), [words('the route point in the drive command is not the intended one')]],
    [uca('Drive command to route point', 'provided', /not adjusted/), [cond(ctx, 'adjusted driving required'), words('the drive command is not adjusted to this operational context')]],
    [uca('Drive command to route point', 'not-provided'), [cond(prog, 'on the path to a route point')]],
    [uca('Environmental data', 'provided'), [cond(motion, 'moving'), words('the environmental data does not match the actual environmental condition')]],
    [uca('Environmental data', 'not-provided'), [cond(cnd, 'extraordinary')]],
    [uca('Environmental data', 'too-early-late'), [cond(motion, 'moving'), cond(cnd, 'extraordinary')]],
  ]
  for (const [u, cs] of ucs) if (isEmpty(u.conditions)) set(b, u.id, { conditions: cs })
  return b.p
}

/** Whether every condition of the list is complete (used by the tests). */
export const complete = (cs: Condition[]) => cs.length > 0 && cs.every((c) => isText(c) || conditionComplete(c))
