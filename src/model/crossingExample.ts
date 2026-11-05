import { and, every, is, none, some } from './lang'
import { relEnds } from './create'
import { projectBuilder } from './build'
import { predicateOf } from './formal'
import type { Project } from './types'

/** Level crossing with several trains: shows many-instance entities and some / every / no conditions. */
export function crossingExampleProject(): Project {
  const b = projectBuilder({
    name: 'Level crossing (several trains)',
    description: 'A gate controller closes a level crossing for road traffic when trains approach. Several trains share the line, so the conditions say "some", "every" or "no" train (entity Train is marked as having several instances; relationship "approaches" is many-to-one).',
  })
  const { add } = b

  const L1 = add('loss', { title: 'Collision between a train and a road vehicle or pedestrian' })
  const L2 = add('loss', { title: 'Road traffic is blocked unnecessarily' })
  const H1 = add('hazard', { title: 'Gate is open while some train is approaching or on the crossing', lossLinks: [L1] })
  const H2 = add('hazard', { title: 'Gate is closed while no train is near the crossing', lossLinks: [L2] })
  add('constraint', { title: 'Gate must be closed whenever some train is approaching or on the crossing', hazards: [H1] })
  add('constraint', { title: 'Gate must open when no train is near the crossing', hazards: [H2] })

  const train = add('entity', { title: 'Train', many: true })
  const crossing = add('entity', { title: 'Crossing' })
  const gate = add('entity', { title: 'Gate', parent: crossing, relation: 'part' })
  const vPos = add('variable', { title: 'Position', parent: train, states: ['far', 'approaching', 'on crossing'], definition: 'Where the train is relative to the crossing.' })
  const rel = add('relationship', { title: 'approaches', ends: relEnds(train, crossing, '*', '1') })
  const vNear = predicateOf(b.project, rel)!.id
  const vGate = add('variable', { title: 'Gate position', parent: gate, states: ['open', 'closed'] })

  const opLower = add('operation', { title: 'Lower', params: [{ name: 'gate', entity: gate }], effects: [{ variable: vGate, state: 'closed', on: 'gate' }] })
  const opRaise = add('operation', { title: 'Raise', params: [{ name: 'gate', entity: gate }], effects: [{ variable: vGate, state: 'open', on: 'gate' }] })

  const ctrl = add('node', { title: 'Gate controller', role: 'controller' })
  const gateNode = add('node', { title: 'Crossing gate', role: 'process', entities: [gate, crossing] })
  const trains = add('node', { title: 'Trains', role: 'external', entities: [train] })
  const lower = add('ca', { title: 'Lower gate', from: ctrl, to: gateNode, actuator: 'Gate motor', affects: [vGate], operation: opLower, duration: 'instantaneous' })
  const raise = add('ca', { title: 'Raise gate', from: ctrl, to: gateNode, actuator: 'Gate motor', affects: [vGate], operation: opRaise, duration: 'instantaneous' })
  const fbTrain = add('feedback', { title: 'Train detection', from: trains, to: ctrl, sensor: 'Track sensors' })
  add('feedback', { title: 'Gate position', from: gateNode, to: ctrl, sensor: 'Gate end switches' })
  const sPos = add('variable', { layer: 'signal', parent: fbTrain, about: vPos, title: 'Train detected', states: ['far', 'approaching', 'on crossing'] })
  void sPos
  add('variable', { layer: 'belief', parent: ctrl, about: vPos, title: 'Train position', states: ['far', 'approaching', 'on crossing', 'unknown'] })
  add('variable', { layer: 'belief', parent: ctrl, about: vNear, title: 'Train approaching', type: 'boolean' })
  add('variable', { layer: 'belief', parent: ctrl, about: vGate, title: 'Gate position', states: ['open', 'closed', 'unknown'] })

  const t = (q: typeof some, ...body: Parameters<typeof and>) => q(q === some ? 'tr1' : 't1', train, and(...body))
  b.set(H1, { when: t(some, is(vGate, 'open'), is(vNear, 'true', 'tr1')) })
  b.set(H2, { when: t(none, is(vGate, 'closed'), is(vNear, 'true', 't1')) })
  const u1 = add('uca', { ca: raise, guide: 'provided', hazards: [H1], when: t(some, is(vPos, 'approaching', 'tr1')), constraint: 'Controller must not raise the gate while some train is approaching' })
  const u2 = add('uca', { ca: raise, guide: 'provided', hazards: [H1], when: t(some, is(vPos, 'on crossing', 'tr1')), constraint: 'Controller must not raise the gate while some train is on the crossing' })
  add('uca', { ca: lower, guide: 'not-provided', hazards: [H1], when: t(some, is(vNear, 'true', 'tr1')), constraint: 'Controller must lower the gate when some train approaches the crossing' })
  add('uca', { ca: lower, guide: 'provided', hazards: [H2], when: t(every, is(vPos, 'far', 't1')), constraint: 'Controller must not lower the gate while every train is far away' })
  add('uca', { ca: raise, guide: 'not-provided', hazards: [H2], when: t(none, is(vNear, 'true', 't1'), is(vGate, 'closed')), constraint: 'Controller must raise the gate when no train approaches the crossing' })

  add('scenario', { uca: u1, cause: 'process-model', element: ctrl, title: 'A second train approaches while the first one is leaving: the controller keeps one "approaching" flag and clears it when the first train has passed' })
  add('scenario', { uca: u2, cause: 'feedback', element: trains, title: 'The track sensor only reports the first train of a convoy, so the controller does not know that another train is still on the crossing' })
  add('requirement', { title: 'The controller shall count approaching trains and keep the gate closed until the count is zero', sources: [u1], type: 'requirement' })
  return b.project
}
