import { addBelief, predicateOf } from '../formal'
import { relEnds } from '../create'
import { createItem, updateItem } from '../ops'
import { itemsOfKind } from '../tree'
import { mention } from '../refs'
import { anyOf } from '../variables'
import { condVars } from '../expr'
import type { Condition, ConditionOp, Id, Patch, Project, ValueCondition } from '../types'

/**
 * Formalization of the Handbook examples `hb-crew` (Table C.3) and `hb-bscu` (Table C.4): domain model, hazard conditions,
 * UCA contexts (conditions + the free-text remainder in `context`) and the controller's beliefs. Pure; items are found by title / wording.
 * Gaps (what could not be said) are listed in docs/formalize-crew-bscu.md.
 */
export function formalizeCrewBscu(id: 'hb-crew' | 'hb-bscu', p: Project): Project {
  let q = p
  const add = <K extends 'entity' | 'relationship' | 'variable'>(kind: K, init: Patch<K>): Id => { const r = createItem(q, kind, init); q = r.project; return r.id }
  const set = (item: Id, patch: Patch) => { q = updateItem(q, item, patch) }

  // ---- domain model -------------------------------------------------------------------------------------------------
  const aircraft = add('entity', { title: 'Aircraft', description: 'The aircraft being braked (one instance).' })
  const wbs = add('entity', { title: 'Wheel braking system', parent: aircraft, description: 'WBS: BSCU, autobrake, anti-skid and the alternate (manual) braking path.' })
  const wheel = add('entity', { title: 'Wheel', parent: aircraft, many: true, description: 'The braked wheels (main gear), several instances.' })
  const runway = add('entity', { title: 'Runway', description: 'The runway or taxiway the aircraft is on (the one in use).' })
  const object = add('entity', { title: 'Object', many: true, description: 'Other objects on the ground: aircraft, vehicles, buildings, people.' })

  const en = (title: string, parent: Id, states: string[], definition = '') => add('variable', { title, parent, states, definition })
  const bool = (title: string, parent: Id, definition = '') => add('variable', { title, parent, type: 'boolean', definition })
  const phase = en('Flight phase', aircraft, ['approach', 'landing roll', 'taxi', 'lined up for takeoff', 'takeoff roll', 'rejected takeoff', 'climb-out'],
    'approach: airborne before touchdown; landing roll: from touchdown until safe taxi speed; takeoff roll: normal takeoff run; rejected takeoff (RTO): takeoff aborted; climb-out: airborne after takeoff. States, not events: "touchdown", "RTO requested" are transitions between them.')
  const speed = add('variable', { title: 'Ground speed', parent: aircraft, type: 'range', min: 0, max: null, unit: 'kt' })
  const accel = add('variable', { title: 'Acceleration', parent: aircraft, type: 'range', min: null, max: null, unit: 'm/s²', definition: 'Longitudinal acceleration (negative = deceleration).' })
  const v1 = bool('V1 passed', aircraft, 'Ground speed has reached V1, the takeoff decision speed.')
  const taxiSpeed = bool('Safe taxi speed reached', aircraft, 'Ground speed is at or below the safe taxi speed (TBD: no value in the Handbook).')
  const thrust = en('Thrust mode', aircraft, ['idle', 'normal', 'TOGA'], 'TOGA: take-off / go-around thrust.')
  const location = en('Location', aircraft, ['airborne', 'runway', 'active taxiway', 'clear of runway and taxiway'])
  const gear = en('Landing gear', aircraft, ['extended', 'retracting', 'retracted'])
  const decelOk = bool('Deceleration sufficient', aircraft, 'Deceleration suffices to stop the aircraft before it comes too close to other objects, given speed, distance, weight and runway condition. Derived quantity; no thresholds.')
  const accelOk = bool('Acceleration sufficient', aircraft, 'Acceleration suffices to reach V1 / rotation speed within the available runway.')
  const brakeSym = bool('Braking symmetric', aircraft, 'Left and right brake forces are equal within tolerance.')
  const accSym = bool('Acceleration symmetric', aircraft, 'No yawing moment from asymmetric thrust or braking drag.')
  const force = add('variable', { title: 'Brake force', parent: wheel, type: 'range', min: 0, max: 100, unit: '%' })
  const rotating = bool('Wheel rotating', wheel)
  const bscu = en('BSCU power', wbs, ['on', 'off'])
  const behaviour = en('WBS behavior', wbs, ['normal', 'abnormal'], 'Abnormal: e.g. loss of braking, unexpected braking, failure indications.')
  const setting = en('Autobrake setting', wbs, ['disarmed', 'low', 'medium', 'high', 'maximum'], 'Armed = any setting except disarmed.')
  const abNeeded = bool('Autobrake needed', wbs, 'Autobrake is, or is about to be, used: selected for landing (spoilers about to deploy) or for a takeoff that may be rejected.')
  const asNeeded = bool('Anti-skid needed', wbs, 'Anti-skid is, or will be, needed: slippery runway or high braking demand.')
  const nbNeeded = bool('Normal braking mode needed', wbs)
  const surface = en('Surface condition', runway, ['dry', 'wet', 'contaminated'])
  // refinements: derived "needed" abstractions over lower-level world variables
  const bscuNeeded = add('variable', { title: 'BSCU function needed', parent: wbs, type: 'boolean', definition: 'Autobrake or Anti-skid behavior is needed.',
    rules: [{ state: 'true', when: anyOf(c(abNeeded, 'true'), c(asNeeded, 'true')) }], otherwise: 'false' })
  const brakingNeeded = add('variable', { title: 'Braking function needed', parent: wbs, type: 'boolean', definition: 'Normal braking mode, Autobrake or Anti-skid is to be used.',
    rules: [{ state: 'true', when: anyOf(c(nbNeeded, 'true'), c(abNeeded, 'true'), c(asNeeded, 'true')) }], otherwise: 'false' })
  set(brakeSym, { definition: `Left and right brake forces (${mention(force)}) are equal within tolerance. Abstraction; two wheels' values cannot be compared in a condition.` })

  const tooClose = add('relationship', { title: 'is too close to', ends: relEnds(aircraft, object, '1', '*') })
  const collide = add('relationship', { title: 'would collide with', ends: relEnds(aircraft, object, '1', '*') })
  const closeV = predicateOf(q, tooClose)!.id
  const collideV = predicateOf(q, collide)!.id
  set(closeV, { definition: 'Clearance to the object is below the minimum separation (TBD).' })
  set(collideV, { definition: 'The aircraft would reach the object if braking stayed as it is.' })

  // ---- conditions ---------------------------------------------------------------------------------------------------
  const decel = ['landing roll', 'rejected takeoff', 'taxi']
  const takeoff = ['lined up for takeoff', 'takeoff roll']
  const words = (text: string): Condition => ({ kind: 'text', op: '=', text })
  const hazardConds: Record<string, Condition[]> = {
    'Aircraft comes too close to other objects on the ground': [c(closeV, 'true', '=', { names: [null, { declare: 'o1' }] })],
    'Deceleration is insufficient upon landing, rejected takeoff, or during taxiing': [inn(phase, ...decel), c(decelOk, 'false')],
    'Asymmetric deceleration maneuvers aircraft toward other objects': [c(force, '0', '>', { names: [{ declare: 'w1' }] }), c(brakeSym, 'false')],
    'Deceleration occurs after V1 point during takeoff': [c(v1, 'true'), inn(phase, 'takeoff roll', 'rejected takeoff'), c(force, '0', '>', { names: [{ declare: 'w1' }] })],
    'Excessive acceleration provided while taxiing': [c(phase, 'taxi'), words(`${mention(accel)} exceeds the limit for taxiing (TBD)`)],
    'Asymmetric acceleration maneuvers aircraft toward other objects': [c(accSym, 'false'), inn(phase, 'taxi', 'takeoff roll')],
    'Acceleration is insufficient during takeoff': [c(phase, 'takeoff roll'), c(accelOk, 'false')],
  }

  // key: a distinctive part of the Handbook wording; value: conditions; the rest of the wording goes to `context`
  const crew: [string, Condition[], string][] = [
    ['does not provide manual braking during landing', [inn(phase, ...decel), c(decelOk, 'false')], 'Autobrake is not providing braking or is providing insufficient braking'],
    ['insufficient pedal pressure', [inn(phase, ...decel)], 'the pedal pressure is insufficient (TBD)'],
    ['excessive pedal pressure', [c(phase, 'landing roll')], 'the pedal pressure is excessive'],
    ['during normal takeoff', [c(phase, 'takeoff roll')], ''],
    ['before touchdown', [c(phase, 'approach')], ''],
    ['manual braking too late', [inn(phase, ...decel), c(collideV, 'true', '=', { names: [null, { declare: 'o1' }] })], 'it is already later than TBD to avoid the collision'],
    ['before safe taxi speed', [c(taxiSpeed, 'false'), inn(phase, 'landing roll', 'rejected takeoff')], ''],
    ['manual braking too long', [c(speed, '0'), inn(location, 'runway', 'active taxiway')], ''],
    ['arm Autobrake before landing', [c(phase, 'approach'), c(setting, 'disarmed')], ''],
    ['arm Autobrake prior to takeoff', [inn(phase, 'taxi', 'lined up for takeoff'), c(setting, 'disarmed')], ''],
    ['to maximum level during takeoff', [inn(phase, ...takeoff)], 'the level armed is below maximum'],
    ['too high of a deceleration rate', [c(phase, 'approach'), inn(surface, 'wet', 'contaminated')], 'the deceleration rate armed is too high for the runway condition'],
    ['arm command too late', [c(phase, 'approach'), c(setting, 'disarmed')], 'less than TBD seconds remain before touchdown'],
    ['disarm Autobrake during TOGA', [c(thrust, 'TOGA'), c(setting, 'disarmed', '≠')], ''],
    ['disarms Autobrake during landing or RTO', [inn(phase, 'landing roll', 'rejected takeoff'), c(setting, 'disarmed', '≠')], ''],
    ['disarms Autobrake more than TBD', [c(setting, 'disarmed', '≠')], 'more than TBD seconds have passed since (a) the descent rate exceeded TBD fps, (b) visibility dropped below TBD ft, (c) etc.'],
    ['does not power off BSCU in the event', [c(bscu, 'on'), c(behaviour, 'abnormal')], ''],
    ['when Autobraking is needed and WBS', [c(bscu, 'on'), c(abNeeded, 'true'), c(behaviour, 'normal')], ''],
    ['when Autobrake is needed (or about', [c(bscu, 'on'), c(abNeeded, 'true'), c(behaviour, 'normal')], ''],
    ['Anti-Skid functionality is needed', [c(bscu, 'on'), c(asNeeded, 'true'), c(behaviour, 'normal')], ''],
    ['powers off BSCU too late', [c(bscu, 'on'), c(behaviour, 'abnormal')], 'more than TBD seconds have passed since the abnormal behavior started'],
    ['powers off BSCU too early', [c(bscu, 'on'), c(bscuNeeded, 'true')], 'Autobrake or Anti-Skid behavior is not yet completed'],
    ['does not power on BSCU', [c(bscu, 'off'), c(brakingNeeded, 'true'), c(behaviour, 'normal')], ''],
    ['powers on BSCU too late', [c(bscu, 'off'), c(brakingNeeded, 'true'), c(behaviour, 'normal')], 'more than TBD seconds have passed since the function was needed'],
  ]
  const bs: [string, Condition[], string][] = [
    ['during RTO to V1', [c(phase, 'rejected takeoff'), c(v1, 'false')], ''],
    ['during landing roll when BSCU is armed', [c(phase, 'landing roll'), c(setting, 'disarmed', '≠')], ''],
    ['after takeoff', [c(phase, 'climb-out'), c(gear, 'retracted', '≠'), c(rotating, 'true', '=', { names: [{ declare: 'w1' }] })], ''],
    ['excessive Braking commands', [c(phase, 'landing roll')], 'the braking level is excessive (TBD)'],
    ['inappropriately during takeoff', [c(phase, 'takeoff roll')], ''],
    ['insufficient level', [c(phase, 'landing roll')], 'the braking level is insufficient (TBD)'],
    ['Braking command before touchdown', [c(phase, 'approach')], ''],
    ['seconds after touchdown', [c(phase, 'landing roll'), c(setting, 'disarmed', '≠')], 'more than TBD seconds have passed since touchdown'],
    ['before wheels have left ground', [c(phase, 'takeoff roll')], 'RTO has not been requested'],
    ['seconds after V1 during rejected takeoff', [c(phase, 'rejected takeoff'), c(v1, 'true')], 'more than TBD seconds have passed since V1'],
    ['before TBD taxi speed attained', [c(phase, 'landing roll'), c(taxiSpeed, 'false')], ''],
    ['too long (more than TBD seconds)', [c(phase, 'landing roll'), c(speed, '0'), c(location, 'runway')], 'the braking has lasted more than TBD seconds'],
    ['tire lock until', [c(phase, 'approach'), c(force, '0', '>', { names: [{ declare: 'w1' }] })], 'the braking continues until less than TBD seconds before touchdown'],
  ]

  // ---- apply --------------------------------------------------------------------------------------------------------
  for (const h of itemsOfKind(q, 'hazard')) {
    const conds = hazardConds[h.title]
    if (!conds) continue
    set(h.id, { conditions: conds, variables: [...new Set(conds.flatMap(condVars))] })
  }
  const ctrl = itemsOfKind(q, 'node').find((n) => n.role === 'controller')!.id
  const table = id === 'hb-crew' ? crew : bs
  const affects: Record<string, Id[]> = { 'Manual braking via brake pedals': [force], 'Arm autobrake': [setting], 'Disarm autobrake': [setting], 'Power off BSCU': [bscu], 'Power on BSCU': [bscu], 'Brake command': [force] }
  for (const ca of itemsOfKind(q, 'ca')) if (affects[ca.title]) set(ca.id, { affects: affects[ca.title] })
  for (const u of itemsOfKind(q, 'uca')) {
    const row = table.find(([key]) => u.override.includes(key))
    if (!row) continue
    const [, conds, context] = row
    set(u.id, { conditions: conds, context, override: '', description: `Handbook wording: ${u.override}` })
    for (const x of conds) for (const v of condVars(x)) q = addBelief(q, ctrl, v).project
  }
  return q
}

function c(variable: Id, state: string, op: ConditionOp = '=', extra: Partial<ValueCondition> = {}): ValueCondition { return { kind: 'value', variable, op, state, ...extra } }
const inn = (variable: Id, ...set: string[]): Condition => ({ kind: 'value', variable, op: 'in', state: '', set })
