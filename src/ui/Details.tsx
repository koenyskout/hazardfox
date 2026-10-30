import { renderText } from '../model/labels'
import { guideApplies } from '../model/uca'
import { conditionComplete, conditionError, conditionText, isRangeOp, isSetOp, OP_LABELS, opsFor, stepOf, valuesOf } from '../model/variables'
import { VARIABLE_TYPES, VARIABLE_TYPE_LABELS, type ConditionOp, type VariableType, CAUSES, DURATIONS, DURATION_LABELS, type Duration, GUIDE_WORD_LABELS, GUIDE_WORDS, KIND_NAMES, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPE_LABELS, SCENARIO_TYPES, STATUSES, STRIDE, type Cause, type GuideWord, type Id, type Item, type ItemOf, type Kind, type NodeRole, type Patch, type RequirementType, type ScenarioType } from '../model/types'
import { effectiveLosses, inheritedLosses } from '../model/derived'
import { updateItem } from '../model/ops'
import { generateUcaText } from '../model/uca'
import { itemsOfKind, isLeaf } from '../model/tree'
import { incoming } from '../model/refs'
import { useStore } from '../model/store'
import { addItemInDialog, commit, useIds, useLabels, useProject } from './hooks'
import { Icon, StatusIcon } from './Icon'
import { DeleteDialog } from './TreeTable'
import { Modal } from './Modal'
import { StringList } from './StringList'
import { useEffect, useState } from 'react'
import { ChoicePicker, Picker } from './Picker'
import { ReviewItem } from './Review'
import { Field, ItemHover, Ref, RefList, RichText, SingleRef, Tags, TextInput, NumberInput, BoundedNumber, RangeBar } from './Fields'

export function Details() {
  const p = useProject()
  const id = useStore((s) => s.selected)
  const it = id ? p.items[id] : null
  if (!it) return <aside className="details"><p className="hint">Select an item to edit its details.</p></aside>
  return <aside className="details"><DetailsForm it={it} /></aside>
}

/** Quick-edit popup for one item (same form as the side panel). */
export function EditDialog() {
  const p = useProject()
  const labels = useLabels()
  const stack = useStore((s) => s.editing)
  const closeEditor = useStore((s) => s.closeEditor)
  const top = stack[stack.length - 1]
  useEffect(() => { if (top && !p.items[top]) closeEditor() }, [top, p, closeEditor]) // deleted meanwhile
  return (
    <>
      {stack.map((id, i) => p.items[id] && (
        <Modal key={i + id} title={`Edit ${labels[id]}`} onClose={closeEditor} wide behind={stack.length - 1 - i} stacked={i > 0}>
          <div className="details inline"><DetailsForm it={p.items[id]} popup /></div>
        </Modal>
      ))}
    </>
  )
}

function DetailsForm({ it, popup }: { it: Item; popup?: boolean }) {
  const p = useProject()
  const idLabels = useIds()
  const closeEditor = useStore((s) => s.closeEditor)
  const [deleting, setDeleting] = useState(false)
  const set: Set = (patch, key) => commit((q) => updateItem(q, it.id, patch), key ? `${it.id}:${key}` : undefined)
  const text = (f: 'title' | 'description' | 'notes') => (v: string) => set({ [f]: v }, f)
  const used = incoming(p, it.id).filter((o) => o.parent !== it.id)

  return (
    <>
      <h3>
        <span className={'chip k-' + it.kind}>{idLabels[it.id]}</span> {KIND_NAMES[it.kind]}
      </h3>
      {it.kind !== 'uca' && it.kind !== 'scenario' && (
        <Field single label="Title"><TextInput value={it.title} onChange={text('title')} /></Field>
      )}
      <KindFields it={it} set={set} />
      <ReviewItem it={it} />
      {it.kind !== 'uca' && (
        <Field label="Description"><RichText value={it.description} onChange={text('description')} /></Field>
      )}
      <Field label="Notes / rationale"><RichText value={it.notes} onChange={text('notes')} rows={2} /></Field>
      <div className="two">
        <Field label="Status">
          <ChoicePicker options={STATUSES} value={it.status} onPick={(s) => set({ status: s })} icon={(s) => <StatusIcon status={s} size={16} />} />
        </Field>
        <Field single label="Tags"><Tags value={it.tags} onChange={(v) => set({ tags: v })} /></Field>
      </div>
      {used.length > 0 && (
        <Field label="Referenced by">
          <div className="reflist">{used.map((o) => <Ref key={o.id} id={o.id} />)}</div>
        </Field>
      )}
      <div className={'actions' + (popup ? ' split' : '')}>
        <button className="danger" onClick={() => setDeleting(true)}><Icon name="trash" /> Delete</button>
        {popup && <button className="primary" onClick={closeEditor}>Done</button>}
      </div>
      {deleting && <DeleteDialog ids={[it.id]} onClose={() => { setDeleting(false); if (popup) closeEditor() }} />}
    </>
  )
}

type Set = (patch: Patch, key?: string) => void

function KindFields({ it, set }: { it: Item; set: Set }) {
  const p = useProject()
  const labels = useLabels()
  const of = <K extends Kind>(k: K) => itemsOfKind(p, k)
  /** Leaf hazards, plus any non-leaf ones still linked (so they can be removed). */
  const leafHazards = (linked: Id[]) => of('hazard').filter((h) => isLeaf(p, h.id) || linked.includes(h.id))
  switch (it.kind) {
    case 'hazard': {
      const inh = inheritedLosses(p, it.id)
      const eff = effectiveLosses(p, it.id)
      return (
        <>
          <Field label="Leads to losses" hint={inh.length ? 'Inherited from parent (greyed) can be switched off.' : undefined}>
            {inh.length > 0 && (
              <div className="reflist inherited">
                {inh.map((l) => (
                  <span key={l} className={'chipwrap' + (it.lossExclude.includes(l) ? ' off' : '')}>
                    <Ref id={l} />
                    <button className="x" title={it.lossExclude.includes(l) ? 'Inherit again' : 'Exclude'} onClick={() => set({ lossExclude: it.lossExclude.includes(l) ? it.lossExclude.filter((x) => x !== l) : [...it.lossExclude, l] })}>
                      {it.lossExclude.includes(l) ? '↺' : '×'}
                    </button>
                  </span>
                ))}
              </div>
            )}
            <RefList value={it.lossLinks} options={of('loss').filter((l) => !eff.includes(l.id) || it.lossLinks.includes(l.id))} onChange={(v) => set({ lossLinks: v })} />
          </Field>
          <label className="check"><input type="checkbox" checked={it.security} onChange={(e) => set({ security: e.target.checked })} /> Security-related (STPA-Sec)</label>
          {!isLeaf(p, it.id) && <p className="hint">Parent hazard: UCAs and constraints link to its sub-hazards.</p>}
        </>
      )
    }
    case 'constraint':
      return (
        <Field label="Prevents hazards (leaf hazards)">
          <RefList value={it.hazards} options={leafHazards(it.hazards)} onChange={(v) => set({ hazards: v })} />
        </Field>
      )
    case 'requirement':
      return (
        <>
          <Field label="Type">
            <select value={it.type} onChange={(e) => set({ type: e.target.value as RequirementType })}>{REQUIREMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </Field>
          <Field label="Derived from">
            <RefList value={it.sources} options={[...of('constraint'), ...of('scenario'), ...of('uca')]} onChange={(v) => set({ sources: v })} />
          </Field>
        </>
      )
    case 'assumption':
      return <Field label="About"><RefList value={it.about} options={Object.values(p.items).filter((o) => o.id !== it.id)} onChange={(v) => set({ about: v })} /></Field>
    case 'entity':
      return (
        <>
          <Field single label="Attributes (one per line: name: type)">
            <textarea rows={3} value={it.attributes.map((a) => (a.type ? `${a.name}: ${a.type}` : a.name)).join('\n')} onChange={(e) => set({ attributes: e.target.value.split('\n').map((l) => { const [n, ...t] = l.split(':'); return { name: n.trim(), type: t.join(':').trim() } }).filter((a) => a.name) }, 'attrs')} />
          </Field>
          <Field single label="Operations (one per line)">
            <textarea rows={2} value={it.operations.join('\n')} onChange={(e) => set({ operations: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }, 'ops')} />
          </Field>
        </>
      )
    case 'variable':
      return (
        <>
          <Field label="Owner entity">
            <SingleRef value={it.parent} options={of('entity')} onChange={(v) => v && set({ parent: v })} />
          </Field>
          <Field single label="Type">
            <select value={it.type} onChange={(e) => set({ type: e.target.value as VariableType })}>
              {VARIABLE_TYPES.map((t) => <option key={t} value={t}>{VARIABLE_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          {it.type === 'enum' && (
            <Field label="States" hint="Named values. Enter adds a state.">
              <StringList value={it.states} onChange={(v) => set({ states: v }, 'states')} placeholder="State" addLabel="Add state" />
            </Field>
          )}
          {it.type === 'range' && (
            <div className="two">
              <Field single label="Min"><NumberInput value={it.min} onChange={(v) => set({ min: v }, 'min')} /></Field>
              <Field single label="Max"><NumberInput value={it.max} onChange={(v) => set({ max: v }, 'max')} /></Field>
              <Field single label="Unit"><TextInput value={it.unit} onChange={(v) => set({ unit: v }, 'unit')} placeholder="e.g. %, mL/h" /></Field>
            </div>
          )}
        </>
      )
    case 'relationship':
      return (
        <>
          <div className="fromto">
            <Field label="From"><SingleRef value={it.from || null} options={of('entity')} onChange={(v) => set({ from: v ?? '' })} /></Field>
            <Field label="To"><SingleRef value={it.to || null} options={of('entity')} onChange={(v) => set({ to: v ?? '' })} /></Field>
          </div>
          <div className="two">
            <Field single label="Cardinality (from)"><TextInput value={it.fromCard} onChange={(v) => set({ fromCard: v }, 'fc')} /></Field>
            <Field single label="Cardinality (to)"><TextInput value={it.toCard} onChange={(v) => set({ toCard: v }, 'tc')} /></Field>
          </div>
        </>
      )
    case 'node':
      return (
        <>
          <Field label="Role">
            <select value={it.role} onChange={(e) => set({ role: e.target.value as NodeRole })}>{NODE_ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          </Field>
          <Field label="Domain entity"><SingleRef value={it.entity} options={of('entity')} onChange={(v) => set({ entity: v })} /></Field>
          <Field label="Process model (variables)">
            <RefList value={it.processModel} options={of('variable')} create={{ label: '+ New variable…', run: () => addItemInDialog('variable') }} onChange={(v) => set({ processModel: v })} />
          </Field>
          {it.nudge && <button onClick={() => set({ nudge: null })}>Reset manual position</button>}
        </>
      )
    case 'ca':
    case 'feedback': {
      const nodes = of('node')
      return (
        <>
          <div className="fromto">
            <Field label="From"><SingleRef value={it.from || null} options={nodes} onChange={(v) => set({ from: v ?? '' })} /></Field>
            <Field label="To"><SingleRef value={it.to || null} options={nodes} onChange={(v) => set({ to: v ?? '' })} /></Field>
          </div>
          {it.kind === 'feedback' && (
            <Field label="Sensor" hint="Optional: the sensor that produces this feedback. Shown as a marker on the arrow.">
              <input value={it.sensor} onChange={(e) => set({ sensor: e.target.value }, 'sensor')} />
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Actuator" hint="Optional: the actuator that carries out this control action. Shown as a marker on the arrow.">
              <input value={it.actuator} onChange={(e) => set({ actuator: e.target.value }, 'actuator')} />
            </Field>
          )}
          {it.kind === 'feedback' && (
            <Field label="Updates variables"><RefList value={it.variables} options={of('variable')} create={{ label: '+ New variable…', run: () => addItemInDialog('variable') }} onChange={(v) => set({ variables: v })} /></Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Domain operation">
              <select value={it.operation} onChange={(e) => set({ operation: e.target.value })}>
                <option value="">— none —</option>
                {of('entity').flatMap((e) => e.operations.map((o) => <option key={e.id + o} value={`${e.id}:${o}`}>{labels[e.id]} {e.title}: {o}</option>))}
              </select>
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Duration">
              <select value={it.duration} onChange={(e) => set({ duration: e.target.value as Duration })}>{DURATIONS.map((d) => <option key={d} value={d}>{DURATION_LABELS[d]}</option>)}</select>
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Guide words not applicable">
              {GUIDE_WORDS.filter((g) => guideApplies(it, g)).map((g) => {
                const n = it.notApplicable.find((x) => x.guide === g)
                const upd = (next: typeof it.notApplicable) => set({ notApplicable: next })
                return (
                  <div key={g} className="na-row">
                    <label><input type="checkbox" checked={!!n} onChange={(e) => upd(e.target.checked ? [...it.notApplicable, { guide: g, reason: '' }] : it.notApplicable.filter((x) => x.guide !== g))} /> {GUIDE_WORD_LABELS[g]}</label>
                    {n && <input placeholder="Reason" value={n.reason} onChange={(e) => upd(it.notApplicable.map((x) => (x.guide === g ? { ...x, reason: e.target.value } : x)))} />}
                  </div>
                )
              })}
            </Field>
          )}
          {(it.bend || it.labelShift) && <button onClick={() => set({ bend: null, labelShift: null })}>Reset manual routing</button>}
        </>
      )
    }
    case 'uca':
      return (
        <>
          <Field label="Control action"><SingleRef value={it.ca} options={of('ca')} onChange={(v) => v && set({ ca: v })} /></Field>
          <Field label="Guide word">
            <select value={it.guide} onChange={(e) => set({ guide: e.target.value as GuideWord })}>{GUIDE_WORDS.map((g) => <option key={g} value={g}>{GUIDE_WORD_LABELS[g]}</option>)}</select>
          </Field>
          <Field label="Context">
            <ContextSummary it={it} set={set} />
          </Field>
          <Field single label="Statement" hint="Generated from the above; type to override, clear to regenerate.">
            <textarea rows={3} value={it.override || generateUcaText(p, labels, it)} onChange={(e) => set({ override: e.target.value }, 'override')} />
          </Field>
          <Field label="Hazards (leaf)">
            <RefList value={it.hazards} options={leafHazards(it.hazards)} onChange={(v) => set({ hazards: v })} />
          </Field>
          <Field label="Controller constraint"><RichText value={it.constraint} onChange={(v) => set({ constraint: v }, 'constraint')} rows={2} /></Field>
        </>
      )
    case 'scenario':
      return (
        <>
          <Field label="Kind of scenario">
            <select value={it.scenarioType} onChange={(e) => {
              const t = e.target.value as ScenarioType
              set(t === 'uca' ? { scenarioType: t, uca: it.uca ?? of('uca')[0]?.id ?? null, ca: null, hazards: [], cause: '' } : { scenarioType: t, ca: it.ca ?? of('ca')[0]?.id ?? null, uca: null, cause: '' })
            }}>
              {SCENARIO_TYPES.map((t) => <option key={t} value={t}>{SCENARIO_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          {it.scenarioType === 'uca' ? (
            <Field label="Unsafe control action"><SingleRef value={it.uca} options={of('uca')} onChange={(v) => set({ uca: v })} /></Field>
          ) : (
            <>
              <Field label="Control action"><SingleRef value={it.ca} options={of('ca')} onChange={(v) => set({ ca: v })} /></Field>
              <Field label="Hazards (leaf)" hint="The control action is issued but not carried out properly; which hazards can this lead to?">
                <RefList value={it.hazards} options={leafHazards(it.hazards)} onChange={(v) => set({ hazards: v })} />
              </Field>
            </>
          )}
          <Field label="Causal factor">
            <select value={it.cause} onChange={(e) => set({ cause: e.target.value as Cause | '' })}>
              <option value="">—</option>
              {CAUSES[it.scenarioType].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Where in the control structure"><SingleRef value={it.element} options={of('node')} onChange={(v) => set({ element: v })} none="— not specified —" /></Field>
          <Field single label="Title"><TextInput value={it.title} onChange={(v) => set({ title: v }, 'title')} /></Field>
          <label className="check"><input type="checkbox" checked={it.adversarial} onChange={(e) => set({ adversarial: e.target.checked })} /> Adversarial (STPA-Sec)</label>
          {p.meta.strideEnabled && (
            <Field label="STRIDE">
              <div className="stride">
                {STRIDE.map((s) => (
                  <label key={s} className="check"><input type="checkbox" checked={it.stride.includes(s)} onChange={(e) => set({ stride: e.target.checked ? [...it.stride, s] : it.stride.filter((x) => x !== s) })} /> {s}</label>
                ))}
              </div>
            </Field>
          )}
          <Field label="Threat description"><RichText value={it.threat} onChange={(v) => set({ threat: v }, 'threat')} rows={2} /></Field>
          <div className="two">
            <Field label="Severity (1–5)"><Rating v={it.severity} on={(v) => set({ severity: v })} /></Field>
            <Field label="Likelihood (1–5)"><Rating v={it.likelihood} on={(v) => set({ likelihood: v })} /></Field>
          </div>
        </>
      )
    default:
      return null
  }
}

const Rating = ({ v, on }: { v: number; on: (v: number) => void }) => (
  <select value={v} onChange={(e) => on(+e.target.value)}>
    <option value={0}>—</option>
    {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
  </select>
)

function ContextSummary({ it, set }: { it: ItemOf<'uca'>; set: Set }) {
  const p = useProject()
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const lines = it.conditions.filter(conditionComplete).map((c) => conditionText(p, c))
  return (
    <div className="ctx-summary">
      {lines.length || it.context ? (
        <ul>
          {lines.map((l, i) => <li key={i}>{l}</li>)}
          {it.context && <li>{renderText(labels, it.context)}</li>}
        </ul>
      ) : <span className="muted">No context yet</span>}
      <button type="button" onClick={() => setOpen(true)}>Edit context…</button>
      {open && (
        <Modal title="Edit context" onClose={() => setOpen(false)} wide>
          <p className="muted">The UCA applies when all of these hold.</p>
          <ConditionsEditor it={it} set={set} />
          <Field label="Additional context (free text)">
            <RichText value={it.context} onChange={(v) => set({ context: v }, 'context')} rows={3} placeholder="Additional context (free text)" />
          </Field>
          <div className="modal-actions"><button className="primary" onClick={() => setOpen(false)}>Done</button></div>
        </Modal>
      )}
    </div>
  )
}

function ConditionsEditor({ it, set }: { it: ItemOf<'uca'>; set: Set }) {
  const p = useProject()
  const labels = useLabels()
  const vars = itemsOfKind(p, 'variable')
  const upd = (i: number, patch: Partial<(typeof it.conditions)[number]>) =>
    set({ conditions: it.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  return (
    <div className="conds">
      {it.conditions.map((c, i) => {
        const v = p.items[c.variable]
        const vr = v?.kind === 'variable' ? v : undefined
        const values = valuesOf(vr)
        const bar = vr?.type === 'range' && vr.min !== null && vr.max !== null && vr.max > vr.min
        const err = vr && (c.state || c.set?.length) ? conditionError(vr, c) : null
        const valueInput = (key: 'state' | 'to', placeholder: string) =>
          values ? (
            <select value={c[key] ?? ''} onChange={(e) => upd(i, { [key]: e.target.value })}>
              <option value="" disabled hidden>{placeholder}</option>
              {values.map((s) => <option key={s}>{s}</option>)}
            </select>
          ) : (
            <BoundedNumber value={c[key] ?? ''} onChange={(v) => upd(i, { [key]: v })} min={vr?.min ?? null} max={vr?.max ?? null} step={vr ? stepOf(vr) : 1} placeholder={placeholder} />
          )
        return (
          <div key={i} className="cond">
            <span className="cond-word">{i === 0 ? 'When' : 'and'}</span>
            <Picker options={vars} onPick={(id) => { const nv = id ? p.items[id] : undefined; upd(i, { variable: id ?? '', state: '', to: '', set: [], op: nv?.kind === 'variable' && opsFor(nv).includes(c.op) ? c.op : '=' }) }}>
              {v ? <><ItemHover id={v.id}><span className={'chip k-' + v.kind}>{labels[v.id]}</span></ItemHover></> : <span className="muted">variable…</span>}
            </Picker>
            <select value={c.op} onChange={(e) => upd(i, { op: e.target.value as ConditionOp })}>
              {opsFor(vr).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
            </select>
            {isSetOp(c.op)
              ? <span className="setpick"><span className="brace">{'{'}</span>{(vr?.states ?? []).map((s) => <button type="button" key={s} role="checkbox" aria-checked={!!c.set?.includes(s)} className={'opt' + (c.set?.includes(s) ? ' on' : '')} onClick={() => upd(i, { set: c.set?.includes(s) ? c.set.filter((x) => x !== s) : [...(c.set ?? []), s] })}>{c.set?.includes(s) ? '✓ ' : ''}{s}</button>)}<span className="brace">{'}'}</span>{!vr?.states.length && <span className="muted">pick a variable with states</span>}</span>
              : !bar && valueInput('state', vr?.type === 'range' ? 'value…' : 'state…')}
            {isRangeOp(c.op) && !bar && <><span className="cond-word">and</span>{valueInput('to', 'value…')}</>}
            {vr?.type === 'range' && vr.unit && !bar && <span className="muted">{vr.unit}</span>}
            <button className="x" onClick={() => set({ conditions: it.conditions.filter((_, j) => j !== i) })}>×</button>
            {bar && vr && (
              <RangeBar min={vr.min!} max={vr.max!} step={stepOf(vr)} op={c.op} a={c.state} b={c.to ?? ''} unit={vr.unit} onChange={(a, b) => upd(i, isRangeOp(c.op) ? { state: a, to: b } : { state: a })} />
            )}
            {err && <small className="cond-err">{err}</small>}
          </div>
        )
      })}
      <button onClick={() => set({ conditions: [...it.conditions, { variable: '', op: '=', state: '' }] })}>+ condition</button>
    </div>
  )
}
