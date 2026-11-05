import { StructViewToggle, useStructView } from './structView'
import { structOf } from '../model/types'
import type { ItemOf } from '../model/types'
import { useState } from 'react'
import { effectText, operationsOf } from '../model/operations'
import { paramSummary } from '../model/params'
import { clusterStructs, isPredicate, structPath } from '../model/formal'
import { effectiveLosses } from '../model/derived'
import { describeStates } from '../model/variables'
import { say } from '../model/say'
import { byLabel, renderText } from '../model/labels'
import { updateItem, updateMeta } from '../model/ops'
import { scenarioTarget } from '../model/refs'
import { itemsOfKind } from '../model/tree'
import { generateUcaText, guideApplies } from '../model/uca'
import { GUIDE_WORD_LABELS, GUIDE_WORDS, KINDS, KIND_PLURALS, type GuideWord } from '../model/types'
import { Field, ItemHover, Ref, TextInput } from './Fields'
import { FlatTable } from './FlatTable'
import { addItem, commit, select, useLabels, useProject } from './hooks'
import { DomainDiagram } from './DomainDiagram'
import { TreeTable } from './TreeTable'
import { RangeCell, TypesPage } from './RangeTypes'
import { ScenarioTrace } from './Trace'
import { Modal } from './Modal'

const chips = (ids: string[]) => <span className="reflist">{ids.map((i) => <Ref key={i} id={i} />)}</span>

export function Overview() {
  const p = useProject()
  const set = (patch: Partial<typeof p.meta>) => commit((q) => updateMeta(q, patch), 'meta')
  return (
    <div className="page">
      <h2>Analysis</h2>
      <div className="card form">
        <Field single label="Name"><TextInput value={p.meta.name} onChange={(v) => set({ name: v })} /></Field>
        <Field single label="Author"><TextInput value={p.meta.author} onChange={(v) => set({ author: v })} /></Field>
        <Field single label="Description / system under analysis">
          <textarea rows={4} value={p.meta.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={p.meta.strideEnabled} onChange={(e) => set({ strideEnabled: e.target.checked })} />
          STPA-Sec: tag scenarios with STRIDE categories
        </label>
      </div>
      <h2>Contents</h2>
      <div className="stats">
        {KINDS.map((k) => (
          <div key={k} className="stat"><b>{itemsOfKind(p, k).length}</b><span>{k === 'variable' ? 'Variables (all layers)' : KIND_PLURALS[k]}</span></div>
        ))}
      </div>
      <h2>Assumptions</h2>
      <FlatTable kind="assumption" items={itemsOfKind(p, 'assumption')} columns={[{ head: 'About', cell: (i) => chips(i.about) }]} />
    </div>
  )
}

type Sub = 'loss' | 'hazard' | 'constraint'
export function Step1() {
  const [sub, setSub] = useState<Sub>('loss')
  const p = useProject()
  const labels = useLabels()
  return (
    <div className="page full">
      <div className="tabs">
        {(['loss', 'hazard', 'constraint'] as Sub[]).map((k) => (
          <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>
            {k === 'loss' ? 'Losses' : k === 'hazard' ? 'Hazards' : 'System constraints'} <i>{itemsOfKind(p, k).length}</i>
          </button>
        ))}
      </div>
      {sub === 'loss' && (
        <TreeTable kind="loss" extraHeader="Hazards" empty="Losses are things of value that stakeholders do not want to lose."
          extra={(l) => chips(itemsOfKind(p, 'hazard').filter((h) => effectiveLosses(p, h.id).includes(l.id)).map((h) => h.id))} />
      )}
      {sub === 'hazard' && (
        <TreeTable kind="hazard" extraHeader="Losses" empty="A hazard is a system state that, together with worst-case environmental conditions, can lead to a loss."
          extra={(h) => chips(effectiveLosses(p, h.id))}
          extra2Header="Condition" extra2={(h) => h.when ? <span className="muted">{renderText(labels, say(p, h.when))}</span> : null} />
      )}
      {sub === 'constraint' && (
        <TreeTable kind="constraint" extraHeader="Hazards" extra={(c) => chips(c.hazards)} />
      )}
    </div>
  )
}

export function Domain() {
  const p = useProject()
  const labels = useLabels()
  const structMode = useStructView()
  const [tab, setTab] = useState<'diagram' | 'entity' | 'variable' | 'relationship' | 'operation' | 'types'>('diagram')
  const vars = itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain')
  return (
    <div className="page full">
      <div className="tabs">
        <button className={tab === 'diagram' ? 'on' : ''} onClick={() => setTab('diagram')}>Diagram</button>
        <button className={tab === 'entity' ? 'on' : ''} onClick={() => setTab('entity')}>Entities <i>{itemsOfKind(p, 'entity').length}</i></button>
        <button className={tab === 'relationship' ? 'on' : ''} onClick={() => setTab('relationship')}>Relationships <i>{itemsOfKind(p, 'relationship').length}</i></button>
        <button className={tab === 'variable' ? 'on' : ''} onClick={() => setTab('variable')}>World variables <i>{vars.length}</i></button>
        <button className={tab === 'operation' ? 'on' : ''} onClick={() => setTab('operation')}>Operations <i>{itemsOfKind(p, 'operation').length}</i></button>
        <button className={tab === 'types' ? 'on' : ''} onClick={() => setTab('types')}>Types <i>{Object.keys(p.rangeTypes ?? {}).length + Object.keys(p.enumTypes ?? {}).length + Object.keys(p.structTypes ?? {}).length}</i></button>
      </div>
      {tab === 'diagram' && <DomainDiagram />}
      {tab === 'entity' && (
        <TreeTable kind="entity" extraHeader="Attributes (variables) / operations"
          empty="Entities model the things in the domain: controllers, controlled processes, devices, data…"
          extra={(e) => <span className="muted">{itemsOfKind(p, 'variable').filter((v) => v.parent === e.id).length} attr · {operationsOf(p, e.id).length} ops</span>} />
      )}
      {tab === 'variable' && (
        <>
          {vars.some((v) => v.struct) && <div style={{ textAlign: 'right', marginBottom: 6 }}><StructViewToggle /></div>}
          <FlatTable kind="variable" addLabel="Add variable…" addTo={itemsOfKind(p, 'entity')}
            groupBy={(v) => v.parent}
            nest={structMode === 'nested' ? structPath : undefined}
            titleView={structMode === 'nested' ? (v) => structOf(v)?.path.split('.').pop() ?? null : undefined}
            groupAdd={(g, v) => ({ layer: v!.layer, parent: g })}
            sub={(v) => v.type === 'range' ? null : describeStates(v)}
            tail={(v) => <RangeCell v={v} />}
            items={clusterByOwner(vars.filter((v) => !isPredicate(p, v)).sort((a, b) => byLabel(labels)(a.parent ?? '', b.parent ?? '') || byLabel(labels)(a, b)))}
            columns={[]} />
        </>
      )}
      {tab === 'types' && <TypesPage />}
      {tab === 'operation' && (
        <FlatTable kind="operation" titleEditable
          columns={[{ head: 'Parameters', cell: (o) => o.kind === 'operation' ? <span>{o.params.map((x, i) => <span key={i}>{i > 0 && ', '}{x.data ? paramSummary(p, { ...x.data, name: x.name }) : <><span className="muted">{x.name}:</span> {x.entity ? <Ref id={x.entity} /> : '?'}</>}</span>)}</span> : null }, { head: 'Effects', cell: (o) => o.kind === 'operation' ? <span className="muted">{o.effects.filter((e) => e.variable && e.state).map((e) => renderText(labels, effectText(e))).join('; ')}</span> : null }]}
          items={itemsOfKind(p, 'operation')} />
      )}
      {tab === 'relationship' && (
        <FlatTable kind="relationship" titleEditable
          columns={[{ head: 'Relation', cell: (r) => r.kind === 'relationship' ? <span>{r.ends.map((e, i) => <span key={i}>{i > 0 && <span className="muted"> {i === 1 ? '' : '· '}{r.ends[i - 1].card} — {e.card} </span>}{e.entity ? <Ref id={e.entity} /> : '?'}{e.role.trim() && <span className="muted"> ({e.role})</span>}</span>)}</span> : null }]}
          items={itemsOfKind(p, 'relationship')} />
      )}
    </div>
  )
}

export function Ucas() {
  const p = useProject()
  const labels = useLabels()
  const cas = itemsOfKind(p, 'ca')
  const ucas = itemsOfKind(p, 'uca')
  const addUca = (ca: string, guide: GuideWord) => addItem('uca', { ca, guide })
  return (
    <div className="page full">
      <h2>Control action × guide word</h2>
      <p className="hint">For each control action, ask for each guide word whether it could be unsafe. Tinted cells have no UCA yet: add one with +, or mark the guide word n/a if it cannot apply.</p>
      {cas.length === 0 ? <p className="empty">Define control actions in the control structure first.</p> : (
        <table className="grid">
          <thead><tr><th>Control action</th>{GUIDE_WORDS.map((g) => <th key={g}>{GUIDE_WORD_LABELS[g]}</th>)}</tr></thead>
          <tbody>
            {cas.map((ca) => (
              <tr key={ca.id}>
                <th><Ref id={ca.id} /> {ca.title}<br /><small className="muted">{ca.kind === 'ca' && p.items[ca.from]?.title} → {ca.kind === 'ca' && p.items[ca.to]?.title}</small></th>
                {GUIDE_WORDS.map((g) => {
                  const cell = ucas.filter((u) => u.ca === ca.id && u.guide === g)
                  const na = ca.kind === 'ca' ? ca.notApplicable.find((n) => n.guide === g) : undefined
                  const toggleNa = () => commit((q) => updateItem(q, ca.id, { notApplicable: ca.kind === 'ca' ? (na ? ca.notApplicable.filter((n) => n.guide !== g) : [...ca.notApplicable, { guide: g, reason: '' }]) : [] }))
                  if (ca.kind === 'ca' && !guideApplies(ca, g) && !cell.length) return (
                    <td key={g} className="na" title="Instantaneous control actions cannot be stopped too soon or applied too long"><span className="muted">N/A – instantaneous</span></td>
                  )
                  if (na && !cell.length) return (
                    <td key={g} className="na" title={na.reason}>
                      <span className="muted">N/A{na.reason && ` – ${na.reason}`}</span>
                      <button className="add" title="Mark applicable again" onClick={toggleNa}>×</button>
                    </td>
                  )
                  return (
                    <td key={g} className={cell.length ? '' : 'gap'}>
                      {cell.map((u) => <ItemHover key={u.id} id={u.id}><button className="chip k-uca" onClick={() => select(u.id)}>{labels[u.id]}</button></ItemHover>)}
                      <button className="add" title="Add UCA" onClick={() => addUca(ca.id, g)}>+</button>
                      {!cell.length && <button className="add" title="Mark this guide word as not applicable" onClick={toggleNa}>n/a</button>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Unsafe control actions</h2>
      <FlatTable kind="uca" titleEditable={false} items={[...ucas].sort(byLabel(labels))}
        addLabel="UCA" init={{ ca: cas[0]?.id ?? '' }}
        columns={[
          { head: 'Statement', cell: (u) => generateUcaText(p, labels, u) },
          { head: 'Hazards', cell: (u) => chips(u.hazards), width: '130px' },
        ]} />
    </div>
  )
}

export function Scenarios() {
  const p = useProject()
  const labels = useLabels()
  const scenarios = itemsOfKind(p, 'scenario').sort(byLabel(labels))
  const ucas = itemsOfKind(p, 'uca')
  const cas = itemsOfKind(p, 'ca')
  const sortedUcas = [...ucas].sort(byLabel(labels))
  const sortedCas = [...cas].sort(byLabel(labels))
  const outline = [...sortedCas.flatMap((c) => [{ id: c.id, depth: 0 }, ...sortedUcas.filter((u) => u.kind === 'uca' && u.ca === c.id).map((u) => ({ id: u.id, depth: 1 }))]),
    ...sortedUcas.filter((u) => u.kind === 'uca' && !p.items[u.ca]).map((u) => ({ id: u.id, depth: 0 }))]
  const order = new Map(outline.map((x, i) => [x.id, i]))
  const grouped = [...scenarios].sort((a, b) => (order.get(scenarioTarget(a) ?? '') ?? 1e9) - (order.get(scenarioTarget(b) ?? '') ?? 1e9))
  const [traceOf, setTraceOf] = useState<string | null>(null)
  const traced = traceOf ? p.items[traceOf] : null
  return (
    <div className="page full">
      <FlatTable kind="scenario" items={grouped}
        groupBy={(s) => scenarioTarget(s)} groups={outline}
        nest={(s) => s.scenarioType === 'ca' ? ['Control action not executed properly'] : []} nestAsGroup
        groupAdd={(g) => (g && p.items[g]?.kind === 'ca' ? { scenarioType: 'ca', ca: g } : { scenarioType: 'uca', uca: g })}
        adds={[
          { label: 'Scenario for a UCA', init: { scenarioType: 'uca', uca: null } },
          { label: 'Scenario for a control action not executed properly', init: { scenarioType: 'ca', ca: null } },
        ]}
        columns={[
          { head: 'STRIDE', cell: (s) => <span className="muted">{s.stride.map((x) => x[0]).join('') || (s.adversarial ? '?' : '')}</span>, width: '70px' },
          { head: 'Risk', cell: (s) => (s.severity && s.likelihood ? <b>{s.severity * s.likelihood}</b> : <span className="muted">—</span>), width: '50px' },
          { head: 'Trace', cell: (s) => <button type="button" className="link-btn" title="Edit and play the trace" onClick={() => setTraceOf(s.id)}>{s.trace.steps.length ? `${s.trace.steps.length} steps` : 'Add…'}</button>, width: '80px' },
        ]} />
      {traced?.kind === 'scenario' && (
        <Modal title={`${labels[traced.id]} trace`} onClose={() => setTraceOf(null)} wide huge>
          <ScenarioTrace key={traced.id} s={traced} />
        </Modal>
      )}
    </div>
  )
}

export function Requirements() {
  return (
    <div className="page full">
      <TreeTable kind="requirement" extraHeader="Derived from" extra={(r) => chips(r.sources)}
        empty="Requirements and mitigations derived from constraints and loss scenarios." />
    </div>
  )
}

/** Variables stay ordered by owner, but those of one struct instance are gathered under the owner. */
const clusterByOwner = (vars: ItemOf<'variable'>[]): ItemOf<'variable'>[] => [...new Set(vars.map((v) => v.parent ?? ''))].flatMap((o) => clusterStructs(vars.filter((v) => (v.parent ?? '') === o)))
