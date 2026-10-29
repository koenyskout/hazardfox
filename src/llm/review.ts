import { effectiveLosses, scenarioHazards } from '../model/derived'
import { updateItem } from '../model/ops'
import { renderText } from '../model/labels'
import { scenarioTarget } from '../model/refs'
import { itemsOfKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { KIND_NAMES, SCENARIO_TYPE_LABELS, type Id, type Item, type Kind, type Project } from '../model/types'
import type { DecisionQuestion } from './ollama'

export const REVIEW_KINDS: Kind[] = ['loss', 'hazard', 'constraint', 'uca', 'scenario', 'requirement']

/** A yes/no check about a mistake; "yes" means the rule is violated. */
export interface Check {
  id: string
  label: string
  ask: string
  yes: string
  no: string
  /** How to repair the text when this check fails; given to the writer model. */
  fix: string
  applies?: (it: Item) => boolean
}

const c = (id: string, label: string, ask: string, yes: string, no: string, fix: string, applies?: Check['applies']): Check => ({ id, label, ask, yes, no, fix, applies })

/** Short STPA primers (condensed from the STPA Handbook, ch. 2) – the decision model knows nothing about STPA. */
export const PRIMERS: Partial<Record<Kind, string>> = {
  loss: `STPA (System-Theoretic Process Analysis) starts by identifying losses.
A loss involves something of value to stakeholders: loss of life or injury, property damage, environmental pollution, loss of mission, loss of reputation, loss or leak of sensitive information. Examples: "Loss of life or injury to people", "Loss of or damage to vehicle", "Loss of mission", "Loss of sensitive information".
Common mistakes: a loss must not reference individual components or specific causes such as "human error" or "brake failure"; it is an outcome stakeholders care about, not a system state.`,
  hazard: `STPA (System-Theoretic Process Analysis) defines system-level hazards after losses.
A hazard is a system state or set of conditions that, together with a particular set of worst-case environmental conditions, will lead to a loss. Hazards are states to be prevented that the system designers and operators can control. Good examples: "Aircraft violate minimum separation standards in flight", "Aircraft leaves designated taxiway, runway, or apron on ground", "Nuclear power plant releases dangerous materials", "Satellite is unable to collect scientific data".
Common mistakes: confusing hazards with causes ("brake failure", "operator is distracted", "engine failure", "hydraulic leak" are causes, not hazards); referring to individual components instead of the overall system; describing environmental states outside the designer's control; using ambiguous or recursive words such as "unsafe", "unintended" or "accidental" (e.g. "Aircraft experiences unsafe flight"); describing a state the system normally must be in (e.g. "Aircraft in flight"); too much detail.`,
  constraint: `STPA (System-Theoretic Process Analysis) derives system-level constraints from hazards.
A system-level constraint specifies system conditions or behaviours that must be satisfied to prevent a hazard. It is obtained by inverting the hazard condition: <System> & <Condition to enforce> & <Link to hazards>. Example: hazard "Aircraft violate minimum separation standards" gives constraint "Aircraft must satisfy minimum separation standards from other aircraft and objects". A constraint may also say what must be done if a hazard occurs ("If the hazard occurs, then ... to minimise a loss").
Common mistakes: prescribing a specific design solution or technology; talking about one component instead of the system; not corresponding to the hazard it traces to.`,
  uca: `STPA (System-Theoretic Process Analysis) identifies unsafe control actions (UCAs) of controllers.
A UCA is a control action that, in a particular context and worst-case environment, leads to a hazard. Format: <Source controller> <type> <control action> <context> [hazards]. Types: not providing the control action; providing it; providing it too early, too late or in the wrong order; stopped too soon or applied too long. Example: "BSCU Autobrake provides Brake command during normal takeoff [H-4.3]".
Rules: every UCA must state the context, i.e. the actual state or condition that makes the action unsafe. The context must not be the controller's belief or process model ("when it incorrectly believes the aircraft is landing" is wrong – that is a cause, handled in loss scenarios), and must not be replaced by the outcome ("resulting in a collision"). A UCA covers one control action and one type. A UCA must trace to one or more hazards. A controller constraint is the inverse of the UCA ("must provide ..." / "must not provide ...").`,
  scenario: `STPA (System-Theoretic Process Analysis) identifies loss scenarios: the causal factors that lead to unsafe control and to losses.
Type 1 scenarios explain why an unsafe control action (UCA) might occur: flawed controller (failure, inadequate control algorithm, unsafe control input from another controller), inadequate process model (wrong feedback, feedback ignored or misinterpreted, delayed or missing feedback, no feedback exists), or other causal factors. Type 2 scenarios explain why a control action is not executed or is executed improperly: failure or degradation of the actuator, the control action is lost, delayed or corrupted before reaching the controlled process, the controlled process does not respond or responds wrongly (missing inputs, disturbances, conflicting commands from other controllers, wrong priority), and then the resulting hazard.
A scenario tells a story: a combination of factors leading to the UCA or the hazard. Example: "The BSCU sends Brake command, but the brakes are not applied due to insufficient hydraulic pressure (pump failure, hydraulic leak). As a result, insufficient deceleration may be provided upon landing [H-4.1]". Security scenarios describe how an adversary could cause the same thing (inject, spoof, tamper, intercept, deny).
Common mistake: listing individual causal factors ("wheel speed sensor failure", "loss of power") instead of a scenario that explains how they lead to the UCA/hazard.`,
  requirement: `STPA (System-Theoretic Process Analysis) derives requirements and mitigations from constraints, unsafe control actions and loss scenarios.
A requirement states what the design shall do to prevent a UCA or scenario. It must be verifiable, unambiguous and state one thing. A mitigation in response to a scenario must address the cause named in that scenario.`,
}

export const CHECKS: Partial<Record<Kind, Check[]>> = {
  loss: [
    c('cause', 'Names a component, failure or cause instead of a loss',
      'A loss is something of value that stakeholders lose, not a cause. Does this statement name a specific component, a failure or a cause?',
      'Names a component, failure or cause', 'Names none of these',
      'Remove the component, failure or cause and state what stakeholders lose instead, e.g. "Loss of life or injury to people" instead of "Brake failure injures people".'),
    c('no-value', 'Does not say what of value is lost',
      'A loss says what of value to the stakeholders is lost or harmed (life, health, property, mission, reputation, data). Does this statement fail to say what is lost or harmed?',
      'Does not say what is lost', 'Says what is lost',
      'Say what of value is lost or harmed, starting with "Loss of …", "Damage to …" or "Injury to …".'),
    c('state', 'Describes a system state instead of a loss',
      'A loss is an outcome for stakeholders, not a condition of the system. Does this statement describe a state or behaviour of a system rather than an outcome for stakeholders?',
      'A system state or behaviour', 'An outcome for stakeholders',
      'Rephrase as the outcome for stakeholders that results from such a system state.'),
    c('several', 'Combines several losses',
      'A loss names one kind of value. Does this statement combine several different losses?',
      'Combines several losses', 'Describes one loss',
      'Keep one loss only; the others belong in separate items.'),
  ],
  hazard: [
    c('component', 'Names a component, failure or cause',
      'A hazard describes the state of the whole system. Does this statement name a specific component of the system, or a failure, fault or other cause?',
      'Names a component, failure or cause', 'Names none of these',
      'Remove the component or cause and describe the resulting state of the overall system, e.g. "Aircraft violate minimum separation standards in flight".'),
    c('not-state', 'Is an event, action or cause rather than a system state',
      'A hazard describes a state of the system, not an event or action. Does this statement describe an event, an action or a cause instead of a state of the system?',
      'An event, action or cause', 'A state or condition of the system',
      'Rephrase as a condition of the system as a whole: "<the system> <unwanted condition>".'),
    c('consequence', 'Includes the consequence or loss',
      'A hazard describes only a condition of the system, not what follows from it. Does this statement also describe a consequence or loss (such as injury, death or damage)?',
      'Includes the consequence or loss', 'Describes only the condition',
      'Delete the consequence ("leading to …", "resulting in …"); keep only the system condition.'),
    c('vague', 'Uses vague or circular words',
      'A hazard must be concrete. Does this statement use vague or circular words such as "unsafe", "unintended", "accidental" or "inadequate"?',
      'Uses vague or circular words', 'Uses none of these',
      'Replace vague words by the concrete condition they stand for, e.g. "more drug delivered than prescribed" instead of "unsafe dose".'),
    c('external', 'Describes an outside condition the designers cannot control',
      'A hazard must be something designers and operators can control. Does this statement describe an external condition, such as weather or other people\'s behaviour, that they cannot control?',
      'An outside condition they cannot control', 'Something they can control',
      'Describe the state of the system that must be prevented even when such conditions occur.'),
    c('no-loss', 'Does not lead to the linked losses',
      'A hazard must be able to lead to the losses it is linked to. Is it implausible that this hazard leads to the linked losses?',
      'Does not plausibly lead to the linked losses', 'Plausibly leads to the linked losses',
      'Reword so that the condition can plausibly lead to the linked losses.'),
  ],
  constraint: [
    c('no-inverse', 'Does not prevent the linked hazards',
      'A constraint states what the system must do, or must not do, to prevent the linked hazards. Does this constraint fail to state that?',
      'Does not correspond to the linked hazards', 'Prevents the linked hazards',
      'Invert the hazard: "<System> must <condition that avoids the hazard>".'),
    c('not-normative', 'Is not an obligation',
      'A constraint is an obligation ("must", "must not", "shall"). Is this constraint worded without such an obligation?',
      'Not worded as an obligation', 'Worded as an obligation',
      'Phrase it with "must" or "must not".'),
    c('solution', 'Prescribes a design solution',
      'A constraint says what must hold, not how to achieve it. Does this constraint prescribe a specific design, technology or mechanism?',
      'Prescribes a design or technology', 'Prescribes none',
      'Remove the mechanism and keep the condition that must hold.'),
    c('component', 'Is about one component only',
      'A system-level constraint concerns the system as a whole. Does this constraint concern one individual component instead?',
      'About one component', 'About the system',
      'Rephrase for the system as a whole.'),
  ],
  uca: [
    c('no-context', 'Has no context',
      'An unsafe control action states the context in which the control action is unsafe. Does this statement end right after the control action, without a condition such as "when", "during" or "while"?',
      'No clear context', 'Has a clear context', 'Add the condition in which the control action is unsafe.'),
    c('belief', 'Context is a belief of the controller',
      'The context must be an actual state of the system, not what the controller thinks. Does this statement say that the controller believes, thinks or assumes something?',
      'A belief or process model', 'An actual state or condition', 'State the real condition instead of the belief.'),
    c('outcome', 'Context is an outcome',
      'The context is a condition that exists when the action is taken, not what follows from it. Does this statement contain a result, such as "resulting in" or "leading to"?',
      'An outcome or consequence', 'A condition', 'Replace the outcome by the condition under which the action is unsafe.'),
    c('cause', 'Mentions a cause',
      'An unsafe control action does not explain why it happens. Does it mention a cause such as a failure, a fault or an error?',
      'Mentions a cause', 'Mentions no cause', 'Remove the cause.'),
    c('several', 'Combines several actions or types',
      'An unsafe control action covers one control action and one type. Does this statement join two different control actions or types with "or" or "and"?',
      'Several combined', 'One action and type', 'Split it into separate unsafe control actions.'),
    c('no-hazard', 'Does not lead to the linked hazards',
      'An unsafe control action must be able to lead to the hazards it is linked to. Is it implausible that it leads to them?',
      'Does not plausibly lead to them', 'Plausibly leads to them', 'Fix the context or the links so that a hazard can result.'),
    c('no-inverse', 'Constraint is not the inverse',
      'The controller constraint is the inverse of the unsafe control action. Does the controller constraint fail to state that inverse?',
      'Not the inverse', 'The inverse', 'State what the controller must or must not do in that context.', (it) => it.kind === 'uca' && !!it.constraint),
  ],
  scenario: [
    c('restates', 'Only restates the UCA or hazard',
      'A scenario gives a reason why the unsafe control action or hazard happens. Does this text only describe what happens, without giving a reason, or end with an open question?',
      'Only restates', 'Explains why', 'Explain why it happens.'),
    c('factor', 'Is one isolated factor, not a story',
      'A scenario is a story of how factors lead to the unsafe control or hazard. Is this just a single isolated factor, such as "sensor failure"?',
      'A single factor', 'A causal story', 'Explain how the factor leads to the unsafe control or hazard.'),
    c('uca-type', 'Does not explain why the controller acts unsafely',
      'This scenario must explain why the controller provides or withholds the control action in the unsafe context (flawed process model, feedback, algorithm or inputs). Does it fail to explain that?',
      'Does not explain it', 'Explains it', 'Explain the controller\'s flawed process model, feedback, algorithm or inputs.', (it) => it.kind === 'scenario' && it.scenarioType === 'uca'),
    c('ca-type', 'Does not explain why the action is not executed properly',
      'This scenario must explain why an issued control action is not executed or is executed improperly (actuator, delay, controlled process, environment, conflicting inputs). Does it fail to explain that?',
      'Does not explain it', 'Explains it', 'Explain what happens to the control action after it is issued.', (it) => it.kind === 'scenario' && it.scenarioType === 'ca'),
    c('threat', 'Names no adversary action',
      'A security scenario says how an adversary acts (inject, spoof, tamper, intercept or deny). Does it fail to name an adversary action?',
      'Names no adversary action', 'Names an adversary action', 'Say what the adversary does.', (it) => it.kind === 'scenario' && it.adversarial),
  ],
  requirement: [
    c('unverifiable', 'Cannot be verified',
      'A requirement must be verifiable by test or inspection. Is it hard or impossible to verify objectively that this requirement is met?',
      'Not verifiable or too vague', 'Verifiable', 'Make it concrete and measurable.'),
    c('several', 'States several things',
      'A requirement states one thing. Does this requirement state more than one thing?',
      'Several things', 'One thing', 'Keep one thing; the rest belongs in other requirements.'),
    c('not-normative', 'Is not an obligation',
      'A requirement is an obligation ("shall", "must"). Is it worded without such an obligation?',
      'Not an obligation', 'An obligation', 'Phrase it with "shall".'),
    c('off-source', 'Does not address its source',
      'A requirement must address its linked source (constraint, unsafe control action or scenario cause). Does it fail to do so?',
      'Does not address its source', 'Addresses its source', 'Address the cause named in the source.'),
  ],
}

/** One-line, label-resolved description of an item and its links, for the model to read. */
export function describe(p: Project, L: Record<Id, string>, it: Item): string {
  const T = (s: string) => renderText(L, s).replace(/\s+/g, ' ').trim()
  const lab = (ids: Id[]) => ids.map((i) => `${L[i]} ${p.items[i]?.title ?? ''}`.trim()).join('; ') || 'none'
  const head = `${L[it.id]}: ${it.title}${it.description ? ' – ' + T(it.description) : ''}`
  switch (it.kind) {
    case 'hazard':
      return `${head}\n  Linked losses: ${lab(effectiveLosses(p, it.id))}`
    case 'constraint':
      return `${head}\n  Prevents hazards: ${lab(it.hazards)}`
    case 'uca': {
      const ca = p.items[it.ca]
      return `${L[it.id]}: ${T(generateUcaText(p, L, it))}\n  Control action: ${ca ? `${L[ca.id]} ${ca.title}` : 'none'}; type: ${it.guide}\n  Hazards: ${lab(it.hazards)}\n  Controller constraint: ${T(it.constraint) || 'none'}`
    }
    case 'scenario': {
      const target = scenarioTarget(it)
      return `${head}\n  Kind: ${SCENARIO_TYPE_LABELS[it.scenarioType]}; applies to ${target ? L[target] : 'nothing'}; cause: ${it.cause || 'unspecified'}\n  Hazards: ${lab(scenarioHazards(p, it))}${it.adversarial ? `\n  Adversarial; STRIDE: ${it.stride.join(', ') || 'none'}; threat: ${T(it.threat) || 'none'}` : ''}`
    }
    case 'requirement':
      return `${head}\n  Type: ${it.type}; derived from: ${lab(it.sources)}`
    default:
      return head
  }
}

export type Verdict = 'pass' | 'unsure' | 'fail'
export interface CheckResult { id: string; label: string; ask: string; p: number; verdict: Verdict }
export interface ItemReview { checks: CheckResult[]; verdict: Verdict }

/** `p` is the probability that the mistake is present: at or above FAIL it is reported, at or below PASS the item is fine, in between the model is unsure. */
export const PASS = 0.4
export const FAIL = 0.7
export const verdictOf = (p: number): Verdict => (p <= PASS ? 'pass' : p >= FAIL ? 'fail' : 'unsure')

export const checksFor = (kind: Kind, it: Item) => (CHECKS[kind] ?? []).filter((x) => !x.applies || x.applies(it))

/** Everything the decision model needs: the STPA primer, the item with its linked items, and the questions. */
export function decisionRequest(p: Project, L: Record<Id, string>, it: Item) {
  const state = `${PRIMERS[it.kind] ?? ''}\n\nArtifact to check (${it.kind}):\n${describe(p, L, it)}`
  const questions: Record<string, DecisionQuestion> = {}
  for (const k of checksFor(it.kind, it)) questions[k.id] = { type: 'noul', instructions: k.ask, criteria: { true: k.yes, false: k.no } }
  return { state, questions }
}

export function summarise(it: Item, probs: Record<string, number>): ItemReview {
  const checks = checksFor(it.kind, it).map((k) => ({ id: k.id, label: k.label, ask: k.ask, p: probs[k.id], verdict: verdictOf(probs[k.id]) }))
  const verdict: Verdict = checks.some((x) => x.verdict === 'fail') ? 'fail' : checks.some((x) => x.verdict === 'unsure') ? 'unsure' : 'pass'
  return { checks, verdict }
}

export const itemsForReview = (p: Project, kind: Kind): Item[] => itemsOfKind(p, kind)

/** Kinds whose wording can be rewritten: the title is the text under review (UCA text is generated from its parts). */
export const canSuggest = (it: Item) => REVIEW_KINDS.includes(it.kind) && it.kind !== 'uca'

export const WRITER_SYSTEM = `You are an expert in STPA (System-Theoretic Process Analysis), writing for the STPA Handbook style.
You improve ONE short artifact (a loss, hazard, constraint, scenario or requirement) so that it follows the STPA rules you are given.
Rules for your answer:
- Reply with the improved text only: no label such as "H-1", no quotes, no explanation, no list.
- Keep the original meaning, subject and domain. Do not invent new facts, components or numbers.
- Fix every listed problem. Do not add anything the rules forbid.
- Write plain, concrete, short wording.`

/** What a well-formed artifact of each kind looks like, with examples; given to the writer model. */
export const WRITE_GUIDE: Partial<Record<Kind, string>> = {
  loss: 'One short noun phrase naming what of value is lost, e.g. "Loss of life or injury to people", "Loss of sensitive information", "Damage to the vehicle". No causes, no components, no system states.',
  hazard: 'One sentence in the form "<the system as a whole> <unwanted condition>", at most 15 words, naming only a condition of the system. No components, no causes, no consequences or losses ("leading to …"), no vague words. Examples: "Aircraft violate minimum separation standards in flight", "Pump delivers more drug than prescribed", "Pump accepts therapy changes from an unauthorised source".',
  constraint: 'One sentence "<The system> must <condition that prevents the hazard>" or "… must not …". It says what must hold, not how to achieve it. Example: "Aircraft must satisfy minimum separation standards from other aircraft and objects".',
  scenario: 'One or two sentences telling the story: the causal factors, how they lead to the unsafe control action or hazard. Example: "The controller sends the brake command, but the brakes are not applied due to insufficient hydraulic pressure (pump failure, leak), so deceleration is insufficient on landing".',
  requirement: 'One sentence "The <system> shall <verifiable behaviour>" that addresses the cause or constraint it comes from and states one thing. Example: "The controller shall reject rate changes that are not authenticated".',
}

export function suggestionPrompt(p: Project, L: Record<Id, string>, it: Item, failed: CheckResult[], tried: { text: string; failed: CheckResult[] }[]): string {
  const kind = KIND_NAMES[it.kind].toLowerCase()
  const fix = (id: string) => (CHECKS[it.kind] ?? []).find((x) => x.id === id)?.fix ?? ''
  const rules = (cs: CheckResult[]) => cs.map((x) => `- ${x.label}. ${fix(x.id)}`).join('\n')
  return [
    `# Background\n${PRIMERS[it.kind] ?? ''}`,
    `# What a good ${kind} looks like\n${WRITE_GUIDE[it.kind] ?? ''}`,
    `# Current ${kind}\n${describe(p, L, it)}\nOnly the title text is rewritten; the rest is context.`,
    `# Problems to fix\n${rules(failed)}`,
    ...tried.map((t) => `# Earlier attempt (rejected)\n"${t.text}"\nIt still had these problems:\n${rules(t.failed)}`),
    `# Task\nWrite the improved ${kind} text. Reply with the text only.`,
  ].join('\n\n')
}

export const cleanSuggestion = (raw: string) =>
  raw.trim().split('\n')[0].replace(/^(?:[A-Z]{1,3}-[\d.]+|rewritten[^:]*|suggestion)\s*:\s*/i, '').replace(/^["'“]+|["'”]+$/g, '').trim()

export const withTitle = (p: Project, it: Item, title: string): Project => updateItem(p, it.id, { title })
