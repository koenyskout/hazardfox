import { ControllerEditorButton } from './VariableMap'
import { Select } from './Select'
import { WhenView } from './WhenView'
import { ConditionEditor } from './ExprEditor'
import { requiredAtoms } from '../model/atoms'
import { say } from '../model/say'
import { HOLE, type Expr } from '../model/lang'
import { renderText, variableName, defaultReading, readingValid, readRel, endName } from '../model/labels'
import { affectable, attributesOf, generalisations, isA, addBelief, addSignal, beliefsAbout, beliefsOf, controlledBy, predicateOf, refinedBy, signalsOf, setLayer, updatedBy, updates, variablesIn } from '../model/formal'
import { VARIABLE_OWNER } from '../model/tree'
import { guideApplies } from '../model/uca'
import { effectText, inheritedOperations, opSignature, operationsOf, paramText } from '../model/operations'
import { argError, argTexts, paramOf, paramSummary, paramVar } from '../model/params'
import { describeStates, symProps, isRangeOp, isSetOp, OP_LABELS, opsFor, valuesOf } from '../model/variables'
import { typeSpec } from '../model/create'
import { type TypeSpec, type Effect, type Project, type RelEnd, type ArgCondition, type OpParam, type Param, CARDINALITIES, VARIABLE_LAYERS, VARIABLE_LAYER_LABELS, type Rule, type Variable, type VariableLayer, type ConditionOp, CAUSES, DURATIONS, DURATION_LABELS, type Duration, GUIDE_WORD_LABELS, GUIDE_WORDS, KIND_NAMES, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPE_LABELS, SCENARIO_TYPES, STATUSES, STRIDE, type Cause, type GuideWord, type Id, type Item, type ItemOf, type Kind, type NodeRole, type Patch, type RequirementType, type ScenarioType, rulesOf, isWorld, aboutOf, otherwiseOf } from '../model/types'
import { effectiveLosses, inheritedLosses } from '../model/derived'
import { updateItem, setScenarioType } from '../model/ops'
import { defineEnumType, defineRangeType } from '../model/ops'
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
import { SubjectPicker } from './Subject'
import { Field, ItemHover, Ref, RefList, RichText, SingleRef, Tags, TextInput, VIEW_OF } from './Fields'
import type { View } from '../model/store'

/** Kinds that may be selected in a view although they belong to another one. */
const SHOWN_ALSO: Partial<Record<View, Kind[]>> = { ucas: ['ca'], scenarios: ['uca', 'ca'], structure: ['variable'], domain: ['node'] }

export function Details() {
  const p = useProject()
  const id = useStore((s) => s.selected)
  const view = useStore((s) => s.view)
  const cur = id ? p.items[id] : null
  const it = cur && (VIEW_OF[cur.kind] === view || (SHOWN_ALSO[view] ?? []).includes(cur.kind)) ? cur : null
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
          <Field label="Leads to losses" hint={inh.length ? 'Losses inherited from the parent hazard have a dashed outline; you can switch them off.' : undefined}>
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
          {it.parent && (
            <Field single label="Relation to parent" hint="Specialisation (is-a): this entity is a kind of its parent and inherits its attributes and operations. Part (part-of): it is a component of its parent.">
              <Select value={it.relation} onChange={(e) => set({ relation: e.target.value as typeof it.relation })}>
                <option value="specialisation">specialisation (is a kind of {p.items[it.parent]?.title.trim() || 'parent'})</option><option value="part">part (is part of {p.items[it.parent]?.title.trim() || 'parent'})</option>
              </Select>
            </Field>
          )}
          <Field single label="Instances" hint="Tick if the system contains several of these (e.g. trains). Conditions on its attributes can then say ‘some’, ‘every’ or ‘no’ instance.">
            <label className="check"><input type="checkbox" checked={it.many} onChange={(e) => set({ many: e.target.checked })} /> several instances</label>
          </Field>
          <Field single label="Attributes" hint="The properties of this entity that can change over time (its world variables).">
            <OwnedVars vars={variablesIn(p, 'domain', it.id)} add="+ new attribute" onNew={() => addItemInDialog('variable', { layer: 'domain', parent: it.id })} />
            {generalisations(p, it.id).length > 0 && <div className="reflist"><span className="muted">inherited:</span>{attributesOf(p, it.id).filter((a) => a.inherited).map((a) => <span key={a.v.id} title={`from ${p.items[a.from]?.title}`}><Ref id={a.v.id} /></span>)}{!attributesOf(p, it.id).some((a) => a.inherited) && <span className="muted">none yet</span>}</div>}
            <ApplyStruct parent={it.id} />
          </Field>
          <Field single label="Operations" hint="Things this entity can do, or that can happen to it. An operation can change world variables, and a control action can carry it out. Optional.">
            <div className="reflist">
              {operationsOf(p, it.id).map((o) => <Ref key={o.id} id={o.id} />)}
              {inheritedOperations(p, it.id).length > 0 && <><span className="muted">inherited:</span>{inheritedOperations(p, it.id).map(({ o, from }) => <span key={o.id} title={`from ${p.items[from]?.title}`}><Ref id={o.id} /></span>)}</>}
              <button className="link" onClick={() => addItemInDialog('operation', { params: [{ name: it.title.trim().split(/\s+/).pop()!.toLowerCase() || 'x', entity: it.id }] })}><Icon name="plus" size={12} /> new operation</button>
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
          {isWorld(it) && it.struct && <p className="hint">This is the field <b>{it.struct.path}</b> of the structured type <b>{it.struct.type}</b> (instance {it.struct.name}). To change its type, states or title, edit the type under Domain model → Types.</p>}
          <VariableLinks v={it} />
          <Field label="Type">
            <DataTypeSelect x={it} own="only for this variable" onChange={(patch) => commit((q) => updateItem(q, it.id, patch as Patch<'variable'>))} />
            {it.type === 'enum' && (
              <Field label="States" hint={it.enumType ? undefined : 'The values this variable can take.'}>
                <EnumTypePicker x={it} name={it.title} onChange={(patch) => commit((q) => updateItem(q, it.id, patch))}>
                  {!it.enumType && <EditPopup title={`States of ${it.title || 'variable'}`} lines={it.states} empty="No states" button="Edit states…"><StringList value={it.states} onChange={(v) => set({ states: v }, 'states')} placeholder="State" addLabel="Add state" /></EditPopup>}
                </EnumTypePicker>
              </Field>
            )}
            {it.type === 'range' && <RangeFields v={it} />}
            {it.type === 'symbolic' && (
              <Field label="Symbolic type" hint="Values without further meaning, written as symbols such as t1 or id7 in traces. They can always be compared with ‘is’ / ‘is not’; if ordered, also with ‘less than’ / ‘greater than’. Compare with a symbol or with another variable of the same type.">
                <SymbolicPicker x={it} onChange={(patch) => commit((q) => updateItem(q, it.id, patch))} />
              </Field>
            )}
          </Field>
        </>
      )
    }
    case 'relationship': {
      const setEnd = (i: number, patch: Partial<RelEnd>) => set({ ends: it.ends.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
      return (
        <>
          <div className="field" style={{ display: 'grid', gridTemplateColumns: 'auto max-content 1fr', alignItems: 'center', columnGap: 8 }}>
            {it.ends.map((e, i) => (
              <Fragment key={i}>
                {i > 0 && <><span /><span style={{ color: 'var(--muted)', lineHeight: 1, paddingLeft: 12 }}>↓</span><span /></>}
                <span>{i ? 'To' : 'From'}</span>
                <div style={{ minWidth: 0 }}><SingleRef value={e.entity || null} options={of('entity')} onChange={(v) => setEnd(i, { entity: v ?? '' })} /></div>
                <div><CardSelect value={e.card} onChange={(v) => setEnd(i, { card: v })} /></div>
                <span />
                <input value={e.role} placeholder={`Role (default ${p.items[e.entity]?.title.trim() || 'entity'})`} onChange={(ev) => setEnd(i, { role: ev.target.value })} style={{ gridColumn: '2 / 4' }} />
              </Fragment>
            ))}
          </div>
          <Field single label="Reads as" hint="How conditions phrase this relationship; the ends are {1}, {2}, …. Use a verb phrase, e.g. ‘{1} is approaching {2}’. Empty: ‘{1} title {2}’.">
            <input value={it.reading} placeholder={defaultReading(it)} onChange={(ev) => set({ reading: ev.target.value })} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {it.ends.map((e, i) => <button key={i} type="button" className="chip" onClick={() => set({ reading: `${it.reading}${/\s$/.test(it.reading) || !it.reading ? '' : ' '}{${i + 1}}` })}>{`{${i + 1}}`} {endName(p, e)}</button>)}
            </div>
            <div style={{ color: readingValid(it) || !it.reading.trim() ? 'var(--muted)' : 'var(--warn, #b45309)', marginTop: 4 }}>{readingValid(it) || !it.reading.trim() ? 'Reads: ' : 'Missing an end, default used: '}{readRel(it, it.ends.map((e) => endName(p, e)))}</div>
          </Field>
          <Field single label="Variables" hint="Properties of the link as a whole, e.g. the distance between the two entities. Whether the relationship holds at all is already available as a yes/no variable in contexts, beliefs and traces. If an end has several instances, conditions can say ‘some’, ‘every’ or ‘no’ link.">
            <OwnedVars vars={variablesIn(p, 'domain', it.id).filter((v) => v.id !== predicateOf(p, it.id)?.id)} add="+ new variable" onNew={() => addItemInDialog('variable', { layer: 'domain', parent: it.id })} />
            <ApplyStruct parent={it.id} />
          </Field>
        </>
      )
    }
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
              <OwnedVars vars={signalsOf(p, it.id)} add="+ reports on…" options={of('variable').filter((v) => v.layer === 'domain' && !signalsOf(p, it.id).some((x) => aboutOf(x) === v.id))} onAdd={(w) => commit((q) => addSignal(q, it.id, w).project)} />
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
              commit((q) => setScenarioType(q, it.id, t, t === 'uca' ? of('uca')[0]?.id ?? null : of('ca')[0]?.id ?? null))
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
  const lines = say(p, it.when) ? [say(p, it.when)] : []
  return (
    <div className="ctx-summary">
      {lines.length || it.context ? (
        <>
          {lines.length > 0 && <WhenView e={it.when} />}
          {it.context && <ul><li>{renderText(labels, it.context)}</li></ul>}
        </>
      ) : <span className="muted">No context yet</span>}
      <button type="button" onClick={() => setOpen(true)}><Icon name="pencil" size={12} /> Edit context…</button>
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
  const lines = say(p, it.when) ? [say(p, it.when)] : []
  return (
    <div className="ctx-summary">
      {lines.length ? <WhenView e={it.when} /> : <span className="muted">No condition yet</span>}
      <button type="button" onClick={() => setOpen(true)}><Icon name="pencil" size={12} /> Edit condition…</button>
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
  return <ConditionEditor e={it.when} onChange={(when) => set({ when })} vars={vars} head={head} />
}

const BLANK_PARAM: Param = { name: '', ...typeSpec({ type: 'range' }) }

/** The parameters of a control action: a name and a type (enum with states / boolean / range with bounds and unit), as for variables. */
/** Summary lines with a button that opens the editor in a dialog. */
function EditPopup({ title, lines, empty, button, children }: { title: string; lines: string[]; empty: string; button: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ctx-summary">
      {lines.length ? <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul> : <span className="muted">{empty}</span>}
      <button type="button" onClick={() => setOpen(true)}><Icon name="pencil" size={12} /> {button}</button>
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

type ParamData = TypeSpec
const rangeSum = (t: { min: number | null; max: number | null; unit: string }) => describeStates({ type: 'range', states: [], rules: [], ...t } as unknown as Variable)

const TypeLabel = ({ t, plus, children }: { t: 'range' | 'enum' | 'boolean' | 'symbolic' | 'struct'; plus?: boolean; children: ReactNode }) =>
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative', ...(plus ? { color: 'var(--accent)' } : {}) }}>{plus && <span style={{ position: 'absolute', left: -17, display: 'flex' }}><Icon name="plus" size={12} /></span>}<Icon name={`type-${t}`} size={13} />{children}</span>

const KINDS = ['boolean', 'enum', 'range', 'struct', 'symbolic'] as const
type Kind5 = (typeof KINDS)[number]
const KIND_NAME = { range: 'Numeric range', enum: 'Enumeration', boolean: 'Boolean', symbolic: 'Symbolic', struct: 'Struct' }

/** One popup for a parameter's datatype: kinds on the left; for the chosen kind, a one-off definition, a named type or a new named type on the right. */
/** `own`: offer a one-off definition (its description); `structs`: struct types to choose from (adds the Struct kind, field `structType`); `noSymbolic`: leave out the Symbolic kind. */
export function DataTypeSelect({ x, onChange, own, structs, noSymbolic }: { x: ParamData & { structType?: string }; onChange: (patch: Partial<Param> & { structType?: string }) => void; own?: string; structs?: string[]; noSymbolic?: boolean }) {
  const p = useProject()
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const kind0: Kind5 = x.structType ? 'struct' : (x.type as Kind5)
  const [vk, setVk] = useState<Kind5>(kind0)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState<Kind5 | null>(null)
  const k = kind0
  const kinds = KINDS.filter((t) => (t !== 'struct' || structs) && (t !== 'symbolic' || !noSymbolic))
  const none = { rangeType: '', enumType: '', symbolicType: '' }
  const close = () => { setAt(null); setQ('') }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.select-pop') && !btn.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    window.addEventListener('mousedown', down); window.addEventListener('keydown', key, true); window.addEventListener('resize', close)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); window.removeEventListener('resize', close) }
  }, [at])
  const namedOf = (t: Kind5): Record<string, unknown> | undefined => t === 'range' ? p.rangeTypes : t === 'enum' ? p.enumTypes : t === 'symbolic' ? p.symbolicTypes : t === 'struct' ? Object.fromEntries((structs ?? []).map((s) => [s, 1])) : undefined
  const fieldOf = (t: Kind5) => t === 'range' ? 'rangeType' : t === 'enum' ? 'enumType' : t === 'struct' ? 'structType' : 'symbolicType'
  const curName = (t: Kind5) => (k === t ? (x as unknown as Record<string, string>)[fieldOf(t)] : '') ?? ''
  const detail = (t: Kind5, n: string) => t === 'struct' ? '' : t === 'range' ? ` (${rangeSum(p.rangeTypes![n])})` : t === 'enum' ? ` (${p.enumTypes![n].join(' | ')})` : ''
  const apply = (t: Kind5, name: string) => { close(); onChange(t === 'struct' ? { ...none, structType: name } : { ...none, ...(structs ? { structType: '' } : {}), type: t as Param['type'], ...(name ? { [fieldOf(t)]: name } : {}) }) }
  const names = Object.keys(namedOf(vk) ?? {}).sort()
  const shown = names.filter((n) => (n + detail(vk, n)).toLowerCase().includes(q.toLowerCase()))
    return (
    <>
      <button ref={btn} type="button" className="select" onClick={() => { if (at) return close(); const r = btn.current!.getBoundingClientRect(); setVk(k); setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 420 - 8)), y: r.bottom + 4 }) }}>
        <span className="select-val"><TypeLabel t={k}>{k === 'boolean' || (own && k !== 'struct' && !curName(k)) ? KIND_NAME[k] : curName(k) ? `${KIND_NAME[k]} · ${curName(k)}` : `${KIND_NAME[k]} · choose type…`}</TypeLabel></span>
      </button>
      {at && createPortal(
        <div className="select-pop" style={{ left: at.x, top: at.y, display: 'flex', gap: 4, padding: 0, width: 420, maxHeight: Math.max(200, window.innerHeight - at.y - 12) }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 4, borderRight: '1px solid var(--line)', width: 140, flexShrink: 0 }}>
            {kinds.map((t) => <li key={t} className={(t === vk ? 'hi ' : '') + (t === k ? 'cur' : '')} onMouseEnter={() => setVk(t)} onClick={() => t === 'boolean' ? apply(t, '') : setVk(t)}><TypeLabel t={t}>{KIND_NAME[t]}</TypeLabel></li>)}
          </ul>
          <ul style={{ listStyle: 'none', margin: 0, padding: 4, flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {vk === 'boolean' ? <li className="off">true / false</li> : <>
              <li className="srch"><input ref={(el) => el?.focus({ preventScroll: true })} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></li>
              {own && vk !== 'struct' && !q && <><li className="grp">Custom</li><li className={k === vk && !curName(vk) ? 'cur' : ''} onClick={() => apply(vk, '')}><b style={{ fontWeight: 600 }}>Own definition</b><span style={{ color: 'var(--muted)', fontSize: '0.9em', marginLeft: 6 }}>{own}</span></li></>}
              {shown.length > 0 && <li className="grp">{vk === 'struct' ? 'Struct types' : 'Named types'}</li>}
              {!names.length && <li className="off">No {KIND_NAME[vk].toLowerCase()} types yet</li>}
              {shown.map((n) => <li key={n} className={curName(vk) === n ? 'cur' : ''} onClick={() => apply(vk, n)} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><b style={{ fontWeight: 600 }}>{n}</b><span style={{ color: 'var(--muted)', fontSize: '0.9em', marginLeft: 6 }}>{detail(vk, n).trim()}</span></li>)}
              {q && !shown.length && <li className="off">No matches</li>}
              {vk !== 'struct' && <li style={{ color: 'var(--accent)' }} onClick={() => { close(); setCreating(vk) }}><TypeLabel t={vk} plus>New named {vk === 'enum' ? 'enumeration' : vk === 'range' ? 'numeric range' : vk} type…</TypeLabel></li>}
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
      <div className="rule-add"><button onClick={() => onChange([...params, BLANK_PARAM])}><Icon name="plus" size={12} /> parameter</button></div>
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
      <div className="rule-add"><button onClick={() => onChange([...args, { param: ca.params[0]?.name ?? '', op: '=', state: '' }])}><Icon name="plus" size={12} /> condition on a parameter</button></div>
    </div>
  )
}

function RulesSummary({ it, set }: { it: Variable; set: Set }) {
  const p = useProject()
  const labels = useLabels()
  const [open, setOpen] = useState(false)
  const lines = rulesOf(it).map((r) => `${r.state || '?'} when ${renderText(labels, say(p, r.when)) || '?'}`)
  return (
    <div className="ctx-summary">
      {lines.length ? (
        <ul>
          {lines.map((l, i) => <li key={i}>{i ? 'else ' : ''}{l}</li>)}
          <li>otherwise {otherwiseOf(it) || 'unknown'}</li>
        </ul>
      ) : <span className="muted">Not computed: set directly</span>}
      <button type="button" onClick={() => setOpen(true)}><Icon name="pencil" size={12} /> Edit rules…</button>
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
  const upd = (i: number, r: Partial<Rule>) => set({ rules: rulesOf(it).map((x, j) => (j === i ? { ...x, ...r } : x)) })
  const name = <b>{it.title || 'the variable'}</b>
  return (
    <div className="rules">
      {!rulesOf(it).length && <p className="muted">No rules: {name} gets its value directly in each trace.</p>}
      {rulesOf(it).map((r, i) => (
        <div key={i} className="rule">
          <ConditionEditor e={r.when.k === 'hole' ? null : r.when} onChange={(when) => upd(i, { when: when ?? HOLE })} vars={vars}
            head={<><span>{i ? 'Else, ' : ''}{name} is</span>{value(r.state, (v) => upd(i, { state: v }), 'value…')}<span>when</span></>} />
          <button className="x rule-x" title="Remove rule" onClick={() => set({ rules: rulesOf(it).filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
        </div>
      ))}
      {rulesOf(it).length > 0 && <div className="rule-head"><span>Otherwise, {name} is</span>{value(otherwiseOf(it), (v) => set({ otherwise: v }, 'otherwise'), 'unknown')}</div>}
      <div className="rule-add"><button onClick={() => set({ rules: [...rulesOf(it), { state: '', when: HOLE }] })}><Icon name="plus" size={12} /> rule</button></div>
    </div>
  )
}

/** Paths (through `and` members and quantifier bodies) of the required conditions, in the order of `requiredAtoms`. */
function atomPaths(e: Expr | null, path: number[] = []): number[][] {
  if (!e || e.k === 'hole') return []
  if (e.k === 'and') return e.of.flatMap((x, i) => atomPaths(x, [...path, i]))
  if (e.k === 'quant') return atomPaths(e.body, [...path, 0])
  if (e.k === 'or') return e.of.length ? atomPaths(e.of[0], [...path, 0]) : []
  return [path]
}
const atomPath = (e: Expr | null, i: number) => atomPaths(e)[i] ?? []

/** UCAs refined from this one (and the one it refines), with a button per context condition whose variable has rules. */
function UcaRefinement({ it, set }: { it: ItemOf<'uca'>; set: Set }) {
  const p = useProject()
  const kids = itemsOfKind(p, 'uca').filter((u) => u.refines === it.id)
  const refinable = requiredAtoms(it.when).flatMap((a, i) => (a.lit?.kind === 'value' ? [[a.lit, i] as const] : [])).filter(([l]) => { const v = p.items[l.id]; return v?.kind === 'variable' && rulesOf(v).length > 0 })
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
            {refinable.map(([c, i]) => <button key={i} className="link" onClick={() => commit((q) => refineUca(q, it.id, atomPath(it.when, i)).project)}>Refine on {p.items[c.id].title}</button>)}
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
  const p = useProject()
  const [open, setOpen] = useState(false)
  const save = async () => {
    const n = await askText({ title: 'Save range as a type', label: 'Name for this numeric range (e.g. Percentage)', initial: v.title, confirm: 'Save' })
    if (n && !p.rangeTypes?.[n]) { commit((q) => defineRangeType(q, n, { min: v.min, max: v.max, unit: v.unit })); commit((q) => updateItem(q, v.id, { rangeType: n })) }
  }
  return (
    <Field label="Numeric range">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <span>{v.rangeType && <b>{v.rangeType} · </b>}{describeStates(v)}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => setOpen(true)}><Icon name="pencil" size={12} /> Edit…</button>
          {!v.rangeType && <button className="btn" style={{ whiteSpace: 'nowrap' }} onClick={save} title="Share this range with other variables"><Icon name="save" size={12} /> Save as shared type</button>}
        </div>
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
function EnumTypePicker({ x, name, onChange, children }: { x: { enumType: string; states: string[] }; name: string; onChange: (patch: { enumType: string }) => void; children?: ReactNode }) {
  const p = useProject()
  const [isNew, setNew] = useState(false)
  const [edit, setEdit] = useState(false)
  const names = Object.keys(p.enumTypes ?? {}).sort()
  const save = async () => {
    const n = await askText({ title: 'Save states as a type', label: 'Name for this state list (e.g. On/Off, Severity)', initial: name, confirm: 'Save' })
    if (n && !p.enumTypes?.[n]) { commit((q) => defineEnumType(q, n, x.states)); onChange({ enumType: n }) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {children}
      {x.enumType && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="muted">{x.states.join(' | ')}</span><button className="icon-btn" aria-label="Edit type" title="Edit this type" onClick={() => setEdit(true)}><Icon name="pencil" size={13} /></button></div>}
      {edit && <EnumTypeDialog edit={x.enumType} onClose={() => setEdit(false)} />}
      {!x.enumType && (x.states.length > 0
        ? <div><button className="btn" onClick={save} title="Share these states with other variables"><Icon name="save" size={12} /> Save as shared type</button></div>
        : names.length === 0 && <div><button className="btn" onClick={() => setNew(true)} title="Define a shared state list">New shared type…</button></div>)}
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
        <div className="rule-add"><button onClick={() => set({ params: [...it.params, { name: '', entity: '' }] })}><Icon name="plus" size={12} /> parameter</button></div>
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
              <SubjectPicker choices={() => vars.map((x) => ({ key: x.id, variable: x, text: `${variableName(p, x)} ${labels[x.id]}`, pick: () => { const par = it.params.filter((q) => q.entity && x.parent && isA(p, q.entity, x.parent)); upd(i, { variable: x.id, state: '', on: par.length === 1 ? par[0].name : undefined }) } }))}>
                {v ? <ItemHover id={v.id}><span className={'chip k-' + v.kind}><ChipLabel it={v} label={labels[v.id]} /></span></ItemHover> : <span className="muted">variable…</span>}
              </SubjectPicker>
              {it.params.some((q) => q.entity && v?.parent && isA(p, q.entity, v.parent)) && <Select value={ef.on ?? ''} onChange={(e) => upd(i, { on: e.target.value || undefined })}><option value="">of any instance</option>{it.params.filter((q) => q.entity && v?.parent && isA(p, q.entity, v.parent)).map((q) => <option key={q.name} value={q.name}>of {q.name}</option>)}</Select>}
              <span className="cond-word">becomes</span>
              {it.params.some((q) => q.data) && <Select value={ef.from ?? ''} onChange={(e) => upd(i, { from: e.target.value || undefined, state: '' })}><option value="">a fixed value</option>{it.params.filter((q) => q.data).map((q) => <option key={q.name} value={q.name}>the value of {q.name}</option>)}</Select>}
              {ef.from ? null : values ? <Select value={ef.state} onChange={(e) => upd(i, { state: e.target.value })}><option value="" disabled hidden>value…</option>{values.map((s) => <option key={s}>{s}</option>)}</Select>
                : <input className="time-amount" type={v?.kind === 'variable' && v.type === 'symbolic' ? 'text' : 'number'} placeholder={v?.kind === 'variable' && v.type === 'symbolic' ? 'symbol…' : 'value…'} value={ef.state} onChange={(e) => upd(i, { state: e.target.value })} />}
              {!ef.from && v?.kind === 'variable' && v.type === 'range' && v.unit && <span className="muted">{v.unit}</span>}
              <button className="x" title="Remove" onClick={() => set({ effects: it.effects.filter((_, j) => j !== i) })}><Icon name="x" size={12} /></button>
            </div>
          )
        })}
        <div className="rule-add"><button onClick={() => set({ effects: [...it.effects, { variable: '', state: '' }] })}><Icon name="plus" size={12} /> effect</button></div>
      </div>
    </EditPopup>
  )
}
