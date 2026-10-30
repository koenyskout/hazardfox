import { computeLabels } from './labels'
import { effectiveLosses } from './derived'
import { mentions, refsOf, scenarioTarget } from './refs'
import { children, isLeaf, itemsOfKind } from './tree'
import { type Id, type Item, type Project } from './types'
import { guideApplies } from './uca'

export const SEVERITIES = ['error', 'warning', 'info'] as const
export type Severity = (typeof SEVERITIES)[number]

export interface Issue {
  severity: Severity
  item: Id | null
  message: string
  /** Key into RULES: what is wrong and how to improve it */
  rule?: RuleId
  /** Other items the finding is about (e.g. the non-leaf hazard a UCA links to) */
  related?: Id[]
  /** 'ai': from the AI review (probabilistic hint) */
  source?: 'ai'
}

export interface Rule { title: string; why: string; fix: string }

/** Explanation of every finding type: what the problem is, why it matters (STPA Handbook) and how to improve. */
export const RULES = {
  'dangling-ref': { title: 'Link to a deleted item', why: 'A link field points at an item that no longer exists, so traceability is broken.', fix: 'Open the item and choose a new target, or clear the link.' },
  'dangling-mention': { title: 'Reference to a deleted item in the text', why: 'The text contains an @-reference to an item that no longer exists, so it cannot be shown as a label.', fix: 'Edit the description or notes and remove or replace the reference.' },
  'no-title': { title: 'Item has no title', why: 'Items without a title cannot be recognised in lists, the diagram or the exported report.', fix: 'Give the item a short, concrete title.' },
  'hazard-no-loss': { title: 'Hazard not linked to a loss', why: 'A hazard is a system state that can lead to a loss. Without the link it is unclear why the hazard matters, and the trace to stakeholders is lost.', fix: 'Link the hazard (or one of its parents) to every loss it can lead to. If none applies, it may not be a hazard.' },
  'hazard-no-constraint': { title: 'Hazard without system-level constraint', why: 'Every hazard needs a system-level constraint stating what must hold to prevent it; this is what later steps and requirements refine.', fix: 'Add a constraint that inverts the hazard ("<System> must …") and link it to the hazard.' },
  'loss-no-hazard': { title: 'No hazard leads to this loss', why: 'Each loss should be reachable from at least one hazard, otherwise the analysis does not address it.', fix: 'Link the hazards that can lead to this loss, or add them. If nothing can lead to the loss, reconsider whether it belongs in the analysis.' },
  'non-leaf-target': { title: 'Linked to a hazard that has sub-hazards', why: 'Constraints, UCAs and scenarios must link to the most specific (leaf) hazards so that coverage can be judged per hazard.', fix: 'Replace the link by the relevant sub-hazard(s).' },
  'constraint-no-hazard': { title: 'Constraint not linked to a hazard', why: 'A system-level constraint exists to prevent hazards; without a link it cannot be traced or checked.', fix: 'Link the constraint to the hazard(s) it prevents.' },
  'ca-instantaneous-stsoon': { title: 'Instantaneous control action with "stopped too soon / applied too long" UCA', why: 'This guide word only applies to continuous control actions; an instantaneous one cannot be stopped or applied for too long.', fix: 'Delete the UCA, or change the duration of the control action to continuous if that is wrong.' },
  'ca-na-conflict': { title: 'Guide word marked not applicable but has UCAs', why: 'The control action says a guide word cannot apply, yet UCAs exist for it. One of the two is wrong.', fix: 'Remove the "not applicable" mark, or delete the UCAs.' },
  'ca-no-scenarios': { title: 'No scenarios for improper execution of the control action', why: 'Besides why a UCA happens, STPA asks why a control action is not executed properly (actuator, delay, controlled process).', fix: 'Add scenarios of type "control action not executed properly" for this control action.' },
  'controller-no-pm': { title: 'Controller without process model variables', why: 'UCA contexts and scenarios about flawed process models need the variables the controller bases its decisions on.', fix: 'Add the process model variables of this controller (in the control structure view).' },
  'uca-no-hazard': { title: 'UCA not linked to a hazard', why: 'An unsafe control action is only unsafe because it can lead to a hazard. The link is the definition of "unsafe".', fix: 'Link the UCA to the hazard(s) it can cause. If there is none, the context is probably not unsafe.' },
  'uca-no-constraint': { title: 'UCA without controller constraint', why: 'Each UCA yields a controller constraint, the inverse of the UCA, from which requirements are derived.', fix: 'State what the controller must (not) do in that context.' },
  'uca-no-scenario': { title: 'UCA without loss scenarios', why: 'Loss scenarios explain how each UCA could occur; they are where mitigations come from.', fix: 'Add scenarios explaining why the controller could provide or withhold the action in this context.' },
  'req-no-source': { title: 'Requirement not derived from anything', why: 'Requirements should trace to a constraint or scenario so that each one has a justification.', fix: 'Link the constraint(s) or scenario(s) this requirement addresses.' },
  'scenario-no-target': { title: 'Scenario not linked to its UCA / control action', why: 'A scenario explains one UCA or one control action; without that link its context is lost.', fix: 'Choose the UCA or control action this scenario belongs to.' },
  'scenario-no-hazard': { title: 'Scenario not linked to a hazard', why: 'Scenarios about improper execution have no UCA to inherit hazards from, so they need their own hazard links.', fix: 'Link the hazard(s) that can result from this scenario.' },
  'scenario-no-stride': { title: 'Adversarial scenario without STRIDE category', why: 'STPA-Sec classifies adversarial scenarios by STRIDE category (STRIDE is switched on for this project).', fix: 'Select at least one STRIDE category or mark the scenario non-adversarial.' },
} satisfies Record<string, Rule>
export type RuleId = keyof typeof RULES

/** Check completeness and consistency of the analysis. */
export function validate(p: Project): Issue[] {
  const L = computeLabels(p)
  const out: Issue[] = []
  const add = (severity: Severity, item: Item | null, rule: RuleId, message: string, related?: Id[]) =>
    out.push({ severity, item: item?.id ?? null, message, rule, related })
  const nm = (i: Item) => `${L[i.id]} ${i.title}`.trim()

  // dangling references / mentions
  for (const it of Object.values(p.items)) {
    for (const r of refsOf(it)) if (!p.items[r]) add('error', it, 'dangling-ref', `${nm(it)}: refers to a deleted item`)
    for (const f of [it.description, it.notes])
      for (const id of mentions(f)) if (!p.items[id]) add('error', it, 'dangling-mention', `${nm(it)}: dangling @-reference`)
    if (!it.title.trim() && it.kind !== 'uca' && it.kind !== 'scenario') add('warning', it, 'no-title', `${L[it.id]}: has no title`)
  }

  const hazards = itemsOfKind(p, 'hazard')
  const losses = itemsOfKind(p, 'loss')
  const constraints = itemsOfKind(p, 'constraint')
  const ucas = itemsOfKind(p, 'uca')

  for (const h of hazards) {
    if (isLeaf(p, h.id)) {
      if (effectiveLosses(p, h.id).length === 0) add('warning', h, 'hazard-no-loss', `${nm(h)}: not linked to any loss`)
      if (!constraints.some((c) => c.hazards.includes(h.id))) add('warning', h, 'hazard-no-constraint', `${nm(h)}: no system constraint`)
    }
  }
  for (const l of losses)
    if (isLeaf(p, l.id) && !hazards.some((h) => effectiveLosses(p, h.id).includes(l.id)))
      add('info', l, 'loss-no-hazard', `${nm(l)}: no hazard leads to this loss`)

  const nonLeafTargets = (it: Item, ids: Id[]) => {
    for (const id of ids)
      if (p.items[id] && !isLeaf(p, id)) add('warning', it, 'non-leaf-target', `${nm(it)}: linked to ${L[id]}, which has sub-hazards – reassign to a leaf`, [id])
  }
  for (const c of constraints) {
    if (c.hazards.length === 0) add('warning', c, 'constraint-no-hazard', `${nm(c)}: not linked to a hazard`)
    nonLeafTargets(c, c.hazards)
  }

  // control structure
  for (const ca of itemsOfKind(p, 'ca')) {
    if (!guideApplies(ca, 'stopped-too-soon') && ucas.some((u) => u.ca === ca.id && u.guide === 'stopped-too-soon')) add('warning', ca, 'ca-instantaneous-stsoon', `${L[ca.id]} ${ca.title}: instantaneous control action has "stopped too soon / applied too long" UCAs`)
    for (const n of ca.notApplicable)
      if (ucas.some((u) => u.ca === ca.id && u.guide === n.guide)) add('warning', ca, 'ca-na-conflict', `${L[ca.id]} ${ca.title}: guide word "${n.guide}" is marked not applicable but has UCAs`)
    if (!itemsOfKind(p, 'scenario').some((s) => s.scenarioType === 'ca' && s.ca === ca.id))
      add('info', ca, 'ca-no-scenarios', `${L[ca.id]} ${ca.title}: no scenarios for improper execution of the control action`)
  }
  for (const n of itemsOfKind(p, 'node')) {
    if (n.role === 'controller' && n.processModel.length === 0 && children(p, n.id, 'node').length === 0)
      add('info', n, 'controller-no-pm', `${nm(n)}: controller has no process model variables`)
  }

  for (const u of ucas) {
    if (u.hazards.length === 0) add('warning', u, 'uca-no-hazard', `${L[u.id]}: no hazard linked`)
    nonLeafTargets(u, u.hazards)
    if (!u.constraint.trim()) add('info', u, 'uca-no-constraint', `${L[u.id]}: no controller constraint`)
    if (!itemsOfKind(p, 'scenario').some((s) => s.scenarioType === 'uca' && s.uca === u.id)) add('warning', u, 'uca-no-scenario', `${L[u.id]}: no loss scenarios`)
  }
  for (const r of itemsOfKind(p, 'requirement'))
    if (r.sources.length === 0) add('info', r, 'req-no-source', `${nm(r)}: not derived from any constraint or scenario`)
  for (const s of itemsOfKind(p, 'scenario')) {
    if (!scenarioTarget(s)) add('warning', s, 'scenario-no-target', `${L[s.id]}: not linked to a ${s.scenarioType === 'uca' ? 'UCA' : 'control action'}`)
    if (s.scenarioType === 'ca') {
      if (s.hazards.length === 0) add('warning', s, 'scenario-no-hazard', `${L[s.id]}: no hazard linked`)
      nonLeafTargets(s, s.hazards)
    }
    if (p.meta.strideEnabled && s.adversarial && s.stride.length === 0)
      add('warning', s, 'scenario-no-stride', `${L[s.id]}: adversarial scenario without STRIDE category`)
  }
  return out
}
