import { createItem, updateItem } from '../ops'
import { addBelief, addSignal, beliefsAbout } from '../formal'
import { itemsOfKind } from '../tree'
import { anyOf, isOnVariable } from '../variables'
import { upgrade, type Init, type Legacy } from '../build'
import { whenToExpr } from '../bridge'
import { varsOf } from '../atoms'
import { and, type Expr } from '../lang'
import { condVars } from '../expr'
import type { ConditionOp, Entity, Hazard, Id, Patch, Project, Uca, Variable } from '../types'
import type { Condition, ValueCondition, VarCondition } from '../legacy'

/**
 * Adds the formal layers (domain model, typed world variables, `many` entities, conditions on leaf hazards and UCAs,
 * beliefs and signals) to the published examples `pub-aeb` and `pub-thomas-msiv`. Pure and idempotent: it only adds
 * what is missing and never touches the text. Gaps are listed in docs/formalize-aeb-msiv.md.
 */
type Ctx = { p: Project }
const kit = (c: Ctx) => {
  const find = <T extends { title: string; parent: Id | null }>(items: T[], title: string, parent: Id | null) => items.find((i) => i.title === title && i.parent === parent)
  const entity = (title: string, patch: Patch<'entity'> = {}): Id<'entity'> => {
    const have = find(itemsOfKind(c.p, 'entity'), title, null)
    if (have) return have.id
    const r = createItem(c.p, 'entity', { title, ...patch }); c.p = r.project; return r.id
  }
  const world = (owner: Id<'entity' | 'relationship'>, title: string, patch: Init<'variable'>): Id<'variable'> => {
    const have = find(itemsOfKind(c.p, 'variable').filter((v) => v.layer === 'domain'), title, owner)
    if (have) return have.id
    const r = createItem(c.p, 'variable', upgrade(c.p, { layer: 'domain', parent: owner, title, ...patch }) as Patch<'variable'>); c.p = r.project; return r.id
  }
  const rng = (owner: Id<'entity' | 'relationship'>, title: string, unit: string, definition = '') => world(owner, title, { type: 'range', min: 0, max: null, unit, definition })
  const set = (id: Id, patch: Patch | Legacy) => { c.p = updateItem(c.p, id, upgrade(c.p, patch as Record<string, unknown>) as Patch) }
  const hazard = (title: string): Hazard => { const h = itemsOfKind(c.p, 'hazard').find((x) => x.title === title); if (!h) throw new Error('hazard not found: ' + title); return h }
  const node = (title: string) => { const n = itemsOfKind(c.p, 'node').find((x) => x.title.startsWith(title)); if (!n) throw new Error('node not found: ' + title); return n.id }
  const feedback = (title: string, from: Id<'node'>, to: Id<'node'>) => { const f = itemsOfKind(c.p, 'feedback').find((x) => x.title.startsWith(title) && x.from === from && x.to === to); if (!f) throw new Error('feedback not found: ' + title); return f.id }
  /** Replace a hazard's / UCA's conditions when it has none yet (never overwrites what is there); hazards also list their world variables. */
  const hazardConditions = (h: Hazard, conditions: Condition[]) => {
    const have = c.p.items[h.id] as Hazard
    set(h.id, { ...(have.when ? {} : { conditions }), variables: [...new Set([...have.variables, ...conditions.flatMap(condVars)])] })
  }
  /** Add the conditions the UCA does not yet have (matched by variable and instance), before the existing ones. */
  const ucaConditions = (u: Uca, conditions: Condition[], context = '') => {
    const have = (c.p.items[u.id] as Uca)
    const had = new Set(varsOf(have.when))
    const missing = conditions.filter((x) => isOnVariable(x) && !had.has(x.variable))
    const parts = [whenToExpr(c.p, missing), have.when].filter((x): x is Expr => !!x)
    set(u.id, { when: parts.length ? and(...parts) : null, ...(context && !have.context.trim() ? { context } : {}) })
  }
  const belief = (ctrl: Id<'node'>, w: Id<'variable'>) => { if (!beliefsAbout(c.p, ctrl, w).length) c.p = addBelief(c.p, ctrl, w).project }
  const signal = (fb: Id<'feedback'>, w: Id<'variable'>) => { c.p = addSignal(c.p, fb, w).project }
  return { find, entity, world, rng, set, hazard, node, feedback, hazardConditions, ucaConditions, belief, signal }
}
const eq = (variable: Id<'variable'>, state: string, extra: Partial<ValueCondition> = {}): ValueCondition => ({ kind: 'value', variable, op: '=', state, ...extra })
/** `variable` compared with another variable (`other`). */
const cmp = (variable: Id<'variable'>, op: ConditionOp, other: Id<'variable'>, extra: Partial<VarCondition> = {}): VarCondition => ({ kind: 'var', variable, op, other, ...extra })

function aeb(c: Ctx) {
  const k = kit(c)
  const av = k.entity('Autonomous vehicle (AV)')
  const fmo = k.entity('Forward mobile object (FMO)', { many: true, description: 'Any mobile object ahead of the AV that it could hit (vehicle, cyclist, pedestrian); there can be several at once.' })
  const pa = k.entity('Prohibited area (PA)', { many: true, description: 'An area the AV must not enter or touch (kerb, wall, lane marking of a closed lane, ...); there can be several.' })
  const speed = k.rng(av, 'Speed', 'm/s')
  const brake = k.rng(av, 'Braking deceleration', 'm/s²', 'Deceleration actually applied by the brakes. 0 when the braking force command is disengaged.')
  const msd = k.rng(av, 'Minimum safe distance (MSD)', 'm', 'Smallest distance to an object at which the AV can still be considered safe (depends on speed, source gives no formula).')
  const cibd = k.rng(av, 'Collision imminent braking distance (CIBd)', 'm', 'Distance to an object at which only immediate full braking still avoids the collision (a function of speed and maximum deceleration, not given by the source).')
  const rdr = k.rng(av, 'Required deceleration rate (RDR)', 'm/s²', 'Deceleration needed to stop before the object.')
  const g = k.rng(av, 'Occupant g-force', 'g')
  const gMax = k.rng(av, 'Occupant g-force safety threshold', 'g', 'Safety threshold of the AV (the source gives no value).')
  const dF = k.rng(fmo, 'Distance to AV', 'm', 'Distance along the AV path to the object.')
  const dP = k.rng(pa, 'Distance to AV', 'm', 'Distance along the AV path to the prohibited area.')
  const within = k.world(av, 'Object within CIBd', {
    type: 'boolean',
    definition: 'Some forward mobile object or some prohibited area is closer to the AV than the collision imminent braking distance.',
    rules: [{ state: 'true', when: anyOf(cmp(dF, '<', cibd, {}), cmp(dP, '<', cibd, {})) }],
    otherwise: 'false',
  })

  // hazards: distance below the minimum safe distance (FMO / PA) and too high g-force
  k.hazardConditions(k.hazard('AV does not maintain minimum safe distance (MSD) from a forward mobile object (FMO)'), [cmp(dF, '<', msd, { names: [{ declare: 'fmo1' }] })])
  k.hazardConditions(k.hazard('AV does not maintain MSD from a prohibited area (PA)'), [cmp(dP, '<', msd, { names: [{ declare: 'pa1' }] })])
  k.hazardConditions(k.hazard('AV occupants are exposed to unhealthy g-forces exceeding the safety threshold of the AV'), [cmp(g, '>', gMax)])

  // UCAs: no BFC / too weak BFC while an object is inside the collision imminent braking distance
  const ucas = itemsOfKind(c.p, 'uca')
  for (const u of ucas) {
    if (u.guide === 'provided') k.ucaConditions(u, [eq(within, 'true')], 'the commanded braking force is below the required deceleration rate (RDR)')
    else k.ucaConditions(u, [eq(within, 'true')])
  }

  // control structure: which entities the nodes stand for, what BFC affects
  k.set(k.node('Vehicle'), { entities: [av] })
  k.set(k.node('Environment'), { entities: [fmo, pa] })
  for (const ca of itemsOfKind(c.p, 'ca')) k.set(ca.id, { affects: [brake] })

  // information flow: sensors -> state estimator -> AEB controller; the AEB needs beliefs about everything its contexts use
  const aebN = k.node('AEB controller'), estN = k.node('State estimator'), vehN = k.node('Vehicle'), envN = k.node('Environment')
  const fVeh = k.feedback('Vehicle sensor data', vehN, estN), fAd = k.feedback('AD sensor data', envN, estN), fEst = k.feedback('State estimate', estN, aebN)
  for (const w of [speed, brake]) k.signal(fVeh, w)
  for (const w of [dF, dP]) k.signal(fAd, w)
  for (const w of [speed, dF, dP]) k.signal(fEst, w)
  for (const w of [cibd, msd, rdr, within]) k.belief(aebN, w)
}

function msiv(c: Ctx) {
  const k = kit(c)
  const sg = itemsOfKind(c.p, 'entity').find((e: Entity) => e.title === 'Steam generator system')
  if (!sg) throw new Error('steam generator entity not found')
  const wv = (title: string) => { const v = itemsOfKind(c.p, 'variable').find((x: Variable) => x.layer === 'domain' && x.parent === sg.id && x.title === title); if (!v) throw new Error('variable not found: ' + title); return v.id }
  const sgtr = wv('Steam generator tube'), fw = wv('Main feedwater pipe'), sl = wv('Main steam line'), sup = wv('Other support systems (CVCS, SI, ECCS, ...)'), press = wv('SG pressure')
  // abstractions of the three leak variables (a UCA context is a conjunction, so "SGTR or leak" needs one variable)
  const leak = k.world(sg.id, 'Rupture or leak', {
    type: 'boolean',
    definition: 'A rupture in the SG tube, a leak in the main feedwater pipe or a leak in the main steam line.',
    rules: [{ state: 'true', when: anyOf(eq(sgtr, 'ruptured'), eq(fw, 'leak'), eq(sl, 'leak')) }], otherwise: 'false',
  })
  const secLeak = k.world(sg.id, 'Secondary-side leak', {
    type: 'boolean',
    definition: 'A leak in the main feedwater pipe or in the main steam line (not a tube rupture).',
    rules: [{ state: 'true', when: anyOf(eq(fw, 'leak'), eq(sl, 'leak')) }], otherwise: 'false',
  })

  // domain model of the hazard states
  const rcs = k.entity('Primary system', { description: 'Reactor coolant system with the radioactive inventory.' })
  const reactor = k.entity('Reactor')
  const equip = k.entity('Plant equipment', { many: true, description: 'Reactor components and other plant equipment; each has its own safe and design limits.' })
  const msivE = k.entity('MSIV', { description: 'Main steam isolation valve of the (generic) steam line.' })
  const rad = k.world(rcs, 'Radioactive material', { type: 'enum', states: ['released outside primary system', 'contained'], definition: 'Any release outside the primary system, regardless of quantity.' })
  const temp = k.world(reactor, 'Reactor temperature', { type: 'enum', states: ['too high', 'acceptable'], definition: '"Too high" in relation to NRC standards and operating guidelines.' })
  const op = k.world(reactor, 'Reactor operation', { type: 'enum', states: ['operating', 'planned shutdown', 'unplanned shutdown'] })
  const eqOp = k.world(equip, 'Operation', { type: 'enum', states: ['within limits', 'beyond limits'], definition: 'Beyond safe limits (reactor damage) or beyond design limits (other equipment).' })
  const pos = k.world(msivE, 'Position', { type: 'enum', states: ['open', 'closed'] })

  k.hazardConditions(k.hazard('Release of radioactive materials'), [eq(rad, 'released outside primary system')])
  k.hazardConditions(k.hazard('Reactor temperature too high'), [eq(temp, 'too high')])
  k.hazardConditions(k.hazard('Equipment operated beyond limits'), [eq(eqOp, 'beyond limits', { names: [{ declare: 'eq1' }] })])
  k.hazardConditions(k.hazard('Reactor shut down'), [eq(op, 'unplanned shutdown')])

  // UCAs (matched by the "(SC n)" in their constraint)
  const byScn = (n: number) => { const u = itemsOfKind(c.p, 'uca').find((x) => x.constraint.includes(`(SC ${n})`)); if (!u) throw new Error('UCA SC ' + n); return u }
  k.ucaConditions(byScn(1), [eq(leak, 'true')])
  k.ucaConditions(byScn(2), [eq(secLeak, 'true'), eq(sgtr, 'not ruptured')])
  k.ucaConditions(byScn(5), [eq(leak, 'true')], 'the Close MSIV command comes later than the time the operator has to stop the release into the secondary loop (the source gives no time bound)')

  // control structure
  k.set(k.node('MSIV'), { entities: [msivE] })
  for (const ca of itemsOfKind(c.p, 'ca').filter((x) => x.title.startsWith('Close MSIV') && (c.p.items[x.to] as { title: string }).title.match(/^(PM|MSIV)/))) k.set(ca.id, { affects: [pos] })
  const opN = k.node('Operator')
  for (const w of [leak, secLeak]) k.belief(opN, w)
  // feedback to the operator: process indications and outside information (loose: indications only hint at the leak state)
  const fProc = k.feedback('SG pressure, SG water level', k.node('Secondary cooling'), opN), fOut = k.feedback('Outside information', k.node('Other plant'), opN)
  for (const w of [press, sgtr, fw, sl]) k.signal(fProc, w)
  k.signal(fOut, sup)
}

/** The published example `id` with its formal layers added. */
export function formalizeAebMsiv(id: 'pub-aeb' | 'pub-thomas-msiv', p: Project): Project {
  const c: Ctx = { p }
  if (id === 'pub-aeb') aeb(c)
  else msiv(c)
  return c.p
}
