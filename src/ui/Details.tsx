import { ControllerEditorButton } from './VariableMap'
import { Select } from './Select'
import { renderText, variableName } from '../model/labels'
import { affectable, addBelief, addSignal, beliefsAbout, beliefsOf, controlledBy, predicateOf, refinedBy, signalsOf, setLayer, updatedBy, updates, variablesIn } from '../model/formal'
import { VARIABLE_OWNER } from '../model/tree'
import { guideApplies } from '../model/uca'
import { effectText, opSignature, operationsOf, paramText } from '../model/operations'
import { argError, argTexts, paramOf, paramSummary, paramVar } from '../model/params'
import { allOf, autoName, nameInstances, condInstances, oName, conditionComplete, conditionError, otherEnd, describeStates, symProps, isGroup, isEvent, isRangeOp, isSetOp, isText, OP_LABELS, opsFor, boundEntity, opsForVar, QUANT_LABELS, quantOf, stepOf, valuesOf, whenText, whenTexts, leaves } from '../model/variables'
import { type Effect, type Project, type ArgCondition, type OpParam, type Param, TIME_UNITS, type TimeBound, type TimeUnit, CARDINALITIES, VARIABLE_LAYERS, VARIABLE_LAYER_LABELS, type Condition, type Group, type Rule, type When, type Variable, type VariableLayer, VARIABLE_TYPES, VARIABLE_TYPE_LABELS, type ConditionOp, type VariableType, CAUSES, DURATIONS, DURATION_LABELS, type Duration, GUIDE_WORD_LABELS, GUIDE_WORDS, KIND_NAMES, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPE_LABELS, SCENARIO_TYPES, STATUSES, STRIDE, QUANTIFIERS, type Cause, type GuideWord, type Id, type Item, type ItemOf, type Kind, type NodeRole, type Patch, type Quantifier, type RequirementType, type ScenarioType } from '../model/types'
import { effectiveLosses, inheritedLosses } from '../model/derived'
import { updateItem } from '../model/ops'
import { defineEnumType } from '../model/ops'
import { ApplyStruct, EnumTypeDialog, RangeTypeDialog, SymbolicPicker, SymbolicTypeDialog, VariableRangeDialog } from './RangeTypes'
import { generateUcaText } from '../model/uca'
import { refineUca } from '../model/refinement'
import { itemsOfKind, isLeaf } from '../model/tree'
import { incoming } from '../model/refs'
import { useStore } from '../model/store'
import { askText } from './dialogs'
import { addItemInDialog, commit, toggled, useIds, useLabels, useProject } from './hooks'
import { ChipLabel, Icon, LayerIcon, StatusIcon } from './Icon'
import { DeleteDialog } from './TreeTable'
import { Modal } from './Modal'
import { StringList } from './StringList'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChoicePicker, Picker } from './Picker'
import { ReviewItem } from './Review'
import { SubjectPicker, type SubjectChoice } from './Subject'
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
        <button className="icon-btn danger" title="Delete" aria-label="Delete" onClick={() => setDeleting(true)}><Icon name="trash" size={16} /></button>
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
          <Field label="Leads to losses" hint={inh.length ? 'Losses inherited from the parent hazard are greyed; you can switch them off.' : undefined}>
            {inh.length > 0 && (
              <div className="reflist inherited">
                {inh.map((l) => (
                  <span key={l} className={'chipwrap' + (it.lossExclude.includes(l) ? ' off' : '')}>
                    <Ref id={l} />
                    <button className="x" title={it.lossExclude.includes(l) ? 'Inherit again' : 'Exclude'} onClick={() => set({ lossExclude: toggled(it.lossExclude, l) })}>
                      {it.lossExclude.includes(l) ? '↺' : '×'}
                    </button>
                  </span>
                ))}
              </div>
            )}
            <RefList value={it.lossLinks} options={of('loss').filter((l) => !eff.includes(l.id) || it.lossLinks.includes(l.id))} onChange={(v) => set({ lossLinks: v })} />
          </Field>
          <Field label="System / environment state" hint="World variables whose values, in the worst-case environment, make this a hazard.">
            <RefList value={it.variables} options={of('variable').filter((v) => v.layer === 'domain')} onChange={(v) => set({ variables: v })} />
          </Field>
          <Field label="Hazardous condition" hint="Conditions on world variables; the hazard is the state in which all of them hold.">
            <HazardCondition it={it} set={set} />
          </Field>
          <label className="check"><input type="checkbox" checked={it.security} onChange={(e) => set({ security: e.target.checked })} /> Security-related (STPA-Sec)</label>
          {!isLeaf(p, it.id) && <p className="hint">This hazard has sub-hazards. Link UCAs and constraints to the sub-hazards instead.</p>}
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
          <Field single label="Instances" hint="Tick if the system contains several of these (e.g. trains). Conditions on its attributes can then say ‘some’, ‘every’ or ‘no’ instance.">
            <label className="check"><input type="checkbox" checked={!!it.many} onChange={(e) => set({ many: e.target.checked || undefined })} /> several instances</label>
          </Field>
          <Field single label="Attributes" hint="The properties of this entity that can change over time (its world variables).">
            <OwnedVars vars={variablesIn(p, 'domain', it.id)} add="+ new attribute" onNew={() => addItemInDialog('variable', { layer: 'domain', parent: it.id })} />
            <ApplyStruct parent={it.id} />
          </Field>
          <Field single label="Operations" hint="Things this entity can do, or that can happen to it. An operation can change world variables, and a control action can carry it out. Optional.">
            <div className="reflist">
              {operationsOf(p, it.id).map((o) => <Ref key={o.id} id={o.id} />)}
              <button className="link" onClick={() => addItemInDialog('operation', { params: [{ name: it.title.trim().split(/\s+/).pop()!.toLowerCase() || 'x', entity: it.id }] })}>+ new operation</button>
            </div>
          </Field>
        </>
      )
    case 'operation':
      return (
        <>
          <Field single label="Parameters" hint="What the operation acts on, e.g. gate: Gate. When the operation occurs in a trace, you choose which instance each parameter refers to.">
            <OpParamsSummary p={p} it={it} set={set} />
          </Field>
          <Field single label="Effects" hint="World variables that get a given value after the operation. In a trace they change when the operation (or a control action that carries it out) occurs. Optional.">
            <EffectsSummary p={p} it={it} set={set} />
          </Field>
          <Field label="Realized by"><div className="reflist">{of('ca').filter((c) => c.operation === it.id).map((c) => <Ref key={c.id} id={c.id} />)}{!of('ca').some((c) => c.operation === it.id) && <span className="muted">no control action</span>}</div></Field>
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
            <Field label="Definition" hint="Optional: what this variable means, e.g. how it follows from other variables (type @ to refer to one).">
              <RichText value={it.definition} onChange={(v) => set({ definition: v }, 'definition')} rows={2} />
            </Field>
          )}
          {it.layer === 'domain' && (
            <Field label="Computed from parts" hint="The value follows from more detailed world variables. Rules are checked in order; the first one that holds decides the value.">
              <RulesSummary it={it} set={set} />
            </Field>
          )}
          {it.struct && <p className="hint">This is the field <b>{it.struct.path}</b> of the structured type <b>{it.struct.type}</b> (instance {it.struct.name}). To change its type, states or title, edit the type under Domain model → Types.</p>}
          <VariableLinks v={it} />
          <Field single label="Type">
            <Select value={it.type} onChange={(e) => set({ type: e.target.value as VariableType })}>
              {VARIABLE_TYPES.map((t) => <option key={t} value={t}>{VARIABLE_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          {it.type === 'enum' && (
            <Field label="States" hint="The values this variable can take. Press Enter to add one. Pick a shared type to reuse the same list for several variables.">
              <EnumTypePicker x={it} name={it.title} onChange={(patch) => commit((q) => updateItem(q, it.id, patch))} />
              <StringList value={it.states} onChange={(v) => set({ states: v }, 'states')} placeholder="State" addLabel="Add state" />
            </Field>
          )}
          {it.type === 'range' && <RangeFields v={it} />}
          {it.type === 'symbolic' && (
            <Field label="Symbolic type" hint="Values without further meaning, written as symbols such as t1 or id7 in traces. They can always be compared with ‘is’ / ‘is not’; if ordered, also with ‘less than’ / ‘greater than’. Compare with a symbol or with another variable of the same type.">
              <SymbolicPicker x={it} onChange={(patch) => commit((q) => updateItem(q, it.id, patch))} />
            </Field>
          )}
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
          <Field single label="Variables" hint="Properties of the link as a whole, e.g. the distance between the two entities. Whether the relationship holds at all is already available as a yes/no variable in contexts, beliefs and traces. If an end has several instances, conditions can say ‘some’, ‘every’ or ‘no’ link.">
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
          <Field label="Domain entities" hint="The domain entities this element stands for. A physical process may involve several."><RefList value={it.entities} options={of('entity')} onChange={(v) => set({ entities: v })} /></Field>
          {it.role === 'controller' && (
            <>
              <Field label="Process model (beliefs)" hint="What this controller believes about the world. Beliefs are updated by the signals on its incoming feedback.">
                <OwnedVars vars={beliefsOf(p, it.id)} add="+ belief about…" options={of('variable').filter((v) => v.layer === 'domain' && !beliefsAbout(p, it.id, v.id).length)} onAdd={(w) => commit((q) => addBelief(q, it.id, w).project)} />
              </Field>
              <Field single label="Variable editor" hint="Edit beliefs, signals and internal state of this controller in one table."><ControllerEditorButton id={it.id} /></Field>
              <Field label="Internal state" hint="The controller’s own state: modes, timers and counters.">
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
            <Field label="Signals" hint="What this feedback reports, each about a world variable. The receiving controller automatically gets a matching belief.">
              <OwnedVars vars={signalsOf(p, it.id)} add="+ reports on…" options={of('variable').filter((v) => v.layer === 'domain' && !signalsOf(p, it.id).some((x) => x.about === v.id))} onAdd={(w) => commit((q) => addSignal(q, it.id, w).project)} />
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Affects (controlled variables)" hint="Variables this action changes: world variables, or the internal state and beliefs of the controller that receives the action.">
              <RefList value={it.affects} options={[...of('variable').filter((v) => v.layer === 'domain'), ...affectable(p, it.to)]} onChange={(v) => set({ affects: v })} />
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Domain operation">
              <Select value={it.operation ?? ''} onChange={(e) => set({ operation: e.target.value || null })}>
                <option value="">— none —</option>
                {of('operation').map((o) => <option key={o.id} value={o.id}>{opSignature(p, o)}</option>)}
              </Select>
              {it.operation && p.items[it.operation]?.kind === 'operation' && (p.items[it.operation] as ItemOf<'operation'>).effects.length > 0 && <div className="muted">Effects: {(p.items[it.operation] as ItemOf<'operation'>).effects.map((ef) => renderText(labels, effectText(ef))).join('; ')}</div>}
            </Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Duration">
              <Select value={it.duration} onChange={(e) => set({ duration: e.target.value as Duration })}>{DURATIONS.map((d) => <option key={d} value={d}>{DURATION_LABELS[d]}</option>)}</Select>
            </Field>
          )}
          {it.kind === 'ca' && <Field label="Parameters" hint="Values the action carries (e.g. a dose); UCAs can refer to them. Optional."><ParamsSummary params={it.params} onChange={(params) => set({ params })} /></Field>}
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
          {p.items[it.ca]?.kind === 'ca' && (p.items[it.ca] as ItemOf<'ca'>).params.length > 0 && <Field label="Parameters"><ArgsSummary ca={p.items[it.ca] as ItemOf<'ca'>} uca={it} onChange={(args) => set({ args })} /></Field>}
          <Field single label="Statement" hint="Written automatically from the fields above. Type to replace it; clear the text to generate it again.">
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
              <Field label="Hazards (leaf)" hint="The control action is issued but not carried out properly. Which hazards can this lead to?">
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
                  <label key={s} className="check"><input type="checkbox" checked={it.stride.includes(s)} onChange={() => set({ stride: toggled(it.stride, s) })} /> {s}</label>
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
  const lines = whenTexts(p, it.conditions).map((l) => renderText(labels, l))
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
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const lines = whenTexts(p, it.conditions).map((l) => renderText(labels, l))
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
function ConditionList({ conditions, onChange, vars, head }: { conditions: When[]; onChange: (cs: When[]) => void; vars: Variable[]; head: ReactNode }) {
  const p = useProject()
  return <div className="rule"><Declarations conditions={conditions} onChange={onChange} /><GroupEditor g={allOf(...conditions)} onChange={(g) => onChange(nameInstances(p, g.of))} vars={vars} head={head} flat scope={conditions.flatMap(leaves)} /></div>
}

/** The tree list with `f` applied to each condition (given its position among the conditions in reading order). */
const mapAt = (ws: When[], f: (c: Condition, i: number) => Condition): When[] => {
  let k = 0
  const go = (w: When): When => (isGroup(w) ? { ...w, of: w.of.map(go) } : f(w, k++))
  return ws.map(go)
}

/** The instances the conditions talk about (an entity with several instances), one line each: quantifier, entity, name. Edits apply to the condition that introduces the instance; conditions refer to it by name. */
function Declarations({ conditions: tree, onChange }: { conditions: When[]; onChange: (cs: When[]) => void }) {
  const p = useProject()
  const conditions = tree.flatMap(leaves)
  const decls = conditions.flatMap((c, i) => {
    const v = isText(c) ? undefined : p.items[c.variable]
    if (v?.kind !== 'variable') return []
    const out: { i: number; end: 1 | 2; name: string; entity: Id | null; quant: Quantifier | null; cmp?: boolean }[] = []
    const e1 = quantOf(p, c) && !c.same ? boundEntity(p, v) : null
    if (e1) out.push({ i, end: 1, name: c.as ?? '', entity: e1, quant: quantOf(p, c) })
    const e2 = !c.same2 ? otherEnd(p, v) : null
    if (e2) out.push({ i, end: 2, name: c.as2 ?? '', entity: e2, quant: 'some' })
    for (const x of condInstances(p, c)) if (x.cmp && x.intro) out.push({ i, end: x.end, name: x.name, entity: x.entity, quant: 'some', cmp: true })
    return out
  })
  if (!decls.length) return null
  const rename = (d: (typeof decls)[number], to: string) => {
    const old = d.name
    onChange(mapAt(tree, (c, i) => {
      const x = i === d.i ? { ...c, [d.cmp ? (d.end === 1 ? 'oAs' : 'oAs2') : d.end === 1 ? 'as' : 'as2']: to || undefined } : { ...c }
      if (old) { for (const k of ['same', 'same2', 'oSame', 'oSame2'] as const) if (x[k] === old) x[k] = to || undefined }
      return x
    }))
  }
  return (
    <div className="decls">
      {decls.map((d, n) => (
        <div key={d.i + ':' + d.end + (d.cmp ? 'c' : '')} className="decl">
          <span className="cond-word">{d.quant === 'all' ? (n ? 'and for' : 'For') : n ? 'and' : 'There is'}</span>
          {d.end === 1 && !d.cmp && (
            <Select value={d.quant ?? 'some'} onChange={(e) => onChange(mapAt(tree, (c, i) => (i === d.i ? { ...c, quant: e.target.value === 'some' ? undefined : e.target.value as Quantifier } : c)))}>
              {QUANTIFIERS.map((q) => <option key={q} value={q}>{QUANT_LABELS[q]}</option>)}
            </Select>
          )}
          {(d.end === 2 || d.cmp) && <span className="cond-word">some</span>}
          <span className="chip k-entity">{p.items[d.entity ?? '']?.title.trim() || 'instance'}</span>
          {d.quant !== 'all' && d.quant !== 'none' && <input className="decl-name" value={d.name} placeholder="name" onChange={(e) => rename(d, e.target.value.replace(/\s/g, ''))} />}
        </div>
      ))}
    </div>
  )
}

const BLANK_PARAM: Param = { name: '', type: 'range', states: [], min: null, max: null, unit: '', rangeType: '', enumType: '' }

/** The parameters of a control action: a name and a type (enum with states / boolean / range with bounds and unit), as for variables. */
/** Summary lines with a button that opens the editor in a dialog. */
function EditPopup({ title, lines, empty, button, children }: { title: string; lines: string[]; empty: string; button: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ctx-summary">
      {lines.length ? <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted">{empty}</span>}
      <button type="button" onClick={() => setOpen(true)}>{button}</button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)} wide>
          {children}
          <div className="modal-actions"><button className="primary" onClick={() => setOpen(false)}>Done</button></div>
        </Modal>
      )}
    </div>
  )
}

function ParamsSummary({ params, onChange }: { params: Param[]; onChange: (p: Param[]) => void }) {
  const p = useProject()
  return <EditPopup title="Edit parameters" lines={params.filter((x) => x.name).map((x) => paramSummary(p, x))} empty="No parameters" button="Edit parameters…"><ParamsEditor params={params} onChange={onChange} /></EditPopup>
}

function ArgsSummary({ ca, uca, onChange }: { ca: ItemOf<'ca'>; uca: ItemOf<'uca'>; onChange: (a: ArgCondition[]) => void }) {
  const p = useProject()
  const labels = useLabels()
  return <EditPopup title="Edit parameter conditions" lines={argTexts(p, uca).map((l) => renderText(labels, l))} empty="No conditions on parameters" button="Edit parameter conditions…"><ArgsEditor ca={ca} args={uca.args} onChange={onChange} /></EditPopup>
}

type ParamData = Omit<Param, 'name'>
const rangeSum = (t: { min: number | null; max: number | null; unit: string }) => describeStates({ type: 'range', states: [], rules: [], ...t } as unknown as Variable)

const TypeLabel = ({ t, plus, children }: { t: 'range' | 'enum' | 'boolean' | 'symbolic'; plus?: boolean; children: ReactNode }) =>
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative', ...(plus ? { color: 'var(--accent)' } : {}) }}>{plus && <span style={{ position: 'absolute', left: -17, display: 'flex' }}><Icon name="plus" size={12} /></span>}<Icon name={`type-${t}`} size={13} />{children}</span>

const KINDS = ['range', 'enum', 'boolean', 'symbolic'] as const
const KIND_NAME = { range: 'Range', enum: 'Enumeration', boolean: 'Boolean', symbolic: 'Symbolic' }

/** One popup for a parameter's datatype: kinds on the left; for the chosen kind, a one-off definition, a named type or a new named type on the right. */
function DataTypeSelect({ x, onChange }: { x: ParamData; onChange: (patch: Partial<Param>) => void }) {
  const p = useProject()
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [vk, setVk] = useState<(typeof KINDS)[number]>(x.type as (typeof KINDS)[number])
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState<(typeof KINDS)[number] | null>(null)
  const k = x.type as (typeof KINDS)[number]
  const none = { rangeType: '', enumType: '', symbolicType: '' }
  const close = () => { setAt(null); setQ('') }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.select-pop') && !btn.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', close) }
  }, [at])
  const namedOf = (t: typeof KINDS[number]) => t === 'range' ? p.rangeTypes : t === 'enum' ? p.enumTypes : t === 'symbolic' ? p.symbolicTypes : undefined
  const fieldOf = (t: typeof KINDS[number]) => t === 'range' ? 'rangeType' : t === 'enum' ? 'enumType' : 'symbolicType'
  const curName = (t: typeof KINDS[number]) => (k === t ? (x as unknown as Record<string, string>)[fieldOf(t)] : '') ?? ''
  const detail = (t: typeof KINDS[number], n: string) => t === 'range' ? ` (${rangeSum(p.rangeTypes![n])})` : t === 'enum' ? ` (${p.enumTypes![n].join(' | ')})` : ''
  const apply = (t: typeof KINDS[number], name: string) => { close(); onChange({ ...none, type: t as Param['type'], ...(name ? { [fieldOf(t)]: name } : {}) }) }
  const names = Object.keys(namedOf(vk) ?? {}).sort()
  const shown = names.filter((n) => (n + detail(vk, n)).toLowerCase().includes(q.toLowerCase()))
    return (
    <>
      <button ref={btn} type="button" className="select" onClick={() => { if (at) return close(); const r = btn.current!.getBoundingClientRect(); setVk(k); setAt({ x: r.left, y: r.bottom + 4 }) }}>
        <span className="select-val"><TypeLabel t={k}>{k !== 'boolean' && curName(k) ? `${KIND_NAME[k]} · ${curName(k)}` : k === 'boolean' ? KIND_NAME[k] : `${KIND_NAME[k]} · choose type…`}</TypeLabel></span>
      </button>
      {at && createPortal(
        <div className="select-pop" style={{ left: at.x, top: at.y, display: 'flex', gap: 4, padding: 0, width: 420, maxHeight: Math.max(200, window.innerHeight - at.y - 12) }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 4, borderRight: '1px solid var(--line)', width: 140, flexShrink: 0 }}>
            {KINDS.map((t) => <li key={t} className={(t === vk ? 'hi ' : '') + (t === k ? 'cur' : '')} onMouseEnter={() => setVk(t)} onClick={() => t === 'boolean' ? apply(t, '') : setVk(t)}><TypeLabel t={t}>{KIND_NAME[t]}</TypeLabel></li>)}
          </ul>
          <ul style={{ listStyle: 'none', margin: 0, padding: 4, flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {vk === 'boolean' ? <li className="off">true / false</li> : <>
              <li className="srch"><input ref={(el) => el?.focus({ preventScroll: true })} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></li>
              {shown.length > 0 && <li className="grp">Named types</li>}
              {!names.length && <li className="off">No {KIND_NAME[vk].toLowerCase()} types yet</li>}
              {shown.map((n) => <li key={n} className={curName(vk) === n ? 'cur' : ''} onClick={() => apply(vk, n)}>{n}{detail(vk, n)}</li>)}
              {q && !shown.length && <li className="off">No matches</li>}
              <li className="grp">Create</li>
              <li style={{ color: 'var(--accent)' }} onClick={() => { close(); setCreating(vk) }}><TypeLabel t={vk} plus>New {vk === 'enum' ? 'enumeration' : vk} type…</TypeLabel></li>
            </>}
          </ul>
        </div>,
        document.body,
      )}
      {creating === 'range' && <RangeTypeDialog name={null} init={{ min: x.min, max: x.max, unit: x.unit }} onClose={() => setCreating(null)} then={(n) => onChange({ ...none, type: 'range', rangeType: n })} />}
      {creating === 'symbolic' && <SymbolicTypeDialog init={symProps(x)} onClose={() => setCreating(null)} then={(n) => onChange({ ...none, type: 'symbolic', symbolicType: n })} />}
      {creating === 'enum' && <EnumTypeDialog init={x.states} onClose={() => setCreating(null)} then={(n) => onChange({ ...none, type: 'enum', enumType: n })} />}
    </>
  )
}

/** One parameter: cells in a grid (name, type, …), remove button, and the type details underneath. */
function ParamRow({ cells, cols = cells.length, details, onRemove }: { cells: ReactNode[]; cols?: number; details?: ReactNode; onRemove: () => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr)) auto`, gap: '6px 8px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
      {cells.map((c, i) => <Fragment key={i}>{c}</Fragment>)}
      <button className="x" title="Remove" onClick={onRemove}><Icon name="x" size={12} /></button>
      {details && <div style={{ gridColumn: '1 / -1', paddingLeft: 4 }}>{details}</div>}
    </div>
  )
}

function ParamsEditor({ params, onChange }: { params: Param[]; onChange: (p: Param[]) => void }) {
  const upd = (i: number, patch: Partial<Param>) => onChange(params.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="params">
      {params.map((x, i) => (
        <ParamRow key={i} onRemove={() => onChange(params.filter((_, j) => j !== i))}
          cells={[<input placeholder="name" value={x.name} onChange={(e) => upd(i, { name: e.target.value })} />, <DataTypeSelect x={x} onChange={(patch) => upd(i, patch)} />]} />
      ))}
      <div className="rule-add"><button onClick={() => onChange([...params, BLANK_PARAM])}>+ parameter</button></div>
    </div>
  )
}

/** Conditions on the parameters of a UCA's control action: "dose is greater than 5 mg". */
function ArgsEditor({ ca, args, onChange }: { ca: ItemOf<'ca'>; args: ArgCondition[]; onChange: (a: ArgCondition[]) => void }) {
  const p = useProject()
  const upd = (i: number, patch: Partial<ArgCondition>) => onChange(args.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="params">
      {args.map((a, i) => {
        const pa = paramOf(ca, a.param), pv = pa && paramVar(p, pa), values = valuesOf(pv), err = argError(p, ca, a)
        return (
          <div key={i} className="cond">
            <Select value={a.param} onChange={(e) => onChange(args.map((x, j) => (j === i ? { param: e.target.value, op: '=', state: '' } : x)))}>
              <option value="" disabled hidden>parameter…</option>
              {ca.params.map((x) => <option key={x.name}>{x.name}</option>)}
            </Select>
            <Select value={a.op} onChange={(e) => upd(i, { op: e.target.value as ConditionOp, set: undefined })}>{opsFor(pv).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}</Select>
            {isSetOp(a.op)
              ? <span className="setpick"><span className="brace">{'{'}</span>{(pv?.states ?? []).map((s) => <button type="button" key={s} className={'opt' + (a.set?.includes(s) ? ' on' : '')} onClick={() => upd(i, { set: toggled(a.set ?? [], s) })}>{a.set?.includes(s) ? '✓ ' : ''}{s}</button>)}<span className="brace">{'}'}</span></span>
              : values
                ? <Select value={a.state} onChange={(e) => upd(i, { state: e.target.value })}><option value="" disabled hidden>value…</option>{values.map((s) => <option key={s}>{s}</option>)}</Select>
                : <input className="time-amount" type={pv?.type === 'symbolic' ? 'text' : 'number'} placeholder={pv?.type === 'symbolic' ? 'symbol…' : 'value…'} value={a.state} onChange={(e) => upd(i, { state: e.target.value })} />}
            {isRangeOp(a.op) && <><span className="cond-word">and</span><input className="time-amount" type="number" placeholder="value…" value={a.to ?? ''} onChange={(e) => upd(i, { to: e.target.value })} /></>}
            {pv?.type === 'range' && pv.unit && <span className="muted">{pv.unit}</span>}
            <button className="x" title="Remove" onClick={() => onChange(args.filter((_, j) => j !== i))}><Icon name="x" size={12} /></button>
            {err && a.param && (a.state || a.set?.length) ? <small className="cond-err">{err}</small> : null}
          </div>
        )
      })}
      <div className="rule-add"><button onClick={() => onChange([...args, { param: ca.params[0]?.name ?? '', op: '=', state: '' }])}>+ condition on a parameter</button></div>
    </div>
  )
}

const BLANK: Condition = { variable: '', op: '=', state: '' }
const WORDS: Condition = { variable: '', op: '=', state: 'true', text: '' }
const TIME: TimeBound = { op: '≥', amount: '', unit: 's' }
const EVENT: Condition = { variable: '', op: '=', state: '', event: '', time: TIME }

/** Duration of a timing condition: "for at least 3 s" (after a condition) or "at least 3 s after <event>". */
function TimeEdit({ t, onChange }: { t: TimeBound; onChange: (t: TimeBound) => void }) {
  return (
    <span className="cond-time">
      <Select value={t.op} onChange={(e) => onChange({ ...t, op: e.target.value as TimeBound['op'] })}><option value="≥">at least</option><option value="<">less than</option></Select>
      <input className="time-amount" type="number" min={0} step="any" value={t.amount} placeholder="…" onChange={(e) => onChange({ ...t, amount: e.target.value })} />
      <Select value={t.unit} onChange={(e) => onChange({ ...t, unit: e.target.value as TimeUnit })}>{TIME_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
    </span>
  )
}

/** A condition tree: "all of" / "any of" its conditions and nested groups; the choice shows once there are two or more. `flat`: conditions only, all of them. */
function GroupEditor({ g, onChange, onRemove, vars, head, flat, scope }: { scope?: Condition[]; g: Group; onChange: (g: Group, binds?: Binds) => void; onRemove?: () => void; vars: Variable[]; head: ReactNode; flat?: boolean }) {
  const bound = (x: When, binds: Binds): When => (isGroup(x) ? { ...x, of: x.of.map((y) => bound(y, binds)) } : binds.filter((b) => b.target === x).reduce(withName, x))
  const upd = (i: number, w: When | null, binds: Binds = []) => onChange({ ...g, of: (w ? g.of.map((x, j) => (j === i ? w : x)) : g.of.filter((_, j) => j !== i)).map((x, j) => (j === i ? x : bound(x, binds))) }, binds)
  const join = g.of.length > 1 ? (g.any ? 'or' : 'and') : ''
  return (
    <>
      <div className="rule-head">
        {head}
        {g.of.length > 1 && (flat ? <span className="cond-word">all of these hold:</span> : <><Select value={g.any ? 'any' : 'all'} onChange={(e) => onChange({ ...g, any: e.target.value === 'any' })}><option value="all">all</option><option value="any">any</option></Select><span className="cond-word">of these hold:</span></>)}
        {onRemove && <button className="x" title="Remove group" onClick={onRemove}><Icon name="x" size={12} /></button>}
      </div>
      <div className={'conds' + (onRemove ? ' group' : '')}>
        {g.of.map((w, i) => isGroup(w)
          ? <GroupEditor key={i} g={w} head={<span className="cond-word">{i ? join : ''}</span>} vars={vars} scope={scope} onChange={(x, bs) => upd(i, x, bs)} onRemove={() => upd(i, null)} />
          : <ConditionRow key={i} c={w} word={i ? join : ''} scope={scope} vars={vars} onChange={(x, bs) => upd(i, x, bs)} onRemove={() => upd(i, null)} />)}
        <div className="rule-add">
          <button onClick={() => onChange({ ...g, of: [...g.of, BLANK] })}>+ condition</button>
          <button title="Timing condition: how long ago a control action or feedback occurred. Only checked in traces whose steps have times such as 5 s." onClick={() => onChange({ ...g, of: [...g.of, EVENT] })}>+ timing</button>
          <button title="A condition written in words, for something that is not a variable. Traces treat it as true or false." onClick={() => onChange({ ...g, of: [...g.of, WORDS] })}>+ in words</button>
          {<button title={`A nested group whose conditions are combined with ${g.any ? 'and' : 'or'}`} onClick={() => onChange({ ...g, of: [...g.of, { any: !g.any, of: [BLANK, BLANK] }] })}>+ {g.any ? 'and' : 'or'}-group</button>}
        </div>
      </div>
    </>
  )
}

/** A change to another condition of the same context made alongside a row's own change: set / clear the instance name of one of its ends. */
type Bind = { target: Condition; end: 1 | 2; as: string | undefined }
type Binds = Bind[]
const withName = (x: Condition, bind: Bind): Condition => ({ ...x, [bind.end === 1 ? 'as' : 'as2']: bind.as })

const VAR_OPTION = '\u0000var'

function ConditionRow({ c, onChange: change, onRemove, vars, word, scope = [] }: { scope?: Condition[]; c: Condition; onChange: (c: Condition, binds?: Binds) => void; onRemove: () => void; vars: Variable[]; word: string }) {
  const p = useProject()
  const labels = useLabels()
  const onChange = (x: Condition, binds?: Binds) => change(x, binds)
  const upd = (patch: Partial<Condition>) => onChange({ ...c, ...patch })
  if (isText(c)) return (
    <div className="cond">
      <span className="cond-word">{word}</span>
      <span className="cond-text"><RichText compact value={c.text ?? ''} onChange={(text) => upd({ text })} only={(it) => it.kind === 'variable' || it.kind === 'entity' || it.kind === 'relationship'} placeholder="condition in words… (type @ to refer to a variable)" /></span>
      <Select value={c.op} onChange={(e) => upd({ op: e.target.value as ConditionOp })}><option value="=">holds</option><option value="≠">does not hold</option></Select>
      <button className="x" title="Remove" onClick={onRemove}><Icon name="x" size={12} /></button>
    </div>
  )
  if (isEvent(c)) {
    const events = Object.values(p.items).filter((x) => x.kind === 'ca' || x.kind === 'feedback' || x.kind === 'operation')
    return (
      <div className="cond cond-ev">
        <span className="cond-word">{word}</span>
        <TimeEdit t={c.time ?? TIME} onChange={(time) => upd({ time })} />
        <span className="cond-word">after</span>
        <Select value={c.event ?? ''} onChange={(e) => upd({ event: e.target.value })}>
          <option value="" disabled hidden>control action or feedback…</option>
          {events.map((x) => <option key={x.id} value={x.id}>{labels[x.id]} {renderText(labels, x.title)}</option>)}
        </Select>
        <span className="cond-word">occurred</span>
        <button className="x" title="Remove" onClick={onRemove}><Icon name="x" size={12} /></button>
      </div>
    )
  }
  const v = p.items[c.variable]
  const vr = v?.kind === 'variable' ? v : undefined
  const values = valuesOf(vr)
  const bar = vr?.type === 'range' && vr.min !== null && vr.max !== null && vr.max > vr.min
  const cmp = c.other !== undefined
  const ov = c.other ? p.items[c.other] : undefined
  const idx = scope.indexOf(c)
  const entityTitle = (e: Id | null) => p.items[e ?? '']?.title.trim() || 'instance'
  /** The ways to pick the instance at one end of condition `c0` (variable `v`): a quantifier (first end), the same instance as an earlier condition, or another one. */
  const instOptions = (c0: Condition, v: Variable, end: 1 | 2) => {
    const ent = end === 1 ? (quantOf(p, c0) ? boundEntity(p, v) : null) : otherEnd(p, v)
    if (!ent) return null
    const [asK, sameK] = end === 1 ? (['as', 'same'] as const) : (['as2', 'same2'] as const)
    const pool = scope.flatMap((o, i) => {
      const ov = isText(o) || o === c ? undefined : p.items[o.variable]
      if (ov?.kind !== 'variable') return []
      return ([1, 2] as const).filter((e) => (e === 1 ? quantOf(p, o) === 'some' && !o.same && boundEntity(p, ov) === ent : !o.same2 && otherEnd(p, ov) === ent))
        .map((e) => ({ o, i, e, name: (e === 1 ? o.as : o.as2) ?? '' }))
    }).filter((x) => x.name)
    const mine = c0[asK]
    const other = mine ? pool.find((x) => x.name !== mine && x.i < idx) : undefined
    const value = c0[sameK] ? 'same:' + c0[sameK] : other ? `other:${other.i}:${other.e}` : end === 1 ? quantOf(p, c0)! : 'some'
    const apply = (x: string) => (c1: Condition): { c: Condition; binds: Bind[] } => {
      // leaving a reference may orphan the name it used
      const ref = c1[sameK]
      const used = (o: Condition) => o !== c && (o.same === ref || o.same2 === ref)
      const intro = ref && !scope.some(used) ? scope.flatMap((o): { target: Condition; end: 1 | 2 }[] => (o.as === ref ? [{ target: o, end: 1 }] : o.as2 === ref ? [{ target: o, end: 2 }] : []))[0] : undefined
      const base: Condition = { ...c1, [sameK]: undefined, [asK]: undefined, ...(end === 1 ? { quant: undefined } : {}) }
      const drop: Bind[] = intro ? [{ ...intro, as: undefined }] : []
      if (x.startsWith('same:')) return { c: { ...base, [sameK]: x.slice(5) }, binds: drop.filter((d) => d.target[d.end === 1 ? 'as' : 'as2'] !== x.slice(5)) }
      if (x.startsWith('other:')) {
        const [, i2, e] = x.split(':'), t = scope[Number(i2)], tn = (e === '1' ? t.as : t.as2) ?? ''
        return { c: { ...base, [asK]: autoName(p, ent, scope, [tn]) }, binds: drop }
      }
      return { c: end === 1 ? { ...base, quant: x === 'some' ? undefined : x as Quantifier } : base, binds: drop }
    }
    const t = entityTitle(ent)
    const opts = [
      ...(end === 1 ? QUANTIFIERS.map((q) => ({ value: q as string, short: QUANT_LABELS[q], long: `${QUANT_LABELS[q]} ${t}` })) : [{ value: 'some', short: `some ${t}`, long: `some ${t}` }]),
      ...pool.map(({ name }) => ({ value: 'same:' + name, short: name, long: name })),
      ...pool.filter(({ i }) => i < idx).map(({ i, e, name }) => ({ value: `other:${i}:${e}`, short: `another ${t} than ${name}`, long: `another ${t} than ${name}` })),
    ].map((o) => ({ ...o, apply: apply(o.value) }))
    return { value, opts, asK }
  }
  const instText = (end: 1 | 2) => { const io = vr && instOptions(c, vr, end); const o = io?.opts.find((x) => x.value === io.value); return o ? (c[io!.asK] ?? o.long) : '' }
  /** Every subject (variable with its instance choices) the condition could be started with. */
  const subjectChoices = (): SubjectChoice[] => vars.flatMap((v) => {
    const c0: Condition = { ...c, variable: v.id, state: '', to: '', set: [], other: undefined, op: opsFor(v).includes(c.op) ? c.op : '=', quant: undefined, as: undefined, same: undefined, as2: undefined, same2: undefined }
    const o1 = instOptions(c0, v, 1)?.opts ?? [null], o2 = instOptions(c0, v, 2)?.opts ?? [null]
    return o1.flatMap((a) => o2.map((b) => {
      const r1 = a ? a.apply(c0) : { c: c0, binds: [] as Bind[] }
      const r2 = b ? b.apply(r1.c) : { c: r1.c, binds: [] as Bind[] }
      const [before, after] = [a?.long, b?.long]
      return { key: `${v.id}|${a?.value}|${b?.value}`, variable: v, before, after, text: `${before ?? ''} ${variableName(p, v)} ${labels[v.id]} ${after ?? ''}`, pick: () => onChange(r2.c, [...r1.binds, ...r2.binds]) }
    }))
  })
  /** Names the compared variable can be read at (instances introduced by the other conditions), per end of a variable. */
  const otherNames = (ent: Id) => [...new Set(scope.flatMap((o) => (o === c ? [] : condInstances(p, o).filter((x) => x.entity === ent && x.intro).map((x) => x.name))))]
  const otherChoices = (): SubjectChoice[] => !vr ? [] : vars.filter((x) => x.id !== vr.id && x.type === vr.type).flatMap((x) => {
    const e1 = boundEntity(p, x), e2 = otherEnd(p, x)
    // per end: read at any instance, at a named one, or at one introduced here ("another … than t1")
    const ends = (e: Id | null, lane: 'oSame' | 'oSame2', as: 'oAs' | 'oAs2', taken: string[]) => {
      if (!e) return [{ label: undefined as string | undefined, patch: {} }]
      const names = otherNames(e), t = entityTitle(e), fresh = autoName(p, e, scope, [...names, ...taken])
      return [
        { label: `any ${t}`, patch: {} },
        ...names.map((n) => ({ label: n, patch: { [lane]: n } })),
        ...(names.length ? names.map((n) => ({ label: `another ${t} than ${n}`, patch: { [as]: fresh } })) : [{ label: `some ${t}`, patch: { [as]: fresh } }]),
      ]
    }
    return ends(e1, 'oSame', 'oAs', []).flatMap((a, ai) => ends(e2, 'oSame2', 'oAs2', Object.values(a.patch)).map((b, bi) => {
      const [before, after] = [a.label, b.label]
      return { key: `${x.id}|${ai}|${bi}`, variable: x, before, after, text: `${before ?? ''} ${variableName(p, x)} ${labels[x.id]} ${after ?? ''}`, pick: () => upd({ other: x.id, oSame: undefined, oSame2: undefined, oAs: undefined, oAs2: undefined, ...a.patch, ...b.patch }) }
    }))
  })
  const instOf = (end: 1 | 2) => { const e = ov?.kind === 'variable' ? (end === 1 ? boundEntity(p, ov) : otherEnd(p, ov)) : null; return e ? (oName(c, end) || `any ${entityTitle(e)}`) : '' }
  const err = vr && (cmp ? c.other : c.state || c.set?.length) ? conditionError(vr, c, p) : null
  const toVar = () => vr && upd({ other: '', state: '', to: '', set: [], op: opsForVar(vr).includes(c.op) ? c.op : '=' })
  const toValue = () => vr && upd({ other: undefined, oSame: undefined, oSame2: undefined, oAs: undefined, oAs2: undefined, state: '', to: '', op: opsFor(vr).includes(c.op) ? c.op : '=' })
  const swap = (title: string, run: () => void) => <button type="button" className="btn" title={title} style={{ flex: 'none', padding: '1px 6px', fontSize: 11 }} onClick={run}>⇄</button>
  const valueInput = (key: 'state' | 'to', placeholder: string) =>
    values ? (
      <Select value={c[key] ?? ''} onChange={(e) => e.target.value === VAR_OPTION ? toVar() : upd({ [key]: e.target.value })}>
        <option value="" disabled hidden>{placeholder}</option>
        {values.map((s) => <option key={s}>{s}</option>)}
        {key === 'state' && !isRangeOp(c.op) && <option value={VAR_OPTION}>another variable…</option>}
      </Select>
    ) : vr?.type === 'symbolic' ? (
      <TextInput value={c[key] ?? ''} onChange={(v) => upd({ [key]: v })} placeholder="symbol, e.g. t1" />
    ) : (
      <BoundedNumber value={c[key] ?? ''} onChange={(v) => upd({ [key]: v })} min={vr?.min ?? null} max={vr?.max ?? null} step={vr ? stepOf(vr) : 1} placeholder={placeholder} />
    )
  return (
    <div className="cond">
      <span className="cond-word">{word}</span>
      <SubjectPicker choices={subjectChoices} create={{ label: '+ New variable…', run: () => upd({ variable: addItemInDialog('variable'), state: '', to: '', set: [], op: '=' }) }}>
        {v ? <>{instText(1) && <span className="subj-inst">{instText(1)}</span>}<ItemHover id={v.id}><span className={'chip k-' + v.kind}><ChipLabel it={v} label={labels[v.id]} /></span></ItemHover>{instText(2) && <span className="subj-inst">{instText(2)}</span>}</> : <span className="muted">variable…</span>}
      </SubjectPicker>
      <Select value={c.op} onChange={(e) => upd({ op: e.target.value as ConditionOp })}>
        {(cmp ? opsForVar(vr) : opsFor(vr)).map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
      </Select>
      <div className={'cond-val' + (!cmp && bar && !isSetOp(c.op) ? ' bar' : '')}>
        {cmp && vr && (
          <SubjectPicker choices={otherChoices}>
            {ov?.kind === 'variable' ? <>{instOf(1) && <span className="subj-inst">{instOf(1)}</span>}<ItemHover id={ov.id}><span className={'chip k-' + ov.kind}><ChipLabel it={ov} label={labels[ov.id]} /></span></ItemHover>{instOf(2) && <span className="subj-inst">{instOf(2)}</span>}</> : <span className="muted">variable…</span>}
          </SubjectPicker>
        )}
        {cmp && vr && swap('Compare with a fixed value instead', toValue)}
        {!cmp && bar && vr && (
          <RangeBar min={vr.min!} max={vr.max!} step={stepOf(vr)} op={c.op} a={c.state} b={c.to ?? ''} unit={vr.unit} onChange={(a, b) => upd(isRangeOp(c.op) ? { state: a, to: b } : { state: a })} />
        )}
        {cmp ? null : isSetOp(c.op)
          ? <span className="setpick"><span className="brace">{'{'}</span>{(vr?.states ?? []).map((s) => <button type="button" key={s} role="checkbox" aria-checked={!!c.set?.includes(s)} className={'opt' + (c.set?.includes(s) ? ' on' : '')} onClick={() => upd({ set: toggled(c.set ?? [], s) })}>{c.set?.includes(s) ? '✓ ' : ''}{s}</button>)}<span className="brace">{'}'}</span>{!vr?.states.length && <span className="muted">pick a variable with states</span>}</span>
          : !bar && valueInput('state', vr?.type === 'range' ? 'value…' : 'state…')}
        {!cmp && isRangeOp(c.op) && !bar && <><span className="cond-word">and</span>{valueInput('to', 'value…')}</>}
        {!cmp && vr?.type === 'range' && vr.unit && !bar && <span className="muted">{vr.unit}</span>}
        {!cmp && vr && !values && !isSetOp(c.op) && swap('Compare with another variable instead', toVar)}
      </div>
      {c.time ? <div className="cond-dur"><span className="cond-word">held for</span><TimeEdit t={c.time} onChange={(time) => upd({ time })} /><button type="button" className="btn" title="Remove the duration" onClick={() => upd({ time: undefined })}>⊘</button></div>
        : vr && <button type="button" className="btn" title="Require the condition to have held for some time" style={{ flex: 'none', padding: '1px 6px', fontSize: 11 }} onClick={() => upd({ time: TIME })}>⏱</button>}
      <button className="x" title="Remove" onClick={onRemove}><Icon name="x" size={12} /></button>
      {err && <small className="cond-err">{err}</small>}
    </div>
  )
}

function RulesSummary({ it, set }: { it: Variable; set: Set }) {
  const p = useProject()
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const lines = it.rules.map((r) => `${r.state || '?'} when ${renderText(labels, whenText(p, r.when)) || '?'}`)
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
          <p className="muted">Rules are checked in order; the first one whose condition holds decides the value.</p>
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
      {!it.rules.length && <p className="muted">No rules: {name} gets its value directly in each trace.</p>}
      {it.rules.map((r, i) => (
        <div key={i} className="rule">
          <GroupEditor g={r.when} onChange={(when) => upd(i, { when })} vars={vars}
            head={<><span>{i ? 'Else, ' : ''}{name} is</span>{value(r.state, (v) => upd(i, { state: v }), 'value…')}<span>when</span></>} />
          <button className="x rule-x" title="Remove rule" onClick={() => set({ rules: it.rules.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
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
  const refinable = it.conditions.map((c, i) => [c, i] as const).filter((x): x is readonly [Condition, number] => !isGroup(x[0])).filter(([c]) => { const v = p.items[c.variable]; return v?.kind === 'variable' && v.rules.length > 0 && conditionComplete(c) })
  return (
    <>
      {it.refines && (
        <Field label="Refines" hint="The more general UCA that this one makes more detailed, using more detailed variables in its context.">
          <SingleRef value={it.refines} options={itemsOfKind(p, 'uca').filter((u) => u.id !== it.id)} onChange={(v) => set({ refines: v })} />
        </Field>
      )}
      {(refinable.length > 0 || kids.length > 0) && (
        <Field label="Refined into" hint="Replaces a computed variable in the context by its rules: one more detailed UCA for each way the condition can hold.">
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

/** Choose a named, reusable state list for an enum variable or parameter, or save its own states as one. */
function EnumTypePicker({ x, name, onChange }: { x: { enumType: string; states: string[] }; name: string; onChange: (patch: { enumType: string }) => void }) {
  const p = useProject()
  const [isNew, setNew] = useState(false)
  const names = Object.keys(p.enumTypes ?? {}).sort()
  const save = async () => {
    const n = await askText({ title: 'Save states as a type', label: 'Name for this state list (e.g. On/Off, Severity)', initial: name, confirm: 'Save' })
    if (n && !p.enumTypes?.[n]) { commit((q) => defineEnumType(q, n, x.states)); onChange({ enumType: n }) }
  }
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
      {names.length > 0 && <Select value={x.enumType} onChange={(e) => onChange({ enumType: e.target.value })}>
        <option value="">Own states</option>
        {names.map((n) => <option key={n} value={n}>{n} ({p.enumTypes![n].join(' | ')})</option>)}
      </Select>}
      {!x.enumType && x.states.length > 0 && <button className="btn" onClick={save} title="Share these states with other variables">Save as type…</button>}
      {!x.enumType && !x.states.length && <button className="btn" onClick={() => setNew(true)} title="Define a shared state list">New type…</button>}
      {isNew && <EnumTypeDialog onClose={() => setNew(false)} then={(n) => onChange({ enumType: n })} />}
    </div>
  )
}

/** Parameters of an operation (name and entity / relationship), edited in a dialog. */
function OpParamsSummary({ p, it, set }: { p: Project; it: ItemOf<'operation'>; set: Set }) {
  const types = [...itemsOfKind(p, 'entity'), ...itemsOfKind(p, 'relationship')]
  const upd = (i: number, patch: Partial<OpParam>) => set({ params: it.params.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <EditPopup title={`Parameters of ${it.title || 'operation'}`} lines={it.params.map((x) => paramText(p, x))} empty="No parameters" button="Edit parameters…">
      <div className="params">
        {it.params.map((x, i) => {
          const setData = (patch: Partial<Param>) => upd(i, { data: { ...x.data!, ...patch } })
          return (
            <ParamRow key={i}
              onRemove={() => set({ params: it.params.filter((_, j) => j !== i), effects: it.effects.map((ef) => (ef.on === x.name ? { ...ef, on: undefined } : ef.from === x.name ? { ...ef, from: undefined, state: '' } : ef)) })}
              cells={[
                <input placeholder="name" value={x.name} onChange={(e) => { const name = e.target.value; set({ params: it.params.map((y, j) => (j === i ? { ...y, name } : y)), effects: it.effects.map((ef) => ({ ...ef, ...(ef.on === x.name ? { on: name } : {}), ...(ef.from === x.name ? { from: name } : {}) })) }) }} />,
                <Select value={x.data ? 'value' : 'of'} onChange={(e) => upd(i, e.target.value === 'value' ? { entity: '', data: { ...BLANK_PARAM } } : { data: undefined })}><option value="of">instance of</option><option value="value">value</option></Select>,
                x.data ? <DataTypeSelect x={x.data} onChange={setData} /> : <SingleRef value={x.entity || null} options={types} onChange={(v) => upd(i, { entity: v ?? '' })} />,
              ]} />
          )
        })}
        <div className="rule-add"><button onClick={() => set({ params: [...it.params, { name: '', entity: '' }] })}>+ parameter</button></div>
      </div>
    </EditPopup>
  )
}

/** Effects of an operation as lines, edited in a dialog. */
function EffectsSummary({ p, it, set }: { p: Project; it: ItemOf<'operation'>; set: Set }) {
  const labels = useLabels()
  const vars = itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain')
  const upd = (i: number, patch: Partial<Effect>) => set({ effects: it.effects.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <EditPopup title={`Effects of ${it.title || 'operation'}`} lines={it.effects.filter((e) => e.variable && e.state).map((e) => renderText(labels, effectText(e)))} empty="No effects" button="Edit effects…">
      <div className="params">
        {it.effects.map((ef, i) => {
          const v = p.items[ef.variable] as Variable | undefined, values = v?.kind === 'variable' ? valuesOf(v) : null
          return (
            <div key={i} className="cond cond-ev">
              <SingleRef value={ef.variable || null} options={vars} onChange={(x) => { const par = it.params.filter((q) => q.entity && q.entity === (p.items[x ?? ''] as Variable | undefined)?.parent); upd(i, { variable: x ?? '', state: '', on: par.length === 1 ? par[0].name : undefined }) }} />
              {it.params.some((q) => q.entity && q.entity === v?.parent) && <Select value={ef.on ?? ''} onChange={(e) => upd(i, { on: e.target.value || undefined })}><option value="">of any instance</option>{it.params.filter((q) => q.entity === v?.parent).map((q) => <option key={q.name} value={q.name}>of {q.name}</option>)}</Select>}
              <span className="cond-word">becomes</span>
              {it.params.some((q) => q.data) && <Select value={ef.from ?? ''} onChange={(e) => upd(i, { from: e.target.value || undefined, state: '' })}><option value="">a fixed value</option>{it.params.filter((q) => q.data).map((q) => <option key={q.name} value={q.name}>the value of {q.name}</option>)}</Select>}
              {ef.from ? null : values ? <Select value={ef.state} onChange={(e) => upd(i, { state: e.target.value })}><option value="" disabled hidden>value…</option>{values.map((s) => <option key={s}>{s}</option>)}</Select>
                : <input className="time-amount" type={v?.kind === 'variable' && v.type === 'symbolic' ? 'text' : 'number'} placeholder={v?.kind === 'variable' && v.type === 'symbolic' ? 'symbol…' : 'value…'} value={ef.state} onChange={(e) => upd(i, { state: e.target.value })} />}
              {!ef.from && v?.kind === 'variable' && v.type === 'range' && v.unit && <span className="muted">{v.unit}</span>}
              <button className="x" title="Remove" onClick={() => set({ effects: it.effects.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
            </div>
          )
        })}
        <div className="rule-add"><button onClick={() => set({ effects: [...it.effects, { variable: '', state: '' }] })}>+ effect</button></div>
      </div>
    </EditPopup>
  )
}
