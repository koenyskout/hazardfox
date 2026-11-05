import { Select } from './Select'
import { ucaOf } from '../model/refs'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { updateItem } from '../model/ops'
import { isRef, parseRich } from '../model/richtext'
import { applyOverrides, layoutStructure, pointAt, type Drawn, type Pt } from '../model/structure'
import { operationOf } from '../model/operations'
import { clockAt, contextHolds, diagnose, getter, whenHolds, draftTrace, mismatches, ruleConflicts, symbolViolations, textConditions, traceState, valueAt, witness } from '../model/traces'
import { beliefsAbout, controlledBy, feedbackInto, signalsOf, variablesIn } from '../model/formal'
import { itemsOfKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import type { Lane } from '../model/types'
import { asLane, laneAt, laneOf, laneLike, condInstances, instLane, isMany, isOnVariable, laneParts, leaves, laneText, stepOf, valuesOf } from '../model/variables'
import { renderText, shortName } from '../model/labels'
import { makeItem } from '../model/create'
import { CAUSE_LABELS, TRACE_EVENT_LABELS, TRACE_EVENTS, VARIABLE_LAYERS, type Id, type Project, type Scenario, type Trace, type TraceEventKind, type Variable, aboutOf } from '../model/types'
import { Ref, RichText } from './Fields'
import { WhenView } from './WhenView'

import { commit, useLabels, useProject } from './hooks'
import { askConfirm } from './dialogs'
import { Picker } from './Picker'
import { Icon, LayerIcon, LayerTag } from './Icon'
import { StructureSvg } from './StructureSvg'

/** A trace lane: a variable (all instances alike), a variable's single instance(s) ("<variable>@t1"), or a condition in words. */
interface LaneRow { key: Lane; v: Variable; names: string[] }
const lanesOf = (p: Project, t: Trace): LaneRow[] => t.lanes.flatMap((key) => { const { id, names } = laneParts(key); const v = p.items[id]; return v?.kind === 'variable' ? [{ key, v, names: names.filter(Boolean) }] : [] })
const InstTag = ({ l }: { l: LaneRow }) => (l.names.length ? <span className="inst-name" title="Lane of one instance">{l.names.join(', ')}</span> : null)

const save = (s: Scenario, trace: Trace, key?: string) => commit((q) => updateItem(q, s.id, { trace }), key && `${s.id}:trace:${key}`)
const setStep = (t: Trace, i: number, f: (st: Trace['steps'][number]) => Partial<Trace['steps'][number]>): Trace =>
  ({ ...t, steps: t.steps.map((st, j) => (j === i ? { ...st, ...f(st) } : st)) })

function RichView({ text }: { text: string }) {
  return <>{parseRich(text).map((segs, k) => (
    <Fragment key={k}>{k > 0 && <br />}{segs.map((s, i) => isRef(s) ? <Ref key={i} id={s.id} /> : <span key={i} style={{ fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined }}>{s.text}</span>)}</Fragment>
  ))}</>
}

/** Checks of a trace against its scenario: does it witness the UCA, and does it point at the chosen causal factor? */
function TraceChecks({ s }: { s: Scenario }) {
  const p = useProject()
  const w = witness(p, s)
  const d = diagnose(p, s)
  const u = ucaOf(s) ? p.items[ucaOf(s)!] : null
  const uca = u?.kind === 'uca' ? u : null
  if (!s.trace.steps.length) return null
  return (
    <div className="trace-checks">
      {w && <span className={w.ok ? 'ok' : w.ok === false ? 'bad' : 'unk'}>{w.ok ? '✓' : w.ok === false ? '✗' : '?'} Witness: {w.why}</span>}
      {w && uca && uca.conditions.length > 0 && <WhenView ws={uca.conditions} verdict={(x) => whenHolds(p, x, getter(traceState(p, s.trace, w.step), clockAt(p, s.trace, w.step)), uca.conditions)} />}
      {d && <span className={!s.cause || d.cause === s.cause ? 'ok' : 'bad'}>{!s.cause || d.cause === s.cause ? '✓' : '✗'} Trace points at <b>{CAUSE_LABELS[d.cause]}</b> ({d.why}){s.cause && d.cause !== s.cause && <> but the causal factor is {CAUSE_LABELS[s.cause]}</>}</span>}
    </div>
  )
}

/** Lanes (variables) × steps grid; empty cells carry the previous value forward. */
export function TraceEditor({ s }: { s: Scenario }) {
  const p = useProject()
  const labels = useLabels()
  const t = s.trace
  const vars = lanesOf(p, t)
  const u = ucaOf(s) ? p.items[ucaOf(s)!] : null
  const uca = u?.kind === 'uca' ? u : null
  // lanes for the instances the UCA's conditions name, and a custom one for any variable with several instances
  // lanes for the instances the UCA's conditions name, with the signals and beliefs about them
  const ctrl = uca ? p.items[uca.ca] : null
  const instPick = uca && ctrl?.kind === 'ca' ? uca.conditions.flatMap(leaves).flatMap((c) => {
    if (!isOnVariable(c)) return []
    const v = p.items[c.variable]
    const k = instLane(c)
    if (v?.kind !== 'variable' || k === v.id || !condInstances(p, c).length) return []
    const tag = laneParts(k).names.filter(Boolean).join(', ')
    const related = [v, ...feedbackInto(p, ctrl.from).flatMap((f) => signalsOf(p, f.id)).filter((x) => aboutOf(x) === v.id), ...beliefsAbout(p, ctrl.from, v.id)]
    return related.filter((x) => !t.lanes.includes(laneLike(x.id, k))).map((x) => ({ k: laneLike(x.id, k), label: `${shortName(p, x)} · ${tag}` }))
  }) : []
  const manyVars = itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain' && isMany(p, v))
  const addCustom = (id: Id | null) => { const v = id ? p.items[id] : null; if (v?.kind !== 'variable') return; const n = prompt(`Instance name${itemsOfKind(p, 'relationship').some((r) => r.id === v.parent) ? 's (e.g. t1 or t1|c1 for both ends)' : ''}`)?.trim(); if (n) save(s, { ...t, lanes: [...new Set([...t.lanes, laneAt(id!, n)])] }) }
  const actionAt = witness(p, s)?.step ?? -1
  const draft = async () => { if (!t.steps.length || (await askConfirm('The current trace is replaced by a drafted one.', { title: 'Draft a new trace?', confirm: 'Replace' }))) save(s, draftTrace(p, s)) }
  const events = [...itemsOfKind(p, 'ca'), ...itemsOfKind(p, 'feedback'), ...itemsOfKind(p, 'operation')]
  const lanePick = itemsOfKind(p, 'variable').filter((v) => !t.lanes.includes(laneOf(v.id)))
  // Conditions in words are boolean lanes keyed by their text.
  const words = t.lanes.filter((k) => laneText(k) !== null).map((k) => ({ ...makeItem('variable', { title: renderText(labels, laneText(k)!), type: 'boolean' }), id: k }))
  const wordPick = textConditions(p).filter((k) => !t.lanes.includes(k))
  const addStep = () => save(s, { ...t, steps: [...t.steps, { t: 't' + t.steps.length, note: '', values: {}, events: [] }] })
  const delStep = (i: number) => save(s, { ...t, steps: t.steps.filter((_, j) => j !== i) })
  const delLane = (id: Lane) => save(s, { lanes: t.lanes.filter((x) => x !== id), steps: t.steps.map((st) => { const values = { ...st.values }; delete values[id]; return { ...st, values } }) })
  const setValue = (i: number, id: Lane, v: string) => save(s, setStep(t, i, (st) => { const values = { ...st.values }; if (v === '') delete values[id]; else values[id] = v; return { values } }), `${i}:${id}`)
  const mm = t.steps.map((_, i) => new Map(mismatches(p, t, i).map((m) => [m.id, m])))
  const computed = t.steps.map((_, i) => traceState(p, t, i))
  const conflicts = t.steps.map((_, i) => new Map(ruleConflicts(p, t, i).map(([id, , x]) => [id, x])))
  const sym = new Map(symbolViolations(p, t).map((x) => [`${x.step}:${x.id}`, `Breaks "${x.property}": ${x.previous} → ${x.value}`]))
  const lane = ({ key, v }: LaneRow, head: ReactNode) => (
    <tr key={key}>
      <th>{head} <button className="x" title="Remove lane" onClick={() => delLane(key)}><Icon name="x" size={12} /></button></th>
      {t.steps.map((_, i) => {
        const { value, set } = valueAt(t, i, key)
        const m = mm[i].get(key)
        const c = conflicts[i].get(key)
        const sv = sym.get(`${i}:${key}`)
        const derived = !set && computed[i][key] !== undefined && computed[i][key] !== value
        return (
          <td key={i} className={(set ? 'set' : 'carried') + (derived ? ' computed' : '') + (m ? ' mm' : '') + (c || sv ? ' conflict' : '') + (i === actionAt ? ' act' : '')} title={sv ?? (c ? `Contradicts its parts, which give ${c}` : m ? `Differs from the world (${labels[m.world]} = ${m.actual})` : derived ? 'Computed from its parts' : undefined)}>
            <ValueInput v={v} value={set ? value ?? '' : ''} carried={set ? undefined : derived ? computed[i][key] : value} onChange={(x) => setValue(i, key, x)} />
          </td>
        )
      })}
    </tr>
  )
  return (
    <div className="trace">
      <div className="toolbar">
        <button onClick={draft} title="Generate steps from the UCA context (or the control action) and the causal factor">Draft trace</button>
        <button onClick={addStep}><Icon name="plus" size={12} /> step</button>
        <Picker options={lanePick} onPick={(id) => id && save(s, { ...t, lanes: [...t.lanes, laneOf(id)] })}><span className="muted">+ variable lane…</span></Picker>
        {(instPick.length > 0 || manyVars.length > 0) && <Select value="" title="Add a row for one instance of a variable that exists several times (e.g. one particular train)" onChange={(e) => { const x = e.target.value; if (x === '*') return; x && save(s, { ...t, lanes: [...t.lanes, asLane(x)] }) }}>
          <option value="">+ instance lane…</option>
          {instPick.map(({ k, label }) => <option key={k} value={k}>{label}</option>)}
        </Select>}
        {manyVars.length > 0 && <Picker options={manyVars} onPick={addCustom}><span className="muted">+ other instance…</span></Picker>}
        {wordPick.length > 0 && <Select value="" onChange={(e) => e.target.value && save(s, { ...t, lanes: [...t.lanes, asLane(e.target.value)] })}><option value="">+ condition in words…</option>{wordPick.map((k) => <option key={k} value={k}>{renderText(labels, laneText(k)!)}</option>)}</Select>}
        <span className="hint">A trace is a sequence of steps. A value stays the same until a later step changes it. Red marks where a signal or belief differs from the actual world.</span>
      </div>
      <TraceChecks s={s} />
      {t.steps.length === 0 ? <p className="empty">No trace yet. “Draft trace” builds one from the {s.scenarioType === 'uca' ? 'UCA context and causal factor' : 'control action'}.</p> : (
        <div className="trace-wrap">
          <table className="grid trace-grid">
            <thead>
              <tr>
                <th />
                {t.steps.map((st, i) => (
                  <th key={i} className={i === actionAt ? 'act' : ''}>
                    <input className="step-t" value={st.t} onChange={(e) => save(s, setStep(t, i, () => ({ t: e.target.value })), `${i}:t`)} />
                    <button className="x" title="Remove step" onClick={() => delStep(i)}><Icon name="x" size={12} /></button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VARIABLE_LAYERS.map((layer) => {
                const rows = vars.filter((l) => l.v.layer === layer)
                return rows.length > 0 && (
                  <Fragment key={layer}>
                    <tr className="layer-row"><th colSpan={t.steps.length + 1}><LayerTag layer={layer} /></th></tr>
                    {rows.map((l) => lane(l, <><Ref id={l.v.id} /> <InstTag l={l} /> <Owner v={l.v} /></>))}
                  </Fragment>
                )
              })}
              {words.length > 0 && <tr className="layer-row"><th colSpan={t.steps.length + 1}>In words</th></tr>}
              {words.map((v) => lane({ key: v.id, v, names: [] }, <span className="lane-words">{v.title}</span>))}
              <tr className="layer-row"><th colSpan={t.steps.length + 1}>Events</th></tr>
              <tr>
                <th className="muted">Events</th>
                {t.steps.map((st, i) => (
                  <td key={i} className={i === actionAt ? 'act' : ''}>
                    {st.events.map((e, k) => (
                      <div key={k} className="ev">
                        <Ref id={e.on} />
                        {(operationOf(p, e.on)?.params ?? []).map((q) => <input key={q.name} className="ev-arg" size={6} placeholder={q.name} title={q.data ? `${q.name}: value` : `${q.name}: instance of ${p.items[q.entity]?.title ?? '?'}`} value={e.args?.[q.name] ?? ''} onChange={(x) => save(s, setStep(t, i, (o) => ({ events: o.events.map((y, j) => (j === k ? { ...y, args: { ...y.args, [q.name]: x.target.value } } : y)) })), `${i}:${k}:${q.name}`)} />)}
                        <Select value={e.what} onChange={(x) => save(s, setStep(t, i, (o) => ({ events: o.events.map((y, j) => (j === k ? { ...y, what: x.target.value as TraceEventKind } : y)) })))}>
                          {TRACE_EVENTS.map((w) => <option key={w} value={w}>{TRACE_EVENT_LABELS[w]}</option>)}
                        </Select>
                        <button className="x" title="Remove" onClick={() => save(s, setStep(t, i, (o) => ({ events: o.events.filter((_, j) => j !== k) })))}><Icon name="x" size={12} /></button>
                      </div>
                    ))}
                    <Picker options={events} onPick={(id) => id && save(s, setStep(t, i, (o) => ({ events: [...o.events, { on: id, what: 'occurs' }] })))}><span className="muted">+ event</span></Picker>
                  </td>
                ))}
              </tr>
              {uca && (
                <tr>
                  <th className="muted">Context of {labels[uca.id]}</th>
                  {t.steps.map((_, i) => {
                    const h = contextHolds(p, uca, computed[i])
                    return <td key={i} className={'ctx ' + (h ? 'ok' : h === false ? 'no' : 'unk') + (i === actionAt ? ' act' : '')}>{h ? 'holds' : h === false ? 'does not hold' : 'unknown'}</td>
                  })}
                </tr>
              )}
              <tr>
                <th className="muted">Note</th>
                {t.steps.map((st, i) => (
                  <td key={i} className="note"><RichText value={st.note} onChange={(v) => save(s, setStep(t, i, () => ({ note: v })), `${i}:note`)} rows={2} /></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ValueInput({ v, value, carried, onChange }: { v: Variable; value: string; carried?: string; onChange: (v: string) => void }) {
  const vals = valuesOf(v)
  if (vals) return (
    <Select value={value} display={value === '' ? (carried !== undefined ? `↳ ${carried}` : '—') : undefined} onChange={(e) => onChange(e.target.value)}>
      <option value="">{carried !== undefined ? `use previous (${carried})` : 'use previous'}</option>
      {vals.map((x) => <option key={x}>{x}</option>)}
    </Select>
  )
  if (v.type === 'symbolic') return <input type="text" value={value} placeholder={carried !== undefined ? `↳ ${carried}` : 'symbol, e.g. t1'} onChange={(e) => onChange(e.target.value)} />
  return <input type="number" value={value} step={stepOf(v)} min={v.min ?? undefined} max={v.max ?? undefined} placeholder={carried !== undefined ? `↳ ${carried}` : '—'} onChange={(e) => onChange(e.target.value)} />
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 0 → 1 over `ms`, restarting when `key` changes. */
function useProgress(key: string, ms: number) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (reduced()) { setT(1); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => { const x = Math.min(1, (now - t0) / ms); setT(x); if (x < 1) raf = requestAnimationFrame(tick) }
    setT(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [key, ms])
  return t
}

function useDrawn(p: Project): Drawn | null {
  const sig = JSON.stringify([itemsOfKind(p, 'node').map((n) => [n.id, n.parent, n.rank, n.title, n.role, n.wide, n.tall]), itemsOfKind(p, 'ca').map((c) => [c.id, c.from, c.to, c.title]), itemsOfKind(p, 'feedback').map((c) => [c.id, c.from, c.to, c.title])])
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutStructure>> | null>(null)
  useEffect(() => {
    let live = true
    layoutStructure(p).then((l) => live && setLayout(l), () => {})
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return useMemo(() => (layout ? applyOverrides(p, layout) : null), [layout, p])
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const STEP_MS = 2200

/** The scenario played on the control structure: control actions and feedback travel along the arrows, world values sit on the
 * processes, signals on the feedback and beliefs on the controllers; red marks what is missing, lost or believed wrongly. */
/** Whose signal, belief or internal state a lane is (world variables need no owner). */
function Owner({ v }: { v: Variable }) {
  const p = useProject()
  const o = v.layer !== 'domain' && v.parent ? p.items[v.parent] : null
  return o ? <small className="muted">{o.title}</small> : null
}

export function ScenarioPlayer({ s }: { s: Scenario }) {
  const p = useProject()
  const labels = useLabels()
  const d0 = useDrawn(p)
  const d = d0 && { ...d0, width: d0.width + 240, height: d0.height + 20 }
  const t = s.trace
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [run, setRun] = useState(0)
  const step = Math.min(i, t.steps.length - 1)
  const prog = useProgress(`${s.id}:${step}:${run}`, STEP_MS)
  useEffect(() => {
    if (!playing || prog < 1) return
    if (step >= t.steps.length - 1) { setPlaying(false); return }
    const h = setTimeout(() => setI(step + 1), 700)
    return () => clearTimeout(h)
  }, [playing, prog, step, t.steps.length])
  useEffect(() => { setI(0); setPlaying(false) }, [s.id])
  if (!t.steps.length) return null
  if (!d) return <p className="empty">Laying out the control structure…</p>
  const cur = t.steps[step]
  const before = step > 0 ? traceState(p, t, step - 1) : {}
  const after = traceState(p, t, step)
  const fbDone = prog >= 0.5
  const shown = ({ v, key }: LaneRow): string | undefined => (v.layer === 'domain' || v.layer === 'internal' ? after : fbDone ? after : before)[key]
  const mm = new Map(mismatches(p, t, step).map((m) => [m.id, m]))
  const vars = lanesOf(p, t)
  const u = ucaOf(s) ? p.items[ucaOf(s)!] : null
  const uca = u?.kind === 'uca' ? u : null
  const w = witness(p, s)
  const ctx = uca ? contextHolds(p, uca, after) : null
  const box = Object.fromEntries(d.nodes.map((n) => [n.id, n]))
  const edge = Object.fromEntries(d.edges.map((e) => [e.id, e]))
  // Where each lane is drawn, right of its element: beliefs/internal on their controller, signals on their feedback, world values on the
  // process of their entity, else where they are sensed or acted on.
  const worldNode = (v: Variable) => {
    const par = v.parent ? p.items[v.parent] : null
    const ents = par?.kind === 'relationship' ? par.ends.map((e) => e.entity) : [v.parent]
    const role = (n: { id: Id }, r?: string) => { const it = p.items[n.id]; return it?.kind === 'node' && it.entities.some((e) => ents.includes(e)) && (!r || it.role === r) }
    const sensed = variablesIn(p, 'signal').find((x) => aboutOf(x) === v.id && x.parent)
    const fb = sensed && p.items[sensed.parent!]
    const ca = controlledBy(p, v.id)[0]
    return d.nodes.find((n) => role(n, 'process')) ?? (fb?.kind === 'feedback' ? box[fb.from] : undefined) ?? (ca ? box[ca.to] : undefined) ?? d.nodes.find((n) => role(n))
  }
  const anchor = (v: Variable): { at: Pt; w: number } | null => {
    if (v.layer === 'signal') { const e = v.parent ? edge[v.parent] : null; if (!e) return null; const q = e.label ?? { ...pointAt(e.points, 0.5), w: 0, h: 0 }; return { at: { x: q.x + q.w + 6, y: q.y }, w: 210 } }
    const node = v.layer === 'domain' ? worldNode(v) : v.parent ? box[v.parent] : null
    return node ? { at: { x: node.x + node.w + 8, y: node.y }, w: 230 } : null
  }
  const groups = new Map<string, { at: Pt; w: number; vars: LaneRow[] }>()
  for (const l of vars) {
    const a = anchor(l.v)
    if (!a) continue
    const k = `${a.at.x},${a.at.y}`
    if (!groups.has(k)) groups.set(k, { ...a, vars: [] })
    groups.get(k)!.vars.push(l)
  }
  const evPhase = (on: Id) => (p.items[on]?.kind === 'feedback' ? clamp01(prog / 0.45) : clamp01((prog - 0.55) / 0.45))
  const go = (n: number) => { setI(Math.max(0, Math.min(t.steps.length - 1, n))); setRun((r) => r + 1) }
  return (
    <div className="player">
      <div className="player-bar">
        <button onClick={() => go(0)} title="First step">⏮</button>
        <button onClick={() => go(step - 1)} disabled={step === 0} title="Previous step">◀</button>
        <button className="primary" onClick={() => { if (!playing && step >= t.steps.length - 1) go(0); else setRun((r) => r + 1); setPlaying(!playing) }}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <button onClick={() => go(step + 1)} disabled={step >= t.steps.length - 1} title="Next step">▶</button>
        <span className="steps">{t.steps.map((st, k) => <button key={k} className={'dot' + (k === step ? ' on' : '') + (k === w?.step ? ' act' : '')} onClick={() => go(k)} title={st.t}>{st.t}</button>)}</span>
        <button onClick={() => setRun((r) => r + 1)} title="Replay this step">↻</button>
      </div>
      <div className="player-caption">
        <b>{cur.t}</b> <RichView text={cur.note} />
        {uca && <div className={'ctxline ' + (ctx ? 'on' : '')}>{ctx ? '⚠ The context of ' : 'Context of '}<Ref id={uca.id} />{ctx ? ' holds' : ctx === false ? ' does not hold' : ' unknown'}{step === w?.step && ctx && <>: <i>{generateUcaText(p, labels, uca)}</i></>}</div>}
      </div>
      <div className="stage">
        <StructureSvg p={p} d={d} h={{ hideDevices: false }} />
        <svg className="overlay" viewBox={`${d.minX} ${d.minY} ${d.width} ${d.height}`}>
          {cur.events.map((e, k) => {
            const r = edge[e.on]
            if (!r) return null
            const ph = evPhase(e.on)
            const col = r.kind === 'ca' ? '#e8590c' : '#16a34a'
            const pth = r.points.map((q, j) => `${j ? 'L' : 'M'}${q.x} ${q.y}`).join(' ')
            if (e.what === 'absent') {
              const m = pointAt(r.points, 0.5)
              return (
                <g key={k} opacity={ph > 0 ? 1 : 0.15}>
                  <path d={pth} fill="none" stroke="#c92a2a" strokeWidth={4} strokeDasharray="6 6" opacity={0.7} />
                  <Cross at={m} scale={0.6 + 0.4 * ph} />
                  <text x={m.x + 14} y={m.y + 4} fill="#c92a2a" fontSize={12} fontWeight={700}>not sent</text>
                </g>
              )
            }
            const stop = e.what === 'lost' ? 0.55 : 1
            const at = pointAt(r.points, ph * stop)
            return (
              <g key={k}>
                <path d={pth} fill="none" stroke={col} strokeWidth={5} opacity={0.25 + 0.35 * Math.min(ph, 1)} />
                {(e.what !== 'lost' || ph < 1) && <circle cx={at.x} cy={at.y} r={7} fill={col} stroke="#fff" strokeWidth={2} />}
                {e.what === 'lost' && ph >= 1 && <><Cross at={at} scale={1} /><text x={at.x + 14} y={at.y + 4} fill="#c92a2a" fontSize={12} fontWeight={700}>lost</text></>}
              </g>
            )
          })}
          {[...groups.values()].map((g, k) => (
            <foreignObject key={k} x={g.at.x} y={g.at.y} width={g.w} height={10 + g.vars.length * 20}>
              <div className="callout">
                {g.vars.map((l) => {
                  const { v, key } = l
                  const val = shown(l)
                  const changed = val !== before[key] && (v.layer === 'domain' || v.layer === 'internal' || fbDone)
                  const bad = mm.has(key) && (v.layer !== 'belief' && v.layer !== 'signal' ? false : fbDone || v.layer === 'signal')
                  return (
                    <div key={key} className={'cv l-' + v.layer + (changed ? ' changed' : '') + (bad ? ' bad' : '')} title={bad ? `Actual: ${mm.get(key)!.actual}` : undefined}>
                      <span className="layer"><LayerIcon layer={v.layer} size={11} />{v.layer === 'belief' ? 'believes' : v.layer === 'signal' ? 'reports' : v.layer === 'internal' ? 'state' : 'actual'}</span> {v.title || shortName(p, v)}{l.names.length > 0 && <i> {l.names.join(', ')}</i>} = <b>{val ?? '?'}</b>
                    </div>
                  )
                })}
              </div>
            </foreignObject>
          ))}
        </svg>
      </div>
      <table className="grid player-state">
        <thead><tr><th>Variable</th><th>Value at {cur.t}</th><th>World</th></tr></thead>
        <tbody>
          {vars.map((l) => {
            const m = mm.get(l.key)
            return (
              <tr key={l.key} className={(after[l.key] !== before[l.key] ? 'changed' : '') + (m ? ' bad' : '')}>
                <th><Ref id={l.v.id} /> <InstTag l={l} /> <Owner v={l.v} /></th>
                <td>{after[l.key] ?? '—'}</td>
                <td>{m ? <>actual <b>{m.actual}</b></> : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const Cross = ({ at, scale }: { at: Pt; scale: number }) => (
  <g transform={`translate(${at.x} ${at.y}) scale(${scale})`}>
    <circle r={10} fill="#fff" stroke="#c92a2a" strokeWidth={2} />
    <path d="M-5 -5L5 5M5 -5L-5 5" stroke="#c92a2a" strokeWidth={2.5} />
  </g>
)

/** Trace editor and animation for the selected scenario. */
export function ScenarioTrace({ s }: { s: Scenario }) {
  const [tab, setTab] = useState<'play' | 'edit'>(s.trace.steps.length ? 'play' : 'edit')
  return (
    <div className="trace-panel">
      <div className="tabs">
        <button className={tab === 'play' ? 'on' : ''} onClick={() => setTab('play')} disabled={!s.trace.steps.length}>Animation</button>
        <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Steps <i>{s.trace.steps.length}</i></button>
      </div>
      {tab === 'play' && s.trace.steps.length ? <><TraceChecks s={s} /><ScenarioPlayer s={s} /></> : <TraceEditor s={s} />}
    </div>
  )
}
