import { addBelief, addSignal } from '../formal'
import { relEnds } from '../create'
import { itemsOfKind } from '../tree'
import { createItem, updateItem } from '../ops'
import { leaves, nameAllInstances } from '../variables'
import { condVars } from '../expr'
import type { Condition, ConditionOp, Id, Kind, Patch, Project, ValueCondition } from '../types'

/**
 * Formalizes the Handbook examples hb-autohold (Auto-Hold, Table C.1) and hb-htv (H-II Transfer Vehicle, Table C.2):
 * a domain model, hazard conditions, UCA contexts as conditions (the Handbook sentence replaced by the generated one,
 * the remainder that cannot be formal kept in `context`) and the controller's beliefs. See docs/formalize-autohold-htv.md.
 * Pure; finds the existing items by title. Returns the project unchanged if it already has variables.
 */
export function formalizeAutoholdHtv(id: 'hb-autohold' | 'hb-htv', p: Project): Project {
  if (itemsOfKind(p, 'variable').length) return p
  return nameAllInstances(id === 'hb-autohold' ? autohold(p) : htv(p))
}

/** Small mutable builder over an existing project. */
function kit(p: Project) {
  let q = p
  const add = <K extends Kind>(kind: K, init?: Patch<K>): Id => { const r = createItem(q, kind, init); q = r.project; return r.id }
  const set = (id: Id, patch: Patch) => { q = updateItem(q, id, patch) }
  const find = (kind: Kind, title: string): Id => {
    const it = itemsOfKind(q, kind).find((x) => x.title === title)
    if (!it) throw new Error(`${kind} "${title}" not found`)
    return it.id
  }
  const enumVar = (parent: Id, title: string, states: string[], extra: Patch<'variable'> = {}) => add('variable', { parent, title, states, ...extra })
  const bool = (parent: Id, title: string, extra: Patch<'variable'> = {}) => add('variable', { parent, title, type: 'boolean', ...extra })
  const range = (parent: Id, title: string, unit: string, min: number | null = 0, max: number | null = null, extra: Patch<'variable'> = {}) =>
    add('variable', { parent, title, type: 'range', unit, min, max, ...extra })
  const internalEnum = (node: Id, title: string, states: string[], definition = '') => add('variable', { layer: 'internal', parent: node, title, states, definition })
  const internalRange = (node: Id, title: string, unit: string, definition = '') => add('variable', { layer: 'internal', parent: node, title, type: 'range', unit, min: 0, max: null, definition })
  const rel = (title: string, from: Id, to: Id, fromCard: string, toCard: string) => { const id = add('relationship', { title, ends: relEnds(from, to, fromCard, toCard) }); return { id, pred: itemsOfKind(q, 'variable').find((v) => v.parent === id)!.id } }
  /** UCA lookup by the Handbook sentence, rewritten with formal conditions; the sentence is kept in the notes. */
  const uca = (text: string, conditions: Condition[], context = '', hazards?: Id[]) => {
    const u = itemsOfKind(q, 'uca').find((x) => x.override === text)
    if (!u) throw new Error(`UCA "${text}" not found`)
    set(u.id, { conditions, context, override: '', notes: `Handbook: ${text}`, ...(hazards ? { hazards } : {}) })
  }
  /** Beliefs of the issuing controller about every world variable its UCA contexts mention. */
  const believe = () => {
    for (const u of itemsOfKind(q, 'uca')) {
      const ca = q.items[u.ca]
      if (ca?.kind !== 'ca') continue
      for (const c of u.conditions.flatMap(leaves)) for (const v of condVars(c)) {
        const w = q.items[v]
        if (w?.kind === 'variable' && w.layer === 'domain') q = addBelief(q, ca.from, v).project
      }
    }
  }
  const belief = (node: Id, world: Id) => itemsOfKind(q, 'variable').find((v) => v.layer === 'belief' && v.parent === node && v.about === world)!.id
  /** Sets the definition of a controller's belief about a world variable (a text note why it has no feedback source); no-op without such a belief. */
  const describeBelief = (node: Id, world: Id, definition: string) => {
    const b = itemsOfKind(q, 'variable').find((v) => v.layer === 'belief' && v.parent === node && v.about === world)
    if (b) set(b.id, { definition })
  }
  const signal = (fb: Id, world: Id) => { q = addSignal(q, fb, world).project }
  const cond = (variable: Id, op: ConditionOp, state: string, extra: Partial<ValueCondition> = {}): ValueCondition => ({ kind: 'value', variable, op, state, ...extra })
  const eq = (v: Id, s: string) => cond(v, '=', s)
  const ne = (v: Id, s: string) => cond(v, '≠', s)
  const cmp = (v: Id, op: ConditionOp, other: Id): Condition => ({ kind: 'var', variable: v, op, other })
  return { get p() { return q }, add, set, find, enumVar, bool, range, internalEnum, internalRange, rel, uca, believe, belief, describeBelief, signal, cond, eq, ne, cmp }
}

function autohold(p: Project): Project {
  const k = kit(p)
  const { add, set, find, enumVar, bool, range, internalEnum, internalRange, rel, uca, eq, ne, cmp, cond } = k

  // --- domain model -----------------------------------------------------------------------------------------
  const vehicle = add('entity', { title: 'Vehicle', description: 'The ego vehicle with Auto-Hold.' })
  const brakes = add('entity', { title: 'Braking system', parent: vehicle })
  for (const title of ['Hold', 'Release', 'Add pressure']) add('operation', { title, params: [{ name: 'brakes', entity: brakes }] })
  const drive = add('entity', { title: 'Propulsion system', parent: vehicle })
  const driver = add('entity', { title: 'Driver' })
  const object = add('entity', { title: 'Nearby object', many: true, description: 'Other vehicles, pedestrians, obstacles around the vehicle.' })
  const area = add('entity', { title: 'Region', many: true, description: 'Areas the vehicle can be in (road, intersection, crossing, lane of oncoming traffic, ...).' })

  const wheelSpeed = range(vehicle, 'Wheel speed', 'km/h', 0, null)
  const motion = enumVar(vehicle, 'Motion', ['stopped', 'moving'], {
    definition: 'The vehicle is moving when its wheel speed exceeds zero.',
    rules: [{ state: 'moving', when: { any: false, of: [cond(wheelSpeed, '>', '0')] } }], otherwise: 'stopped',
  })
  const timeAtRest = range(vehicle, 'Time at rest', 's', 0, null, { definition: 'Time since the vehicle came to rest (a timer; zero while moving).' })
  const slipping = bool(vehicle, 'Slipping', { definition: 'The vehicle moves (rolls) although the brakes hold, e.g. on a steep or slippery slope.' })
  const slipTime = range(vehicle, 'Time slipping', 's', 0, null, { definition: 'Time since the vehicle started slipping (a timer).' })
  const safeDistance = range(vehicle, 'Safe distance', 'm', 0, null, { definition: 'Distance to other objects below which the situation is unsafe; depends on speed and surroundings (not derived here).' })
  const incline = range(vehicle, 'Inclination', 'deg', -30, 30)
  const accel = enumVar(driver, 'Accelerator pedal', ['released', 'applied'])
  const brakePedal = enumVar(driver, 'Brake pedal', ['released', 'applied'])
  const present = bool(driver, 'Present', { definition: 'A driver is in the driver seat.' })
  const brakeHold = enumVar(brakes, 'Brake hold', ['released', 'holding'])
  const pressure = range(brakes, 'Brake pressure', 'bar', 0, null)
  const maxPressure = range(brakes, 'Maximum brake pressure', 'bar', 0, null, { definition: 'Specified limit of the brake system.' })
  const holdTorque = range(brakes, 'Holding torque', 'Nm', 0, null, { definition: 'Torque at the wheels exerted by the held brakes.' })
  const wheelTorque = range(drive, 'Propulsive torque', 'Nm', 0, null, { definition: 'Torque at the wheels from the engine / drive train.' })
  const torqueNeeded = range(vehicle, 'Torque needed to hold', 'Nm', 0, null, { definition: 'Wheel torque needed to keep the vehicle from rolling back; depends on inclination and mass (not derived here).' })
  const dangerous = bool(area, 'Dangerous', { definition: 'Entering this region is unsafe (e.g. crossing, oncoming lane, a drop).' })
  const near = rel('is near', vehicle, object, '1', '*')
  const distance = add('variable', { parent: near.id, title: 'Distance', type: 'range', unit: 'm', min: 0, max: null })
  const locatedIn = rel('is located in', vehicle, area, '1', '*')

  // --- control structure ------------------------------------------------------------------------------------
  const node = { ah: find('node', 'Auto-Hold (AH) Module'), driver: find('node', 'Driver'), vehicle: find('node', 'Physical Vehicle'), env: find('node', 'Environment & Other Drivers') }
  set(node.driver, { entities: [driver] })
  set(node.vehicle, { entities: [vehicle, brakes, drive] })
  set(node.env, { entities: [object, area] })
  const ahState = internalEnum(node.ah, 'AH state', ['disabled', 'standby', 'active'], 'disabled: switched off by the driver; standby: enabled, not holding; active: holding the vehicle.')
  const holdDelay = internalRange(node.ah, 'Required time at rest', 's', 'Time the vehicle must be at rest before AH holds (value TBD).')
  const maxHoldDelay = internalRange(node.ah, 'Maximum time to hold', 's', 'Latest time after the vehicle comes to rest by which AH must hold (value TBD).')
  const maxSlipDelay = internalRange(node.ah, 'Maximum time to add pressure', 's', 'Latest time after slipping starts by which AH must add pressure (value TBD).')

  // --- hazards ----------------------------------------------------------------------------------------------
  const H1 = find('hazard', 'Vehicle does not maintain safe distance from nearby objects')
  const H2 = find('hazard', 'Vehicle enters dangerous area/region')
  set(H1, { variables: [distance, safeDistance], conditions: [cmp(distance, '<', safeDistance)] })
  set(H2, { variables: [dangerous, locatedIn.pred], conditions: [cond(dangerous, '=', 'true', { as: 'ar1' }), cond(locatedIn.pred, '=', 'true', { same: 'ar1' })] })

  // --- UCAs (contexts) --------------------------------------------------------------------------------------
  uca('AH does not provide HOLD when vehicle stops and brake pedal released', [eq(motion, 'stopped'), eq(brakePedal, 'released'), ne(ahState, 'disabled')], 'the vehicle has just stopped')
  uca('AH provides HOLD when driver is applying the accelerator', [eq(accel, 'applied')])
  uca('AH provides HOLD when AH is DISABLED', [eq(ahState, 'disabled')])
  uca('AH provides HOLD when vehicle is moving', [eq(motion, 'moving')])
  uca('AH provides HOLD when driver is not applying brake', [eq(brakePedal, 'released')])
  uca('AH provides HOLD too early before the required time at rest has been met', [eq(motion, 'stopped'), cmp(timeAtRest, '<', holdDelay)])
  uca('AH provides HOLD too late after vehicle stops, begins to roll', [eq(ahState, 'standby'), eq(brakePedal, 'released'), cmp(timeAtRest, '>', maxHoldDelay)], 'the vehicle begins to roll')
  uca('AH does not provide RELEASE when driver applies accelerator pedal', [eq(accel, 'applied'), eq(ahState, 'active')])
  uca('AH provides RELEASE when driver is not applying accelerator', [eq(accel, 'released'), eq(ahState, 'active')])
  uca('AH provides RELEASE too early before there is sufficient wheel torque', [eq(accel, 'applied'), cmp(wheelTorque, '<', torqueNeeded)])
  uca('AH provides RELEASE too late after accelerator applied, engine torque exceeds wheel torque', [eq(accel, 'applied'), cmp(wheelTorque, '>', holdTorque)])
  uca('AH does not provide ADDITIONAL PRESSURE when vehicle is slipping and AH is active', [eq(slipping, 'true'), eq(ahState, 'active')])
  uca('AH provides ADDITIONAL PRESSURE when AH is not active', [ne(ahState, 'active')])
  uca('AH provides ADDITIONAL PRESSURE when brake system specs are exceeded', [cmp(pressure, '>', maxPressure)])
  uca('AH provides ADDITIONAL PRESSURE too late after vehicle is slipping', [eq(slipping, 'true'), eq(ahState, 'active'), cmp(slipTime, '>', maxSlipDelay)])

  // --- signals, beliefs, effects of control actions ---------------------------------------------------------
  const fb = (title: string) => find('feedback', title)
  k.signal(fb('Wheel speed'), wheelSpeed)
  k.signal(fb('Accel pos., PRNDL'), accel)
  k.signal(fb('Driver presence, Inclination'), present)
  k.signal(fb('Driver presence, Inclination'), incline)
  k.believe()
  for (const w of [timeAtRest, slipping, slipTime, brakePedal, holdTorque, wheelTorque, torqueNeeded, pressure, maxPressure])
    k.describeBelief(node.ah, w, 'The Handbook figure shows no feedback for this; AH must obtain or derive it (e.g. internal timer, brake pressure sensor, pedal switch).')
  set(find('ca', 'HOLD command'), { affects: [brakeHold] })
  set(find('ca', 'RELEASE command'), { affects: [brakeHold] })
  set(find('ca', 'ADDITIONAL PRESSURE command'), { affects: [pressure] })
  set(find('ca', 'Enable/Disable AH, Brake pedal on/off'), { affects: [ahState, k.belief(node.ah, brakePedal)] })
  return k.p
}

function htv(p: Project): Project {
  const k = kit(p)
  const { add, set, find, enumVar, bool, range, internalRange, rel, uca, eq, ne, cmp, cond } = k

  // --- domain model -----------------------------------------------------------------------------------------
  const htvE = add('entity', { title: 'HTV', description: 'The autonomous H-II Transfer Vehicle.' })
  const iss = add('entity', { title: 'ISS', description: 'The International Space Station with its robotic arm and crew.' })
  const box = add('entity', { title: 'Capture box', description: 'Region next to the ISS in which the HTV is stopped and captured.' })

  const mode = enumVar(htvE, 'Mode', ['approach', 'hold', 'free drift', 'abort', 'retreat'], { definition: 'Operating mode of the HTV: free drift means deactivated (thrusters off); hold means stopped.' })
  const distance = range(htvE, 'Distance to ISS', 'm', 0, null)
  const timeHold = range(htvE, 'Time in hold', 'min', 0, null, { definition: 'Time since the HTV stopped (a timer).' })
  const timeDrift = range(htvE, 'Time in free drift', 'min', 0, null, { definition: 'Time since the HTV was deactivated (a timer).' })
  const safeSep = range(iss, 'Safe separation', 'm', 0, null, { definition: 'Minimum distance from the ISS; depends on relative speed and trajectory (not derived here).' })
  const emergency = bool(iss, 'Emergency condition', { definition: 'An emergency exists (e.g. HTV fault or off-nominal trajectory) that requires an abort. Not further defined in the Handbook.' })
  const inBox = rel('is in', htvE, box, '1', '1')
  const captured = rel('is captured by', htvE, iss, '1', '1')
  const inPath = rel('is in the abort path of', iss, htvE, '1', '1')

  // --- control structure ------------------------------------------------------------------------------------
  const nHtv = find('node', 'Autonomous H-II Transfer Vehicle (HTV)')
  const nIss = find('node', 'International Space Station (ISS)')
  set(nHtv, { entities: [htvE, box] })
  set(nIss, { entities: [iss] })
  const maxHold = internalRange(nIss, 'Maximum time to command Free Drift (X)', 'min', 'X minutes after the HTV stops (value TBD).')
  const maxDrift = internalRange(nIss, 'Maximum time to capture (X)', 'min', 'X minutes after the HTV is deactivated (value TBD).')

  // --- hazard -----------------------------------------------------------------------------------------------
  const H1 = find('hazard', 'HTV and ISS collide or violate safe separation')
  set(H1, { variables: [distance, safeSep, captured.pred], conditions: [cmp(distance, '<', safeSep), cond(captured.pred, '=', 'false')] })

  // --- UCAs (contexts) --------------------------------------------------------------------------------------
  uca('ISS crew does not provide Abort Cmd when emergency condition exists', [eq(emergency, 'true'), ne(mode, 'abort')])
  uca('ISS crew provides Abort Cmd when HTV is captured', [eq(captured.pred, 'true')])
  uca('ISS crew provides Abort Cmd when ISS is in Abort path', [eq(inPath.pred, 'true')])
  uca('ISS crew provides Abort Cmd too late to avoid collision', [eq(emergency, 'true')], 'too late to avoid collision')
  uca('ISS crew provides Abort Cmd too early before capture is released', [eq(captured.pred, 'true')], 'before the capture is released')
  uca('ISS crew does not provide Free Drift Cmd when HTV is stopped in capture box', [eq(mode, 'hold'), eq(inBox.pred, 'true')])
  uca('ISS crew provides Free Drift Cmd when HTV is approaching ISS', [eq(mode, 'approach')])
  uca('ISS crew provides Free Drift Cmd too late, more than X minutes after HTV stops', [eq(mode, 'hold'), cmp(timeHold, '>', maxHold)])
  uca('ISS crew provides Free Drift Cmd too early before HTV stops', [eq(mode, 'approach')], 'before the HTV stops')
  uca('ISS crew does not perform Capture when HTV is in capture box in free drift', [eq(inBox.pred, 'true'), eq(mode, 'free drift')])
  uca('ISS crew performs Capture when HTV is not in free drift', [ne(mode, 'free drift')])
  uca('ISS crew performs Capture when HTV is aborting', [eq(mode, 'abort')])
  uca('ISS crew performs Capture with excessive/insufficient movement (can impact HTV, cause collision course)', [], 'the movement of the arm is excessive or insufficient (can impact the HTV, cause a collision course)')
  uca('ISS crew performs Capture too late, more than X minutes after HTV deactivated', [eq(mode, 'free drift'), cmp(timeDrift, '>', maxDrift)])
  uca('ISS crew performs Capture too early before HTV deactivated', [ne(mode, 'free drift')], 'before the HTV is deactivated')
  uca('ISS crew continues performing Capture too long after emergency condition exists', [eq(emergency, 'true')], 'the capture continues')

  // --- signals and beliefs ----------------------------------------------------------------------------------
  const fb = find('feedback', 'HTV Mode, HTV Fault Status, Position (visual), Speed (visual)')
  k.signal(fb, mode)
  k.signal(fb, distance)
  k.signal(fb, inBox.pred)
  k.signal(fb, emergency)
  k.believe()
  for (const w of [timeHold, timeDrift, captured.pred, inPath.pred])
    k.describeBelief(nIss, w, 'Not reported by the HTV feedback in the figure; the crew derives it (clock, own operation of the arm, view of the trajectory).')
  set(find('ca', 'Free Drift'), { affects: [mode] })
  set(find('ca', 'Abort'), { affects: [mode] })
  return k.p
}
