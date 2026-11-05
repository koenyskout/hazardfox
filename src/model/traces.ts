import { sameInstance, beliefsAbout, feedbackInto, partsOf, signalsOf, worldOf } from './formal'
import { variableName } from './labels'
import { exprHolds } from './expr'
import { appliedEffects, isOccurrence } from './operations'
import { mention, ucaOf } from './refs'
import { itemsOfKind } from './tree'
import { laneKeys, laneAt, nameOf, manyEndsOf, laneLike, laneOf, laneEntries, boundSeconds, condInstances, condKey, conditionComplete, isEvent, isOnVariable, isVarCmp, toValue, parseTime, instLane, otherLane, isGroup, isSetOp, isExpr, isText, laneParts, leaves, required, stepOf, valuesOf, compareSymbols, symbolAfter, symbolBefore } from './variables'
import { aboutOf, otherwiseOf, rulesOf } from './types'
import type { Cause, Comparison, EndNames, Quantifier, Condition, ConditionOp, Id, Lane, Project, Scenario, Trace, TraceStep, TextCondition, Uca, ValueCondition, Variable, When } from './types'

/** Value of a variable at step i (set there or carried forward), and whether it was set at that step. */
export function valueAt(t: Trace, i: number, id: Lane): { value: string | undefined; set: boolean } {
  for (let k = Math.min(i, t.steps.length - 1); k >= 0; k--) if (id in t.steps[k].values) return { value: t.steps[k].values[id], set: k === i }
  return { value: undefined, set: false }
}

/** All variable values at step i. */
export function stateAt(t: Trace, i: number): Record<Lane, string> {
  const out: Record<Lane, string> = {}
  for (const s of t.steps.slice(0, i + 1)) Object.assign(out, s.values)
  return out
}

/** Whether `value` satisfies the condition (null when unknown). */
export function holds(v: Variable, c: Comparison, value: string | undefined): boolean | null {
  if (value === undefined || value === '') return null
  if (isSetOp(c.op)) return (c.set ?? []).includes(value) === (c.op === 'in')
  if (v.type === 'symbolic') {
    const k = compareSymbols(value, c.state)
    return c.op === '=' ? value === c.state : c.op === '≠' ? value !== c.state : !v.ordered ? null : c.op === '<' ? k < 0 : c.op === '≤' ? k <= 0 : c.op === '>' ? k > 0 : c.op === '≥' ? k >= 0 : null
  }
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

/** Reads trace values; `lanes` lists the lanes with a value (variable lanes "<variable>@t1" per instance). */
/** Timing at one trace step: seconds a condition has held continuously, and since an event last occurred (null when step times are not numeric or it never did). */
export interface Clock { held(c: Condition, env: Env): number | null; since(on: Id): number | null; /** value at the previous step */ prev(id: Id): string | undefined }
/** The instance each declared name stands for. */
export type Env = Record<string, string>
export type Getter = ((id: Id) => string | undefined) & { lanes?: () => Lane[]; clock?: Clock }

/** The clock at step i: needs numeric step times ("5", "200 ms"; `parseTime`) from step 0 to i. */
export function clockAt(p: Project, t: Trace, i: number): Clock {
  const times = t.steps.slice(0, i + 1).map((s) => parseTime(s.t))
  const ok = times.length > 0 && times.every((x) => x !== null)
  const states: Record<number, Record<Id, string>> = {}
  const st = (k: number) => (states[k] ??= traceState(p, t, k))
  return {
    prev: (id) => (i > 0 ? st(i - 1)[id] : undefined),
    since(on) {
      if (!ok) return null
      for (let k = i; k >= 0; k--) if (t.steps[k].events.some((e) => isOccurrence(p, e, on))) return times[i]! - times[k]!
      return null
    },
    held(c, env) {
      if (!ok) return null
      const base = { ...c, time: undefined }
      let k = i
      while (k >= 0 && leafHolds(p, base, getter(st(k)), env) === true) k--
      return k === i ? null : times[i]! - times[k + 1]!
    },
  }
}
export const getter = (state: Record<Id, string>, clock?: Clock): Getter => Object.assign((id: Id) => state[id], { clock, lanes: () => laneKeys(state).filter((k) => state[k] !== '') })

const set = (x: string | undefined): x is string => x !== undefined && x !== ''
/** The values of a variable for the instances `inst` (one per end; null = any): its lanes for those instances, else the lane for all instances alike. */
function valuesFor(get: Getter, id: Id, inst: (string | null)[]): string[] {
  const bound = inst.some(Boolean)
  const lanes = get.lanes?.().map((l) => ({ l, ...laneParts(l) })).filter((x) => x.id === id && x.names.length) ?? []
  if (!bound) return [get(id), ...lanes.map((x) => get(x.l))].filter(set)
  const hit = lanes.filter((x) => inst.every((n, i) => !n || x.names[i] === n)).map((x) => get(x.l)).filter(set)
  if (hit.length || get.lanes) return hit.length ? hit : [get(id)].filter(set)
  return [get(laneAt(id, inst.map((n) => n ?? '').join('|').replace(/\|+$/, ''))) ?? get(id)].filter(set)
}
const instOf = (n: EndNames | undefined, env: Env): (string | null)[] => (n ?? []).map((b) => (b ? env[nameOf(b)] || null : null))

/** Whether a single condition holds for the instances `env` gives its names (null when unknown, undefined for an empty one); a condition in words is a boolean keyed by its text.
 *  A variable of a many-instance entity has either one lane for all instances alike, or lanes per instance; unnamed ends range over all lanes (some). */
function leafHolds(p: Project, c: Condition, get: Getter, env: Env): boolean | null | undefined {
  if (isEvent(c)) {
    if (!conditionComplete(c)) return undefined
    const d = get.clock?.since(c.event!)
    return d == null ? null : c.time!.op === '≥' ? d >= boundSeconds(c.time!) : d < boundSeconds(c.time!)
  }
  if (c.time) {
    if (!conditionComplete(c)) return undefined
    const base = leafHolds(p, { ...c, time: undefined }, get, env)
    if (base !== true) return base
    const d = get.clock?.held(c, env)
    return d == null ? null : c.time.op === '≥' ? d >= boundSeconds(c.time) : d < boundSeconds(c.time)
  }
  if (isExpr(c)) { if (!conditionComplete(c)) return undefined; return exprHolds(p, c, get, get.clock?.prev) }
  if (isText(c)) { if (!conditionComplete(c)) return undefined; const x = get(condKey(c)); return x === undefined || x === '' ? null : (x === 'true') === (c.op !== '≠') }
  const v = p.items[c.variable]
  if (v?.kind !== 'variable') return undefined
  if (isVarCmp(c) && p.items[c.other]?.kind !== 'variable') return undefined
  const vals = valuesFor(get, c.variable, instOf(c.names, env))
  const b = isVarCmp(c) ? valuesFor(get, c.other, instOf(c.otherNames, env))[0] : undefined
  const test = (x: string) => (isVarCmp(c) ? (set(b) ? holds(v, toValue(c, { state: b }), x) : null) : holds(v, c, x))
  const hs = vals.map(test)
  if (!hs.length) return null
  return hs.includes(true) ? true : hs.every((h) => h === false) ? false : null
}

type Tri = boolean | null | undefined
interface Decl { name: string; entity: Id; quant: Quantifier }
/** The names declared by the leaves of `ws`, in order of appearance (the first declaration of a name counts). */
function declsOf(p: Project, ws: When[]): Decl[] {
  const out: Decl[] = []
  for (const c of ws.flatMap(leaves)) for (const i of condInstances(p, c)) if (i.intro && !out.some((d) => d.name === i.name)) out.push({ name: i.name, entity: i.entity, quant: i.quant })
  return out
}
/** The instances of an entity a trace talks about: those named in its domain lanes, or the one undistinguished instance ('') when there are none. */
function universe(p: Project, get: Getter, entity: Id): string[] {
  const out = new Set<string>()
  for (const l of get.lanes?.() ?? []) {
    const { id, names } = laneParts(l)
    const v = p.items[id]
    if (v?.kind === 'variable' && v.layer === 'domain') for (const e of manyEndsOf(p, v)) if (names[e.end] && sameInstance(p, e.entity, entity)) out.add(names[e.end])
  }
  return out.size ? [...out] : ['']
}
/** `body` under the declarations `ds` (nested ∃ / ∀ / ¬∃ over the instances; different names of one entity stand for different instances). */
function quantify(p: Project, get: Getter, ds: Decl[], body: (env: Env) => Tri, env: Env = {}, done: Decl[] = []): Tri {
  if (!ds.length) return body(env)
  const [d, ...rest] = ds
  const uni = universe(p, get, d.entity)
  const taken = done.filter((x) => sameInstance(p, x.entity, d.entity)).map((x) => env[x.name])
  const cands = uni.filter((x) => !taken.includes(x))
  if (uni.length === 1 && uni[0] === '' && !cands.length) return null
  const hs = cands.map((x) => quantify(p, get, rest, body, { ...env, [d.name]: x }, [...done, d])).filter((h) => h !== undefined)
  if (cands.length && !hs.length) return undefined
  if (d.quant === 'all') return hs.every((h) => h === true) ? true : hs.includes(false) ? false : null
  const some = hs.includes(true) ? true : hs.every((h) => h === false) ? false : null
  return some !== null && d.quant === 'none' ? !some : some
}

/** Whether a condition holds (null when unknown). */
export const condHolds = (p: Project, c: Condition, get: Getter): Tri => whenHolds(p, c, get)

/** Texts of all conditions in words in the project (candidate trace lanes). */
export const textConditions = (p: Project): Lane[] => [...new Set(Object.values(p.items).flatMap((it) =>
  (it.kind === 'uca' || it.kind === 'hazard' ? it.conditions.flatMap(leaves) : it.kind === 'variable' ? rulesOf(it).flatMap((r) => leaves(r.when)) : []).filter((c): c is TextCondition => isText(c) && conditionComplete(c)).map(condKey)))]

/** Whether a condition tree holds (three-valued: null while it depends on an unknown value); empty conditions are ignored.
 *  The names its conditions declare are quantified over the trace's instances in order of appearance, outermost first; `scope`: the conditions that declare names (default: the tree itself). */
export function whenHolds(p: Project, w: When, get: Getter, scope: When[] = [w]): Tri {
  const mine = new Set(leaves(w).flatMap((c) => condInstances(p, c).map((i) => i.name)))
  const tree = (x: When, env: Env): Tri => {
    if (!isGroup(x)) return leafHolds(p, x, get, env)
    const hs = x.of.map((y) => tree(y, env)).filter((h) => h !== undefined)
    if (x.not) { if (!hs.length) return undefined; return hs.includes(false) ? true : hs.includes(null) ? null : false }
    return hs.includes(x.any) ? x.any : hs.includes(null) ? null : !x.any
  }
  return quantify(p, get, declsOf(p, scope).filter((d) => mine.has(d.name)), (env) => tree(w, env))
}

/** Value of a refined variable from its rules (first rule whose condition holds, else `otherwise`); undefined while a needed part is unknown. */
export function ruleValue(p: Project, v: Variable, get: Getter): string | undefined {
  for (const r of rulesOf(v)) {
    const h = whenHolds(p, r.when, get)
    if (h === null) return undefined
    if (h !== false) return r.state
  }
  return otherwiseOf(v) || undefined
}

/** State at step i, with refined world variables (and a controller's beliefs about them, from its beliefs about the parts) computed by their rules. */
export function traceState(p: Project, t: Trace, i: number): Record<Id, string> {
  // effects of operations that occurred (directly or through a control action) apply before the values set at the same step
  const raw: Record<Id, string> = {}
  for (const s of t.steps.slice(0, i + 1)) {
    for (const e of s.events) if (e.what === 'occurs') for (const ef of appliedEffects(p, e)) raw[ef.key] = ef.state
    Object.assign(raw, s.values)
  }
  const out = { ...raw }
  const vars = itemsOfKind(p, 'variable')
  if (!vars.some((v) => rulesOf(v).length)) return out
  const busy = new Set<Id>()
  const derive = (id: Id, get: (id: Id) => string | undefined, own: string | undefined): string | undefined => {
    const v = p.items[id]
    if (v?.kind !== 'variable' || !rulesOf(v).length || busy.has(id)) return own
    busy.add(id)
    const x = ruleValue(p, v, get)
    busy.delete(id)
    return x ?? own
  }
  const world = (id: Id): string | undefined => derive(id, world, raw[id])
  for (const v of vars) if (rulesOf(v).length) { const x = world(v.id); if (x !== undefined) out[v.id] = x }
  for (const b of vars) {
    if (b.layer !== 'belief' || !b.parent || !b.about) continue
    const ctrl = b.parent
    const belief = (id: Id): string | undefined => { const x = beliefsAbout(p, ctrl as Id<'node'>, id)[0]; return x ? derive(id, belief, raw[x.id]) : derive(id, belief, undefined) }
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

/** Steps where a symbolic lane breaks its type's properties: a repeated value (unique), a decrease (monotonic) or a jump (sequential). */
export function symbolViolations(p: Project, t: Trace): { step: number; id: Id; property: 'unique' | 'monotonic' | 'sequential'; value: string; previous: string }[] {
  const out: ReturnType<typeof symbolViolations> = []
  for (const id of t.lanes) {
    const v = p.items[id]
    if (v?.kind !== 'variable' || v.type !== 'symbolic' || !(v.unique || v.monotonic || v.sequential)) continue
    const seen: string[] = []
    t.steps.forEach((_, i) => {
      const x = stateAt(t, i)[id]
      const prev = seen[seen.length - 1]
      if (x === undefined || x === prev) return
      if (prev !== undefined) {
        if (v.unique && seen.includes(x)) out.push({ step: i, id, property: 'unique', value: x, previous: prev })
        if (v.monotonic && compareSymbols(x, prev) < 0) out.push({ step: i, id, property: 'monotonic', value: x, previous: prev })
        if (v.sequential && x !== symbolAfter(prev)) out.push({ step: i, id, property: 'sequential', value: x, previous: prev })
      }
      seen.push(x)
    })
  }
  return out
}

/** Whether the UCA's context holds in a state: false if a condition fails, null if one is unknown. */
export function contextHolds(p: Project, u: Uca, state: Record<Id, string>, clock?: Clock): boolean | null {
  const h = whenHolds(p, { kind: 'group', any: false, of: u.conditions }, getter(state, clock))
  return h === undefined ? true : h
}

export const NEGATE: Record<ConditionOp, ConditionOp> = { '=': '≠', '≠': '=', in: 'not in', 'not in': 'in', '<': '≥', '≥': '<', '≤': '>', '>': '≤', between: 'not between', 'not between': 'between' }

/** A value that satisfies the condition (or, with `negate`, one that does not). */
export function pickValue(v: Variable, c: Comparison, negate = false): string {
  const op = negate ? NEGATE[c.op] : c.op
  const vals = valuesOf(v)
  if (vals) {
    if (op === '=') return c.state
    if (op === 'in') return c.set?.[0] ?? vals[0] ?? ''
    const not = op === '≠' ? [c.state] : c.set ?? []
    return vals.find((x) => !not.includes(x)) ?? ''
  }
  if (v.type === 'symbolic') {
    const s = c.state
    switch (op) {
      case '=': case '≤': case '≥': return s
      case '≠': case '>': return symbolAfter(s)
      case '<': return symbolBefore(s)
    }
    return ''
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
export const initialValue = (v: Variable): string => (valuesOf(v)?.[0] ?? (v.type === 'symbolic' ? 'x1' : String(v.min ?? 0)))

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
  const ctx = contextHolds(p, u, traceState(p, s.trace, step), clockAt(p, s.trace, step))
  return { step, ok: ctx, why: ctx === false ? 'the UCA context does not hold at that step' : ctx === null ? 'some context conditions have no value at that step' : 'the UCA context holds when the action is ' + (ev.what === 'absent' ? 'withheld' : 'sent') }
}

export interface Mismatch { id: Id; world: Id; value: string; actual: string }

/** Signals and beliefs whose value differs from the world variable they are about, at step i. */
export function mismatches(p: Project, t: Trace, i: number): Mismatch[] {
  const st = traceState(p, t, i)
  const out: Mismatch[] = []
  for (const [id, value] of laneEntries(st)) {
    const { id: vid, names } = laneParts(id)
    const v = p.items[vid]
    if (v?.kind !== 'variable' || v.layer === 'domain' || v.layer === 'internal') continue
    const w = worldOf(p, v)
    // a per-instance signal or belief is compared with the same instance of the world variable (or the lane for all instances)
    const actual = w ? st[laneLike(w.id, id)] ?? (names.length ? st[laneOf(w.id)] : undefined) : undefined
    if (!w || w.type !== v.type || actual === undefined) continue
    if (value !== actual) out.push({ id, world: w.id, value, actual })
  }
  return out
}

/** Causal factor the trace points at, from comparing world, signals and beliefs of the controller at the action step. */
export function diagnose(p: Project, s: Scenario): { cause: Cause; why: string } | null {
  const u = ucaOf(s) ? p.items[ucaOf(s)!] : null
  const ca = u?.kind === 'uca' ? p.items[u.ca] : null
  if (s.scenarioType !== 'uca' || u?.kind !== 'uca' || ca?.kind !== 'ca') return null
  const step = actionStep(s.trace, ca.id)
  if (step < 0) return null
  const st = traceState(p, s.trace, step)
  const fbs = feedbackInto(p, ca.from)
  let anyBelief = false
  for (const c of u.conditions.flatMap(required)) {
    if (!isOnVariable(c)) continue
    const w = p.items[c.variable]
    if (w?.kind !== 'variable' || w.layer !== 'domain') continue
    // per-instance lanes of a named instance ("<variable>@t1"), else the lanes for all instances
    const il = instLane(c)
    const rd = (id: Id) => st[laneLike(id, il)] ?? st[laneOf(id)]
    if (rd(w.id) === undefined) continue
    // Signals about the variable or one of its parts, each compared with the world variable it is about.
    const about = [w.id, ...partsOf(p, w.id)]
    const sigs = fbs.flatMap((f) => signalsOf(p, f.id)).filter((x) => about.includes(aboutOf(x) ?? '') && rd(x.id) !== undefined)
    const bel = beliefsAbout(p, ca.from, w.id).filter((b) => rd(b.id) !== undefined)
    const bad = sigs.find((x) => rd(aboutOf(x)!) !== undefined && rd(x.id) !== rd(aboutOf(x)!))
    if (bad) return { cause: 'feedback', why: `the signal about ${variableName(p, p.items[aboutOf(bad)!] as Variable)} differs from the world` }
    for (const b of bel) {
      anyBelief = true
      if (rd(b.id) === rd(w.id)) continue
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
    const u = ucaOf(s) ? p.items[ucaOf(s)!] : null
    const ca = u?.kind === 'uca' ? p.items[u.ca] : null
    if (u?.kind !== 'uca' || ca?.kind !== 'ca') return { lanes: [], steps: [] }
    const ctrl = ca.from
    const fbs = feedbackInto(p, ctrl)
    const lanes: Lane[] = []
    const [init, ctx, act] = [step('t0', 'Initially the context does not hold.'), step('t1', ''), step('t2', '')]
    const lost = new Set<Id>(), sent = new Set<Id>()
    // Only the first condition is false initially; it becoming true makes the context hold.
    for (const [k, c] of u.conditions.flatMap(required).entries()) {
      if (isEvent(c)) continue
      if (isText(c)) {
        if (!conditionComplete(c)) continue
        const key = condKey(c), after = String(c.op !== '≠')
        lanes.push(key)
        init.values[key] = k ? after : String(c.op === '≠')
        ctx.values[key] = after
        continue
      }
      if (!isOnVariable(c)) continue
      const w = p.items[c.variable]
      if (w?.kind !== 'variable') continue
      const o = isVarCmp(c) ? p.items[c.other] : null
      let cc: Comparison | ValueCondition = c as ValueCondition
      if (isVarCmp(c) && o?.kind === 'variable') {
        const ol = otherLane(c), ref = init.values[ol] ?? initialValue(o)
        lanes.push(ol)
        init.values[ol] = ctx.values[ol] = ref
        cc = toValue(c, { state: ref })
      }
      // "no instance" holds when the value fails the condition; a named instance gets a lane of its own
      const none = condInstances(p, c).some((i) => i.intro && i.quant === 'none')
      const after = pickValue(w, cc, none), before = k ? after : pickValue(w, cc, !none)
      const lane = instLane(c)
      lanes.push(lane)
      init.values[lane] = before
      ctx.values[lane] = after
      if (w.layer !== 'domain') continue
      // signals and beliefs about a named instance get that instance's lane too
      for (const f of fbs) for (const sig of signalsOf(p, f.id).filter((x) => aboutOf(x) === w.id)) {
        lanes.push(laneLike(sig.id, lane))
        init.values[laneLike(sig.id, lane)] = before
        if (s.cause === 'feedback') lost.add(f.id)
        else { ctx.values[laneLike(sig.id, lane)] = after; sent.add(f.id) }
      }
      for (const b of beliefsAbout(p, ctrl, w.id)) {
        lanes.push(laneLike(b.id, lane))
        init.values[laneLike(b.id, lane)] = before
        if (s.cause !== 'feedback' && s.cause !== 'process-model') ctx.values[laneLike(b.id, lane)] = after
      }
    }
    // timing conditions: numeric times, the action sent late enough; an event condition's event occurs as the context starts
    const timed = u.conditions.flatMap(required).filter((c) => c.time && conditionComplete(c))
    if (timed.length) {
      const gap = Math.max(1, ...timed.filter((c) => c.time!.op === '≥').map((c) => Math.ceil(boundSeconds(c.time!))))
      init.t = '0'; ctx.t = '1'; act.t = String(1 + gap)
      for (const c of timed) if (isEvent(c) && p.items[c.event]) sent.add(c.event)
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
  const lanes: Lane[] = []
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
    const intended = ranked ? ranked[0] ?? '' : w.type === 'symbolic' ? symbolAfter(initialValue(w)) : String(Number(initialValue(w)) + stepOf(w) * 10)
    const a = ranked ? (ranked.find((x) => !score(x) && x !== intended) ?? ranked.find((x) => x !== intended) ?? intended) : initialValue(w)
    lanes.push(laneOf(w.id))
    init.values[laneOf(w.id)] = a
    const wrong = s.cause === 'controlled-process' || s.cause === 'environment'
    result.values[laneOf(w.id)] = wrong && vals ? vals.find((x) => x !== a && x !== intended) ?? a : a
    for (const b of beliefsAbout(p, ca.from, w.id)) {
      lanes.push(laneOf(b.id))
      init.values[laneOf(b.id)] = a
      result.values[laneOf(b.id)] = intended
    }
  }
  result.note = s.cause === 'delivery' ? 'The action is lost on the way; the process does not change, yet the controller assumes it did.'
    : s.cause === 'controlled-process' || s.cause === 'environment' ? 'A disturbance makes the process respond differently than intended.'
    : 'The action arrives but is not carried out; the process does not change, yet the controller assumes it did.'
  return { lanes, steps: [init, send, result] }
}
