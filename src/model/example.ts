import { projectBuilder } from './build'
import { mention } from './refs'
import { draftTrace } from './traces'
import type { Project, Scenario, Variable } from './types'

/** Small infusion-pump example (safety + security) for trying out the tool. */
export function exampleProject(): Project {
  const b = projectBuilder({
    name: 'Infusion pump (example)',
    description: 'Networked infusion pump administering a drug to a patient under nurse supervision.',
  })
  const { add } = b

  const l1 = add('loss', { title: 'Patient injury or death' })
  const l2 = add('loss', { title: 'Loss of patient data confidentiality' })
  const h1 = add('hazard', { title: 'Patient receives wrong amount of drug', lossLinks: [l1] })
  const h11 = add('hazard', { title: 'Overdose: more drug delivered than prescribed', parent: h1 })
  const h12 = add('hazard', { title: 'Underdose: less drug delivered than prescribed', parent: h1 })
  const h2 = add('hazard', { title: 'Pump accepts therapy changes from an unauthorised source', lossLinks: [l1, l2], security: true })
  add('constraint', { title: 'Pump must not deliver more than the prescribed rate', hazards: [h11] })
  add('constraint', { title: 'Pump must alert when delivery stops unexpectedly', hazards: [h12] })
  add('constraint', { title: 'Pump must only accept authenticated, authorised therapy changes', hazards: [h2] })

  const patient = add('entity', { title: 'Patient' })
  const pump = add('entity', { title: 'Pump', operations: ['Start infusion', 'Stop infusion', 'Set rate'] })
  add('relationship', { title: 'infuses', from: pump, to: patient, fromCard: '1', toCard: '1' })
  const vRun = add('variable', { title: 'Infusion state', parent: pump, states: ['running', 'stopped', 'paused'] })
  const vAlarm = add('variable', { title: 'Alarm', parent: pump, states: ['none', 'active'] })
  const vOcc = add('variable', { title: 'Line occlusion', parent: pump, states: ['clear', 'occluded'], definition: 'The line downstream of the pump is blocked (kink, closed clamp, clot), so the drug does not reach the patient.' })
  const vFlow = add('variable', { title: 'Flow', parent: patient, type: 'range', min: 0, max: 500, unit: 'ml/h', definition: 'Actual rate at which the drug enters the patient.' })

  const vRx = add('variable', { title: 'Prescribed rate', parent: patient, type: 'range', min: 0, max: 500, unit: 'ml/h', definition: 'Rate prescribed for the patient.' })
  const vSrc = add('variable', { title: 'Therapy change source', parent: pump, states: ['authorised', 'unauthorised'], definition: 'Who issued the last therapy change: an authenticated, authorised user or anyone else.' })
  b.set(h11, { variables: [vFlow, vRx], conditions: [{ kind: 'var', variable: vFlow, op: '>', other: vRx }] })
  b.set(h12, { variables: [vFlow, vOcc], conditions: [{ kind: 'value', variable: vRun, op: '=', state: 'running' }, { kind: 'value', variable: vOcc, op: '=', state: 'occluded' }] })
  b.set(h2, { variables: [vSrc], conditions: [{ kind: 'value', variable: vSrc, op: '=', state: 'unauthorised' }] })

  const clinic = add('node', { title: 'Hospital', role: 'external' })
  const nurse = add('node', { title: 'Nurse', role: 'controller', parent: clinic })
  const ctrl = add('node', { title: 'Pump controller', role: 'controller', entities: [pump] })
  const body = add('node', { title: 'Patient', role: 'process', entities: [patient] })
  const ca1 = add('ca', { title: 'Set rate', from: nurse, to: ctrl })
  const ca2 = add('ca', { title: 'Drive motor', from: ctrl, to: body, actuator: 'Motor drive', affects: [vFlow, vRun] })
  const fbStatus = add('feedback', { title: 'Alarm & status', from: ctrl, to: nurse })
  const fbFlow = add('feedback', { title: 'Flow rate', from: body, to: ctrl, sensor: 'Flow sensor' })
  const enumOf = (v: string) => b.project.items[v] as { states: string[] }
  // Signals carried by the feedback, beliefs of the controllers (process models), controller-internal state.
  add('variable', { layer: 'signal', parent: fbStatus, about: vAlarm, title: 'Alarm', states: enumOf(vAlarm).states, definition: 'Audible and visual alarm on the pump display.' })
  add('variable', { layer: 'signal', parent: fbStatus, about: vRun, title: 'Status', states: enumOf(vRun).states, definition: 'Infusion state shown on the display.' })
  add('variable', { layer: 'signal', parent: fbFlow, about: vOcc, title: 'Occlusion flag', states: enumOf(vOcc).states, definition: 'Set by the downstream pressure sensor when the pressure exceeds the occlusion threshold.' })
  add('variable', { layer: 'signal', parent: fbFlow, about: vFlow, title: 'Measured flow', type: 'range', min: 0, max: 500, unit: 'ml/h', definition: 'Flow sensor reading, sampled every second.' })
  add('variable', { layer: 'belief', parent: nurse, about: vAlarm, title: 'Alarm', states: enumOf(vAlarm).states })
  add('variable', { layer: 'belief', parent: nurse, about: vRun, title: 'Infusion state', states: enumOf(vRun).states })
  add('variable', { layer: 'belief', parent: ctrl, about: vRun, title: 'Infusion state', states: enumOf(vRun).states, definition: 'The motor is commanded to run.' })
  add('variable', { layer: 'belief', parent: ctrl, about: vOcc, title: 'Line occlusion', states: enumOf(vOcc).states, definition: 'The controller believes the line downstream is blocked.' })
  add('variable', { layer: 'belief', parent: ctrl, about: vFlow, title: 'Flow', type: 'range', min: 0, max: 500, unit: 'ml/h' })
  add('variable', { layer: 'belief', parent: nurse, about: vSrc, title: 'Therapy change source', states: enumOf(vSrc).states, definition: 'Whether the issuer believes the request comes from an authorised source.' })
  const vMode = add('variable', { layer: 'internal', parent: ctrl, title: 'Mode', states: ['priming', 'infusing', 'alarm'], definition: 'Operating mode; occlusion detection is suppressed while priming.' })

  const u1 = add('uca', { ca: ca2, guide: 'provided', hazards: [h11], conditions: [{ kind: 'value', variable: vOcc, op: '=', state: 'occluded' }], constraint: 'Controller must not drive the motor when the line is occluded' })
  const u2 = add('uca', { ca: ca2, guide: 'not-provided', hazards: [h12], conditions: [{ kind: 'value', variable: vRun, op: '=', state: 'running' }], constraint: 'Controller must keep driving the motor while infusion is running' })
  add('uca', { ca: ca1, guide: 'provided', hazards: [h2], context: 'rate set by an unauthenticated source', conditions: [{ kind: 'value', variable: vSrc, op: '=', state: 'unauthorised' }], constraint: 'Controller must reject unauthenticated rate changes' })
  const s1 = add('scenario', { uca: u1, cause: 'feedback', element: ctrl, title: 'Occlusion sensor reading is stale after reconnect', adversarial: false, severity: 5, likelihood: 2 })
  const s3 = add('scenario', { uca: u1, cause: 'process-model', element: ctrl, title: 'Controller ignores the occlusion flag while it is still in priming mode', severity: 4, likelihood: 2 })
  const s2 = add('scenario', { uca: u1, title: 'Attacker spoofs occlusion feedback to mask a blockage', adversarial: true, stride: ['Spoofing', 'Tampering'], threat: 'Man-in-the-middle on the sensor bus', severity: 5, likelihood: 2 })
  const s4 = add('scenario', { scenarioType: 'ca', ca: ca2, hazards: [h12], cause: 'actuator', title: 'Motor drive stalls or loses torque although "Drive motor" is issued' })
  add('scenario', { scenarioType: 'ca', ca: ca2, hazards: [h11], cause: 'controlled-process', title: 'Back-pressure from a kinked line combined with a manual bolus overrides the commanded rate' })
  add('requirement', { title: 'Authenticate and integrity-protect sensor messages', sources: [s2], type: 'mitigation' })
  add('assumption', { title: 'Nurse verifies the prescription before programming the pump', about: [nurse] })
  for (const s of [s1, s3, s4]) b.set(s, (p) => ({ trace: draftTrace(p, p.items[s] as Scenario) }))
  // The occlusion belief is stale because the controller is still priming, where it ignores the occlusion flag.
  b.set(s3, (p) => {
    const t = structuredClone((p.items[s3] as Scenario).trace)
    t.lanes.unshift(vMode)
    t.steps[0].values[vMode] = 'priming'
    t.steps[0].note = 'The pump is still in priming mode; the line is clear.'
    t.steps[1].note = `The line becomes occluded. The flow sensor reports it, but in ${mention(vMode)} "priming" the controller ignores the occlusion flag.`
    t.steps[2].values[vMode] = 'infusing'
    t.steps[2].note = `Priming ends and the controller starts infusing with a stale ${mention(t.lanes.find((id) => (p.items[id] as Variable).layer === 'belief')!)}: it sends ${mention(ca2)}.`
    return { trace: t }
  })
  void u2
  return b.project
}
