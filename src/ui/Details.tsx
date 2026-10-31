import { ControllerEditorButton } from './VariableMap'
import { Select } from './Select'
import { renderText, shortName } from '../model/labels'
import { affectable, addBelief, addSignal, beliefsAbout, beliefsOf, controlledBy, predicateOf, refinedBy, signalsOf, setLayer, updatedBy, updates, variablesIn } from '../model/formal'
import { VARIABLE_OWNER } from '../model/tree'
import { guideApplies } from '../model/uca'
import { allOf, conditionComplete, conditionError, conditionText, describeStates, isGroup, isRangeOp, isSetOp, isText, OP_LABELS, opsFor, boundEntity, opsForVar, QUANT_LABELS, quantOf, stepOf, valuesOf, whenText } from '../model/variables'
import { CARDINALITIES, VARIABLE_LAYERS, VARIABLE_LAYER_LABELS, type Condition, type Group, type Rule, type When, type Variable, type VariableLayer, VARIABLE_TYPES, VARIABLE_TYPE_LABELS, type ConditionOp, type VariableType, CAUSES, DURATIONS, DURATION_LABELS, type Duration, GUIDE_WORD_LABELS, GUIDE_WORDS, KIND_NAMES, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPE_LABELS, SCENARIO_TYPES, STATUSES, STRIDE, QUANTIFIERS, type Cause, type GuideWord, type Id, type Item, type ItemOf, type Kind, type NodeRole, type Patch, type Project, type Quantifier, type RequirementType, type ScenarioType } from '../model/types'
import { effectiveLosses, inheritedLosses } from '../model/derived'
import { updateItem } from '../model/ops'
import { defineEnumType } from '../model/ops'
import { ApplyStruct, VariableRangeDialog } from './RangeTypes'
import { generateUcaText } from '../model/uca'
import { refineUca } from '../model/refinement'
import { itemsOfKind, isLeaf } from '../model/tree'
import { incoming } from '../model/refs'
import { useStore } from '../model/store'
import { addItemInDialog, commit, useIds, useLabels, useProject } from './hooks'
import { ChipLabel, Icon, LayerIcon, StatusIcon } from './Icon'
import { DeleteDialog } from './TreeTable'
import { Modal } from './Modal'
import { StringList } from './StringList'
import { useEffect, useState, type ReactNode } from 'react'
import { ChoicePicker, Picker } from './Picker'
import { ReviewItem } from './Review'
import { Field, ItemHover, Ref, RefList, RichText, SingleRef, Tags, TextInput, BoundedNumber, RangeBar } from './Fields'

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
        <span className={'chip k-' + it.kind}><ChipLabel it={it} label={idLabels[it.id]} /></span> {KIND_NAMES[it.kind]}
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
          <Field label="System / environment state" hint="World variables whose values (together with worst-case environment) make this a hazard.">
            <RefList value={it.variables} options={of('variable').filter((v) => v.layer === 'domain')} onChange={(v) => set({ variables: v })} />
          </Field>
          <Field label="Hazardous condition" hint="Logical definition over world variables; the hazard is the state in which all of these hold.">
            <HazardCondition it={it} set={set} />
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
            <Select value={it.type} onChange={(e) => set({ type: e.target.value as RequirementType })}>{REQUIREMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
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
          <Field single label="Instances" hint="Tick when the model has several of these (e.g. trains). Conditions on its attributes then read 'some / every / no instance'; with one instance nothing changes.">
            <label className="check"><input type="checkbox" checked={!!it.many} onChange={(e) => set({ many: e.target.checked || undefined })} /> several instances</label>
          </Field>
          <Field single label="Attributes" hint="The entity's world variables: its state that can change over time.">
            <OwnedVars vars={variablesIn(p, 'domain', it.id)} add="+ new attribute" onNew={() => addItemInDialog('variable', { layer: 'domain', parent: it.id })} />
            <ApplyStruct parent={it.id} />
          </Field>
          <Field single label="Operations (one per line)">
            <textarea rows={2} value={it.operations.join('\n')} onChange={(e) => set({ operations: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }, 'ops')} />
          </Field>
        </>
      )
    case 'variable': {
      const ownerKind = VARIABLE_OWNER[it.layer][0]
      const owners = ownerKind === 'node' ? of('node').filter((n) => n.role === 'controller') : ownerKind === 'entity' ? [...of('entity'), ...of('relationship')] : of(ownerKind)
      const world = of('variable').filter((v) => v.layer === 'domain' && v.id !== it.id)
      const pickLayer = (l: VariableLayer) => {
        const cur = it.parent ? p.items[it.parent] : null
        const k = VARIABLE_OWNER[l][0]
        const parent = cur && VARIABLE_OWNER[l].includes(cur.kind) ? cur.id : (k === 'node' ? of('node').find((n) => n.role === 'controller') : of(k)[0])?.id ?? null
        commit((q) => setLayer(q, it.id, l, parent))
      }
      return (
        <>
          <Field label="Layer" hint={LAYER_HINTS[it.layer]}>
            <ChoicePicker options={VARIABLE_LAYERS} value={it.layer} onPick={pickLayer} label={(l) => VARIABLE_LAYER_LABELS[l]} icon={(l) => <LayerIcon layer={l} size={16} />} />
          </Field>
          <Field label={ownerKind === 'entity' ? 'Owner (entity or relationship)' : ownerKind === 'feedback' ? 'Carried by feedback' : 'Controller'}>
            <SingleRef value={it.parent} options={owners} onChange={(v) => v && set({ parent: v })} />
          </Field>
          {(it.layer === 'signal' || it.layer === 'belief') && (
            <Field label="About (world variable)" hint="The actual state this observation or belief refers to.">
              <SingleRef value={it.about} options={world} onChange={(v) => set({ about: v })} />
            </Field>
          )}
          {it.layer === 'domain' && (
            <Field label="Definition" hint="Optional: how this variable is defined, e.g. derived from other @variables (refinement).">
              <RichText value={it.definition} onChange={(v) => set({ definition: v }, 'definition')} rows={2} />
            </Field>
          )}
          {it.layer === 'domain' && (
            <Field label="Computed from parts" hint="Refinement: the value follows from lower-level world variables. Rules are tried in order; the first that holds gives the value.">
              <RulesSummary it={it} set={set} />
            </Field>
          )}
          {it.struct && <p className="hint">Field <b>{it.struct.path}</b> of struct type <b>{it.struct.type}</b> (instance {it.struct.name}): it follows the type, so change its type, states and title there (Domain model → Types).</p>}
          <VariableLinks v={it} />
          <Field single label="Type">
            <Select value={it.type} onChange={(e) => set({ type: e.target.value as VariableType })}>
              {VARIABLE_TYPES.map((t) => <option key={t} value={t}>{VARIABLE_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          {it.type === 'enum' && (
            <Field label="States" hint="Named values. Enter adds a state. Pick a shared type to reuse a state list across variables.">
              <EnumTypePicker v={it} />
              <StringList value={it.states} onChange={(v) => set({ states: v }, 'states')} placeholder="State" addLabel="Add state" />
            </Field>
          )}
          {it.type === 'range' && <RangeFields v={it} />}
        </>
      )
    }
    case 'relationship':
      return (
        <>
          <div className="field" style={{ display: 'grid', gridTemplateColumns: 'auto max-content 1fr', alignItems: 'center', columnGap: 8 }}>
            <span>From</span>
            <div style={{ minWidth: 0 }}><SingleRef value={it.from || null} options={of('entity')} onChange={(v) => set({ from: v ?? '' })} /></div>
            <div><CardSelect value={it.fromCard} onChange={(v) => set({ fromCard: v })} /></div>
            <span />
            <span style={{ color: 'var(--muted)', lineHeight: 1, paddingLeft: 12 }}>↓</span>
            <span />
            <span>To</span>
            <div style={{ minWidth: 0 }}><SingleRef value={it.to || null} options={of('entity')} onChange={(v) => set({ to: v ?? '' })} /></div>
            <div><CardSelect value={it.toCard} onChange={(v) => set({ toCard: v })} /></div>
          </div>
          <Field single label="Variables" hint="These describe the link as a whole. If an end has several instances (entity ticked 'several instances', or cardinality *), conditions on these read 'some / every / no link'. Whether the relationship holds is implied (a boolean variable usable in contexts, beliefs and traces). Add further state of the link itself here, e.g. the distance between the two entities.">
            <OwnedVars vars={variablesIn(p, 'domain', it.id).filter((v) => v.id !== predicateOf(p, it.id)?.id)} add="+ new variable" onNew={() => addItemInDialog('variable', { layer: 'domain', parent: it.id })} />
            <ApplyStruct parent={it.id} />
          </Field>
        </>
      )
    case 'node':
      return (
        <>
          <Field label="Role">
            <Select value={it.role} onChange={(e) => set({ role: e.target.value as NodeRole })}>{NODE_ROLES.map((r) => <option key={r}>{r}</option>)}</Select>
          </Field>
          <Field label="Domain entities" hint="The domain entities this element represents; a physical process may comprise several."><RefList value={it.entities} options={of('entity')} onChange={(v) => set({ entities: v })} /></Field>
          {it.role === 'controller' && (
            <>
              <Field label="Process model (beliefs)" hint="What this controller believes about the world. Fed by signals on its incoming feedback.">
                <OwnedVars vars={beliefsOf(p, it.id)} add="+ belief about…" options={of('variable').filter((v) => v.layer === 'domain' && !beliefsAbout(p, it.id, v.id).length)} onAdd={(w) => commit((q) => addBelief(q, it.id, w).project)} />
              </Field>
              <Field single label="Variable editor" hint="Edit beliefs, signals and internal state of this controller in one table."><ControllerEditorButton id={it.id} /></Field>
              <Field label="Internal state" hint="Modes, timers and counters of the control algorithm itself.">
                <OwnedVars vars={variablesIn(p, 'internal', it.id)} add="+ new internal variable" onNew={() => addItemInDialog('variable', { layer: 'internal', parent: it.id })} />
              </Field>
            </>
          )}
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
            <Field label="Signals" hint="What this feedback reports, each about a world variable. Adding one also gives the receiving controller a belief.">
              <OwnedVars vars={signalsOf(p, it.id)} add="+ reports on…" options={of('variable').filter((v) => v.layer === 'domain' && !signalsOf(p, it.id).some((x) => x.about === v.id))} onAdd={(w) => commit((q) => addSignal(q, it.id, w).project)} />
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Affects (controlled variables)" hint="Variables this action changes: world variables, or the internal state and beliefs of the receiving controller.">
              <RefList value={it.affects} options={[...of('variable').filter((v) => v.layer === 'domain'), ...affectable(p, it.to)]} onChange={(v) => set({ affects: v })} />
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Domain operation">
              <Select value={it.operation} onChange={(e) => set({ operation: e.target.value })}>
                <option value="">— none —</option>
                {of('entity').flatMap((e) => e.operations.map((o) => <option key={e.id + o} value={`${e.id}:${o}`}>{labels[e.id]} {e.title}: {o}</option>))}
              </Select>
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Duration">
              <Select value={it.duration} onChange={(e) => set({ duration: e.target.value as Duration })}>{DURATIONS.map((d) => <option key={d} value={d}>{DURATION_LABELS[d]}</option>)}</Select>
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
            <Select value={it.guide} onChange={(e) => set({ guide: e.target.value as GuideWord })}>{GUIDE_WORDS.map((g) => <option key={g} value={g}>{GUIDE_WORD_LABELS[g]}</option>)}</Select>
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
          <UcaRefinement it={it} set={set} />
          <Field label="Controller constraint"><RichText value={it.constraint} onChange={(v) => set({ constraint: v }, 'constraint')} rows={2} /></Field>
        </>
      )
    case 'scenario':
      return (
        <>
          <Field label="Kind of scenario">
            <Select value={it.scenarioType} onChange={(e) => {
              const t = e.target.value as ScenarioType
              set(t === 'uca' ? { scenarioType: t, uca: it.uca ?? of('uca')[0]?.id ?? null, ca: null, hazards: [], cause: '' } : { scenarioType: t, ca: it.ca ?? of('ca')[0]?.id ?? null, uca: null, cause: '' })
            }}>
              {SCENARIO_TYPES.map((t) => <option key={t} value={t}>{SCENARIO_TYPE_LABELS[t]}</option>)}
            </Select>
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
            <Select value={it.cause} onChange={(e) => set({ cause: e.target.value as Cause | '' })}>
              <option value="">—</option>
              {CAUSES[it.scenarioType].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Where in the control structure"><SingleRef value={it.element} options={of('node')} onChange={(v) => set({ element: v })} none="— not specified —" /></Field>
          <Field single label="Title"><TextInput multiline value={it.title} onChange={(v) => set({ title: v }, 'title')} /></Field>
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

/** Multiplicity of one relationship end: predefined values, plus whatever an older file holds. */
const CardSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <Select style={{ width: 'auto', flex: 'none' }} value={value} onChange={(e) => onChange(e.target.value)}>
    {!(CARDINALITIES as readonly string[]).includes(value) && <option>{value}</option>}
    {CARDINALITIES.map((c) => <option key={c}>{c}</option>)}
  </Select>
)

const Rating = ({ v, on }: { v: number; on: (v: number) => void }) => (
  <Select value={v} onChange={(e) => on(+e.target.value)}>
    <option value={0}>—</option>
    {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
  </Select>
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

function HazardCondition({ it, set }: { it: ItemOf<'hazard'>; set: Set }) {
  const p = useProject()
  const [open, setOpen] = useState(false)
  const lines = it.conditions.filter(conditionComplete).map((c) => conditionText(p, c))
  return (
    <div className="ctx-summary">
      {lines.length ? <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted">No condition yet</span>}
      <button type="button" onClick={() => setOpen(true)}>Edit condition…</button>
      {open && (
        <Modal title="Edit hazardous condition" onClose={() => setOpen(false)} wide>
          <ConditionsEditor it={it} set={set} vars={itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain')} />
          <div className="modal-actions"><button className="primary" onClick={() => setOpen(false)}>Done</button></div>
        </Modal>
      )}
    </div>
  )
}

function ConditionsEditor({ it, set, vars: given }: { it: ItemOf<'uca' | 'hazard'>; set: Set; vars?: ItemOf<'variable'>[] }) {
  const p = useProject()
  const ca = it.kind === 'uca' ? p.items[it.ca] : undefined
  // The context is actual state: world variables and the controller's own internal state, not beliefs or signals.
  const vars = given ?? itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain' || (v.layer === 'internal' && ca?.kind === 'ca' && v.parent === ca.from))
  const label = <b>{useLabels()[it.id]}</b>
  const head = <span>{it.kind === 'uca' ? <>{label} applies when</> : <>The system is in hazard state {label} when</>}</span>
  return <ConditionList conditions={it.conditions} onChange={(conditions) => set({ conditions })} vars={vars} head={head} />
}

/** A conjunction of conditions (UCA context, hazard state), laid out like a rule. */
function ConditionList({ conditions, onChange, vars, head }: { conditions: Condition[]; onChange: (cs: Condition[]) => void; vars: Variable[]; head: ReactNode }) {
  return <div className="rule"><GroupEditor g={allOf(...conditions)} onChange={(g) => onChange(g.of.filter((w): w is Condition => !isGroup(w)))} vars={vars} head={head} flat scope={conditions} /></div>
}

const BLANK: Condition = { variable: '', op: '=', state: '' }
const WORDS: Condition = { variable: '', op: '=', state: 'true', text: '' }

/** A condition tree: "all of" / "any of" its conditions and nested groups; the choice shows once there are two or more. `flat`: conditions only, all of them. */
function GroupEditor({ g, onChange, onRemove, vars, head, flat, scope }: { scope?: Condition[]; g: Group; onChange: (g: Group) => void; onRemove?: () => void; vars: Variable[]; head: ReactNode; flat?: boolean }) {
  const upd = (i: number, w: When | null, bind?: Bind) => onChange({ ...g, of: (w ? g.of.map((x, j) => (j === i ? w : x)) : g.of.filter((_, j) => j !== i)).map((x) => (bind && x === bind.target ? { ...x, as: bind.as } as Condition : x)) })
  const join = g.of.length > 1 ? (g.any ? 'or' : 'and') : ''
  return (
    <>
      <div className="rule-head">
        {head}
        {g.of.length > 1 && (flat ? <span className="cond-word">all of these hold:</span> : <><Select value={g.any ? 'any' : 'all'} onChange={(e) => onChange({ ...g, any: e.target.value === 'any' })}><option value="all">all</option><option value="any">any</option></Select><span className="cond-word">of these hold:</span></>)}
        {onRemove && <button className="x" title="Remove group" onClick={onRemove}>×</button>}
      </div>
      <div className={'conds' + (onRemove ? ' group' : '')}>
        {g.of.map((w, i) => isGroup(w)
          ? <GroupEditor key={i} g={w} head={<span className="cond-word">{i ? join : ''}</span>} vars={vars} scope={scope} onChange={(x) => upd(i, x)} onRemove={() => upd(i, null)} />
          : <ConditionRow key={i} c={w} word={i ? join : ''} scope={scope} vars={vars} onChange={(x, b) => upd(i, x, b)} onRemove={() => upd(i, null)} />)}
        <div className="rule-add">
          <button onClick={() => onChange({ ...g, of: [...g.of, BLANK] })}>+ condition</button>
          <button title="A condition in words, for something not modelled as a variable; traces treat it as true / false" onClick={() => onChange({ ...g, of: [...g.of, WORDS] })}>+ in words</button>
          {!flat && <button title={`A nested group whose conditions are combined with ${g.any ? 'and' : 'or'}`} onClick={() => onChange({ ...g, of: [...g.of, { any: !g.any, of: [BLANK, BLANK] }] })}>+ {g.any ? 'and' : 'or'}-group</button>}
        </div>
      </div>
    </>
  )
}

/** A change to another condition of the same context made alongside a row's own change: set / clear its instance name. */
type Bind = { target: Condition; as: string | undefined }
/** A short unused instance name for a condition's entity: t1, t2, … */
function autoName(p: Project, c: Condition, scope: Condition[]): string {
  const v = p.items[c.variable]
  const base = ((v?.kind === 'variable' && p.items[boundEntity(p, v) ?? '']?.title.trim()[0]) || 'x').toLowerCase()
  const used = new Set(scope.flatMap((o) => [o.as, o.same]))
  let n = 1
  while (used.has(base + n)) n++
  return base + n
}

function ConditionRow({ c, onChange: change, onRemove, vars, word, scope = [] }: { scope?: Condition[]; c: Condition; onChange: (c: Condition, bind?: Bind) => void; onRemove: () => void; vars: Variable[]; word: string }) {
  const p = useProject()
  const labels = useLabels()
  const onChange = (x: Condition, bind?: Bind) => change(x, bind)
  const upd = (patch: Partial<Condition>) => onChange({ ...c, ...patch })
  if (isText(c)) return (
    <div className="cond">
      <span className="cond-word">{word}</span>
      <input className="cond-text" value={c.text} placeholder="condition in words…" onChange={(e) => upd({ text: e.target.value })} />
      <Select value={c.op} onChange={(e) => upd({ op: e.target.value as ConditionOp })}><option value="=">holds</option><option value="≠">does not hold</option></Select>
      <button className="x" onClick={onRemove}>×</button>
    </div>
  )
  const v = p.items[c.variable]
  const vr = v?.kind === 'variable' ? v : undefined
  const values = valuesOf(vr)
  const bar = vr?.type === 'range' && vr.min !== null && vr.max !== null && vr.max > vr.min
  const cmp = c.other !== undefined
  const ov = c.other ? p.items[c.other] : undefined
  const err = vr && (cmp ? c.other : c.state || c.set?.length) ? conditionError(vr, c, p) : null
  const valueInput = (key: 'state' | 'to', placeholder: string) =>
    values ? (
      <Select value={c[key] ?? ''} onChange={(e) => upd({ [key]: e.target.value })}>
        <option value="" disabled hidden>{placeholder}</option>
        {values.map((s) => <option key={s}>{s}</option>)}
      </Select>
    ) : (
      <BoundedNumber value={c[key] ?? ''} onChange={(v) => upd({ [key]: v })} min={vr?.min ?? null} max={vr?.max ?? null} step={vr ? stepOf(vr) : 1} placeholder={placeholder} />
    )
  return (
    <div className="cond">
      <span className="cond-word">{word}</span>
      {quantOf(p, c) && <>
        <Select title="For how many instances this holds, or the same instance as an earlier condition" value={c.same ? 'same:' + c.same : quantOf(p, c)!} onChange={(e) => {
          const x = e.target.value
          // leaving a reference may orphan the name it used
          const drop = c.same && !scope.some((o) => o !== c && o.same === c.same) ? scope.find((o) => o.as === c.same) : undefined
          if (x.startsWith('same:')) return onChange({ ...c, same: x.slice(5), as: undefined, quant: undefined }, drop && drop.as !== x.slice(5) ? { target: drop, as: undefined } : undefined)
          if (x.startsWith('bind:')) { const t = scope[Number(x.slice(5))]; const nm = autoName(p, t, scope); return onChange({ ...c, same: nm, as: undefined, quant: undefined }, { target: t, as: nm }) }
          onChange({ ...c, same: undefined, as: undefined, quant: x === 'some' ? undefined : x as Quantifier }, drop ? { target: drop, as: undefined } : undefined)
        }}>
          {QUANTIFIERS.map((q) => <option key={q} value={q}>{QUANT_LABELS[q]}</option>)}
          {scope.map((o, i) => ({ o, i })).filter(({ o }) => o !== c && !isText(o) && !o.same && quantOf(p, o) === 'some' && o.variable !== c.variable ? boundEntity(p, p.items[o.variable] as Variable) === (vr && boundEntity(p, vr)) : false).map(({ o, i }) => <option key={i} value={o.as ? 'same:' + o.as : 'bind:' + i}>the same {p.items[boundEntity(p, p.items[o.variable] as Variable) ?? '']?.title.trim() || 'instance'} {o.as ?? `(${shortName(p, p.items[o.variable] as Variable)})`}</option>)}
        </Select>
        {c.as && <span className="inst-name" title="Name of this instance; later conditions can pick “the same …” to refer to it">{c.as}</span>}
      </>}
      <Picker options={vars} create={{ label: '+ New variable…', run: () => upd({ variable: addItemInDialog('variable'), state: '', to: '', set: [], op: '=' }) }} onPick={(id) => { const nv = id ? p.items[id] : undefined; upd({ variable: id ?? '', state: '', to: '', set: [], other: undefined, op: nv?.kind === 'variable' && opsFor(nv).includes(c.op) ? c.op : '=' }) }}>
        {v ? <><ItemHover id={v.id}><span className={'chip k-' + v.kind}><ChipLabel it={v} label={labels[v.id]} /></span></ItemHover></> : <span className="muted">variable…</span>}
      </Picker>
      <Select value={c.op} onChange={(e) => upd({ op: e.target.value as ConditionOp })}>
        {(cmp ? opsForVar(vr) : opsFor(vr)).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
      </Select>
      {vr && <Select title="Compare with a fixed value or with the value of another variable" value={cmp ? 'var' : 'value'} onChange={(e) => e.target.value === 'var' ? upd({ other: '', state: '', to: '', set: [], op: opsForVar(vr).includes(c.op) ? c.op : '=' }) : onChange({ variable: c.variable, op: opsFor(vr).includes(c.op) ? c.op : '=', state: '' })}><option value="value">a value</option><option value="var">another variable</option></Select>}
      {cmp && vr && (
        <Picker options={vars.filter((x) => x.id !== vr.id && x.type === vr.type)} onPick={(id) => upd({ other: id ?? '' })}>
          {ov?.kind === 'variable' ? <ItemHover id={ov.id}><span className={'chip k-' + ov.kind}><ChipLabel it={ov} label={labels[ov.id]} /></span></ItemHover> : <span className="muted">variable…</span>}
        </Picker>
      )}
      {!cmp && bar && vr && (
        <RangeBar min={vr.min!} max={vr.max!} step={stepOf(vr)} op={c.op} a={c.state} b={c.to ?? ''} unit={vr.unit} onChange={(a, b) => upd(isRangeOp(c.op) ? { state: a, to: b } : { state: a })} />
      )}
      {cmp ? null : isSetOp(c.op)
        ? <span className="setpick"><span className="brace">{'{'}</span>{(vr?.states ?? []).map((s) => <button type="button" key={s} role="checkbox" aria-checked={!!c.set?.includes(s)} className={'opt' + (c.set?.includes(s) ? ' on' : '')} onClick={() => upd({ set: c.set?.includes(s) ? c.set.filter((x) => x !== s) : [...(c.set ?? []), s] })}>{c.set?.includes(s) ? '✓ ' : ''}{s}</button>)}<span className="brace">{'}'}</span>{!vr?.states.length && <span className="muted">pick a variable with states</span>}</span>
        : !bar && valueInput('state', vr?.type === 'range' ? 'value…' : 'state…')}
      {!cmp && isRangeOp(c.op) && !bar && <><span className="cond-word">and</span>{valueInput('to', 'value…')}</>}
      {!cmp && vr?.type === 'range' && vr.unit && !bar && <span className="muted">{vr.unit}</span>}
      <button className="x" onClick={onRemove}>×</button>
      {err && <small className="cond-err">{err}</small>}
    </div>
  )
}

function RulesSummary({ it, set }: { it: Variable; set: Set }) {
  const p = useProject()
  const [open, setOpen] = useState(false)
  const lines = it.rules.map((r) => `${r.state || '?'} when ${whenText(p, r.when) || '?'}`)
  return (
    <div className="ctx-summary">
      {lines.length ? (
        <ul>
          {lines.map((l, i) => <li key={i}>{i ? 'else ' : ''}{l}</li>)}
          <li>otherwise {it.otherwise || 'unknown'}</li>
        </ul>
      ) : <span className="muted">Not computed: set directly</span>}
      <button type="button" onClick={() => setOpen(true)}>Edit rules…</button>
      {open && (
        <Modal title={`Compute ${it.title || 'variable'} from its parts`} onClose={() => setOpen(false)} wide>
          <p className="muted">Rules are tried in order; the first whose condition holds gives the value.</p>
          <RulesEditor it={it} set={set} />
          <div className="modal-actions"><button className="primary" onClick={() => setOpen(false)}>Done</button></div>
        </Modal>
      )}
    </div>
  )
}

/** Refinement: the variable's value as a function of lower-level world variables; rules are tried in order. */
function RulesEditor({ it, set }: { it: Variable; set: Set }) {
  const p = useProject()
  const vars = itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain' && v.id !== it.id)
  const values = valuesOf(it)
  const value = (v: string, on: (v: string) => void, placeholder: string) => values
    ? <Select value={v} onChange={(e) => on(e.target.value)}><option value="">{placeholder}</option>{values.map((s) => <option key={s}>{s}</option>)}</Select>
    : <TextInput value={v} onChange={on} placeholder={placeholder} />
  const upd = (i: number, r: Partial<Rule>) => set({ rules: it.rules.map((x, j) => (j === i ? { ...x, ...r } : x)) })
  const name = <b>{it.title || 'the variable'}</b>
  return (
    <div className="rules">
      {!it.rules.length && <p className="muted">No rules: {name} is set directly in traces.</p>}
      {it.rules.map((r, i) => (
        <div key={i} className="rule">
          <GroupEditor g={r.when} onChange={(when) => upd(i, { when })} vars={vars}
            head={<><span>{i ? 'Else, ' : ''}{name} is</span>{value(r.state, (v) => upd(i, { state: v }), 'value…')}<span>when</span></>} />
          <button className="x rule-x" title="Remove rule" onClick={() => set({ rules: it.rules.filter((_, j) => j !== i) })}>×</button>
        </div>
      ))}
      {it.rules.length > 0 && <div className="rule-head"><span>Otherwise, {name} is</span>{value(it.otherwise, (v) => set({ otherwise: v }, 'otherwise'), 'unknown')}</div>}
      <div className="rule-add"><button onClick={() => set({ rules: [...it.rules, { state: '', when: allOf(BLANK) }] })}>+ rule</button></div>
    </div>
  )
}

/** UCAs refined from this one (and the one it refines), with a button per context condition whose variable has rules. */
function UcaRefinement({ it, set }: { it: ItemOf<'uca'>; set: Set }) {
  const p = useProject()
  const kids = itemsOfKind(p, 'uca').filter((u) => u.refines === it.id)
  const refinable = it.conditions.map((c, i) => [c, i] as const).filter(([c]) => { const v = p.items[c.variable]; return v?.kind === 'variable' && v.rules.length > 0 && conditionComplete(c) })
  return (
    <>
      {it.refines && (
        <Field label="Refines" hint="The higher-level UCA whose context this one states over lower-level variables.">
          <SingleRef value={it.refines} options={itemsOfKind(p, 'uca').filter((u) => u.id !== it.id)} onChange={(v) => set({ refines: v })} />
        </Field>
      )}
      {(refinable.length > 0 || kids.length > 0) && (
        <Field label="Refined into" hint="Substitutes the rules of a refined variable: one lower-level UCA per way the condition can hold.">
          <div className="reflist">
            {kids.map((u) => <Ref key={u.id} id={u.id} />)}
            {refinable.map(([c, i]) => <button key={i} className="link" onClick={() => commit((q) => refineUca(q, it.id, i).project)}>Refine on {p.items[c.variable].title}</button>)}
          </div>
        </Field>
      )}
    </>
  )
}

const LAYER_HINTS: Record<VariableLayer, string> = {
  domain: 'Actual state of the world. UCA contexts are stated over these.',
  signal: 'An observation carried by a feedback; may differ from the world when feedback is wrong, late or missing.',
  belief: 'Part of a controller\'s process model; may differ from the world.',
  internal: 'State of the control algorithm itself: modes, timers, counters.',
}

/** Variables owned by an item, with a picker to add one about a world variable (or a new one). */
function OwnedVars(props: { vars: Variable[]; add: string; options?: Item[]; onAdd?: (world: Id) => void; onNew?: () => void }) {
  return (
    <div className="reflist">
      {props.vars.map((v) => <Ref key={v.id} id={v.id} />)}
      {props.onNew ? <button className="link" onClick={props.onNew}>{props.add}</button>
        : <Picker options={props.options ?? []} onPick={(id) => id && props.onAdd?.(id)}><span className="muted">{props.add}</span></Picker>}
    </div>
  )
}

/** How a variable is connected through the layers: world → signals → beliefs, and what controls it. */
/** Read-only summary of a range variable's type; editing happens in a popup. */
function RangeFields({ v }: { v: Variable }) {
  const [open, setOpen] = useState(false)
  return (
    <Field single label="Range">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span>{v.rangeType && <b>{v.rangeType} · </b>}{describeStates(v)}</span>
        <button className="btn" onClick={() => setOpen(true)}>Edit…</button>
      </div>
      {open && <VariableRangeDialog v={v} onClose={() => setOpen(false)} />}
    </Field>
  )
}

function VariableLinks({ v }: { v: Variable }) {
  const p = useProject()
  const all = itemsOfKind(p, 'variable')
  const rows: [string, Id[]][] = v.layer === 'domain'
    ? [['Part of', refinedBy(p, v.id).map((x) => x.id)], ['Observed as', all.filter((x) => x.layer === 'signal' && x.about === v.id).map((x) => x.id)], ['Believed as', all.filter((x) => x.layer === 'belief' && x.about === v.id).map((x) => x.id)], ['Controlled by', controlledBy(p, v.id).map((c) => c.id)]]
    : v.layer === 'signal' ? [['Updates beliefs', updates(p, v).map((x) => x.id)]]
    : v.layer === 'belief' ? [['Updated from signals', updatedBy(p, v).map((x) => x.id)]] : []
  return rows.map(([label, ids]) => (
    <Field key={label} label={label}>
      <div className="reflist">{ids.length ? ids.map((id) => <Ref key={id} id={id} />) : <span className="muted">none</span>}</div>
    </Field>
  ))
}

/** Choose a named, reusable state list for an enum variable, or save its own states as one. */
function EnumTypePicker({ v }: { v: Variable }) {
  const p = useProject()
  const names = Object.keys(p.enumTypes ?? {}).sort()
  const save = () => {
    const n = window.prompt('Name for this state list (e.g. On/Off, Severity)', v.title)?.trim()
    if (n && !p.enumTypes?.[n]) commit((q) => updateItem(defineEnumType(q, n, v.states), v.id, { enumType: n }))
  }
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
      <Select value={v.enumType} onChange={(e) => commit((q) => updateItem(q, v.id, { enumType: e.target.value }))}>
        <option value="">Own states</option>
        {names.map((n) => <option key={n} value={n}>{n} ({p.enumTypes![n].join(' | ')})</option>)}
      </Select>
      {!v.enumType && v.states.length > 0 && <button className="btn" onClick={save} title="Share these states with other variables">Save as type…</button>}
    </div>
  )
}
