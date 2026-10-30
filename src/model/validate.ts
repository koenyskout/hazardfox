import { computeLabels } from './labels'
import { effectiveLosses } from './derived'
import { mentions, refsOf, scenarioTarget } from './refs'
import { children, isLeaf, itemsOfKind } from './tree'
import { type Id, type Item, type Project } from './types'

export const SEVERITIES = ['error', 'warning', 'info'] as const
export type Severity = (typeof SEVERITIES)[number]

export interface Issue {
  severity: Severity
  item: Id | null
  message: string
}

/** Check completeness and consistency of the analysis. */
export function validate(p: Project): Issue[] {
  const L = computeLabels(p)
  const out: Issue[] = []
  const add = (severity: Severity, item: Item | null, message: string) =>
    out.push({ severity, item: item?.id ?? null, message })
  const nm = (i: Item) => `${L[i.id]} ${i.title}`.trim()

  // dangling references / mentions
  for (const it of Object.values(p.items)) {
    for (const r of refsOf(it)) if (!p.items[r]) add('error', it, `${nm(it)}: refers to a deleted item`)
    for (const f of [it.description, it.notes])
      for (const id of mentions(f)) if (!p.items[id]) add('error', it, `${nm(it)}: dangling @-reference`)
    if (!it.title.trim() && it.kind !== 'uca' && it.kind !== 'scenario') add('warning', it, `${L[it.id]}: has no title`)
  }

  const hazards = itemsOfKind(p, 'hazard')
  const losses = itemsOfKind(p, 'loss')
  const constraints = itemsOfKind(p, 'constraint')
  const ucas = itemsOfKind(p, 'uca')

  for (const h of hazards) {
    if (isLeaf(p, h.id)) {
      if (effectiveLosses(p, h.id).length === 0) add('warning', h, `${nm(h)}: not linked to any loss`)
      if (!constraints.some((c) => c.hazards.includes(h.id))) add('warning', h, `${nm(h)}: no system constraint`)
    }
  }
  for (const l of losses)
    if (isLeaf(p, l.id) && !hazards.some((h) => effectiveLosses(p, h.id).includes(l.id)))
      add('info', l, `${nm(l)}: no hazard leads to this loss`)

  const nonLeafTargets = (it: Item, ids: Id[]) => {
    for (const id of ids)
      if (p.items[id] && !isLeaf(p, id)) add('warning', it, `${nm(it)}: linked to ${L[id]}, which has sub-hazards – reassign to a leaf`)
  }
  for (const c of constraints) {
    if (c.hazards.length === 0) add('warning', c, `${nm(c)}: not linked to a hazard`)
    nonLeafTargets(c, c.hazards)
  }

  // control structure
  for (const ca of itemsOfKind(p, 'ca')) {
    if (!itemsOfKind(p, 'scenario').some((s) => s.scenarioType === 'ca' && s.ca === ca.id))
      add('info', ca, `${L[ca.id]} ${ca.title}: no scenarios for improper execution of the control action`)
  }
  for (const n of itemsOfKind(p, 'node')) {
    if (n.role === 'controller' && n.processModel.length === 0 && children(p, n.id, 'node').length === 0)
      add('info', n, `${nm(n)}: controller has no process model variables`)
  }

  for (const u of ucas) {
    if (u.hazards.length === 0) add('warning', u, `${L[u.id]}: no hazard linked`)
    nonLeafTargets(u, u.hazards)
    if (!u.constraint.trim()) add('info', u, `${L[u.id]}: no controller constraint`)
    if (!itemsOfKind(p, 'scenario').some((s) => s.scenarioType === 'uca' && s.uca === u.id)) add('warning', u, `${L[u.id]}: no loss scenarios`)
  }
  for (const r of itemsOfKind(p, 'requirement'))
    if (r.sources.length === 0) add('info', r, `${nm(r)}: not derived from any constraint or scenario`)
  for (const s of itemsOfKind(p, 'scenario')) {
    if (!scenarioTarget(s)) add('warning', s, `${L[s.id]}: not linked to a ${s.scenarioType === 'uca' ? 'UCA' : 'control action'}`)
    if (s.scenarioType === 'ca') {
      if (s.hazards.length === 0) add('warning', s, `${L[s.id]}: no hazard linked`)
      nonLeafTargets(s, s.hazards)
    }
    if (p.meta.strideEnabled && s.adversarial && s.stride.length === 0)
      add('warning', s, `${L[s.id]}: adversarial scenario without STRIDE category`)
  }
  return out
}
