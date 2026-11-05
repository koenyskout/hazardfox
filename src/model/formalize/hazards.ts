import { predicateOf } from '../formal'
import { relEnds } from '../create'
import { createItem, updateItem } from '../ops'
import type { Id, Patch, Project } from '../types'
import { and, between, cmp as cmpE, gt, is, isNot, lt, not, num, oneOf, or, quant, variable, type CmpOp, type Expr, type Quant } from '../lang'

/**
 * Formalization experiments for the hazard-only Handbook examples (hb-nuclear, hb-aircraft, hb-radiation, hb-military, hb-automotive):
 * a domain model (entities, relationships, typed world variables, `many` where several instances matter) and, for each leaf hazard, `conditions`.
 * Where the model is too weak the closest expressible condition is used; the gaps are listed in docs/formalize-hazards.md.
 */
class Ctx {
  constructor(public p: Project) {}
  private add<K extends 'entity' | 'relationship' | 'variable'>(kind: K, init: Patch<K>): Id<K> { const r = createItem(this.p, kind, init); this.p = r.project; return r.id }
  entity = (title: string, many = false, description = ''): Id<'entity'> => this.add('entity', { title, description, ...(many ? { many } : {}) })
  rel = (from: Id<'entity'>, title: string, to: Id<'entity'>, fromCard = '*', toCard = '*'): Id<'relationship'> => this.add('relationship', { title, ends: relEnds(from, to, fromCard, toCard) })
  /** The boolean predicate R(from, to) of a relationship. */
  pred = (rel: Id<'relationship'>): Id<'variable'> => predicateOf(this.p, rel)!.id
  states = (parent: Id<'entity' | 'relationship'>, title: string, states: string[], definition = ''): Id<'variable'> => this.add('variable', { parent, title, states, definition })
  bool = (parent: Id<'entity' | 'relationship'>, title: string, definition = ''): Id<'variable'> => this.add('variable', { parent, title, type: 'boolean', definition })
  range = (parent: Id<'entity' | 'relationship'>, title: string, min: number | null, max: number | null, unit: string, definition = ''): Id<'variable'> => this.add('variable', { parent, title, type: 'range', min, max, unit, definition })
  /** Defines a (refined) enum variable by rules over lower-level world variables: the first state of `rules` whose condition holds, else `otherwise`. */
  refined = (v: Id<'variable'>, rules: [state: string, when: Expr][], otherwise: string) => { this.p = updateItem(this.p, v, { rules: rules.map(([state, when]) => ({ state, when })), otherwise }) }
  hazard = (title: string): Id<'hazard'> => {
    const h = Object.values(this.p.items).find((i) => i.kind === 'hazard' && i.title.startsWith(title))
    if (!h) throw new Error(`no hazard "${title}"`)
    return h.id as Id<'hazard'>
  }
  /** The conjunction `cs` with the instance names `decls` (name, entity, quantifier) quantified around it, first one outermost. */
  conditions = (title: string, decls: Decl[], ...cs: Expr[]) => {
    const body = cs.length === 1 ? cs[0] : and(...cs)
    this.p = updateItem(this.p, this.hazard(title), { when: decls.reduceRight((e, [name, entity, q = 'some']) => quant(q, name, entity, e), body) })
  }
}
type Decl = [name: string, entity: Id<'entity'>, q?: Quant]

export { is, isNot }
export const isIn = (v: Id<'variable'>, set: string[], ...at: string[]): Expr => oneOf(variable(v, ...at), ...set)
export const notIn = (v: Id<'variable'>, set: string[], ...at: string[]): Expr => not(isIn(v, set, ...at))
export const above = (v: Id<'variable'>, n: number, ...at: string[]): Expr => gt(variable(v, ...at), num(n))
export const below = (v: Id<'variable'>, n: number, ...at: string[]): Expr => lt(variable(v, ...at), num(n))
export const outside = (v: Id<'variable'>, lo: number, hi: number, ...at: string[]): Expr => not(between(variable(v, ...at), num(lo), num(hi)))
/** `variable op other`, both read at the instances `at` (same names for both). */
export const cmp = (v: Id<'variable'>, op: CmpOp, other: Id<'variable'>, ...at: string[]): Expr => cmpE(op, variable(v, ...at), variable(other, ...at))

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
  c.conditions('Release', [['rm1', material]], is(where, 'outside containment', 'rm1'))
  c.conditions('Reactor temperature', [], cmp(temp, '>', tmax))
  c.conditions('Equipment operated', [['eq1', equipment]], above(util, 100, 'eq1'))
  c.conditions('Reactor shut down', [], is(state, 'shut down'), is(needed, 'false'))
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
  c.refined(integrity, [['lost', or(above(load, 100), is(fire, 'true'), is(damage, 'true'))]], 'intact')
  const alt = c.range(ac, 'cabin pressure altitude', 0, 50000, 'ft')
  const smoke = c.bool(ac, 'smoke or toxic fumes in cabin')
  const ctemp = c.range(ac, 'cabin temperature', -50, 100, '°C')
  const cabin = c.states(ac, 'cabin air', ['safe', 'harmful'])
  c.refined(cabin, [['harmful', or(above(alt, 10000), is(smoke, 'true'), outside(ctemp, 5, 40))]], 'safe')
  const aboard = c.rel(person, 'is aboard', ac, '*', '1')
  const onArea = c.rel(area, 'carries', ac)
  const tooClose = c.rel(ac, 'is close to', obj)
  const dist = c.range(tooClose, 'distance', 0, null, 'm')
  const minDist = c.range(tooClose, 'minimum safe distance', 0, null, 'm', 'Depends on aircraft size and the object (wingspan, speed, ...).')
  c.conditions('Aircraft violate', [['ac1', ac], ['ac2', ac]],
    is(c.pred(near), 'true', 'ac1', 'ac2'),
    cmp(hsep, '<', hreq, 'ac1', 'ac2'),
    cmp(vsep, '<', vreq, 'ac1', 'ac2'))
  c.conditions('Controlled flight', [['ac3', ac], ['te1', terrain]],
    is(c.pred(over), 'true', 'ac3', 'te1'),
    cmp(clearance, '<', minClear, 'ac3', 'te1'),
    is(control, 'controlled', 'ac3'),
    notIn(phase, ['ground', 'landing'], 'ac3'))
  c.conditions('Loss of aircraft control', [['ac4', ac]], isNot(phase, 'ground', 'ac4'), is(control, 'lost', 'ac4'))
  c.conditions('Aircraft airframe', [['ac8', ac]], is(integrity, 'lost', 'ac8'))
  c.conditions('Aircraft environment', [['pe1', person], ['ac5', ac]],
    is(c.pred(aboard), 'true', 'pe1', 'ac5'),
    is(cabin, 'harmful', 'ac5'))
  c.conditions('Aircraft departs', [['ac6', ac], ['ar1', area, 'none']],
    is(phase, 'ground', 'ac6'),
    is(c.pred(onArea), 'true', 'ar1', 'ac6'))
  c.conditions('Aircraft comes too close', [['ac7', ac], ['ob1', obj]],
    is(phase, 'ground', 'ac7'),
    is(c.pred(tooClose), 'true', 'ac7', 'ob1'),
    cmp(dist, '<', minDist, 'ac7', 'ob1'))
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
  const sameDose = (op: '=' | '≠') => cmp(dose, op, rx, 'pa1')
  const sameSite = (op: '=' | '≠') => cmp(site, op, target, 'pa1')
  const irradiated = is(c.pred(irradiates), 'true', '', 'pa1')
  const pt: Decl[] = [['pa1', patient]]
  c.conditions('Right patient, right dose', pt, irradiated, is(scheduled, 'true', 'pa1'), sameDose('='), sameSite('≠'))
  c.conditions('Right patient, wrong dose, right', pt, irradiated, is(scheduled, 'true', 'pa1'), sameDose('≠'), sameSite('='))
  c.conditions('Right patient, wrong dose, wrong', pt, irradiated, is(scheduled, 'true', 'pa1'), sameDose('≠'), sameSite('≠'))
  c.conditions('Wrong patient', pt, irradiated, is(scheduled, 'false', 'pa1'))
  c.conditions('A nonpatient', [['np1', nonpatient]], is(c.pred(exposes), 'true', '', 'np1'))
  c.conditions('Equipment is subject', [['eq1', equipment]], above(stress, 100, 'eq1'))
  c.conditions('Persons are subjected', [['mp1', mover], ['pr1', person]],
    is(motion, 'moving', 'mp1'),
    is(c.pred(approach), 'true', 'mp1', 'pr1'),
    cmp(gap, '<', minGap, 'mp1', 'pr1'))
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
  c.refined(integrity, [['lost', or(above(load, 100), is(fire, 'true'), is(damage, 'true'))]], 'intact')
  const detCmd = c.states(ord, 'detonation command', ['not commanded', 'commanded'])
  const det = c.states(ord, 'detonation', ['intact', 'detonated'])
  const launchCmd = c.states(ord, 'launch command', ['not commanded', 'commanded'])
  const launch = c.states(ord, 'launch state', ['on aircraft', 'launched'])
  const status = c.states(asset, 'status', ['friendly forces', 'civilians', 'civilian property', 'legitimate target'])
  const lethal = c.rel(ord, 'detonates within lethal radius of', asset)
  c.conditions('Violation of minimum', [['ob1', obj]], is(c.pred(near), 'true', '', 'ob1'), cmp(sep, '<', minSep, '', 'ob1'))
  c.conditions('Inability to control', [], is(control, 'lost'))
  c.conditions('Loss of airframe', [], is(integrity, 'lost'))
  c.conditions('Uncommanded detonation', [['or1', ord]], is(det, 'detonated', 'or1'), is(detCmd, 'not commanded', 'or1'))
  c.conditions('Uncommanded launch', [['or2', ord]], is(launch, 'launched', 'or2'), is(launchCmd, 'not commanded', 'or2'))
  c.conditions('Collateral damage', [['or3', ord], ['pa1', asset]],
    is(c.pred(lethal), 'true', 'or3', 'pa1'),
    isNot(status, 'legitimate target', 'pa1'),
    is(det, 'detonated', 'or3'))
  c.conditions('Non-deployment', [['or4', ord]], is(launchCmd, 'commanded', 'or4'), is(launch, 'on aircraft', 'or4'))
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
  c.refined(envelope, [['exceeded', or(cmp(speed, '>', safeSpeed), cmp(lat, '>', latMax), cmp(lon, '>', lonMax))]], 'within')
  const fire = c.bool(veh, 'fire in vehicle')
  const temp = c.range(veh, 'cabin temperature', -50, 100, '°C')
  const exit = c.bool(veh, 'occupants can escape')
  const closing = c.rel(door, 'closes on', occupant)
  const exposure = c.states(occupant, 'exposure', ['harmless', 'harmful'])
  c.refined(exposure, [['harmful', or(is(fire, 'true'), outside(temp, 5, 40), is(exit, 'false'), is(c.pred(closing), 'true'))]], 'harmless')
  c.conditions('Vehicle does not maintain', [['no1', obj]], is(c.pred(near), 'true', '', 'no1'), cmp(dist, '<', safe, '', 'no1'))
  c.conditions('Vehicle enters', [['re1', region]], is(c.pred(inside), 'true', '', 're1'), is(danger, 'dangerous', 're1'))
  c.conditions('Vehicle exceeds', [], is(envelope, 'exceeded'))
  c.conditions('Vehicle occupants', [['oc1', occupant]], is(exposure, 'harmful', 'oc1'))
}

const FORMALIZERS: Record<string, (c: Ctx) => void> = { 'hb-nuclear': nuclear, 'hb-aircraft': aircraft, 'hb-radiation': radiation, 'hb-military': military, 'hb-automotive': automotive }
export const FORMALIZED_HAZARD_EXAMPLES = Object.keys(FORMALIZERS)

/** The hazard-only Handbook example `id` with a domain model and conditions on its leaf hazards (pure; `p` is the unformalized example). */
export function formalizeHazardExample(id: string, p: Project): Project {
  const f = FORMALIZERS[id]
  if (!f) throw new Error(`no formalization for ${id}`)
  const c = new Ctx(p)
  f(c)
  return c.p
}
