import { projectBuilder, type Add } from './build'
import { mention } from './refs'
import type { Cause, Id, Patch, Project } from './types'

/**
 * End-to-end STPA analyses taken from openly published sources (losses, hazards, constraints, control structure,
 * UCAs, loss scenarios, requirements). Where the source only shows a figure or an excerpt, the gap is noted in the
 * item notes / project description rather than filled with invented content.
 */
type Build = (add: Add, b: ReturnType<typeof projectBuilder>) => void

export const PUBLISHED_EXAMPLES: { id: string; label: string; name: string; description: string; build: Build }[] = [
  {
    id: 'pub-train-door', label: 'Automated train door controller (Thomas)',
    name: 'Automated train door controller (Thomas example)',
    description: 'Train door example of J. Thomas, "Extending and Automating a Systems-Theoretic Hazard Analysis for Requirements Generation and Analysis", PhD thesis, MIT (2013), also used in the STPA tutorials: an automated door controller opens and closes the door through a door actuator, gets door position and "door clear" feedback from door sensors and train motion, train position and emergency indicator as other inputs. Losses, hazards, control structure and process model follow the source; the process-model beliefs have an extra "unknown" state. UCA contexts, scenarios, traces and requirements are worded by us after the source\'s context tables. The upstream controller and its commands/status are left open ("?") as in the figure.',
    build(add, b) {
      const L1 = add('loss', { title: 'Death or injury of passengers or people on the platform' })
      const H1 = add('hazard', { title: 'Doors close on a person in the doorway', lossLinks: [L1] })
      const H2 = add('hazard', { title: 'Doors open when the train is moving or not aligned with a platform', lossLinks: [L1] })
      const H3 = add('hazard', { title: 'Passengers or personnel are unable to exit the train during an emergency', lossLinks: [L1] })
      add('constraint', { title: 'Doors must not close while a person is in the doorway', hazards: [H1] })
      add('constraint', { title: 'Doors must not open while the train is moving or not aligned with a platform, unless an evacuation is required', hazards: [H2] })
      add('constraint', { title: 'Doors must allow passengers and personnel to exit during an emergency', hazards: [H3] })

      const train = add('entity', { title: 'Train' })
      const door = add('entity', { title: 'Door', parent: train, operations: ['Open', 'Close'] })
      const vMotion = add('variable', { title: 'Train motion', parent: train, states: ['stopped', 'moving'], definition: 'The train is moving when its speed exceeds a small threshold.' })
      const vPos = add('variable', { title: 'Train position', parent: train, states: ['aligned with platform', 'not aligned with platform'], definition: 'All doors on the platform side are within the platform edges.' })
      const vEm = add('variable', { title: 'Emergency', parent: train, states: ['no emergency', 'evacuation required'], definition: 'A condition (fire, smoke, toxic gas, …) requires passengers to leave the train.' })
      const vDoor = add('variable', { title: 'Door position', parent: door, states: ['fully open', 'fully closed', 'partially open'] })
      const vWay = add('variable', { title: 'Door state', parent: door, states: ['person not in doorway', 'person in doorway'], definition: 'A person or object is in the path of the door.' })

      const ops = add('node', { title: 'Train operations (?)', role: 'controller', description: 'Upstream controller; its commands and status are left open in the source figure.' })
      const ctrl = add('node', { title: 'Automated door controller', role: 'controller' })
      const phys = add('node', { title: 'Physical door', role: 'process', entity: door })
      const trainNode = add('node', { title: 'Train', role: 'external', entity: train })
      const cmd = add('ca', { title: 'Control commands (?)', from: ops, to: ctrl })
      const fbStatus = add('feedback', { title: 'Status (?)', from: ctrl, to: ops })
      const open = add('ca', { title: 'Open door', from: ctrl, to: phys, actuator: 'Door actuator', affects: [vDoor], description: 'Open door, stop opening door (mechanical force on the door).' })
      const close = add('ca', { title: 'Close door', from: ctrl, to: phys, actuator: 'Door actuator', affects: [vDoor], description: 'Close door, stop closing door (mechanical force on the door).' })
      const fbDoor = add('feedback', { title: 'Door feedback', from: phys, to: ctrl, sensor: 'Door sensors', description: 'Door position, door clear? (from the mechanical position of the door).' })
      const fbOther = add('feedback', { title: 'Other inputs', from: trainNode, to: ctrl })
      const states = (v: Id) => (b.project.items[v] as { states: string[] }).states
      add('variable', { layer: 'signal', parent: fbStatus, about: vDoor, title: 'Door status', states: states(vDoor) })
      const sig: Record<Id, Id> = {}, bel: Record<Id, Id> = {}
      sig[vDoor] = add('variable', { layer: 'signal', parent: fbDoor, about: vDoor, title: 'Door position', states: states(vDoor), definition: 'Door end-position switches.' })
      sig[vWay] = add('variable', { layer: 'signal', parent: fbDoor, about: vWay, title: 'Door clear?', states: states(vWay), definition: 'Light curtain and door-edge force sensor.' })
      sig[vMotion] = add('variable', { layer: 'signal', parent: fbOther, about: vMotion, title: 'Train motion', states: states(vMotion), definition: 'From the speed sensors.' })
      sig[vPos] = add('variable', { layer: 'signal', parent: fbOther, about: vPos, title: 'Train position', states: states(vPos), definition: 'From the platform alignment sensors.' })
      sig[vEm] = add('variable', { layer: 'signal', parent: fbOther, about: vEm, title: 'Emergency indicator', states: states(vEm) })
      for (const v of [vDoor, vWay, vPos, vMotion, vEm]) bel[v] = add('variable', { layer: 'belief', parent: ctrl, about: v, title: (b.project.items[v] as { title: string }).title, states: [...states(v), 'unknown'] })
      add('variable', { layer: 'belief', parent: ops, about: vDoor, title: 'Door position', states: [...states(vDoor), 'unknown'] })

      const c = (variable: Id, state: string, op: '=' | '≠' = '=') => ({ variable, op, state })
      const u1 = add('uca', { ca: open, guide: 'provided', hazards: [H2], conditions: [c(vMotion, 'moving'), c(vEm, 'no emergency')], constraint: 'Controller must not open the doors while the train is moving, unless an evacuation is required' })
      const u2 = add('uca', { ca: open, guide: 'provided', hazards: [H2], conditions: [c(vMotion, 'stopped'), c(vPos, 'not aligned with platform'), c(vEm, 'no emergency')], constraint: 'Controller must not open the doors when the train is not aligned with a platform, unless an evacuation is required' })
      add('uca', { ca: open, guide: 'not-provided', hazards: [H1], conditions: [c(vMotion, 'stopped'), c(vWay, 'person in doorway'), c(vDoor, 'fully open', '≠')], constraint: 'Controller must reopen the door when a person is in the doorway while it is closing' })
      const u4 = add('uca', { ca: open, guide: 'not-provided', hazards: [H3], conditions: [c(vMotion, 'stopped'), c(vEm, 'evacuation required')], constraint: 'Controller must open the doors when the train is stopped and an evacuation is required' })
      add('uca', { ca: open, guide: 'too-early-late', hazards: [H3], conditions: [c(vMotion, 'stopped'), c(vEm, 'evacuation required')], override: 'Open door is provided too late (more than TBD seconds) after the train stops when an evacuation is required', constraint: 'Controller must open the doors within TBD seconds after the train stops when an evacuation is required' })
      add('uca', { ca: open, guide: 'stopped-too-soon', hazards: [H3], conditions: [c(vEm, 'evacuation required')], override: 'Open door is stopped before the door is fully open while an evacuation is required', constraint: 'Controller must open the doors fully when an evacuation is required' })
      const u7 = add('uca', { ca: close, guide: 'provided', hazards: [H1], conditions: [c(vWay, 'person in doorway')], constraint: 'Controller must not close the door while a person is in the doorway' })
      add('uca', { ca: close, guide: 'provided', hazards: [H3], conditions: [c(vMotion, 'stopped'), c(vEm, 'evacuation required')], constraint: 'Controller must not close the doors when the train is stopped and an evacuation is required' })
      add('uca', { ca: close, guide: 'not-provided', hazards: [H2], conditions: [c(vMotion, 'moving'), c(vDoor, 'fully closed', '≠'), c(vEm, 'no emergency')], constraint: 'Controller must close the doors before the train starts moving' })
      add('uca', { ca: close, guide: 'stopped-too-soon', hazards: [H2], conditions: [c(vMotion, 'moving'), c(vEm, 'no emergency')], override: 'Close door is stopped before the door is fully closed when the train departs', constraint: 'Controller must close the doors fully before departure' })

      const s1 = add('scenario', { uca: u7, cause: 'feedback', element: phys, title: 'Door-clear sensor does not detect a small child or a trapped bag strap in the doorway, so the controller believes the doorway is clear and closes the door', severity: 4, likelihood: 3 })
      const s2 = add('scenario', { uca: u2, cause: 'process-model', element: ctrl, title: 'Controller believes the train is aligned with the platform: after an overrun it keeps the alignment from the previous stop because the position input is not re-read before opening', severity: 5, likelihood: 2 })
      const s3 = add('scenario', { uca: u1, cause: 'control-algorithm', element: ctrl, title: 'Control algorithm accepts an open request from the operator while the train is still moving (no interlock on train motion)', severity: 5, likelihood: 1 })
      const s4 = add('scenario', { scenarioType: 'ca', ca: open, hazards: [H3], cause: 'actuator', title: 'Door actuator has no power after a fire damaged the supply, so "Open door" is sent but the door does not move during an evacuation' })
      const s5 = add('scenario', { uca: u4, cause: 'feedback', element: trainNode, title: 'Emergency indicator is not connected for the affected car, so the controller does not know that an evacuation is required', adversarial: false, severity: 5, likelihood: 2 })
      add('requirement', { title: 'Detect any object of 10 mm or more in the doorway over the full door height', sources: [s1], notes: 'Value illustrative.' })
      add('requirement', { title: 'Re-read and validate the train position input at every door-open decision; treat stale input as "unknown"', sources: [s2] })
      add('requirement', { title: 'Inhibit door opening while train motion is "moving" or "unknown", unless an evacuation is required', sources: [s3] })
      add('requirement', { title: 'Provide a manual emergency door release independent of the door actuator power', sources: [s4], type: 'mitigation' })
      add('assumption', { title: 'Train speed and platform alignment sensors are independent of the door controller', about: [trainNode] })
      // Hand-written traces. A lane triple is world variable, the controller's signal and belief about it; `w(v, x)` sets all three, `world`/`belief` one.
      const lanes = (vs: Id[]) => vs.flatMap((v) => [v, sig[v], bel[v]])
      const w = (v: Id, x: string) => ({ [v]: x, [sig[v]]: x, [bel[v]]: x })
      type Ev = [Id, 'occurs' | 'absent' | 'lost']
      const st = (t: string, note: string, values: Record<Id, string>, events: Ev[] = []) => ({ t, note, values, events: events.map(([on, what]) => ({ on, what })) })
      const set = (s: Id, vs: Id[], steps: ReturnType<typeof st>[]) => b.set(s, { trace: { lanes: lanes(vs), steps } })
      set(s1, [vWay, vDoor], [
        st('t0', 'The door is open at the platform and the doorway is clear.', { ...w(vWay, 'person not in doorway'), ...w(vDoor, 'fully open') }),
        st('t1', `A small child steps into the doorway. ${mention(sig[vWay])} still reports the doorway clear: the child is below the sensor's resolution.`, { [vWay]: 'person in doorway' }, [[fbDoor, 'occurs']]),
        st('t2', `Believing the doorway clear, the controller sends ${mention(close)}: ${mention(u7)}.`, {}, [[close, 'occurs']]),
        st('t3', 'The door closes on the child (H1).', w(vDoor, 'partially open'), [[fbDoor, 'occurs']]),
      ])
      set(s2, [vMotion, vPos, vEm], [
        st('t0', 'The train stands at the previous station, aligned with the platform; process model and world agree.', { ...w(vMotion, 'stopped'), ...w(vPos, 'aligned with platform'), ...w(vEm, 'no emergency') }),
        st('t1', `The train departs. ${mention(bel[vMotion])} follows the motion input, but ${mention(bel[vPos])} is only read at a stop and keeps "aligned".`, { [vMotion]: 'moving', [sig[vMotion]]: 'moving', [bel[vMotion]]: 'moving', [vPos]: 'not aligned with platform', [sig[vPos]]: 'not aligned with platform' }, [[fbOther, 'occurs']]),
        st('t2', `The train overruns the next platform and stops. ${mention(sig[vPos])} reports "not aligned", but the controller does not re-read it.`, { [vMotion]: 'stopped', [sig[vMotion]]: 'stopped', [bel[vMotion]]: 'stopped' }, [[fbOther, 'occurs']]),
        st('t3', `The controller sends ${mention(open)}: ${mention(u2)}.`, {}, [[open, 'occurs']]),
      ])
      set(s3, [vMotion, vEm], [
        st('t0', 'The train is stopped; no emergency.', { ...w(vMotion, 'stopped'), ...w(vEm, 'no emergency') }),
        st('t1', 'The train departs; the controller correctly believes it is moving.', w(vMotion, 'moving'), [[fbOther, 'occurs']]),
        st('t2', `The operator sends an open request (${mention(cmd)}), e.g. by mistake.`, {}, [[cmd, 'occurs']]),
        st('t3', `Without an interlock on train motion, the controller passes the request on and sends ${mention(open)}: ${mention(u1)}.`, {}, [[open, 'occurs']]),
      ])
      set(s4, [vMotion, vEm, vDoor], [
        st('t0', 'A fire stops the train and damages the door actuator supply; an evacuation is required and the door is closed.', { ...w(vMotion, 'stopped'), ...w(vEm, 'evacuation required'), ...w(vDoor, 'fully closed') }),
        st('t1', `The controller sends ${mention(open)}.`, {}, [[open, 'occurs']]),
        st('t2', 'The actuator has no power: the door does not move, yet the controller assumes it opens. Passengers cannot exit (H3).', { [bel[vDoor]]: 'fully open' }),
        st('t3', `${mention(sig[vDoor])} still reports "fully closed"; the controller notices, but cannot open the door itself.`, { [bel[vDoor]]: 'fully closed' }, [[fbDoor, 'occurs']]),
      ])
      set(s5, [vMotion, vEm], [
        st('t0', 'The train is stopped between stations; no emergency.', { ...w(vMotion, 'stopped'), ...w(vEm, 'no emergency') }),
        st('t1', `A fire breaks out in the car and an evacuation is required, but ${mention(sig[vEm])} is not connected and keeps "no emergency".`, { [vEm]: 'evacuation required' }, [[fbOther, 'lost']]),
        st('t2', `The controller does not send ${mention(open)}: ${mention(u4)}.`, {}, [[open, 'absent']]),
      ])
    },
  },
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
      const world = add('node', { title: 'Other traffic and items (people, manual vehicles, traffic lights)', role: 'external' })
      const weather = add('node', { title: 'Environmental conditions', role: 'external' })
      const caDrive = add('ca', { title: 'Drive command to route point', from: tmcs, to: am })
      const caEnv = add('ca', { title: 'Environmental data', from: tmcs, to: am })
      add('ca', { title: 'Mission plans', from: sup, to: tmcs })
      add('ca', { title: 'Remote control', from: remote, to: am })
      add('ca', { title: 'Movement', from: am, to: proc })
      add('feedback', { title: 'Status / diagnostic data', from: am, to: tmcs })
      add('feedback', { title: 'Machine location', from: am, to: tmcs })
      add('feedback', { title: 'System status', from: tmcs, to: sup })
      add('feedback', { title: 'Locations of tagged entities within range', from: world, to: tmcs, sensor: 'Infra tag reader', description: 'Tags worn by people or attached to vehicles are read by the infra tag reader.' })
      add('feedback', { title: 'Environmental conditions', from: weather, to: tmcs, sensor: 'Environmental condition sensors' })

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
      const sNoTag = S(u12, 'Failure in the tag of the entity', 'feedback', { element: world, notes: 'Listed under UCA-1.4 in the source, which Table 5 does not define.' })
      const sDim = S(u12, 'Entity has different dimensions than assumed by Traffic and mission control system', 'process-model', { element: tmcs, notes: 'Listed under UCA-1.4 in the source.' })
      const sBrake = S(u12, 'Traffic and mission control system does not consider environmental parameters affecting the length of brake path', 'process-model', { element: tmcs, notes: 'Listed under UCA-1.4 in the source.' })
      S(u12, 'Failure in the connection of the traffic and mission control system and the entity', 'other-controller', { notes: 'Listed under UCA-1.4 in the source.' })
      const sSensor = S(u12, 'Failure in the tag sensors', 'feedback')
      const sNotWorn = S(u12, 'Tag is not worn by person', 'feedback', { element: world })
      const sNotAtt = S(u12, 'Tag is not attached to AM', 'feedback', { element: world })
      S(u12, 'Tag battery is empty and does not send signal anymore', 'feedback', { element: world })
      // UCA-1.3
      const sNoInfo = S(u13, 'Traffic and mission control system does not receive any information about entities', 'feedback', { element: tmcs })
      S(u13, 'Failure in the traffic and mission control system itself', 'controller-failure')
      S(u13, 'Failure in the connection of the traffic and mission control system and the AM', 'other-controller')
      S(u13, 'Failure in the infra tag reader itself', 'feedback')
      S(u13, 'Infra tag reader parameters are set too high / low', 'feedback')
      S(u13, 'Infra tag reader is not installed at optimal location', 'feedback')
      S(u13, 'Infra tag reader battery is empty and does not receive / send signal anymore', 'feedback')
      S(u13, 'Tags are swapped: the infra tag reader believes an item is an AM when it is a human and vice versa', 'process-model')
      // UCA-2.x
      const sEnvMix = S(u21, 'Traffic and mission control system fails in combining drive command with environmental condition', 'control-algorithm', { element: tmcs })
      const sEnvBad = S(u21, 'Traffic and mission control system receives inaccurate information about environmental condition', 'feedback')
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
      add('assumption', { title: 'Some obstacles or persons may not carry a tag', about: [world] })
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
      const veh = add('node', { title: 'Vehicle', role: 'process' })
      const est = add('node', { title: 'State estimator', role: 'controller' })
      const env = add('node', { title: 'Environment', role: 'external' })
      const bfc = add('ca', { title: 'Braking force command (BFC)', from: aeb, to: veh, actuator: 'Brakes', description: 'Two states: BFC disengaged (0%) and BFC engaged (modulated 0-100%).' })
      add('feedback', { title: 'Vehicle sensor data', from: veh, to: est, sensor: 'Vehicle sensors' })
      add('feedback', { title: 'AD sensor data', from: env, to: est, sensor: 'AD sensors' })
      add('feedback', { title: 'State estimate (distance, speed, object predicted path)', from: est, to: aeb })

      const u1 = add('uca', { ca: bfc, guide: 'not-provided', hazards: [H1, H2], override: 'AEB does not provide BFC when AV is at a closer distance than the collision imminent braking distance (CIBd)', constraint: 'AEB shall provide BFC when AV is at a closer distance than the CIBd (SC 1)' })
      const u3 = add('uca', { ca: bfc, guide: 'provided', hazards: [H1, H2], override: 'AEB provides BFC with a braking force below the required deceleration rate (RDR) when AV is at a closer distance than the CIBd', constraint: 'AEB shall provide the required braking force value when AV is at a closer distance than the CIBd (SC 3)' })
      const cf = add('scenario', { uca: u1, title: 'Object predicted path (OPP) is calculated incorrectly, e.g. by an image processing performance fault, so the actual object path is closer to the AV path than calculated and the controller does not send BFC', cause: 'process-model', element: est })
      const sp = add('scenario', { uca: u3, title: 'AV speed sensor information is spoofed, so the required braking force is computed from a wrong speed', cause: 'feedback', element: veh, adversarial: true, stride: ['Spoofing'], threat: 'Spoofed vehicle speed feedback' })
      add('scenario', { uca: u1, title: 'EPS sensor information is delayed, so BFC is not set to 0% after the earlier hazard has gone, causing an unnecessary halt from which occupants\' personal information could be inferred', cause: 'feedback', element: veh, adversarial: true, stride: ['Information disclosure'], threat: 'Inference of personal identifiable information of occupants from unnecessary halts', notes: 'Security-affects-safety example from the paper; it concerns the opposite failure (BFC held too long).' })
      add('requirement', { title: 'Object path prediction shall be verified against the sensor data, with a fault in image processing detected and handled so that BFC is still provided', sources: [cf], type: 'requirement', notes: 'Technical safety requirement wording is ours; the paper only describes the rationale for causal factor CF1.1a.' })
      add('requirement', { title: 'Speed sensor information shall be authenticated and plausibility-checked against redundant sources', sources: [sp], type: 'mitigation', notes: 'Wording is ours; the paper names spoofing as the security threat only.' })
      add('assumption', { title: 'AEB works for collisions from all angles, not just forward collisions (no lateral manoeuvring or acceleration commanded, only brake actuation)', about: [aeb] })
      add('assumption', { title: 'Path prediction of surrounding mobile objects is available to the AEB system', about: [est] })
    },
  },
  {
    id: 'pub-thomas-msiv', label: 'Nuclear plant, MSIV closure (Thomas PhD)',
    name: 'Nuclear power plant: closing the Main Steam Isolation Valve (Thomas, Appendix A)',
    description: 'Worked example of J. P. Thomas, "Extending and Automating a Systems-Theoretic Hazard Analysis for Requirements Generation and Analysis", PhD thesis, MIT (2013), Appendix A (case study of a generalized EPR/PWR, from an NRC-funded study). Covers closing the MSIV: losses A-1..A-4, hazards H-1..H-4, control structure of Fig. 40, the six unsafe control actions of the Operator (Tables 26-29) with their safety constraints, a selection of the Operator causal factors (A.8.1) and of the factors that keep a correct Close MSIV from being followed. The thesis repeats the analysis for the PS and DAS and gives full 16-row context tables (Tables 27-28); those are summarised here, not reproduced. The source states no requirements; the three listed come from its own recommendations (A.10, A.11).',
    build(add) {
      const A1 = add('loss', { title: 'People injured or killed', description: 'Employees and general population; radiation exposure, explosion or any other mechanism.' })
      const A2 = add('loss', { title: 'Environment contaminated', description: 'Radiation or other harmful release to air, ground, groundwater or any other part of the environment.' })
      const A3 = add('loss', { title: 'Equipment damage (economic loss)', description: 'Regardless of whether any radiation is released.' })
      const A4 = add('loss', { title: 'Loss of electrical power generation', description: 'Includes any unplanned plant shutdown.' })
      const H1 = add('hazard', { title: 'Release of radioactive materials', lossLinks: [A1, A2], description: 'Any release outside the primary system, regardless of quantity, including into the secondary cooling system, groundwater and air.' })
      const H2 = add('hazard', { title: 'Reactor temperature too high', lossLinks: [A1, A2, A3, A4], description: '"Too high" in relation to NRC standards and operating guidelines.' })
      const H3 = add('hazard', { title: 'Equipment operated beyond limits', lossLinks: [A3, A4], description: 'Beyond safe limits (reactor damage) or beyond design limits (damage to other equipment).' })
      const H4 = add('hazard', { title: 'Reactor shut down', lossLinks: [A4], description: 'Any unplanned shutdown that may result in loss of electrical power generation.' })

      const eSg = add('entity', { title: 'Steam generator system' })
      const world: [Id, string, string[]][] = []
      const wv = (title: string, states: string[], description = '') => { const id = add('variable', { title, parent: eSg, states, description }); world.push([id, title, states]); return id }
      const vSgtr = wv('Steam generator tube', ['ruptured', 'not ruptured'])
      const vFw = wv('Main feedwater pipe', ['leak', 'no leak'])
      const vSl = wv('Main steam line', ['leak', 'no leak'])
      const vSup = wv('Other support systems (CVCS, SI, ECCS, ...)', ['adequate', 'inadequate'], 'Adequate: their operation suffices to provide the cooling normally provided by the steam generator.')
      const vP = wv('SG pressure', ['high', 'normal'])

      const op = add('node', { title: 'Operator', role: 'controller', description: 'Validates/inhibits permissives; brings the plant to a controlled shutdown on AOO / postulated accidents; activates the engineered safety features; starts main steam line isolation when necessary; monitors parameters; operates the plant during start-up and programmed shutdown; follows written guides in transients and emergencies.' })
      for (const [v, title, states] of world) add('variable', { layer: 'belief', parent: op, about: v, title, states })
      const nssc = add('node', { title: 'NSSC (Non-Safety System Controller)', role: 'controller', description: 'Provides manual control for the MSIV: forwards an operator open/close command to the PM and the PM feedback to the operator.' })
      const ps = add('node', { title: 'PS (Protection System)', role: 'controller', description: 'Brings the plant to a controlled shutdown on AOO / postulated accidents, activates the engineered safety features and starts main steam line isolation when necessary. Inputs: SIS actuation, low pressurizer pressure, partial cooldown, high main steam line activity, high SG level, start-up/shutdown, SG pressure drop rate, low SG pressure, containment compartment.' })
      const das = add('node', { title: 'DAS (Diverse Automation System)', role: 'controller', description: 'Backup protection system for the PS, same responsibilities.' })
      const pm = add('node', { title: 'PM (Priority Module)', role: 'controller', description: 'Selects one controller to be active, forwards commands to the MSIV actuator and feedback to the active controller, ensures a check-back when the MSIV is closed (valve torque at maximum) and checks the actuator operability.' })
      const msiv = add('node', { title: 'MSIV (main steam isolation valve)', role: 'process' })
      const sec = add('node', { title: 'Secondary cooling system', role: 'process' })
      const plant = add('node', { title: 'Other plant controllers and systems (RC, SCS, TG I&C, CRDCS)', role: 'external', description: 'Source of the "outside information" the controllers use: pressurizer pressure and level, SI status, status of the CVCS, start-up / shutdown, containment and compartment pressure, off-site power, partial cooldown.' })

      const caOpPm = add('ca', { title: 'Close MSIV', from: op, to: pm, duration: 'instantaneous' })
      const caOpNssc = add('ca', { title: 'Close MSIV (manual, via NSSC)', from: op, to: nssc, duration: 'instantaneous' })
      add('ca', { title: 'Close MSIV', from: nssc, to: pm, duration: 'instantaneous' })
      add('ca', { title: 'Close MSIV', from: ps, to: pm, duration: 'instantaneous' })
      add('ca', { title: 'Close MSIV', from: das, to: pm, duration: 'instantaneous' })
      add('ca', { title: 'Permissives, Reset ESF', from: op, to: ps })
      add('ca', { title: 'Permissives, Reset ESF', from: op, to: das })
      const caPmMsiv = add('ca', { title: 'Close MSIV', from: pm, to: msiv, duration: 'instantaneous', actuator: 'MSIV actuator' })
      add('ca', { title: 'Stop flow', from: msiv, to: sec })
      add('feedback', { title: 'Actuator operational conditions', from: nssc, to: op })
      add('feedback', { title: 'Actuator operational conditions', from: pm, to: nssc })
      add('feedback', { title: 'Actuator operational conditions', from: pm, to: op })
      add('feedback', { title: 'Actuator operational conditions', from: pm, to: ps })
      add('feedback', { title: 'MSIV check-back: operational conditions of actuators, status of operation, position', from: msiv, to: pm, sensor: 'MSIV sensor', description: 'Senses the torque applied to the valve (and upper/lower chamber pressure, solenoid valves energised, valve position) to detect that the valve has closed. It does not sense process variables.' })
      add('feedback', { title: 'SG pressure, SG water level, main steam line radioactivity level', from: sec, to: op, sensor: 'Process sensors' })
      add('feedback', { title: 'SG pressure, SG water level, main steam line radioactivity level', from: sec, to: ps, sensor: 'Process sensors' })
      add('feedback', { title: 'SG pressure, SG water level, main steam line radioactivity level', from: sec, to: das, sensor: 'Process sensors' })
      add('feedback', { title: 'Outside information (pressurizer pressure/level, SI status, CVCS status, start-up/shutdown, partial cooldown, ...)', from: plant, to: op })
      add('feedback', { title: 'Outside information (pressurizer pressure, SI status, start-up/shutdown, partial cooldown, ...)', from: plant, to: ps })
      add('feedback', { title: 'Outside information (pressurizer pressure, SI status, start-up/shutdown, partial cooldown, ...)', from: plant, to: das })

      const leak = 'a rupture in the SG tube, a leak in the main feedwater or a leak in the main steam line'
      const u1 = add('uca', { ca: caOpPm, guide: 'not-provided', hazards: [H1, H2, H3, H4], conditions: [{ variable: vSup, op: '=', state: 'adequate' }], override: `Operator does not provide Close MSIV when there is ${leak} and the support systems are adequate`, constraint: 'MSIV must be closed when there is a leak (rupture in the SG tube, leak in main feedwater, or leak in main steam line) and the support systems are adequate (SC 1)' })
      const u2 = add('uca', { ca: caOpPm, guide: 'not-provided', hazards: [H2, H3], conditions: [{ variable: vSup, op: '=', state: 'inadequate' }], override: 'Operator does not provide Close MSIV when there is a main feedwater or main steam line leak and other support systems are inadequate', constraint: 'MSIV must be closed when there is a main feedwater or main steam line leak and other support systems are inadequate (SC 2)', notes: 'Hazards from Table 28 rows 11-16 (leak, not ruptured).' })
      const u3 = add('uca', { ca: caOpPm, guide: 'provided', hazards: [H1, H2, H3, H4], conditions: [{ variable: vSgtr, op: '=', state: 'ruptured' }, { variable: vSup, op: '=', state: 'inadequate' }], override: 'Operator provides Close MSIV when there is a SG tube rupture but support systems are inadequate', constraint: 'MSIV must not be closed when there is a SGTR and support systems are inadequate (SC 3)', notes: 'Result of the conflict resolution of Tables 27 and 28, row 10: the consensus was that keeping the MSIV open maximises cooling.' })
      const u4 = add('uca', { ca: caOpPm, guide: 'too-early-late', hazards: [H2, H3], conditions: [{ variable: vP, op: '=', state: 'high' }], override: 'Operator provides Close MSIV too early (while SG pressure is high): SG pressure may rise, trigger the relief valve, abrupt steam expansion', constraint: 'MSIV must not be closed too early while SG pressure is too high (SC 4)' })
      const u5 = add('uca', { ca: caOpPm, guide: 'too-early-late', hazards: [H1, H2, H3, H4], override: `Operator provides Close MSIV too late after ${leak}: contaminated coolant released into the secondary loop, loss of primary coolant, SG may run dry`, constraint: 'MSIV must not be closed too late after rupture/leak (in the SG tube, main feedwater, or main steam line) (SC 5)' })
      add('uca', { ca: caOpPm, guide: 'provided', hazards: [H4], conditions: [{ variable: vSgtr, op: '=', state: 'not ruptured' }, { variable: vFw, op: '=', state: 'no leak' }, { variable: vSl, op: '=', state: 'no leak' }], override: 'Operator provides Close MSIV when there is no rupture/leak', constraint: 'MSIV must not be closed when there is no rupture/leak (SC 6)' })
      void caOpNssc

      for (const [t, hs, u] of [
        ['MSIV must be closed when there is a leak (rupture in the SG tube, leak in main feedwater or main steam line) and the support systems are adequate', [H1, H2, H3, H4], 1],
        ['MSIV must be closed when there is a main feedwater or main steam line leak and other support systems are inadequate', [H2, H3], 2],
        ['MSIV must not be closed when there is a SGTR and support systems are inadequate', [H1, H2, H3, H4], 3],
        ['MSIV must not be closed too early while SG pressure is too high', [H2, H3], 4],
        ['MSIV must not be closed too late after rupture/leak (in the SG tube, main feedwater, or main steam line)', [H1, H2, H3, H4], 5],
        ['MSIV must not be closed when there is no rupture/leak', [H4], 6],
      ] as const) add('constraint', { title: t, hazards: [...hs], description: `Safety constraint SC ${u} (Table 29).` })

      // Operator causal factors (A.8.1.1): a selection per UCA
      const S = (uca: Id, title: string, cause: Cause, init: Patch<'scenario'> = {}) => add('scenario', { uca, title, cause, ...init })
      S(u1, 'A concurrent situation masks another, e.g. a feedwater problem during a SGTR keeps the SG water level practically stable', 'process-model', { element: op })
      S(u1, 'The event progresses too slowly to detect', 'feedback')
      const s1fb = S(u1, 'SG level or pressure feedback is missing, delayed or incorrect; main steam line activity is not correctly indicated', 'feedback')
      S(u1, 'The voting system does not operate properly and gives wrong measures; sensors, communication lines or power fail', 'feedback')
      S(u1, 'The PM reports both MSIV actuators inoperable when they are, or the MSIV already closed when it is not; the NSSC is reported operational when it is not', 'feedback', { element: pm })
      S(u1, 'Pressurizer pressure delayed or missing; no or delayed indication of SI initiated; inappropriate permissives in effect', 'feedback', { element: plant })
      S(u1, 'Operator believes the SG is not ruptured (or the steam line / feedwater has no leak) when it is', 'process-model', { element: op })
      const s1wait = S(u1, 'Operator recognises a possible SGTR but believes the PS will handle it, or waits for stronger evidence to avoid a spurious reactor trip under pressure not to trip', 'other-controller', { element: op })
      S(u1, 'Operator recognises the rupture/leak but believes other support systems are inadequate and keeps the MSIV open to maintain cooling', 'process-model', { element: op })
      S(u1, 'Operator is confused about the procedure to be followed or by conflicting indicators', 'control-algorithm', { element: op })
      S(u1, 'Operator believes the NSSC is operational when it is not and sends the command to a disabled NSSC instead of directly to the PM', 'process-model', { element: op })
      S(u2, 'Operator believes there is an SGTR that does not require MSIV closure when it is actually a main steam line or feedwater leak that does', 'process-model', { element: op })
      S(u2, 'Operator waits for the PS to handle the situation, or is not aware of the problem because the screen is frozen or the NSSC provides inadequate information', 'feedback', { element: op })
      S(u3, 'Operator thinks the support systems are working when they are not, e.g. believes a partial cooldown was initiated by the automation because SI engaged at the same time as high main steam line radioactivity', 'process-model', { element: op })
      S(u3, 'Operator believes there is a main steam line or feedwater leak when there is actually a SGTR', 'process-model', { element: op })
      S(u3, 'Operator knows the support systems are working but does not realise they are inadequate, or does not realise they are not operative (e.g. in maintenance)', 'process-model', { element: op })
      S(u3, 'False SI signal, wrong combination of indicators from the 4 divisions, or loss of power', 'feedback')
      S(u4, 'Operator believes it is already safe to act after the indications confirm the SGTR / steam line break / feedwater break', 'process-model', { element: op })
      S(u4, 'SG pressure feedback is incorrect or missing, or the NSSC actuation (e.g. pressurizer heaters making up for lost RCS pressure) confuses the operator', 'feedback')
      S(u5, 'Operator is not aware of the problem or waits for stronger evidence of the real problem (e.g. pressed to avoid spurious shutdowns, or relies on automatic protection)', 'other-controller', { element: op })

      // Why a correct "Close MSIV" is not followed (A.8.1.2); the thesis states these for SC 1 and 2, and SC 3-6
      const CS = (title: string, cause: Cause, hazards: Id[], element: Id, init: Patch<'scenario'> = {}) => add('scenario', { scenarioType: 'ca', ca: caPmMsiv, title, cause, hazards, element, ...init })
      const c1 = CS('The PM ignores the close command: wrong priority settings, a previous interlock from the PS (e.g. to prevent closure during start-up), two conflicting commands arriving at nearly the same time, or a status check of the MSIV actuators taking longer than expected', 'receiver', [H1, H2, H3], pm)
      CS('Valve position or operability is reported incorrectly by the MSIV sensor, so the PM does not or cannot forward the close command', 'delivery', [H1, H2, H3], msiv)
      CS('The MSIV actuator cannot close the valve: dump valves do not open, nitrogen pressure in the upper chamber is insufficient, upper chamber in maintenance, loss of oil pump power', 'actuator', [H1, H2, H3], msiv)
      CS('The valve itself does not close: pressure in the lower chamber does not drop, the gate is stuck, or debris keeps it open', 'controlled-process', [H1, H2, H3], msiv)
      CS('Valve closes without an operator command: de-energised pilots open the dump valve, mechanical failure dumps the hydraulic oil, or a closure test inadvertently closes it', 'actuator', [H2, H3, H4], msiv)
      CS('Valve closes too late: leakage in the upper chamber, or the oil pump keeps the valve open', 'actuator', [H1, H2, H3], msiv)

      const R = (title: string, src: Id, type: 'requirement' | 'mitigation' = 'requirement', notes = '') => add('requirement', { title, sources: [src], type, notes })
      R('Simplify the indicators for a SGTR: make the radioactivity level in the main steam line a major indication to isolate the affected SG, so that the PS can detect the event earlier', s1fb, 'requirement', 'Recommendation in A.11.')
      R('The priority settings of the PM must be fixed and not programmable, and the PM logic and PLD design must ensure that MSIV close commands are never ignored regardless of the current priority', c1, 'requirement', 'Option named in A.10; wording ours.')
      R('Reduce the reliance on the operator and on the PS to act on each other: design the PS to alert the operator when it takes no action instead of assuming the operator will resolve the problem', s1wait, 'mitigation', 'Derived from the discussion of "crediting the operator" in A.11; wording ours.')

      add('assumption', { title: 'In a SG tube rupture with inadequate support systems (Table 27/28 row 10) it is best to keep the MSIV open to maximise cooling, even though this contaminates the secondary cooling system', about: [op], notes: 'Consensus after consultation with nuclear engineers and regulators; to be reviewed by domain experts.' })
      add('assumption', { title: 'With a feedwater or steam line leak and inadequate support systems (rows 11-16) it is best to keep the MSIV closed', about: [op], notes: 'Differs from current MSIV controller designs, which do not consider the state of other support systems.' })
      add('assumption', { title: 'The analysis considers a single steam generator and a single MSIV and the systems that close the MSIV; backup cooling systems are included only as far as they influence the decision', about: [pm] })
    },
  },
]

export function publishedExampleProject(id: string): Project {
  const e = PUBLISHED_EXAMPLES.find((x) => x.id === id)!
  const b = projectBuilder({ name: e.name, description: e.description })
  e.build(b.add, b)
  return b.project
}
