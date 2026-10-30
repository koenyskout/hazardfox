import { beliefsAbout, feedbackInto, partsOf, signalsOf, worldOf } from './formal'
import { variableName } from './labels'
import { mention } from './refs'
import { itemsOfKind } from './tree'
import { isGroup, isSetOp, stepOf, valuesOf } from './variables'
import type { Cause, Condition, ConditionOp, Id, Project, Scenario, Trace, TraceStep, Uca, Variable, When } from './types'

/** Value of a variable at step i (set there or carried forward), and whether it was set at that step. */
export function valueAt(t: Trace, i: number, id: Id): { value: string | undefined; set: boolean } {
  for (let k = Math.min(i, t.steps.length - 1); k >= 0; k--) if (id in t.steps[k].values) return { value: t.steps[k].values[id], set: k === i }
  return { value: undefined, set: false }
}

/** All variable values at step i. */
export function stateAt(t: Trace, i: number): Record<Id, string> {
  const out: Record<Id, string> = {}
  for (const s of t.steps.slice(0, i + 1)) Object.assign(out, s.values)
  return out
}

/** Whether `value` satisfies the condition (null when unknown). */
export function holds(v: Variable, c: Condition, value: string | undefined): boolean | null {
  if (value === undefined || value === '') return null
  if (isSetOp(c.op)) return (c.set ?? []).includes(value) === (c.op === 'in')
  if (v.type !== 'range') return c.op === '=' ? value === c.state : c.op === '≠' ? value !== c.state : null
  const x = Number(value), a = Number(c.state), b = Number(c.to)
  if (!Number.isFinite(x)) return null
  switch (c.op) {
    case '=': return x === a
    case '≠': return x !== a
    case '<': return x < a
    case '≤': return x <= a
    case '>': return x > a
    case '≥': return x >= a
    case 'between': return x >= a && x <= b
    case 'not between': return x < a || x > b
  }
  return null
}

/** Whether a condition tree holds (three-valued: null while it depends on an unknown value); conditions without a variable are ignored. */
export function whenHolds(p: Project, w: When, get: (id: Id) => string | undefined): boolean | null | undefined {
  if (!isGroup(w)) { const v = p.items[w.variable]; return v?.kind === 'variable' ? holds(v, w, get(w.variable)) : undefined }
  const hs = w.of.map((x) => whenHolds(p, x, get)).filter((h) => h !== undefined)
  return hs.includes(w.any) ? w.any : hs.includes(null) ? null : !w.any
}

/** Value of a refined variable from its rules (first rule whose condition holds, else `otherwise`); undefined while a needed part is unknown. */
export function ruleValue(p: Project, v: Variable, get: (id: Id) => string | undefined): string | undefined {
  for (const r of v.rules) {
    const h = whenHolds(p, r.when, get)
    if (h === null) return undefined
    if (h !== false) return r.state
  }
  return v.otherwise || undefined
}

/** State at step i, with refined world variables (and a controller's beliefs about them, from its beliefs about the parts) computed by their rules. */
export function traceState(p: Project, t: Trace, i: number): Record<Id, string> {
  const raw = stateAt(t, i)
  const out = { ...raw }
  const vars = itemsOfKind(p, 'variable')
  if (!vars.some((v) => v.rules.length)) return out
  const busy = new Set<Id>()
  const derive = (id: Id, get: (id: Id) => string | undefined, own: string | undefined): string | undefined => {
    const v = p.items[id]
    if (v?.kind !== 'variable' || !v.rules.length || busy.has(id)) return own
    busy.add(id)
    const x = ruleValue(p, v, get)
    busy.delete(id)
    return x ?? own
  }
  const world = (id: Id): string | undefined => derive(id, world, raw[id])
  for (const v of vars) if (v.rules.length) { const x = world(v.id); if (x !== undefined) out[v.id] = x }
  for (const b of vars) {
    if (b.layer !== 'belief' || !b.parent || !b.about) continue
    const ctrl = b.parent
    const belief = (id: Id): string | undefined => { const x = beliefsAbout(p, ctrl, id)[0]; return x ? derive(id, belief, raw[x.id]) : derive(id, belief, undefined) }
    const x = derive(b.about, belief, undefined)
    if (x !== undefined) out[b.id] = x
  }
  return out
}

/** Values set at step i that contradict the rules of a refined variable: [id, set value, computed value]. */
export function ruleConflicts(p: Project, t: Trace, i: number): [Id, string, string][] {
  const st = traceState(p, t, i)
  return Object.entries(t.steps[i]?.values ?? {}).flatMap(([id, x]) => (st[id] !== undefined && st[id] !== x ? [[id, x, st[id]] as [Id, string, string]] : []))
}

/** Whether the UCA's context holds in a state: false if a condition fails, null if one is unknown. */
export function contextHolds(p: Project, u: Uca, state: Record<Id, string>): boolean | null {
  let all: boolean | null = true
  for (const c of u.conditions) {
    const v = p.items[c.variable]
    if (v?.kind !== 'variable') continue
    const h = holds(v, c, state[c.variable])
    if (h === false) return false
    if (h === null) all = null
  }
  return all
}

export const NEGATE: Record<ConditionOp, ConditionOp> = { '=': '≠', '≠': '=', in: 'not in', 'not in': 'in', '<': '≥', '≥': '<', '≤': '>', '>': '≤', between: 'not between', 'not between': 'between' }

/** A value that satisfies the condition (or, with `negate`, one that does not). */
export function pickValue(v: Variable, c: Condition, negate = false): string {
  const op = negate ? NEGATE[c.op] : c.op
  const vals = valuesOf(v)
  if (vals) {
    if (op === '=') return c.state
    if (op === 'in') return c.set?.[0] ?? vals[0] ?? ''
    const not = op === '≠' ? [c.state] : c.set ?? []
    return vals.find((x) => !not.includes(x)) ?? ''
  }
  const d = stepOf(v)
  const clamp = (x: number) => String(+Math.min(v.max ?? Infinity, Math.max(v.min ?? -Infinity, x)).toFixed(6))
  const a = Number(c.state), b = Number(c.to)
  switch (op) {
    case '=': case '≤': case '≥': return clamp(a)
    case '≠': case '>': return clamp(a + d)
    case '<': return clamp(a - d)
    case 'between': return clamp((a + b) / 2)
    case 'not between': return v.min !== null && v.min < a ? clamp(v.min) : clamp(b + d)
  }
  return ''
}

/** A neutral starting value. */
export const initialValue = (v: Variable): string => (valuesOf(v)?.[0] ?? String(v.min ?? 0))

/** Index of the step where the trace's control action is sent / withheld (first event on it). */
export function actionStep(t: Trace, ca: Id | null): number {
  return ca ? t.steps.findIndex((s) => s.events.some((e) => e.on === ca)) : -1
}

/** Does the trace witness the UCA: its context holds where the action is (not) sent, with the right kind of event? */
export function witness(p: Project, s: Scenario): { step: number; ok: boolean | null; why: string } | null {
  const u = s.scenarioType === 'uca' && s.uca ? p.items[s.uca] : null
  if (u?.kind !== 'uca' || !s.trace.steps.length) return null
  const step = actionStep(s.trace, u.ca)
  if (step < 0) return { step, ok: false, why: 'no step shows the control action (sent or not sent)' }
  const ev = s.trace.steps[step].events.find((e) => e.on === u.ca)!
  if ((u.guide === 'not-provided') !== (ev.what === 'absent')) return { step, ok: false, why: u.guide === 'not-provided' ? 'the UCA is about not providing the action, but the trace sends it' : 'the UCA is about providing the action, but the trace does not send it' }
  const ctx = contextHolds(p, u, traceState(p, s.trace, step))
  return { step, ok: ctx, why: ctx === false ? 'the UCA context does not hold at that step' : ctx === null ? 'some context variables have no value at that step' : 'the UCA context holds when the action is ' + (ev.what === 'absent' ? 'withheld' : 'sent') }
}

export interface Mismatch { id: Id; world: Id; value: string; actual: string }

/** Signals and beliefs whose value differs from the world variable they are about, at step i. */
export function mismatches(p: Project, t: Trace, i: number): Mismatch[] {
  const st = traceState(p, t, i)
  const out: Mismatch[] = []
  for (const [id, value] of Object.entries(st)) {
    const v = p.items[id]
    if (v?.kind !== 'variable' || v.layer === 'domain' || v.layer === 'internal') continue
    const w = worldOf(p, v)
    if (!w || w.type !== v.type || st[w.id] === undefined) continue
    if (value !== st[w.id]) out.push({ id, world: w.id, value, actual: st[w.id] })
  }
  return out
}

/** Causal factor the trace points at, from comparing world, signals and beliefs of the controller at the action step. */
export function diagnose(p: Project, s: Scenario): { cause: Cause; why: string } | null {
  const u = s.uca ? p.items[s.uca] : null
  const ca = u?.kind === 'uca' ? p.items[u.ca] : null
  if (s.scenarioType !== 'uca' || u?.kind !== 'uca' || ca?.kind !== 'ca') return null
  const step = actionStep(s.trace, ca.id)
  if (step < 0) return null
  const st = traceState(p, s.trace, step)
  const fbs = feedbackInto(p, ca.from)
  let anyBelief = false
  for (const c of u.conditions) {
    const w = p.items[c.variable]
    if (w?.kind !== 'variable' || w.layer !== 'domain' || st[w.id] === undefined) continue
    // Signals about the variable or one of its parts, each compared with the world variable it is about.
    const about = [w.id, ...partsOf(p, w.id)]
    const sigs = fbs.flatMap((f) => signalsOf(p, f.id)).filter((x) => x.about && about.includes(x.about) && st[x.id] !== undefined)
    const bel = beliefsAbout(p, ca.from, w.id).filter((b) => st[b.id] !== undefined)
    const bad = sigs.find((x) => st[x.about!] !== undefined && st[x.id] !== st[x.about!])
    if (bad) return { cause: 'feedback', why: `the signal about ${variableName(p, p.items[bad.about!] as Variable)} differs from the world` }
    for (const b of bel) {
      anyBelief = true
      if (st[b.id] === st[w.id]) continue
      if (sigs.length) return { cause: 'process-model', why: `${b.title} is not updated from a correct signal` }
      return { cause: 'feedback', why: `no signal tells the controller about ${variableName(p, w)}` }
    }
  }
  return anyBelief ? { cause: 'control-algorithm', why: 'the controller believes the actual state and still acts unsafely' } : null
}

const step = (t: string, note: string, values: Record<Id, string> = {}, events: TraceStep['events'] = []): TraceStep => ({ t, note, values, events })

/** Draft a trace that exhibits the scenario: from the UCA's context and the chosen causal factor (type 'uca'), or from the control action and what goes wrong with it (type 'ca'). */
export function draftTrace(p: Project, s: Scenario): Trace {
  if (s.scenarioType === 'uca') {
    const u = s.uca ? p.items[s.uca] : null
    const ca = u?.kind === 'uca' ? p.items[u.ca] : null
    if (u?.kind !== 'uca' || ca?.kind !== 'ca') return { lanes: [], steps: [] }
    const ctrl = ca.from
    const fbs = feedbackInto(p, ctrl)
    const lanes: Id[] = []
    const [init, ctx, act] = [step('t0', 'Initially the context does not hold.'), step('t1', ''), step('t2', '')]
    const lost = new Set<Id>(), sent = new Set<Id>()
    // Only the first condition is false initially; it becoming true makes the context hold.
    for (const [k, c] of u.conditions.entries()) {
      const w = p.items[c.variable]
      if (w?.kind !== 'variable') continue
      const after = pickValue(w, c), before = k ? after : pickValue(w, c, true)
      lanes.push(w.id)
      init.values[w.id] = before
      ctx.values[w.id] = after
      if (w.layer !== 'domain') continue
      for (const f of fbs) for (const sig of signalsOf(p, f.id).filter((x) => x.about === w.id)) {
        lanes.push(sig.id)
        init.values[sig.id] = before
        if (s.cause === 'feedback') lost.add(f.id)
        else { ctx.values[sig.id] = after; sent.add(f.id) }
      }
      for (const b of beliefsAbout(p, ctrl, w.id)) {
        lanes.push(b.id)
        init.values[b.id] = before
        if (s.cause !== 'feedback' && s.cause !== 'process-model') ctx.values[b.id] = after
      }
    }
    ctx.events = [...[...sent].map((on) => ({ on, what: 'occurs' as const })), ...[...lost].map((on) => ({ on, what: 'lost' as const }))]
    ctx.note = s.cause === 'feedback' ? 'The world changes into the UCA context, but the feedback does not report it.'
      : s.cause === 'process-model' ? 'The world changes and the feedback reports it, but the process model is not updated.'
      : 'The world changes into the UCA context; the controller observes it.'
    act.events = [{ on: ca.id, what: u.guide === 'not-provided' ? 'absent' : 'occurs' }]
    act.note = `${mention(ca.from)} ${u.guide === 'not-provided' ? 'does not send' : 'sends'} ${mention(ca.id)}: ${mention(u.id)}.`
    return { lanes: [...new Set(lanes)], steps: [init, ctx, act] }
  }
  const ca = s.ca ? p.items[s.ca] : null
  if (ca?.kind !== 'ca') return { lanes: [], steps: [] }
  const lanes: Id[] = []
  const [init, send, result] = [step('t0', 'Initial state.'), step('t1', `${mention(ca.from)} sends ${mention(ca.id)}.`), step('t2', '')]
  const delivered = s.cause !== 'delivery'
  send.events = [{ on: ca.id, what: delivered ? 'occurs' : 'lost' }]
  for (const id of ca.affects) {
    const w = p.items[id]
    if (w?.kind !== 'variable') continue
    const vals = valuesOf(w)
    // The intended value is the state named like the action ("Open door" → "fully open"); start from one that is not.
    const words = new Set(ca.title.toLowerCase().split(/\W+/).filter(Boolean))
    const score = (x: string) => x.toLowerCase().split(/\W+/).filter((y) => words.has(y)).length
    const ranked = vals && [...vals].sort((x, y) => score(y) - score(x))
    const intended = ranked ? ranked[0] ?? '' : String(Number(initialValue(w)) + stepOf(w) * 10)
    const a = ranked ? (ranked.find((x) => !score(x) && x !== intended) ?? ranked.find((x) => x !== intended) ?? intended) : initialValue(w)
    lanes.push(w.id)
    init.values[w.id] = a
    const wrong = s.cause === 'controlled-process' || s.cause === 'environment'
    result.values[w.id] = wrong && vals ? vals.find((x) => x !== a && x !== intended) ?? a : a
    for (const b of beliefsAbout(p, ca.from, w.id)) {
      lanes.push(b.id)
      init.values[b.id] = a
      result.values[b.id] = intended
    }
  }
  result.note = s.cause === 'delivery' ? 'The action is lost on the way; the process does not change, yet the controller assumes it did.'
    : s.cause === 'controlled-process' || s.cause === 'environment' ? 'A disturbance makes the process respond differently than intended.'
    : 'The action arrives but is not carried out; the process does not change, yet the controller assumes it did.'
  return { lanes, steps: [init, send, result] }
}
