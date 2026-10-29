import { computeLabels } from '../model/labels'
import { projectBuilder } from '../model/build'
import type { GuideWord, Id, Item, Kind, Project } from '../model/types'

/** An example from the STPA Handbook (or a mistake the Handbook warns about), used as built-in demo input and as the LLM test set. */
export interface Example {
  id: string
  kind: Kind
  /** The text under review (for a UCA: the full sentence). */
  text: string
  good: boolean
  /** Bad examples: ids of the checks that should fire (any non-pass check counts if omitted). */
  flaws?: string[]
  /** Where it comes from. "Handbook" = quoted; "Handbook mistake" = a mistake the Handbook names, worded here. */
  source: string
  /** hazard: linked losses */
  losses?: string[]
  /** constraint, uca, scenario type 2: linked hazards */
  hazards?: string[]
  /** uca, scenario: controller and control action */
  controller?: string
  action?: string
  guide?: GuideWord
  /** uca: controller constraint */
  constraint?: string
  /** scenario type 1: the UCA it explains; type 2: omitted */
  uca?: string
  scenarioType?: 'uca' | 'ca'
  adversarial?: boolean
}

const LOSSES = ['Loss of life or injury to people', 'Loss of or damage to aircraft', 'Loss of mission', 'Loss of customer satisfaction']
const BSCU = { controller: 'BSCU Autobrake', action: 'Brake' }
const UCA2 = 'BSCU Autobrake does not provide the Brake control action during landing roll when the BSCU is armed'
const MISTAKE = 'Handbook mistake'

const loss = (id: string, text: string, good: boolean, source = 'Handbook', flaws?: string[]): Example => ({ id, kind: 'loss', text, good, source, flaws })
const hazard = (id: string, text: string, good: boolean, source = 'Handbook', flaws?: string[], losses = LOSSES.slice(0, 2)): Example => ({ id, kind: 'hazard', text, good, source, flaws, losses })
const constraint = (id: string, text: string, hazards: string[], good: boolean, source = 'Handbook', flaws?: string[]): Example => ({ id, kind: 'constraint', text, good, source, flaws, hazards })
const uca = (id: string, text: string, guide: GuideWord, hazards: string[], good: boolean, source = 'Handbook', flaws?: string[], constraint?: string): Example =>
  ({ id, kind: 'uca', text, good, source, flaws, guide, hazards, constraint, ...BSCU })
const scenario = (id: string, text: string, scenarioType: 'uca' | 'ca', good: boolean, source = 'Handbook', flaws?: string[], adversarial = false): Example =>
  ({ id, kind: 'scenario', text, good, source, flaws, scenarioType, adversarial, uca: scenarioType === 'uca' ? UCA2 : undefined, hazards: scenarioType === 'ca' ? ['Deceleration is insufficient upon landing'] : undefined, ...BSCU })

export const EXAMPLES: Example[] = [
  loss('loss-life', 'Loss of life or injury to people', true),
  loss('loss-aircraft', 'Loss of or damage to aircraft', true),
  loss('loss-outside', 'Loss of or damage to objects outside the aircraft', true),
  loss('loss-mission', 'Loss of mission', true),
  loss('loss-sat', 'Loss of customer satisfaction', true),
  loss('loss-info', 'Loss of sensitive information', true),
  loss('loss-env', 'Environmental loss', true),
  loss('loss-bad-component', 'Brake failure', false, MISTAKE, ['cause']),
  loss('loss-bad-human', 'Human error injures passengers', false, MISTAKE, ['cause']),
  loss('loss-bad-state', 'Aircraft is not under control', false, MISTAKE, ['state']),
  loss('loss-bad-several', 'Loss of life and loss of mission', false, MISTAKE, ['several']),

  hazard('haz-separation', 'Aircraft violate minimum separation standards in flight', true),
  hazard('haz-integrity', 'Aircraft airframe integrity is lost', true),
  hazard('haz-taxiway', 'Aircraft leaves designated taxiway, runway, or apron on ground', true),
  hazard('haz-decel', 'Deceleration is insufficient upon landing, rejected takeoff, or during taxiing', true),
  hazard('haz-nuclear', 'Nuclear power plant releases dangerous materials', true, 'Handbook', undefined, ['Loss of life or injury to people', 'Environmental loss']),
  hazard('haz-satellite', 'Satellite is unable to collect scientific data', true, 'Handbook', undefined, ['Loss of mission']),
  hazard('haz-bad-brake', 'Brake failure', false, MISTAKE, ['component']),
  hazard('haz-bad-engine', 'Engine failure', false, MISTAKE, ['component']),
  hazard('haz-bad-hydraulic', 'Hydraulic leak', false, MISTAKE, ['component']),
  hazard('haz-bad-operator', 'Operator is distracted', false, MISTAKE, ['not-state', 'external']),
  hazard('haz-bad-unsafe', 'Aircraft experiences unsafe flight', false, MISTAKE, ['vague']),
  hazard('haz-bad-weather', 'Heavy rain makes the runway wet', false, MISTAKE, ['external']),
  hazard('haz-bad-consequence', 'Aircraft collide in flight, killing all passengers', false, MISTAKE, ['consequence']),
  hazard('haz-bad-normal', 'Aircraft in flight', false, MISTAKE),

  constraint('sc-separation', 'Aircraft must satisfy minimum separation standards from other aircraft and objects', ['Aircraft violate minimum separation standards in flight'], true),
  constraint('sc-integrity', 'Aircraft airframe integrity must be maintained under all flight conditions', ['Aircraft airframe integrity is lost'], true),
  constraint('sc-taxiway', 'Aircraft must remain within the designated taxiway, runway, or apron on ground', ['Aircraft leaves designated taxiway, runway, or apron on ground'], true),
  constraint('sc-decel', 'Deceleration must be provided upon landing, rejected takeoff, and during taxiing', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], true),
  constraint('sc-response', 'If aircraft violate minimum separation, then the violation must be detected and measures taken to avoid a collision', ['Aircraft violate minimum separation standards in flight'], true),
  constraint('sc-bad-solution', 'Aircraft must use a TCAS transponder that issues resolution advisories', ['Aircraft violate minimum separation standards in flight'], false, MISTAKE, ['solution']),
  constraint('sc-bad-component', 'The left brake must not fail', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], false, MISTAKE, ['component']),
  constraint('sc-bad-mismatch', 'Passengers must be served meals on time', ['Aircraft violate minimum separation standards in flight'], false, MISTAKE, ['no-inverse']),
  constraint('sc-bad-soft', 'Aircraft separation is usually good', ['Aircraft violate minimum separation standards in flight'], false, MISTAKE, ['not-normative']),

  uca('uca-1', UCA2, 'not-provided', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], true, 'Handbook', undefined, 'BSCU Autobrake must provide the Brake control action during landing roll when the BSCU is armed'),
  uca('uca-2', 'BSCU Autobrake provides the Brake control action during a normal takeoff', 'provided', ['Aircraft decelerates during takeoff'], true, 'Handbook', undefined, 'BSCU Autobrake must not provide the Brake control action during a normal takeoff'),
  uca('uca-3', 'BSCU Autobrake provides the Brake control action too late (more than TBD seconds) after touchdown', 'too-early-late', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], true),
  uca('uca-4', 'BSCU Autobrake stops providing the Brake control action too early, before TBD taxi speed is attained', 'stopped-too-soon', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], true),
  uca('uca-5', 'Pilot provides the Brake control action during landing roll when the aircraft is on a wet runway', 'provided', ['Aircraft leaves designated taxiway, runway, or apron on ground'], true),
  uca('uca-bad-belief', 'BSCU Autobrake does not provide the Brake control action when the BSCU incorrectly believes the aircraft has already stopped', 'not-provided', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], false, MISTAKE, ['belief']),
  uca('uca-bad-outcome', 'BSCU Autobrake provides the Brake control action, resulting in the aircraft decelerating during takeoff', 'provided', ['Aircraft decelerates during takeoff'], false, MISTAKE, ['outcome']),
  uca('uca-bad-nocontext', 'BSCU Autobrake does not provide the Brake control action', 'not-provided', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], false, MISTAKE, ['no-context']),
  uca('uca-bad-cause', 'BSCU Autobrake does not provide the Brake control action during landing roll because of a software failure', 'not-provided', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], false, MISTAKE, ['cause']),
  uca('uca-bad-several', 'BSCU Autobrake provides or does not provide the Brake and Park control actions during landing roll', 'provided', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], false, MISTAKE, ['several']),
  uca('uca-bad-inverse', UCA2, 'not-provided', ['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing'], false, MISTAKE, ['no-inverse'], 'The BSCU software must be tested every year'),

  scenario('scn1-uca2', 'The BSCU is armed and the aircraft begins landing roll. The BSCU does not provide the Brake control action because the BSCU incorrectly believes the aircraft has already come to a stop. This flawed process model will occur if the received feedback momentarily indicates zero speed during landing roll. The received feedback may momentarily indicate zero speed during anti-skid operation, even though the aircraft is not stopped.', 'uca', true),
  scenario('scn2-uca2', 'The BSCU is armed and the aircraft begins landing roll. The BSCU does not provide the Brake control action because the BSCU incorrectly believes the aircraft is in the air and has not touched down. This flawed process model will occur if the touchdown indication is not received upon touchdown. The touchdown indication may not be received when wheels hydroplane on a wet runway, wheel speed feedback is delayed due to filtering, or the air/ground switches fail.', 'uca', true),
  scenario('scn3-algo', 'The BSCU does not provide the Brake control action because it incorrectly assumes that a previous Brake control action was successful and that the aircraft was already braking.', 'uca', true),
  scenario('scn-ca1', 'The BSCU sends the Brake command upon landing, but the brakes are not applied due to actuator failure. As a result, insufficient deceleration may be provided upon landing.', 'ca', true),
  scenario('scn-ca2', 'The BSCU sends the Brake command upon landing, but insufficient braking is applied due to slow actuator response. As a result, insufficient deceleration may be provided upon landing.', 'ca', true),
  scenario('scn-ca3', 'The BSCU sends the Brake command upon landing, but it is not received by the actuator due to a wiring error. As a result, insufficient deceleration may be provided upon landing.', 'ca', true),
  scenario('scn-ca6', 'The BSCU sends the Brake command, but the brakes are not applied because the wheel braking system was previously commanded into alternate braking mode (bypassing the BSCU). As a result, insufficient deceleration may be provided upon landing.', 'ca', true),
  scenario('scn-ca7', 'The BSCU sends the Brake command, but the brakes are not applied due to insufficient hydraulic pressure (pump failure, hydraulic leak, etc.). As a result, insufficient deceleration may be provided upon landing.', 'ca', true),
  scenario('scn-ca8', 'The BSCU sends the Brake command, the brakes are applied, but the aircraft does not decelerate due to a wet runway (wheels hydroplane). As a result, insufficient deceleration may be provided upon landing.', 'ca', true),
  scenario('scn-sec5', 'The BSCU sends the Brake command, but the brakes are not applied because an adversary executes a denial of service attack that blocks the Brake command. As a result, insufficient deceleration may be provided upon landing.', 'ca', true, 'Handbook', undefined, true),
  scenario('scn-sec9', 'The BSCU sends the Brake command, but the brakes are not applied because an adversary injected a command that put the wheel braking system into alternate braking mode. As a result, insufficient deceleration may be provided upon landing.', 'ca', true, 'Handbook', undefined, true),
  scenario('scn-bad-sensor', 'Wheel speed sensor failure', 'uca', false, MISTAKE, ['factor']),
  scenario('scn-bad-power', 'Loss of power', 'ca', false, MISTAKE, ['factor']),
  scenario('scn-bad-delay', 'Wheel speed feedback is delayed', 'uca', false, MISTAKE, ['factor']),
  scenario('scn-bad-restate', 'The BSCU does not provide the Brake control action during landing roll, so deceleration is insufficient.', 'uca', false, MISTAKE, ['restates']),
  scenario('scn-bad-unfinished', 'The BSCU does not provide the Brake control action because it incorrectly believes the aircraft is in the air. This will occur if the touchdown indication is not received upon touchdown. Why?', 'uca', false, 'Handbook (marked as unfinished)'),
  scenario('scn-bad-sec', 'The brakes are not applied and deceleration is insufficient upon landing.', 'ca', false, MISTAKE, ['threat'], true),
]

export interface Built { p: Project; L: Record<Id, string>; it: Item }

/** Builds a small in-memory project around an example so the review checks see linked items like they would in a real project. */
export function buildExample(ex: Example): Built {
  const b = projectBuilder()
  const { add } = b
  const mkHazards = (titles: string[] = []) => titles.map((t) => add('hazard', { title: t, lossLinks: [add('loss', { title: LOSSES[0] })] }))
  let id: Id
  switch (ex.kind) {
    case 'loss':
      id = add('loss', { title: ex.text })
      break
    case 'hazard':
      id = add('hazard', { title: ex.text, lossLinks: (ex.losses ?? []).map((t) => add('loss', { title: t })) })
      break
    case 'constraint':
      id = add('constraint', { title: ex.text, hazards: mkHazards(ex.hazards) })
      break
    default: {
      const ctrl = add('node', { title: ex.controller ?? BSCU.controller, role: 'controller' })
      const act = add('node', { title: 'Brakes', role: 'actuator' })
      const ca = add('ca', { title: ex.action ?? BSCU.action, from: ctrl, to: act })
      const hazards = mkHazards(ex.hazards)
      if (ex.kind === 'uca') id = add('uca', { ca, guide: ex.guide ?? 'provided', override: ex.text, hazards, constraint: ex.constraint ?? '' })
      else if (ex.kind === 'scenario') {
        const u = ex.scenarioType === 'uca' ? add('uca', { ca, guide: 'not-provided', override: ex.uca ?? '', hazards: mkHazards(['Deceleration is insufficient upon landing, rejected takeoff, or during taxiing']) }) : null
        id = add('scenario', { title: ex.text, scenarioType: ex.scenarioType ?? 'uca', uca: u, ca: ex.scenarioType === 'ca' ? ca : null, hazards: ex.scenarioType === 'ca' ? hazards : [], adversarial: !!ex.adversarial, threat: ex.adversarial ? ex.text : '', stride: [] })
      } else id = add(ex.kind, { title: ex.text })
    }
  }
  const p = b.project
  return { p, L: computeLabels(p), it: p.items[id] }
}

/** Did the model judge the example the way the Handbook does? Good: no check fails. Bad: an expected check (or any, if none given) is above the pass threshold. */
export function agrees(ex: Example, probs: Record<string, number>, pass: number, fail: number): boolean {
  if (ex.good) return Object.values(probs).every((v) => v < fail)
  const ids = ex.flaws?.length ? ex.flaws : Object.keys(probs)
  return ids.some((k) => (probs[k] ?? 0) > pass)
}

