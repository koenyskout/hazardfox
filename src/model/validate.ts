import { computeLabels } from './labels'
import { effectiveLosses } from './derived'
import { mentions, refsOf, scenarioTarget } from './refs'
import { beliefsAbout, beliefsOf, isPredicate, refines, updatedBy, updates } from './formal'
import { diagnose, witness } from './traces'
import { children, isLeaf, itemsOfKind, VARIABLE_OWNER } from './tree'
import { CAUSE_LABELS, LAYER_SHORT, type Id, type Item, type Project } from './types'
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
  'controller-no-pm': { title: 'Controller without process model', why: 'A controller decides on what it believes about the process (its process model). UCA contexts and scenarios about flawed beliefs need these beliefs.', fix: 'Add beliefs to the controller: in the Variable map, use "+ belief" next to the world variables it must know about.' },
  'variable-owner': { title: 'Variable has an owner of the wrong kind', why: 'World variables belong to a domain entity, signals to the feedback that carries them, beliefs and internal state to a controller. Otherwise it is unclear whose state the variable is.', fix: 'Open the variable and choose an owner of the right kind, or change its layer.' },
  'context-not-world': { title: 'UCA context uses a belief or signal', why: 'The context of a UCA states what is actually true in the world (or the controller\'s own mode). What the controller believes or observes is a cause and belongs in a loss scenario (STPA Handbook, step 3).', fix: 'Use the world variable this belief / signal is about, and explain the wrong belief in a scenario.' },
  'context-unrepresented': { title: 'Controller cannot know the UCA context', why: 'The controller can only distinguish contexts it has beliefs about: every world variable in a UCA context needs a corresponding process-model variable (representability).', fix: 'Add a belief about this variable to the controller and a feedback that reports it.' },
  'belief-no-about': { title: 'Belief without designation', why: 'A belief only has meaning if it is clear which world state it stands for; otherwise "the belief is wrong" cannot be judged.', fix: 'Choose the world variable it is about, or describe the world predicate in its definition.' },
  'belief-no-source': { title: 'Belief not updated by any feedback', why: 'A belief that no feedback updates can only be inferred (from own commands or a model) and may become outdated – a typical causal factor.', fix: 'Add a signal about this world variable to a feedback into the controller, or describe in the definition how the belief is inferred.' },
  'signal-unused': { title: 'Signal not used by the controller', why: 'The feedback reports something the receiving controller has no belief about, so it cannot influence its decisions.', fix: 'Add a belief about it to the receiving controller, or remove the signal.' },
  'trace-no-witness': { title: 'Trace does not exhibit the UCA', why: 'A scenario trace should show the unsafe control action: the UCA context holds at the step where the action is sent (or not sent).', fix: 'Adjust the values at the action step, or add / fix the control action event.' },
  'trace-cause-mismatch': { title: 'Trace points at a different causal factor', why: 'Comparing world, signal and belief at the action step suggests another cause than the one chosen: signal ≠ world → feedback; signal = world but belief ≠ signal → process model; belief = world → control algorithm.', fix: 'Change the causal factor, or adjust the trace.' },
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
    if (!it.title.trim() && it.kind !== 'uca' && it.kind !== 'scenario' && !(it.kind === 'variable' && isPredicate(p, it))) add('warning', it, 'no-title', `${L[it.id]}: has no title`)
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
  // Formal checks apply only once the project uses variables at all (text-only analyses are not nagged).
  const formal = itemsOfKind(p, 'variable').length > 0
  for (const n of itemsOfKind(p, 'node')) {
    if (formal && n.role === 'controller' && beliefsOf(p, n.id).length === 0 && children(p, n.id, 'node').length === 0)
      add('info', n, 'controller-no-pm', `${nm(n)}: controller has no beliefs (process model)`)
  }
  for (const v of itemsOfKind(p, 'variable')) {
    const owner = v.parent ? p.items[v.parent] : null
    if (owner && !VARIABLE_OWNER[v.layer].includes(owner.kind)) add('error', v, 'variable-owner', `${nm(v)}: a ${LAYER_SHORT[v.layer].toLowerCase()} variable cannot belong to a ${owner.kind}`)
    if (v.layer === 'belief' && !v.about && !v.definition.trim()) add('info', v, 'belief-no-about', `${nm(v)}: not linked to the world variable it stands for`)
    if (v.layer === 'belief' && v.about && !updatedBy(p, v).length && !v.definition.trim()) add('info', v, 'belief-no-source', `${nm(v)}: no feedback updates this belief`, [v.about])
    if (v.layer === 'signal' && v.about && owner?.kind === 'feedback') {
      const to = p.items[owner.to]
      if (to?.kind === 'node' && to.role === 'controller' && !updates(p, v).length) add('info', v, 'signal-unused', `${nm(v)}: the receiving controller has no belief about it`, [v.about])
    }
  }

  for (const u of ucas) {
    const ca = p.items[u.ca]
    for (const c of u.conditions) {
      const v = p.items[c.variable]
      if (v?.kind !== 'variable') continue
      if (v.layer === 'belief' || v.layer === 'signal') add('warning', u, 'context-not-world', `${L[u.id]}: context uses ${v.layer} ${v.title}`, [v.id])
      else if (v.layer === 'domain' && ca?.kind === 'ca' && p.items[ca.from]?.kind === 'node' && !beliefsAbout(p, ca.from, v.id).length && !refines(p, v).some((w) => beliefsAbout(p, ca.from, w).length))
        add('warning', u, 'context-unrepresented', `${L[u.id]}: ${p.items[ca.from].title} has no belief about ${v.title}`, [v.id])
    }
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
    if (s.trace.steps.length) {
      const w = witness(p, s)
      if (w && w.ok === false) add('warning', s, 'trace-no-witness', `${L[s.id]}: ${w.why}`)
      const d = w?.ok ? diagnose(p, s) : null
      if (d && s.cause && d.cause !== s.cause && s.cause !== 'controller-failure' && s.cause !== 'other-controller') add('info', s, 'trace-cause-mismatch', `${L[s.id]}: trace suggests "${CAUSE_LABELS[d.cause]}" (${d.why})`)
    }
    if (p.meta.strideEnabled && s.adversarial && s.stride.length === 0)
      add('warning', s, 'scenario-no-stride', `${L[s.id]}: adversarial scenario without STRIDE category`)
  }
  return out
}
