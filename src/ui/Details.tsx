import { CAUSES, GUIDE_WORD_LABELS, GUIDE_WORDS, KIND_NAMES, NODE_ROLES, REQUIREMENT_TYPES, SCENARIO_TYPE_LABELS, SCENARIO_TYPES, STATUSES, STRIDE, type Cause, type GuideWord, type Id, type Item, type ItemOf, type Kind, type NodeRole, type Patch, type RequirementType, type ScenarioType, type Status } from '../model/types'
import { effectiveLosses, inheritedLosses } from '../model/derived'
import { updateItem } from '../model/ops'
import { generateUcaText } from '../model/uca'
import { itemsOfKind, isLeaf } from '../model/tree'
import { incoming } from '../model/refs'
import { useStore } from '../model/store'
import { commit, useLabels, useProject } from './hooks'
import { ReviewItem } from './Review'
import { Field, Ref, RefList, RichText, SingleRef, Tags, TextInput } from './Fields'

export function Details() {
  const p = useProject()
  const labels = useLabels()
  const id = useStore((s) => s.selected)
  const it = id ? p.items[id] : null
  if (!it) return <aside className="details"><p className="hint">Select an item to edit its details.</p></aside>
  const set: Set = (patch, key) => commit((q) => updateItem(q, it.id, patch), key ? `${it.id}:${key}` : undefined)
  const text = (f: 'title' | 'description' | 'notes') => (v: string) => set({ [f]: v }, f)
  const used = incoming(p, it.id).filter((o) => o.parent !== it.id)

  return (
    <aside className="details">
      <h3>
        <span className={'chip k-' + it.kind}>{labels[it.id]}</span> {KIND_NAMES[it.kind]}
      </h3>
      {it.kind !== 'uca' && it.kind !== 'scenario' && (
        <Field label="Title"><TextInput value={it.title} onChange={text('title')} /></Field>
      )}
      <KindFields it={it} set={set} />
      <ReviewItem it={it} />
      {it.kind !== 'uca' && (
        <Field label="Description"><RichText value={it.description} onChange={text('description')} /></Field>
      )}
      <Field label="Notes / rationale"><RichText value={it.notes} onChange={text('notes')} rows={2} /></Field>
      <div className="two">
        <Field label="Status">
          <select value={it.status} onChange={(e) => set({ status: e.target.value as Status })}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Tags"><Tags value={it.tags} onChange={(v) => set({ tags: v })} /></Field>
      </div>
      {used.length > 0 && (
        <Field label="Referenced by">
          <div className="reflist">{used.map((o) => <Ref key={o.id} id={o.id} />)}</div>
        </Field>
      )}
    </aside>
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
          <Field label="Attributes (one per line: name: type)">
            <textarea rows={3} value={it.attributes.map((a) => (a.type ? `${a.name}: ${a.type}` : a.name)).join('\n')} onChange={(e) => set({ attributes: e.target.value.split('\n').map((l) => { const [n, ...t] = l.split(':'); return { name: n.trim(), type: t.join(':').trim() } }).filter((a) => a.name) }, 'attrs')} />
          </Field>
          <Field label="Operations (one per line)">
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
          <Field label="States (one per line)" hint="Enumerated values, or ranges like “0–100 %”.">
            <textarea rows={4} value={it.states.join('\n')} onChange={(e) => set({ states: e.target.value.split('\n').map((l) => l.trim()).filter(Boolean) }, 'states')} />
          </Field>
        </>
      )
    case 'relationship':
      return (
        <>
          <div className="two">
            <Field label="From"><SingleRef value={it.from || null} options={of('entity')} onChange={(v) => set({ from: v ?? '' })} /></Field>
            <Field label="To"><SingleRef value={it.to || null} options={of('entity')} onChange={(v) => set({ to: v ?? '' })} /></Field>
          </div>
          <div className="two">
            <Field label="Cardinality (from)"><TextInput value={it.fromCard} onChange={(v) => set({ fromCard: v }, 'fc')} /></Field>
            <Field label="Cardinality (to)"><TextInput value={it.toCard} onChange={(v) => set({ toCard: v }, 'tc')} /></Field>
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
            <RefList value={it.processModel} options={of('variable')} onChange={(v) => set({ processModel: v })} />
          </Field>
          <Field label="Width">
            <select value={it.wide} onChange={(e) => set({ wide: Number(e.target.value) })}>
              {[[0, 'Automatic'], [80, 'Wider'], [180, 'Wide'], [320, 'Very wide']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          {it.nudge && <button onClick={() => set({ nudge: null })}>Reset manual position</button>}
        </>
      )
    case 'ca':
    case 'feedback': {
      const nodes = of('node')
      return (
        <>
          <div className="two">
            <Field label="From"><SingleRef value={it.from || null} options={nodes} onChange={(v) => set({ from: v ?? '' })} /></Field>
            <Field label="To"><SingleRef value={it.to || null} options={nodes} onChange={(v) => set({ to: v ?? '' })} /></Field>
          </div>
          {it.kind === 'feedback' && (
            <Field label="Updates variables"><RefList value={it.variables} options={of('variable')} onChange={(v) => set({ variables: v })} /></Field>
          )}
          {it.kind === 'ca' && (
            <Field label="Domain operation">
              <select value={it.operation} onChange={(e) => set({ operation: e.target.value })}>
                <option value="">— none —</option>
                {of('entity').flatMap((e) => e.operations.map((o) => <option key={e.id + o} value={`${e.id}:${o}`}>{labels[e.id]} {e.title}: {o}</option>))}
              </select>
            </Field>
          )}
          {it.bend && <button onClick={() => set({ bend: null })}>Reset manual routing</button>}
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
            <ConditionsEditor it={it} set={set} />
            <RichText value={it.context} onChange={(v) => set({ context: v }, 'context')} rows={2} placeholder="Additional context (free text)" />
          </Field>
          <Field label="Statement" hint="Generated from the above; type to override, clear to regenerate.">
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
          <Field label="Title"><TextInput value={it.title} onChange={(v) => set({ title: v }, 'title')} /></Field>
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
        const states = v?.kind === 'variable' ? v.states : []
        return (
          <div key={i} className="cond">
            <select value={c.variable} onChange={(e) => upd(i, { variable: e.target.value, state: '' })}>
              <option value="">variable…</option>
              {vars.map((x) => <option key={x.id} value={x.id}>{labels[x.id]} {x.title}</option>)}
            </select>
            <select value={c.negate ? 'ne' : 'eq'} onChange={(e) => upd(i, { negate: e.target.value === 'ne' })}><option value="eq">=</option><option value="ne">≠</option></select>
            <select value={c.state} onChange={(e) => upd(i, { state: e.target.value })}>
              <option value="">state…</option>
              {states.map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="x" onClick={() => set({ conditions: it.conditions.filter((_, j) => j !== i) })}>×</button>
          </div>
        )
      })}
      <button onClick={() => set({ conditions: [...it.conditions, { variable: '', state: '', negate: false }] })}>+ condition</button>
    </div>
  )
}
