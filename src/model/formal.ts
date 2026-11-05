import { leaves } from './variables'
import { produce } from 'immer'
import { createItem } from './ops'
import { variableName } from './labels'
import { condVars } from './expr'
import { mentions } from './refs'
import { itemsOfKind } from './tree'
import { aboutOf, structOf, rulesOf } from './types'
import { isWorld } from './types'
import type { Feedback, Id, Project, Rule, Variable, VariableLayer, WorldVariable } from './types'

/** Relations of the formalization (world variable v, signal o, belief v̂, internal q) between the variables of a project. */

export const variablesIn = (p: Project, layer: VariableLayer, owner?: Id | null) =>
  itemsOfKind(p, 'variable').filter((v) => v.layer === layer && (owner === undefined || v.parent === owner)).sort((a, b) => a.rank - b.rank)

/** The entities `e` specialises, nearest first: the chain of parents while each link is a specialisation (is-a). */
export function generalisations(p: Project, e: Id): Id[] {
  const out: Id[] = []
  let c = p.items[e]
  while (c?.kind === 'entity' && c.relation === 'specialisation' && c.parent && !out.includes(c.parent) && c.parent !== e) { out.push(c.parent); c = p.items[c.parent] }
  return out
}
/** Whether an instance of `e` is also an instance of `g` (same entity, or `g` is a generalisation of `e`). */
export const isA = (p: Project, e: Id, g: Id) => e === g || generalisations(p, e).includes(g)
/** Whether two entities can stand for the same instance (one is a specialisation of the other). */
export const sameInstance = (p: Project, a: Id | null, b: Id | null) => a === b || (!!a && !!b && (isA(p, a, b) || isA(p, b, a)))
/** The world variables of an entity: own, then inherited ones (nearest generalisation first) with the entity that declares them. */
export const attributesOf = (p: Project, e: Id): { v: Variable; from: Id; inherited: boolean }[] =>
  [e, ...generalisations(p, e)].flatMap((g) => variablesIn(p, 'domain', g).map((v) => ({ v, from: g, inherited: g !== e })))

/** Process model of a controller. */
export const beliefsOf = (p: Project, node: Id) => variablesIn(p, 'belief', node)
/** Observations carried by a feedback. */
export const signalsOf = (p: Project, fb: Id) => variablesIn(p, 'signal', fb)

/** Feedback arriving at a node. */
export const feedbackInto = (p: Project, node: Id): Feedback[] => itemsOfKind(p, 'feedback').filter((f) => f.to === node)
/** Signals a node receives. */
export const signalsInto = (p: Project, node: Id) => feedbackInto(p, node).flatMap((f) => signalsOf(p, f.id))

/** The world variable a signal or belief is about (itself for world variables). */
export const worldOf = (p: Project, v: Variable): Variable | null => {
  if (v.layer === 'domain') return v
  const a = aboutOf(v) ? p.items[aboutOf(v)!] : null
  return a?.kind === 'variable' ? a : null
}

/** The predicate of a relationship: the untitled boolean world variable that says whether R(from, to) holds. */
export const predicateOf = (p: Project, rel: Id) => variablesIn(p, 'domain', rel).find((v) => v.type === 'boolean' && !v.title.trim()) ?? null
export const isPredicate = (p: Project, v: Variable) => p.items[v.parent ?? '']?.kind === 'relationship' && predicateOf(p, v.parent!)?.id === v.id

/** Variables a refined world variable is defined from (refinement ρ: its rules, and @-mentions in its definition). */
export const refines = (p: Project, v: Variable): Id[] =>
  [...new Set([...rulesOf(v).flatMap((r) => leaves(r.when).flatMap(condVars)), ...mentions(v.definition)])].filter((id) => id !== v.id && p.items[id]?.kind === 'variable')

/** All lower-level variables v is refined into, transitively (includes v itself only on a cycle). */
export function partsOf(p: Project, v: Id): Id[] {
  const out = new Set<Id>()
  const go = (id: Id) => { const x = p.items[id]; if (x?.kind === 'variable') for (const w of refines(p, x)) if (!out.has(w)) { out.add(w); go(w) } }
  go(v)
  return [...out]
}
/** Higher-level variables refined (transitively) into v. */
export const wholesOf = (p: Project, v: Id): Id[] => itemsOfKind(p, 'variable').filter((w) => w.id !== v && partsOf(p, w.id).includes(v)).map((w) => w.id)
/** Variables refined directly into v. */
export const refinedBy = (p: Project, v: Id) => itemsOfKind(p, 'variable').filter((w) => refines(p, w).includes(v))

/** Beliefs of a controller about a world variable. */
export const beliefsAbout = (p: Project, node: Id, world: Id) => beliefsOf(p, node).filter((b) => aboutOf(b) === world)

/** Signals that update a belief: those about the same world variable, or one of its parts, on feedback into its controller. */
export function updatedBy(p: Project, belief: Variable) {
  if (!belief.parent || !aboutOf(belief)) return []
  const about = [aboutOf(belief), ...partsOf(p, aboutOf(belief)!)]
  return signalsInto(p, belief.parent).filter((s) => aboutOf(s) && about.includes(aboutOf(s)))
}

/** Beliefs a signal updates (in the receiving controller). */
export const updates = (p: Project, signal: Variable) => {
  const fb = signal.parent ? p.items[signal.parent] : null
  if (fb?.kind !== 'feedback' || !aboutOf(signal)) return []
  const about = [aboutOf(signal), ...wholesOf(p, aboutOf(signal)!)]
  return beliefsOf(p, fb.to).filter((b) => aboutOf(b) && about.includes(aboutOf(b)))
}

/** Non-world variables a control action to `node` can change: its internal state and beliefs. */
export const affectable = (p: Project, node: Id) => (p.items[node]?.kind === 'node' ? [...variablesIn(p, 'internal', node), ...beliefsOf(p, node)] : [])

/** Control actions that affect (control) a world variable. */
export const controlledBy = (p: Project, world: Id) => itemsOfKind(p, 'ca').filter((c) => c.affects.includes(world))


/** A variable of another layer about `world`, with the same type and value set. */
const copyOf = (p: Project, world: Variable) => ({ title: variableName(p, world), type: world.type, states: [...world.states], unit: world.unit, min: world.min, max: world.max, rangeType: world.rangeType, enumType: world.enumType, ordered: world.ordered, unique: world.unique, monotonic: world.monotonic, sequential: world.sequential, symbolicType: world.symbolicType, about: world.id })

/** Add a belief about a world variable to a controller (no-op if it has one). */
export function addBelief(p: Project, node: Id, world: Id): { project: Project; id: Id } {
  const have = beliefsAbout(p, node, world)[0]
  const w = p.items[world]
  if (have || w?.kind !== 'variable') return { project: p, id: have?.id ?? '' }
  return createItem(p, 'variable', { ...copyOf(p, w), layer: 'belief', parent: node })
}

/** Let a feedback report a world variable: a signal on it, plus the receiving controller's belief when missing. */
export function addSignal(p: Project, fb: Id, world: Id): { project: Project; id: Id } {
  const f = p.items[fb]
  const w = p.items[world]
  if (f?.kind !== 'feedback' || w?.kind !== 'variable') return { project: p, id: '' }
  const have = signalsOf(p, fb).find((s) => aboutOf(s) === world)
  if (have) return { project: p, id: have.id }
  const r = createItem(p, 'variable', { ...copyOf(p, w), layer: 'signal', parent: fb })
  const to = r.project.items[f.to]
  return { project: to?.kind === 'node' && to.role === 'controller' ? addBelief(r.project, f.to, world).project : r.project, id: r.id }
}

/** Change a variable's layer; it keeps its id and links, and gets an owner of the right kind. */
export const setLayer = (p: Project, id: Id, layer: VariableLayer, parent: Id | null): Project =>
  produce(p, (d) => {
    const v = d.items[id]
    if (v?.kind !== 'variable') return
    const { about: _a, rules: _r, otherwise: _o, struct: _s, ...rest } = v as Variable & { about?: Id | null; rules?: Rule[]; otherwise?: string; struct?: WorldVariable['struct'] }
    const base = { ...rest, parent }
    d.items[id] = layer === 'domain' ? { ...base, layer, rules: [], otherwise: '' } : layer === 'internal' ? { ...base, layer } : { ...base, layer, about: aboutOf(v as Variable) }
  })

/** The groups a struct-generated variable sits under: the instance name, then the nested struct fields (`motion.position.x` → motion, position). */
export const structPath = (v: Variable): string[] => (isWorld(v) && v.struct ? [v.struct.name, ...v.struct.path.split('.').slice(0, -1)] : [])
/** Keeps order, but gathers (in field order) the variables of one struct instance (after the plain ones) so that they can be shown grouped. */
export function clusterStructs<T extends Variable>(vars: T[]): T[] {
  const ids = [...new Set(vars.filter((v) => structOf(v)).map((v) => structOf(v)!.id))]
  return [...vars.filter((v) => !structOf(v)), ...ids.flatMap((id) => vars.filter((v) => structOf(v)?.id === id).sort((a, b) => a.rank - b.rank))]
}
