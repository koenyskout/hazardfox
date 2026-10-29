import { projectBuilder, type Add } from './build'
import type { Cause, Id, Patch, Project } from './types'

/**
 * End-to-end STPA analyses taken from openly published sources (losses, hazards, constraints, control structure,
 * UCAs, loss scenarios, requirements). Where the source only shows a figure or an excerpt, the gap is noted in the
 * item notes / project description rather than filled with invented content.
 */
type Build = (add: Add) => void

export const PUBLISHED_EXAMPLES: { id: string; label: string; name: string; description: string; build: Build }[] = [
  {
    id: 'pub-vtt-am', label: 'Autonomous machine, traffic control (VTT)',
    name: 'Autonomous machine in an industrial area (VTT STPA Guide example)',
    description: 'Continuous example of J. Berger, "STPA Guide", VTT Research Report VTT-R-00848-23 (2023), chapter 4. Narrow use case: traffic and mission control system, one autonomous machine (AM), tagged people and vehicles, human supervisor. The control structure (Fig. 11) is only a figure in the source; the nodes and flows here are reconstructed from the text of Tables 5-8. The source shows a selection of two control actions and of the loss scenarios; this is the complete published chain, not a complete analysis of the system.',
    build(add) {
      const L1 = add('loss', { title: 'Loss of life or injury to people' })
      const L2 = add('loss', { title: 'Loss of, or damage to vehicle (AM or others)' })
      const L3 = add('loss', { title: 'Loss of, or damage to objects outside the AM' })
      const L4 = add('loss', { title: 'Loss of mission (production)' })
      const H1 = add('hazard', { title: 'The AM moves when there are people nearby', lossLinks: [L1, L4], description: 'Source refinements (Table 4, optional step): the AM moves near people crossing at crosswalks; the AM moves near people on its path other than on the crosswalk; deceleration is insufficient upon spontaneous braking.' })
      const H2 = add('hazard', { title: 'The AM moves when there are vehicles or other objects in the way', lossLinks: [L2, L3, L4] })
      const H3 = add('hazard', { title: 'The AM leaves the area where it is intended to operate', lossLinks: [L1, L2, L3, L4] })
      add('constraint', { title: 'The movement of the AM shall not cause safety risk to people nearby', hazards: [H1], description: 'Refinements from the source: AM must stop when people are on the crosswalk; AM must stop when people are on its path; AM must adjust its speed as soon as people are nearby, even if they are not on the road yet.' })
      add('constraint', { title: 'The movement of the AM shall not cause risk of collision when there are vehicles or other objects in the way', hazards: [H2] })
      add('constraint', { title: 'The AM shall not leave the area where it is intended to operate', hazards: [H3] })

      const am = add('node', { title: 'Autonomous machine (AM)', role: 'controller' })
      const proc = add('node', { title: 'AM movement in the operating area', role: 'process' })
      const tmcs = add('node', { title: 'Traffic and mission control system', role: 'controller' })
      const sup = add('node', { title: 'System supervisor (human)', role: 'controller' })
      const remote = add('node', { title: 'Remote operator (human)', role: 'controller' })
      const reader = add('node', { title: 'Infra tag reader', role: 'sensor' })
      const tags = add('node', { title: 'Tags worn by people / attached to vehicles', role: 'sensor' })
      const envs = add('node', { title: 'Environmental condition sensors', role: 'sensor' })
      add('node', { title: 'Other traffic and items (people, manual vehicles, traffic lights)', role: 'external' })
      const caDrive = add('ca', { title: 'Drive command to route point', from: tmcs, to: am })
      const caEnv = add('ca', { title: 'Environmental data', from: tmcs, to: am })
      add('ca', { title: 'Mission plans', from: sup, to: tmcs })
      add('ca', { title: 'Remote control', from: remote, to: am })
      add('ca', { title: 'Movement', from: am, to: proc })
      add('feedback', { title: 'Status / diagnostic data', from: am, to: tmcs })
      add('feedback', { title: 'Machine location', from: am, to: tmcs })
      add('feedback', { title: 'System status', from: tmcs, to: sup })
      add('feedback', { title: 'Tag data', from: tags, to: reader })
      add('feedback', { title: 'Locations of tagged entities within range', from: reader, to: tmcs })
      add('feedback', { title: 'Environmental conditions', from: envs, to: tmcs })

      const HS = [H1, H2, H3]
      const u11 = add('uca', { ca: caDrive, guide: 'provided', hazards: HS, override: 'Traffic and mission control system provides drive command but to an incorrect route point', constraint: 'The drive command must go to the intended route point (SC: AM shall not leave the area where it is intended to operate)' })
      const u12 = add('uca', { ca: caDrive, guide: 'provided', hazards: HS, override: 'Traffic and mission control system provides drive command to route point, but the command is not adjusted to the given operational context', constraint: 'The drive command must be adjusted to the operational context (SC: movement shall not cause safety risk to people nearby; no risk of collision)' })
      const u13 = add('uca', { ca: caDrive, guide: 'not-provided', hazards: HS, override: 'Traffic and mission control system does not provide drive command while AM is already on the path', constraint: 'A drive command must be available while the AM is on the path (SC: AM shall not leave the area where it is intended to operate)' })
      const u21 = add('uca', { ca: caEnv, guide: 'provided', hazards: [H1, H2], override: 'Traffic and mission control system provides environmental data that does not match the given environmental condition while AM is driving, so the AM operates without complying with required parameters', notes: 'The source Table 5 repeats the wording of UCA-1.2 here; reworded to fit the control action "Environmental data".' })
      const u22 = add('uca', { ca: caEnv, guide: 'not-provided', hazards: [H1, H2], override: 'Traffic and mission control system does not provide environmental data during extraordinary environmental conditions, so the AM operates without complying with required parameters' })
      const u23 = add('uca', { ca: caEnv, guide: 'too-early-late', hazards: [H1, H2], override: 'Traffic and mission control system provides environmental data too late to adjust accordingly while AM is driving, so the AM operates without complying with required parameters' })

      const S = (uca: Id, title: string, cause: Cause, init: Patch<'scenario'> = {}) => add('scenario', { uca, title, cause, ...init })
      // UCA-1.1
      S(u11, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u11, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      S(u11, 'Traffic and mission control system receives incorrect data', 'feedback')
      // UCA-1.2 (source also lists scenarios about tags and entity dimensions under a "UCA-1.4" that Table 5 does not define; attached here)
      S(u12, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u12, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      const sNoTag = S(u12, 'Failure in the tag of the entity', 'feedback', { element: tags, notes: 'Listed under UCA-1.4 in the source, which Table 5 does not define.' })
      const sDim = S(u12, 'Entity has different dimensions than assumed by Traffic and mission control system', 'process-model', { element: tmcs, notes: 'Listed under UCA-1.4 in the source.' })
      const sBrake = S(u12, 'Traffic and mission control system does not consider environmental parameters affecting the length of brake path', 'process-model', { element: tmcs, notes: 'Listed under UCA-1.4 in the source.' })
      S(u12, 'Failure in the connection of the traffic and mission control system and the entity', 'other-controller', { notes: 'Listed under UCA-1.4 in the source.' })
      const sSensor = S(u12, 'Failure in the tag sensors', 'feedback', { element: reader })
      const sNotWorn = S(u12, 'Tag is not worn by person', 'feedback', { element: tags })
      const sNotAtt = S(u12, 'Tag is not attached to AM', 'feedback', { element: tags })
      S(u12, 'Tag battery is empty and does not send signal anymore', 'feedback', { element: tags })
      // UCA-1.3
      const sNoInfo = S(u13, 'Traffic and mission control system does not receive any information about entities', 'feedback', { element: tmcs })
      S(u13, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u13, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      S(u13, 'Failure in the infra tag reader itself', 'feedback', { element: reader })
      S(u13, 'Infra tag reader parameters are set too high / low', 'feedback', { element: reader })
      S(u13, 'Infra tag reader is not installed at optimal location', 'feedback', { element: reader })
      S(u13, 'Infra tag reader battery is empty and does not receive / send signal anymore', 'feedback', { element: reader })
      S(u13, 'Tags are swapped: the infra tag reader believes an item is an AM when it is a human and vice versa', 'process-model', { element: reader })
      // UCA-2.x
      const sEnvMix = S(u21, 'Traffic and mission control system fails in combining drive command with environmental condition', 'control-algorithm', { element: tmcs })
      const sEnvBad = S(u21, 'Traffic and mission control system receives inaccurate information about environmental condition', 'feedback', { element: envs })
      S(u21, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      S(u21, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u22, 'The parameters to define extraordinary environmental conditions are set too low', 'control-algorithm', { element: tmcs })
      S(u22, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u22, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      S(u23, 'The parameters to define extraordinary environmental conditions are set too low', 'control-algorithm', { element: tmcs })
      S(u23, 'The parameters to define normal environmental conditions are set too high', 'control-algorithm', { element: tmcs })
      S(u23, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u23, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      // Element-based scenarios of the source (feedback, controller, external input)
      const sDiag = S(u12, 'Failure in machine automation decision making', 'controller-failure', { element: am })
      const sDiagP = S(u12, 'The parameters of status / diagnostic data are set too low', 'feedback', { element: am })
      const sOp = S(u13, 'Remote operator is not aware what consequences the command to stop providing mission plans has, when operation is already ongoing', 'process-model', { element: remote })
      S(u13, 'Traffic and mission control system suffers a data overload and freezes', 'controller-failure', { element: tmcs })

      const R = (title: string, src: Id) => add('requirement', { title, sources: [src], type: 'requirement' })
      R('Traffic and mission control system may not cause a hazard even if it does not receive information about entities; other safety measures must take over if an object is in the way of the AM', sNoInfo)
      R('The tag must function at all times and must not be affected by weather; it must be maintained regularly', sNoTag)
      R('Traffic and mission control system must have knowledge about all possible dimensions of entities and, if in doubt, must assume the biggest parameters', sDim)
      R('Traffic and mission control system may not operate without considering environmental parameters', sBrake)
      R('The tag must be maintained regularly', sSensor)
      R('People must be reminded to wear their personal tags; a gate could ensure that only people with tags on them can enter the operation area', sNotWorn)
      R('AMs must be checked for a tag before they leave for a mission', sNotAtt)
      R('Traffic and mission control system must check whether the environmental parameters are reasonable; the sensors providing environmental data must be maintained regularly; the system supervisor must regularly check the suitability of the environmental parameters', sEnvBad)
      R('The control algorithm of the AM must be checked precisely and for all possible scenarios', sDiag)
      R('The status / diagnostic data parameters must be adjusted to cause the correct reactions', sDiagP)
      R('Remote operator must receive proper training', sOp)
      void sEnvMix
      add('assumption', { title: 'The safety functionalities of the AM system (sensors, motion control, stop functions) work correctly and are not part of this analysis', about: [am] })
      add('assumption', { title: 'Only one AM moves within the operating area, during daytime; pedestrians in the area are aware of the autonomous function', about: [am] })
      add('assumption', { title: 'Some obstacles or persons may not carry a tag', about: [tags] })
    },
  },
  {
    id: 'pub-aeb', label: 'Autonomous emergency braking, L4 vehicle (Waterloo)',
    name: 'Autonomous emergency braking of an L4 vehicle (Sharma et al. example)',
    description: 'From S. Sharma, A. Flores, C. Hobbs, J. Stafford, S. Fischmeister, "Safety and Security Analysis of AEB for L4 Autonomous Vehicle Using STPA", OASIcs ASD 2019, article 5 (CC BY). Combined safety and security analysis; the paper presents an excerpt (assumptions 1 and 5, 3 accidents and hazards, 2 UCAs with constraints, one causal factor, spoofing example). Source accidents are modelled as losses; the system constraints are the inverse of the hazards (the paper does not list their wording).',
    build(add) {
      const A1 = add('loss', { title: 'The AV collides with a mobile object' })
      const A2 = add('loss', { title: 'The AV collides with an immobile object' })
      const A3 = add('loss', { title: 'The AV passengers are injured without collision' })
      const H1 = add('hazard', { title: 'AV does not maintain minimum safe distance (MSD) from a forward mobile object (FMO)', lossLinks: [A1] })
      const H2 = add('hazard', { title: 'AV does not maintain MSD from a prohibited area (PA)', lossLinks: [A2] })
      const H3 = add('hazard', { title: 'AV occupants are exposed to unhealthy g-forces exceeding the safety threshold of the AV', lossLinks: [A3] })
      add('constraint', { title: 'AV must maintain MSD from a forward mobile object', hazards: [H1] })
      add('constraint', { title: 'AV must maintain MSD from a prohibited area', hazards: [H2] })
      add('constraint', { title: 'AV must keep occupant g-forces below the safety threshold', hazards: [H3] })

      const aeb = add('node', { title: 'AEB controller', role: 'controller' })
      const brakes = add('node', { title: 'Brakes', role: 'actuator' })
      const veh = add('node', { title: 'Vehicle', role: 'process' })
      const est = add('node', { title: 'State estimator', role: 'controller' })
      const ad = add('node', { title: 'AD sensors', role: 'sensor' })
      const vs = add('node', { title: 'Vehicle sensors', role: 'sensor' })
      const env = add('node', { title: 'Environment', role: 'external' })
      const bfc = add('ca', { title: 'Braking force command (BFC)', from: aeb, to: brakes, description: 'Two states: BFC disengaged (0%) and BFC engaged (modulated 0-100%).' })
      add('ca', { title: 'Braking force', from: brakes, to: veh })
      add('feedback', { title: 'Vehicle state', from: veh, to: vs })
      add('feedback', { title: 'Surroundings', from: env, to: ad })
      add('feedback', { title: 'Vehicle sensor data', from: vs, to: est })
      add('feedback', { title: 'AD sensor data', from: ad, to: est })
      add('feedback', { title: 'State estimate (distance, speed, object predicted path)', from: est, to: aeb })

      const u1 = add('uca', { ca: bfc, guide: 'not-provided', hazards: [H1, H2], override: 'AEB does not provide BFC when AV is at a closer distance than the collision imminent braking distance (CIBd)', constraint: 'AEB shall provide BFC when AV is at a closer distance than the CIBd (SC 1)' })
      const u3 = add('uca', { ca: bfc, guide: 'provided', hazards: [H1, H2], override: 'AEB provides BFC with a braking force below the required deceleration rate (RDR) when AV is at a closer distance than the CIBd', constraint: 'AEB shall provide the required braking force value when AV is at a closer distance than the CIBd (SC 3)' })
      const cf = add('scenario', { uca: u1, title: 'Object predicted path (OPP) is calculated incorrectly, e.g. by an image processing performance fault, so the actual object path is closer to the AV path than calculated and the controller does not send BFC', cause: 'process-model', element: est })
      const sp = add('scenario', { uca: u3, title: 'AV speed sensor information is spoofed, so the required braking force is computed from a wrong speed', cause: 'feedback', element: vs, adversarial: true, stride: ['Spoofing'], threat: 'Spoofed vehicle speed feedback' })
      add('scenario', { uca: u1, title: 'EPS sensor information is delayed, so BFC is not set to 0% after the earlier hazard has gone, causing an unnecessary halt from which occupants\' personal information could be inferred', cause: 'feedback', element: vs, adversarial: true, stride: ['Information disclosure'], threat: 'Inference of personal identifiable information of occupants from unnecessary halts', notes: 'Security-affects-safety example from the paper; it concerns the opposite failure (BFC held too long).' })
      add('requirement', { title: 'Object path prediction shall be verified against the sensor data, with a fault in image processing detected and handled so that BFC is still provided', sources: [cf], type: 'requirement', notes: 'Technical safety requirement wording is ours; the paper only describes the rationale for causal factor CF1.1a.' })
      add('requirement', { title: 'Speed sensor information shall be authenticated and plausibility-checked against redundant sources', sources: [sp], type: 'mitigation', notes: 'Wording is ours; the paper names spoofing as the security threat only.' })
      add('assumption', { title: 'AEB works for collisions from all angles, not just forward collisions (no lateral manoeuvring or acceleration commanded, only brake actuation)', about: [aeb] })
      add('assumption', { title: 'Path prediction of surrounding mobile objects is available to the AEB system', about: [est] })
    },
  },
]

export function publishedExampleProject(id: string): Project {
  const e = PUBLISHED_EXAMPLES.find((x) => x.id === id)!
  const b = projectBuilder({ name: e.name, description: e.description })
  e.build(b.add)
  return b.project
}
