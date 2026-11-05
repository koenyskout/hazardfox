import { predicateOf } from '../formal'
import { createItem, updateItem } from '../ops'
import type { Condition, ConditionOp, Id, Patch, Project, VarCondition } from '../types'
import { anyOf, nameAllInstances } from '../variables'

/**
 * Formalization experiments for the hazard-only Handbook examples (hb-nuclear, hb-aircraft, hb-radiation, hb-military, hb-automotive):
 * a domain model (entities, relationships, typed world variables, `many` where several instances matter) and, for each leaf hazard, `conditions`.
 * Where the model is too weak the closest expressible condition is used; the gaps are listed in docs/formalize-hazards.md.
 */
class Ctx {
  constructor(public p: Project) {}
  private add<K extends 'entity' | 'relationship' | 'variable'>(kind: K, init: Patch<K>): Id { const r = createItem(this.p, kind, init); this.p = r.project; return r.id }
  entity = (title: string, many = false, description = ''): Id => this.add('entity', { title, description, ...(many ? { many } : {}) })
  rel = (from: Id, title: string, to: Id, fromCard = '*', toCard = '*'): Id => this.add('relationship', { from, title, to, fromCard, toCard })
  /** The boolean predicate R(from, to) of a relationship. */
  pred = (rel: Id): Id => predicateOf(this.p, rel)!.id
  states = (parent: Id, title: string, states: string[], definition = ''): Id => this.add('variable', { parent, title, states, definition })
  bool = (parent: Id, title: string, definition = ''): Id => this.add('variable', { parent, title, type: 'boolean', definition })
  range = (parent: Id, title: string, min: number | null, max: number | null, unit: string, definition = ''): Id => this.add('variable', { parent, title, type: 'range', min, max, unit, definition })
  /** Defines a (refined) enum variable by rules over lower-level world variables: the first state of `rules` whose condition holds, else `otherwise`. */
  refined = (v: Id, rules: [state: string, when: ReturnType<typeof anyOf>][], otherwise: string) => { this.p = updateItem(this.p, v, { rules: rules.map(([state, when]) => ({ state, when })), otherwise }) }
  hazard = (title: string): Id => {
    const h = Object.values(this.p.items).find((i) => i.kind === 'hazard' && i.title.startsWith(title))
    if (!h) throw new Error(`no hazard "${title}"`)
    return h.id
  }
  conditions = (title: string, ...cs: Condition[]) => { this.p = updateItem(this.p, this.hazard(title), { conditions: cs }) }
}

export const is = (variable: Id, state: string, extra: Partial<Condition> = {}): Condition => ({ variable, op: '=', state, ...extra })
export const isNot = (variable: Id, state: string, extra: Partial<Condition> = {}): Condition => ({ variable, op: '≠', state, ...extra })
export const isIn = (variable: Id, set: string[], extra: Partial<Condition> = {}): Condition => ({ variable, op: 'in', state: '', set, ...extra })
export const notIn = (variable: Id, set: string[], extra: Partial<Condition> = {}): Condition => ({ variable, op: 'not in', state: '', set, ...extra })
export const above = (variable: Id, n: number, extra: Partial<Condition> = {}): Condition => ({ variable, op: '>', state: String(n), ...extra })
export const below = (variable: Id, n: number, extra: Partial<Condition> = {}): Condition => ({ variable, op: '<', state: String(n), ...extra })
export const outside = (variable: Id, lo: number, hi: number, extra: Partial<Condition> = {}): Condition => ({ variable, op: 'not between', state: String(lo), to: String(hi), ...extra })
/** `variable op other`, both read at the instances named in `extra` (`as`/`same`, `oSame`). */
export const cmp = (variable: Id, op: ConditionOp, other: Id, extra: Partial<VarCondition> = {}): VarCondition => ({ variable, op, other, ...extra })

const REGIONS = ['head', 'neck', 'thorax', 'abdomen', 'pelvis', 'limbs']

function nuclear(c: Ctx) {
  const reactor = c.entity('Reactor core')
  const material = c.entity('Radioactive material', true)
  const equipment = c.entity('Plant equipment', true)
  const temp = c.range(reactor, 'temperature', 0, 3000, '°C')
  const tmax = c.range(reactor, 'maximum safe temperature', 0, 3000, '°C', 'Limit above which fuel or core structures are damaged.')
  const state = c.states(reactor, 'operating state', ['operating', 'shut down'])
  const needed = c.bool(reactor, 'shutdown required', 'A condition of the plant (safety demand) requires the reactor to be shut down.')
  const where = c.states(material, 'location', ['inside containment', 'outside containment'])
  const util = c.range(equipment, 'utilization', 0, 300, '%', 'Load as a percentage of the rated limit (temperature, pressure, flow, speed, ...).')
  c.conditions('Release', is(where, 'outside containment', { quant: 'some' }))
  c.conditions('Reactor temperature', cmp(temp, '>', tmax))
  c.conditions('Equipment operated', above(util, 100))
  c.conditions('Reactor shut down', is(state, 'shut down'), is(needed, 'false'))
}

function aircraft(c: Ctx) {
  const ac = c.entity('Aircraft', true)
  const person = c.entity('Person', true)
  const terrain = c.entity('Terrain or obstacle', true)
  const area = c.entity('Movement area', true, 'Designated taxiway, runway or apron.')
  const obj = c.entity('Ground object', true, 'Other aircraft, vehicles, buildings, people on the ground.')
  const near = c.rel(ac, 'flies near', ac)
  const hsep = c.range(near, 'horizontal separation', 0, null, 'NM')
  const vsep = c.range(near, 'vertical separation', 0, null, 'ft')
  const hreq = c.range(near, 'required horizontal separation', 0, null, 'NM', 'Minimum standard for the airspace and aircraft pair.')
  const vreq = c.range(near, 'required vertical separation', 0, null, 'ft')
  const over = c.rel(ac, 'flies over', terrain)
  const clearance = c.range(over, 'clearance', 0, null, 'ft')
  const minClear = c.range(over, 'minimum safe clearance', 0, null, 'ft')
  const control = c.states(ac, 'control', ['controlled', 'lost'], 'Aircraft follows the intended trajectory within its flight envelope.')
  const phase = c.states(ac, 'flight phase', ['ground', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing'])
  const load = c.range(ac, 'structural load', 0, 300, '%', 'Percentage of the design limit load.')
  const fire = c.bool(ac, 'fire in airframe')
  const damage = c.bool(ac, 'structural damage')
  const integrity = c.states(ac, 'airframe integrity', ['intact', 'lost'])
  c.refined(integrity, [['lost', anyOf(above(load, 100), is(fire, 'true'), is(damage, 'true'))]], 'intact')
  const alt = c.range(ac, 'cabin pressure altitude', 0, 50000, 'ft')
  const smoke = c.bool(ac, 'smoke or toxic fumes in cabin')
  const ctemp = c.range(ac, 'cabin temperature', -50, 100, '°C')
  const cabin = c.states(ac, 'cabin air', ['safe', 'harmful'])
  c.refined(cabin, [['harmful', anyOf(above(alt, 10000), is(smoke, 'true'), outside(ctemp, 5, 40))]], 'safe')
  const aboard = c.rel(person, 'is aboard', ac, '*', '1')
  const onArea = c.rel(area, 'carries', ac)
  const tooClose = c.rel(ac, 'is close to', obj)
  const dist = c.range(tooClose, 'distance', 0, null, 'm')
  const minDist = c.range(tooClose, 'minimum safe distance', 0, null, 'm', 'Depends on aircraft size and the object (wingspan, speed, ...).')
  c.conditions('Aircraft violate',
    is(c.pred(near), 'true', { quant: 'some', as: 'ac1', as2: 'ac2' }),
    cmp(hsep, '<', hreq, { same: 'ac1', same2: 'ac2', oSame: 'ac1', oSame2: 'ac2' }),
    cmp(vsep, '<', vreq, { same: 'ac1', same2: 'ac2', oSame: 'ac1', oSame2: 'ac2' }))
  c.conditions('Controlled flight',
    is(c.pred(over), 'true', { quant: 'some', as: 'ac3', as2: 'te1' }),
    cmp(clearance, '<', minClear, { same: 'ac3', same2: 'te1', oSame: 'ac3', oSame2: 'te1' }),
    is(control, 'controlled', { same: 'ac3' }),
    notIn(phase, ['ground', 'landing'], { same: 'ac3' }))
  c.conditions('Loss of aircraft control', isNot(phase, 'ground', { quant: 'some', as: 'ac4' }), is(control, 'lost', { same: 'ac4' }))
  c.conditions('Aircraft airframe', is(integrity, 'lost'))
  c.conditions('Aircraft environment',
    is(c.pred(aboard), 'true', { quant: 'some', as: 'pe1', as2: 'ac5' }),
    is(cabin, 'harmful', { same: 'ac5' }))
  c.conditions('Aircraft departs',
    is(phase, 'ground', { quant: 'some', as: 'ac6' }),
    is(c.pred(onArea), 'true', { quant: 'none', same2: 'ac6' }))
  c.conditions('Aircraft comes too close',
    is(phase, 'ground', { quant: 'some', as: 'ac7' }),
    is(c.pred(tooClose), 'true', { same: 'ac7', as2: 'ob1' }),
    cmp(dist, '<', minDist, { same: 'ac7', same2: 'ob1', oSame: 'ac7', oSame2: 'ob1' }))
}

function radiation(c: Ctx) {
  const beam = c.entity('Radiation beam')
  const patient = c.entity('Patient', true)
  const nonpatient = c.entity('Nonpatient', true, 'Staff, visitors, other patients.')
  const equipment = c.entity('Treatment equipment', true)
  const person = c.entity('Person', true, 'Patient or nonpatient.')
  const mover = c.entity('Moving equipment part', true, 'Gantry, couch, collimator, ...')
  const irradiates = c.rel(beam, 'irradiates', patient, '1', '*')
  const dose = c.range(patient, 'delivered dose', 0, 100, 'Gy')
  const rx = c.range(patient, 'prescribed dose', 0, 100, 'Gy')
  const site = c.states(patient, 'irradiated site', REGIONS)
  const target = c.states(patient, 'target site', REGIONS, 'Body region named in the treatment plan.')
  const scheduled = c.bool(patient, 'is the scheduled patient', 'The patient the current treatment plan was made for.')
  const exposes = c.rel(beam, 'irradiates', nonpatient, '1', '*')
  const stress = c.range(equipment, 'utilization', 0, 300, '%', 'Load as a percentage of the rated limit.')
  const approach = c.rel(mover, 'is near', person)
  const gap = c.range(approach, 'distance', 0, null, 'cm')
  const minGap = c.range(approach, 'minimum safe distance', 0, null, 'cm')
  const motion = c.states(mover, 'motion', ['stationary', 'moving'])
  const pa = (extra: Partial<Condition> = {}) => ({ same: 'pa1', ...extra })
  const sameDose = (op: '=' | '≠') => cmp(dose, op, rx, pa({ oSame: 'pa1' }))
  const sameSite = (op: '=' | '≠') => cmp(site, op, target, pa({ oSame: 'pa1' }))
  const irradiated = is(c.pred(irradiates), 'true', { quant: 'some', as: 'pa1' })
  c.conditions('Right patient, right dose', irradiated, is(scheduled, 'true', pa()), sameDose('='), sameSite('≠'))
  c.conditions('Right patient, wrong dose, right', irradiated, is(scheduled, 'true', pa()), sameDose('≠'), sameSite('='))
  c.conditions('Right patient, wrong dose, wrong', irradiated, is(scheduled, 'true', pa()), sameDose('≠'), sameSite('≠'))
  c.conditions('Wrong patient', irradiated, is(scheduled, 'false', pa()))
  c.conditions('A nonpatient', is(c.pred(exposes), 'true', { quant: 'some', as: 'np1' }))
  c.conditions('Equipment is subject', above(stress, 100))
  c.conditions('Persons are subjected',
    is(motion, 'moving', { quant: 'some', as: 'mp1' }),
    is(c.pred(approach), 'true', { same: 'mp1', as2: 'pr1' }),
    cmp(gap, '<', minGap, { same: 'mp1', same2: 'pr1', oSame: 'mp1', oSame2: 'pr1' }))
}

function military(c: Ctx) {
  const ac = c.entity('Own aircraft')
  const obj = c.entity('Object', true, 'Fixed or moving: terrain, buildings, other aircraft, vehicles.')
  const ord = c.entity('Ordnance', true, 'Weapons and stores carried by the aircraft.')
  const asset = c.entity('Protected asset', true, 'Friendly forces, civilians and protected property.')
  const near = c.rel(ac, 'is near', obj, '1', '*')
  const sep = c.range(near, 'separation', 0, null, 'm')
  const minSep = c.range(near, 'minimum separation', 0, null, 'm', 'Depends on the object type and the flight rules.')
  const control = c.states(ac, 'control', ['controlled', 'lost'])
  const load = c.range(ac, 'structural load', 0, 300, '%', 'Percentage of the design limit load.')
  const fire = c.bool(ac, 'fire in airframe')
  const damage = c.bool(ac, 'structural damage')
  const integrity = c.states(ac, 'airframe integrity', ['intact', 'lost'])
  c.refined(integrity, [['lost', anyOf(above(load, 100), is(fire, 'true'), is(damage, 'true'))]], 'intact')
  const detCmd = c.states(ord, 'detonation command', ['not commanded', 'commanded'])
  const det = c.states(ord, 'detonation', ['intact', 'detonated'])
  const launchCmd = c.states(ord, 'launch command', ['not commanded', 'commanded'])
  const launch = c.states(ord, 'launch state', ['on aircraft', 'launched'])
  const status = c.states(asset, 'status', ['friendly forces', 'civilians', 'civilian property', 'legitimate target'])
  const lethal = c.rel(ord, 'detonates within lethal radius of', asset)
  c.conditions('Violation of minimum', is(c.pred(near), 'true', { quant: 'some', as: 'ob1' }), cmp(sep, '<', minSep, { same: 'ob1', oSame: 'ob1' }))
  c.conditions('Inability to control', is(control, 'lost'))
  c.conditions('Loss of airframe', is(integrity, 'lost'))
  c.conditions('Uncommanded detonation', is(det, 'detonated', { quant: 'some', as: 'or1' }), is(detCmd, 'not commanded', { same: 'or1' }))
  c.conditions('Uncommanded launch', is(launch, 'launched', { quant: 'some', as: 'or2' }), is(launchCmd, 'not commanded', { same: 'or2' }))
  c.conditions('Collateral damage',
    is(c.pred(lethal), 'true', { quant: 'some', as: 'or3', as2: 'pa1' }),
    isNot(status, 'legitimate target', { same: 'pa1' }),
    is(det, 'detonated', { same: 'or3' }))
  c.conditions('Non-deployment', is(launchCmd, 'commanded', { quant: 'some', as: 'or4' }), is(launch, 'on aircraft', { same: 'or4' }))
}

function automotive(c: Ctx) {
  const veh = c.entity('Vehicle')
  const obj = c.entity('Nearby object', true, 'Other vehicles, pedestrians, cyclists, fixed objects.')
  const region = c.entity('Region', true, 'Areas of the road environment.')
  const occupant = c.entity('Occupant', true)
  const door = c.entity('Door', true)
  const near = c.rel(veh, 'is near', obj, '1', '*')
  const dist = c.range(near, 'distance', 0, null, 'm')
  const safe = c.range(near, 'safe distance', 0, null, 'm', 'Depends on speed, relative speed, road friction and the type of object.')
  const inside = c.rel(veh, 'is in', region, '1', '*')
  const danger = c.states(region, 'danger', ['safe', 'dangerous'], 'Opposing lane, railway crossing, pedestrian zone, construction site, ...')
  const speed = c.range(veh, 'speed', 0, 100, 'm/s')
  const safeSpeed = c.range(veh, 'maximum safe speed', 0, 100, 'm/s', 'Depends on friction, curvature, visibility, traffic.')
  const lat = c.range(veh, 'lateral acceleration', 0, 20, 'm/s²')
  const latMax = c.range(veh, 'maximum safe lateral acceleration', 0, 20, 'm/s²')
  const lon = c.range(veh, 'longitudinal acceleration', 0, 20, 'm/s²')
  const lonMax = c.range(veh, 'maximum safe longitudinal acceleration', 0, 20, 'm/s²')
  const envelope = c.states(veh, 'operating envelope', ['within', 'exceeded'])
  c.refined(envelope, [['exceeded', anyOf(cmp(speed, '>', safeSpeed), cmp(lat, '>', latMax), cmp(lon, '>', lonMax))]], 'within')
  const fire = c.bool(veh, 'fire in vehicle')
  const temp = c.range(veh, 'cabin temperature', -50, 100, '°C')
  const exit = c.bool(veh, 'occupants can escape')
  const closing = c.rel(door, 'closes on', occupant)
  const exposure = c.states(occupant, 'exposure', ['harmless', 'harmful'])
  c.refined(exposure, [['harmful', anyOf(is(fire, 'true'), outside(temp, 5, 40), is(exit, 'false'), is(c.pred(closing), 'true'))]], 'harmless')
  c.conditions('Vehicle does not maintain', is(c.pred(near), 'true', { quant: 'some', as: 'no1' }), cmp(dist, '<', safe, { same: 'no1', oSame: 'no1' }))
  c.conditions('Vehicle enters', is(c.pred(inside), 'true', { quant: 'some', as: 're1' }), is(danger, 'dangerous', { same: 're1' }))
  c.conditions('Vehicle exceeds', is(envelope, 'exceeded'))
  c.conditions('Vehicle occupants', is(exposure, 'harmful', { quant: 'some', as: 'oc1' }))
}

const FORMALIZERS: Record<string, (c: Ctx) => void> = { 'hb-nuclear': nuclear, 'hb-aircraft': aircraft, 'hb-radiation': radiation, 'hb-military': military, 'hb-automotive': automotive }
export const FORMALIZED_HAZARD_EXAMPLES = Object.keys(FORMALIZERS)

/** The hazard-only Handbook example `id` with a domain model and conditions on its leaf hazards (pure; `p` is the unformalized example). */
export function formalizeHazardExample(id: string, p: Project): Project {
  const f = FORMALIZERS[id]
  if (!f) throw new Error(`no formalization for ${id}`)
  const c = new Ctx(p)
  f(c)
  return nameAllInstances(c.p)
}
