import { emptyProject } from './create'
import { createItem } from './ops'
import type { Id, Kind, Project } from './types'

/** Small infusion-pump example (safety + security) for trying out the tool. */
export function exampleProject(): Project {
  let p = emptyProject()
  p.meta.name = 'Infusion pump (example)'
  p.meta.description = 'Networked infusion pump administering a drug to a patient under nurse supervision.'
  const add = (kind: Kind, init: Record<string, unknown> = {}): Id => {
    const r = createItem(p, kind, init)
    p = r.project
    return r.id
  }

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
  const vOcc = add('variable', { title: 'Line occlusion', parent: pump, states: ['clear', 'occluded'] })

  const clinic = add('node', { title: 'Hospital', role: 'external' })
  const nurse = add('node', { title: 'Nurse', role: 'controller', parent: clinic })
  const ctrl = add('node', { title: 'Pump controller', role: 'controller', processModel: [vRun, vAlarm, vOcc], entity: pump })
  const motor = add('node', { title: 'Motor drive', role: 'actuator' })
  const sensor = add('node', { title: 'Flow sensor', role: 'sensor' })
  const body = add('node', { title: 'Patient', role: 'process', entity: patient })
  const ca1 = add('ca', { title: 'Set rate', from: nurse, to: ctrl })
  const ca2 = add('ca', { title: 'Drive motor', from: ctrl, to: motor })
  add('ca', { title: 'Deliver drug', from: motor, to: body })
  add('feedback', { title: 'Alarm & status', from: ctrl, to: nurse, variables: [vAlarm, vRun] })
  add('feedback', { title: 'Flow rate', from: sensor, to: ctrl, variables: [vOcc] })
  add('feedback', { title: 'Delivered volume', from: body, to: sensor })

  const u1 = add('uca', { ca: ca2, guide: 'provided', hazards: [h11], conditions: [{ variable: vOcc, state: 'occluded', negate: false }], constraint: 'Controller must not drive the motor when the line is occluded' })
  const u2 = add('uca', { ca: ca2, guide: 'not-provided', hazards: [h12], conditions: [{ variable: vRun, state: 'running', negate: false }], constraint: 'Controller must keep driving the motor while infusion is running' })
  add('uca', { ca: ca1, guide: 'provided', hazards: [h2], context: 'rate set by an unauthenticated source', constraint: 'Controller must reject unauthenticated rate changes' })
  add('scenario', { uca: u1, title: 'Occlusion sensor reading is stale after reconnect', adversarial: false, severity: 5, likelihood: 2 })
  const s2 = add('scenario', { uca: u1, title: 'Attacker spoofs occlusion feedback to mask a blockage', adversarial: true, stride: ['Spoofing', 'Tampering'], threat: 'Man-in-the-middle on the sensor bus', severity: 5, likelihood: 2 })
  add('scenario', { scenarioType: 'ca', ca: ca2, hazards: [h12], cause: 'actuator', element: motor, title: 'Motor drive stalls or loses torque although "Drive motor" is issued' })
  add('scenario', { scenarioType: 'ca', ca: ca2, hazards: [h11], cause: 'controlled-process', title: 'Back-pressure from a kinked line combined with a manual bolus overrides the commanded rate' })
  add('requirement', { title: 'Authenticate and integrity-protect sensor messages', sources: [s2], type: 'mitigation' })
  add('assumption', { title: 'Nurse verifies the prescription before programming the pump', about: [nurse] })
  void u2
  return p
}
