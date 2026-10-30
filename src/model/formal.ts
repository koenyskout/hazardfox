import { produce } from 'immer'
import { createItem } from './ops'
import { variableName } from './labels'
import { mentions } from './refs'
import { itemsOfKind } from './tree'
import type { Feedback, Id, Project, Variable, VariableLayer } from './types'

/** Relations of the formalization (world variable v, signal o, belief v̂, internal q) between the variables of a project. */

export const variablesIn = (p: Project, layer: VariableLayer, owner?: Id | null) =>
  itemsOfKind(p, 'variable').filter((v) => v.layer === layer && (owner === undefined || v.parent === owner)).sort((a, b) => a.rank - b.rank)

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
  const a = v.about ? p.items[v.about] : null
  return a?.kind === 'variable' ? a : null
}

/** The predicate of a relationship: the untitled boolean world variable that says whether R(from, to) holds. */
export const predicateOf = (p: Project, rel: Id) => variablesIn(p, 'domain', rel).find((v) => v.type === 'boolean' && !v.title.trim()) ?? null
export const isPredicate = (p: Project, v: Variable) => p.items[v.parent ?? '']?.kind === 'relationship' && predicateOf(p, v.parent!)?.id === v.id

/** Beliefs of a controller about a world variable. */
export const beliefsAbout = (p: Project, node: Id, world: Id) => beliefsOf(p, node).filter((b) => b.about === world)

/** Signals that update a belief: those about the same world variable on feedback into its controller. */
export const updatedBy = (p: Project, belief: Variable) =>
  belief.parent && belief.about ? signalsInto(p, belief.parent).filter((s) => s.about === belief.about) : []

/** Beliefs a signal updates (in the receiving controller). */
export const updates = (p: Project, signal: Variable) => {
  const fb = signal.parent ? p.items[signal.parent] : null
  return fb?.kind === 'feedback' && signal.about ? beliefsAbout(p, fb.to, signal.about) : []
}

/** Control actions that affect (control) a world variable. */
export const controlledBy = (p: Project, world: Id) => itemsOfKind(p, 'ca').filter((c) => c.affects.includes(world))

/** World variables a derived world variable is defined from (refinement ρ, via @-mentions in its definition). */
export const refines = (p: Project, v: Variable) => mentions(v.definition).filter((id) => p.items[id]?.kind === 'variable')

/** A variable of another layer about `world`, with the same type and value set. */
const copyOf = (p: Project, world: Variable) => ({ title: variableName(p, world), type: world.type, states: [...world.states], unit: world.unit, min: world.min, max: world.max, about: world.id })

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
  const have = signalsOf(p, fb).find((s) => s.about === world)
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
    v.layer = layer
    v.parent = parent
    if (layer === 'domain' || layer === 'internal') v.about = null
  })
