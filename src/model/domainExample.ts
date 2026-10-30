import { projectBuilder } from './build'
import type { Project } from './types'

/** Hospital medication management: an example with a large domain model (entity hierarchy, many attributes and relationships) and a small STPA analysis on top. */
export function medicationExampleProject(): Project {
  const b = projectBuilder({
    name: 'Hospital medication management (example)',
    description: 'Ordering, verifying, preparing and infusing medication on a hospital ward. Illustrative example with a large domain model (entities, attributes, relationships); the STPA part is kept short.',
  })
  const { add } = b

  const l1 = add('loss', { title: 'Patient injury or death' })
  const l2 = add('loss', { title: 'Loss of trust in the hospital' })
  const h1 = add('hazard', { title: 'Patient receives a drug that is not appropriate for them', lossLinks: [l1, l2] })
  const h2 = add('hazard', { title: 'Patient receives a wrong dose', lossLinks: [l1] })
  add('constraint', { title: 'A drug must not be administered when the patient is allergic to it', hazards: [h1] })
  add('constraint', { title: 'The delivered dose must match the verified order', hazards: [h2] })

  // --- domain model -------------------------------------------------------------------------
  const person = add('entity', { title: 'Person' })
  const patient = add('entity', { title: 'Patient', parent: person })
  const staff = add('entity', { title: 'Clinical staff', parent: person })
  const nurse = add('entity', { title: 'Nurse', parent: staff, operations: ['Scan wristband', 'Program pump', 'Administer drug'] })
  const physician = add('entity', { title: 'Physician', parent: staff, operations: ['Prescribe', 'Cancel order'] })
  const pharmacist = add('entity', { title: 'Pharmacist', parent: staff, operations: ['Verify order', 'Prepare container'] })

  const order = add('entity', { title: 'Medication order' })
  const drug = add('entity', { title: 'Drug' })
  const container = add('entity', { title: 'Drug container', operations: ['Label', 'Scan barcode'] })
  const record = add('entity', { title: 'Electronic health record', operations: ['Record administration', 'Raise allergy alert'] })
  const library = add('entity', { title: 'Drug library' })

  const equip = add('entity', { title: 'Ward equipment' })
  const pump = add('entity', { title: 'Infusion pump', parent: equip, operations: ['Start infusion', 'Stop infusion', 'Set rate', 'Raise alarm'] })
  const monitor = add('entity', { title: 'Vital signs monitor', parent: equip, operations: ['Measure', 'Raise alarm'] })
  const line = add('entity', { title: 'Infusion line', parent: equip })
  const place = add('entity', { title: 'Ward' })
  const bed = add('entity', { title: 'Bed', parent: place })

  // attributes (world variables)
  add('variable', { title: 'Condition', parent: patient, states: ['stable', 'deteriorating', 'critical'] })
  add('variable', { title: 'Allergic to ordered drug', parent: patient, type: 'boolean' })
  add('variable', { title: 'Heart rate', parent: patient, type: 'range', min: 0, max: 250, unit: 'bpm' })
  add('variable', { title: 'Weight', parent: patient, type: 'range', min: 0, max: 300, unit: 'kg' })
  add('variable', { title: 'On duty', parent: staff, type: 'boolean' })
  add('variable', { title: 'Fatigue', parent: nurse, states: ['rested', 'tired', 'exhausted'] })
  add('variable', { title: 'Workload', parent: nurse, states: ['low', 'normal', 'high'] })
  add('variable', { title: 'Status', parent: order, states: ['draft', 'verified', 'active', 'completed', 'cancelled'] })
  add('variable', { title: 'Prescribed rate', parent: order, type: 'range', min: 0, max: 1000, unit: 'ml/h' })
  add('variable', { title: 'Prescribed dose', parent: order, type: 'range', min: 0, max: 5000, unit: 'mg' })
  add('variable', { title: 'Class', parent: drug, states: ['opioid', 'antibiotic', 'anticoagulant', 'electrolyte', 'other'] })
  add('variable', { title: 'High alert', parent: drug, type: 'boolean' })
  add('variable', { title: 'Concentration', parent: drug, type: 'range', min: 0, max: 100, unit: 'mg/ml' })
  add('variable', { title: 'Content', parent: container, states: ['as labelled', 'mislabelled', 'contaminated'] })
  add('variable', { title: 'Volume', parent: container, type: 'range', min: 0, max: 1000, unit: 'ml' })
  add('variable', { title: 'Expired', parent: container, type: 'boolean' })
  add('variable', { title: 'Allergy list complete', parent: record, type: 'boolean' })
  add('variable', { title: 'Order synchronised', parent: record, type: 'boolean' })
  add('variable', { title: 'Version', parent: library, states: ['current', 'outdated'] })
  add('variable', { title: 'Infusion state', parent: pump, states: ['running', 'stopped', 'paused'] })
  add('variable', { title: 'Programmed rate', parent: pump, type: 'range', min: 0, max: 1000, unit: 'ml/h' })
  add('variable', { title: 'Alarm', parent: pump, states: ['none', 'active', 'silenced'] })
  add('variable', { title: 'Battery', parent: pump, type: 'range', min: 0, max: 100, unit: '%' })
  add('variable', { title: 'Alarm', parent: monitor, states: ['none', 'active', 'silenced'] })
  add('variable', { title: 'Sensor attached', parent: monitor, type: 'boolean' })
  add('variable', { title: 'Occlusion', parent: line, states: ['clear', 'occluded'] })
  add('variable', { title: 'Air in line', parent: line, type: 'boolean' })
  add('variable', { title: 'Occupied', parent: bed, type: 'boolean' })
  add('variable', { title: 'Staffing level', parent: place, states: ['adequate', 'short'] })

  // relationships
  const rel = (title: string, from: string, to: string, fromCard = '1', toCard = '1') => add('relationship', { title, from, to, fromCard, toCard })
  rel('prescribes', physician, order, '1', '*')
  rel('is for', order, patient, '*', '1')
  rel('specifies', order, drug, '*', '1')
  rel('verifies', pharmacist, order, '1', '*')
  rel('prepares', pharmacist, container, '1', '*')
  rel('contains', container, drug, '*', '1')
  rel('is assigned to', nurse, patient, '1..*', '*')
  rel('programs', nurse, pump, '1', '*')
  rel('hangs', pump, container, '1', '0..1')
  rel('delivers through', pump, line, '1', '1')
  rel('is connected to', line, patient, '0..1', '1')
  rel('monitors', monitor, patient, '0..1', '1')
  rel('is lying in', patient, bed, '0..1', '0..1')
  rel('is part of', bed, place, '1..*', '1')
  rel('works on', staff, place, '1..*', '*')
  rel('is stored in', order, record, '*', '1')
  rel('constrains', library, pump, '1', '*')
  rel('lists allergies of', record, patient, '1', '1')
  rel('supervises', physician, nurse, '1', '*')

  // --- small control structure ----------------------------------------------------------------
  const cNurse = add('node', { title: 'Nurse', role: 'controller', entities: [nurse] })
  const cPump = add('node', { title: 'Infusion pump controller', role: 'controller', entities: [pump] })
  const proc = add('node', { title: 'Infusion', role: 'process', entities: [line, patient] })
  add('ca', { title: 'Program rate', from: cNurse, to: cPump })
  add('ca', { title: 'Start infusion', from: cPump, to: proc, actuator: 'Pump motor' })
  add('feedback', { title: 'Pump status', from: cPump, to: cNurse })
  add('feedback', { title: 'Patient status', from: proc, to: cNurse, sensor: 'Vital signs monitor' })
  return b.project
}
