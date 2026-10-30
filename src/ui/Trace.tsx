import { Fragment, useEffect, useMemo, useState } from 'react'
import { variableName } from '../model/labels'
import { updateItem } from '../model/ops'
import { isRef, parseRich } from '../model/richtext'
import { applyOverrides, layoutStructure, pointAt, type Drawn, type Pt } from '../model/structure'
import { contextHolds, diagnose, draftTrace, mismatches, stateAt, valueAt, witness } from '../model/traces'
import { controlledBy, variablesIn } from '../model/formal'
import { itemsOfKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { stepOf, valuesOf } from '../model/variables'
import { CAUSE_LABELS, LAYER_SHORT, TRACE_EVENT_LABELS, TRACE_EVENTS, VARIABLE_LAYERS, type Id, type Project, type Scenario, type Trace, type TraceEventKind, type Variable } from '../model/types'
import { Ref, RichText } from './Fields'
import { commit, useLabels, useProject } from './hooks'
import { Picker } from './Picker'
import { StructureSvg } from './StructureSvg'

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
  if (!s.trace.steps.length) return null
  return (
    <div className="trace-checks">
      {w && <span className={w.ok ? 'ok' : w.ok === false ? 'bad' : 'unk'}>{w.ok ? '✓' : w.ok === false ? '✗' : '?'} Witness: {w.why}</span>}
      {d && <span className={!s.cause || d.cause === s.cause ? 'ok' : 'bad'}>{!s.cause || d.cause === s.cause ? '✓' : '✗'} Trace points at <b>{CAUSE_LABELS[d.cause]}</b> ({d.why}){s.cause && d.cause !== s.cause && <> but the causal factor is {CAUSE_LABELS[s.cause]}</>}</span>}
    </div>
  )
}

/** Lanes (variables) × steps grid; empty cells carry the previous value forward. */
export function TraceEditor({ s }: { s: Scenario }) {
  const p = useProject()
  const labels = useLabels()
  const t = s.trace
  const vars = t.lanes.map((id) => p.items[id]).filter((v): v is Variable => v?.kind === 'variable')
  const u = s.uca ? p.items[s.uca] : null
  const uca = u?.kind === 'uca' ? u : null
  const actionAt = witness(p, s)?.step ?? -1
  const draft = () => (!t.steps.length || confirm('Replace the current trace with a drafted one?')) && save(s, draftTrace(p, s))
  const events = [...itemsOfKind(p, 'ca'), ...itemsOfKind(p, 'feedback')]
  const lanePick = itemsOfKind(p, 'variable').filter((v) => !t.lanes.includes(v.id))
  const addStep = () => save(s, { ...t, steps: [...t.steps, { t: 't' + t.steps.length, note: '', values: {}, events: [] }] })
  const delStep = (i: number) => save(s, { ...t, steps: t.steps.filter((_, j) => j !== i) })
  const delLane = (id: Id) => save(s, { lanes: t.lanes.filter((x) => x !== id), steps: t.steps.map((st) => { const values = { ...st.values }; delete values[id]; return { ...st, values } }) })
  const setValue = (i: number, id: Id, v: string) => save(s, setStep(t, i, (st) => { const values = { ...st.values }; if (v === '') delete values[id]; else values[id] = v; return { values } }), `${i}:${id}`)
  const mm = t.steps.map((_, i) => new Map(mismatches(p, t, i).map((m) => [m.id, m])))
  return (
    <div className="trace">
      <div className="toolbar">
        <button onClick={draft} title="Generate steps from the UCA context (or the control action) and the causal factor">Draft trace</button>
        <button onClick={addStep}>+ step</button>
        <Picker options={lanePick} onPick={(id) => id && save(s, { ...t, lanes: [...t.lanes, id] })}><span className="muted">+ variable lane…</span></Picker>
        <span className="hint">A trace is a sequence of states: values carry forward until changed. Mismatches between a signal or belief and the world are marked red.</span>
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
                    <button className="x" title="Remove step" onClick={() => delStep(i)}>×</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VARIABLE_LAYERS.map((layer) => {
                const rows = vars.filter((v) => v.layer === layer)
                return rows.length > 0 && (
                  <Fragment key={layer}>
                    <tr className="layer-row"><th colSpan={t.steps.length + 1}><span className={'layer l-' + layer}>{LAYER_SHORT[layer]}</span></th></tr>
                    {rows.map((v) => (
                      <tr key={v.id}>
                        <th><Ref id={v.id} /> {variableName(p, v)} <button className="x" title="Remove lane" onClick={() => delLane(v.id)}>×</button></th>
                        {t.steps.map((_, i) => {
                          const { value, set } = valueAt(t, i, v.id)
                          const m = mm[i].get(v.id)
                          return (
                            <td key={i} className={(set ? 'set' : 'carried') + (m ? ' mm' : '') + (i === actionAt ? ' act' : '')} title={m ? `Differs from the world (${labels[m.world]} = ${m.actual})` : undefined}>
                              <ValueInput v={v} value={set ? value ?? '' : ''} carried={set ? undefined : value} onChange={(x) => setValue(i, v.id, x)} />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
              <tr className="layer-row"><th colSpan={t.steps.length + 1}>Events</th></tr>
              <tr>
                <th className="muted">Control actions & feedback</th>
                {t.steps.map((st, i) => (
                  <td key={i} className={i === actionAt ? 'act' : ''}>
                    {st.events.map((e, k) => (
                      <div key={k} className="ev">
                        <Ref id={e.on} />
                        <select value={e.what} onChange={(x) => save(s, setStep(t, i, (o) => ({ events: o.events.map((y, j) => (j === k ? { ...y, what: x.target.value as TraceEventKind } : y)) })))}>
                          {TRACE_EVENTS.map((w) => <option key={w} value={w}>{TRACE_EVENT_LABELS[w]}</option>)}
                        </select>
                        <button className="x" onClick={() => save(s, setStep(t, i, (o) => ({ events: o.events.filter((_, j) => j !== k) })))}>×</button>
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
                    const h = contextHolds(p, uca, stateAt(t, i))
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
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{carried !== undefined ? `↳ ${carried}` : '—'}</option>
      {vals.map((x) => <option key={x}>{x}</option>)}
    </select>
  )
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
  const before = step > 0 ? stateAt(t, step - 1) : {}
  const after = stateAt(t, step)
  const fbDone = prog >= 0.5
  const shown = (v: Variable): string | undefined => (v.layer === 'domain' || v.layer === 'internal' ? after : fbDone ? after : before)[v.id]
  const mm = new Map(mismatches(p, t, step).map((m) => [m.id, m]))
  const vars = t.lanes.map((id) => p.items[id]).filter((v): v is Variable => v?.kind === 'variable')
  const u = s.uca ? p.items[s.uca] : null
  const uca = u?.kind === 'uca' ? u : null
  const w = witness(p, s)
  const ctx = uca ? contextHolds(p, uca, after) : null
  const box = Object.fromEntries(d.nodes.map((n) => [n.id, n]))
  const edge = Object.fromEntries(d.edges.map((e) => [e.id, e]))
  // Where each lane is drawn, right of its element: beliefs/internal on their controller, signals on their feedback, world values on the
  // process of their entity, else where they are sensed or acted on.
  const worldNode = (v: Variable) => {
    const role = (n: { id: Id }, r?: string) => { const it = p.items[n.id]; return it?.kind === 'node' && it.entity === v.parent && (!r || it.role === r) }
    const sensed = variablesIn(p, 'signal').find((x) => x.about === v.id && x.parent)
    const fb = sensed && p.items[sensed.parent!]
    const ca = controlledBy(p, v.id)[0]
    return d.nodes.find((n) => role(n, 'process')) ?? (fb?.kind === 'feedback' ? box[fb.from] : undefined) ?? (ca ? box[ca.to] : undefined) ?? d.nodes.find((n) => role(n))
  }
  const anchor = (v: Variable): { at: Pt; w: number } | null => {
    if (v.layer === 'signal') { const e = v.parent ? edge[v.parent] : null; if (!e) return null; const q = e.label ?? { ...pointAt(e.points, 0.5), w: 0, h: 0 }; return { at: { x: q.x + q.w + 6, y: q.y }, w: 210 } }
    const node = v.layer === 'domain' ? worldNode(v) : v.parent ? box[v.parent] : null
    return node ? { at: { x: node.x + node.w + 8, y: node.y }, w: 230 } : null
  }
  const groups = new Map<string, { at: Pt; w: number; vars: Variable[] }>()
  for (const v of vars) {
    const a = anchor(v)
    if (!a) continue
    const k = `${a.at.x},${a.at.y}`
    if (!groups.has(k)) groups.set(k, { ...a, vars: [] })
    groups.get(k)!.vars.push(v)
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
                {g.vars.map((v) => {
                  const val = shown(v)
                  const changed = val !== before[v.id] && (v.layer === 'domain' || v.layer === 'internal' || fbDone)
                  const bad = mm.has(v.id) && (v.layer !== 'belief' && v.layer !== 'signal' ? false : fbDone || v.layer === 'signal')
                  return (
                    <div key={v.id} className={'cv l-' + v.layer + (changed ? ' changed' : '') + (bad ? ' bad' : '')} title={bad ? `Actual: ${mm.get(v.id)!.actual}` : undefined}>
                      <span className="layer">{v.layer === 'belief' ? 'believes' : v.layer === 'signal' ? 'reports' : v.layer === 'internal' ? 'state' : 'actual'}</span> {v.title} = <b>{val ?? '?'}</b>
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
          {vars.map((v) => {
            const m = mm.get(v.id)
            return (
              <tr key={v.id} className={(after[v.id] !== before[v.id] ? 'changed' : '') + (m ? ' bad' : '')}>
                <th><span className={'layer l-' + v.layer}>{LAYER_SHORT[v.layer]}</span> <Ref id={v.id} /> {variableName(p, v)}</th>
                <td>{after[v.id] ?? '—'}</td>
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
  const labels = useLabels()
  const [tab, setTab] = useState<'play' | 'edit'>(s.trace.steps.length ? 'play' : 'edit')
  return (
    <div className="trace-panel">
      <div className="tabs">
        <b className="trace-title">{labels[s.id]} trace</b>
        <button className={tab === 'play' ? 'on' : ''} onClick={() => setTab('play')} disabled={!s.trace.steps.length}>Animation</button>
        <button className={tab === 'edit' ? 'on' : ''} onClick={() => setTab('edit')}>Steps <i>{s.trace.steps.length}</i></button>
      </div>
      {tab === 'play' && s.trace.steps.length ? <><TraceChecks s={s} /><ScenarioPlayer s={s} /></> : <TraceEditor s={s} />}
    </div>
  )
}
