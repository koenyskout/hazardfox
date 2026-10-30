import { useState } from 'react'
import { effectiveLosses } from '../model/derived'
import { conditionComplete, conditionText, describeStates } from '../model/variables'
import { byLabel } from '../model/labels'
import { updateItem, updateMeta } from '../model/ops'
import { scenarioTarget } from '../model/refs'
import { itemsOfKind } from '../model/tree'
import { generateUcaText, guideApplies } from '../model/uca'
import { VARIABLE_LAYER_LABELS, VARIABLE_LAYERS, type VariableLayer, GUIDE_WORD_LABELS, GUIDE_WORDS, KINDS, KIND_NAMES, type GuideWord } from '../model/types'
import { useStore } from '../model/store'
import { Field, ItemHover, Ref, TextInput } from './Fields'
import { FlatTable } from './FlatTable'
import { addItem, commit, select, useLabels, useProject } from './hooks'
import { DomainDiagram } from './DomainDiagram'
import { TreeTable } from './TreeTable'
import { VariableMap } from './VariableMap'
import { LayerIcon, LayerTag } from './Icon'
import { RangeTypes } from './RangeTypes'
import { ScenarioTrace } from './Trace'

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
          <div key={k} className="stat"><b>{itemsOfKind(p, k).length}</b><span>{KIND_NAMES[k]}s</span></div>
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
        <TreeTable kind="hazard" extraHeader="Losses" empty="A hazard is a system state that, with worst-case environment, leads to a loss."
          extra={(h) => <>{chips(effectiveLosses(p, h.id))}{h.conditions.some(conditionComplete) && <div className="muted">{h.conditions.filter(conditionComplete).map((c) => conditionText(p, c)).join(' and ')}</div>}{h.variables.length > 0 && <span className="muted"> · state: </span>}{chips(h.variables)}</>} />
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
  const selected = useStore((s) => s.selected)
  const sel = selected ? p.items[selected] : null
  const owner = sel?.kind === 'entity' ? sel.id : sel?.kind === 'variable' ? sel.parent : null
  const [tab, setTab] = useState<'diagram' | 'entity' | 'variable' | 'map' | 'relationship' | 'types'>('diagram')
  const [layer, setLayer] = useState<VariableLayer | ''>('')
  const vars = itemsOfKind(p, 'variable')
  return (
    <div className="page full">
      <div className="tabs">
        <button className={tab === 'diagram' ? 'on' : ''} onClick={() => setTab('diagram')}>Diagram</button>
        <button className={tab === 'entity' ? 'on' : ''} onClick={() => setTab('entity')}>Entities <i>{itemsOfKind(p, 'entity').length}</i></button>
        <button className={tab === 'variable' ? 'on' : ''} onClick={() => setTab('variable')}>Variables <i>{vars.length}</i></button>
        <button className={tab === 'map' ? 'on' : ''} onClick={() => setTab('map')}>Variable map <i>{vars.filter((v) => v.layer === 'domain').length}</i></button>
        <button className={tab === 'relationship' ? 'on' : ''} onClick={() => setTab('relationship')}>Relationships <i>{itemsOfKind(p, 'relationship').length}</i></button>
        <button className={tab === 'types' ? 'on' : ''} onClick={() => setTab('types')}>Types <i>{Object.keys(p.rangeTypes ?? {}).length}</i></button>
      </div>
      {tab === 'diagram' && <DomainDiagram />}
      {tab === 'entity' && (
        <TreeTable kind="entity" extraHeader="Attributes (variables) / operations"
          empty="Entities model the things in the domain: controllers, controlled processes, devices, data…"
          extra={(e) => <span className="muted">{itemsOfKind(p, 'variable').filter((v) => v.parent === e.id).length} attr · {e.operations.length} ops</span>} />
      )}
      {tab === 'variable' && (
        <>
          <div className="layer-filter">
            {(['', ...VARIABLE_LAYERS] as const).map((l) => (
              <button key={l} className={layer === l ? 'on' : ''} onClick={() => setLayer(l)}>{l ? <><LayerIcon layer={l} />{VARIABLE_LAYER_LABELS[l]}</> : 'All'} <i>{(l ? vars.filter((v) => v.layer === l) : vars).length}</i></button>
            ))}
          </div>
          <FlatTable kind="variable" init={layer && layer !== 'domain' ? { layer, parent: (layer === 'signal' ? itemsOfKind(p, 'feedback')[0] : itemsOfKind(p, 'node').find((n) => n.role === 'controller'))?.id ?? null } : { parent: owner ?? itemsOfKind(p, 'entity')[0]?.id ?? null }}
            groupBy={(v) => v.parent}
            groupAdd={(g, v) => ({ layer: v!.layer, parent: g })}
            sub={(v) => describeStates(v)}
            items={vars.filter((v) => !layer || v.layer === layer).sort((a, b) => byLabel(labels)(a.parent ?? '', b.parent ?? '') || byLabel(labels)(a, b))}
            columns={[
              { head: 'Layer', cell: (v) => <LayerTag layer={v.layer} />, width: '84px' },
            ]} />
        </>
      )}
      {tab === 'map' && <VariableMap />}
      {tab === 'types' && <RangeTypes />}
      {tab === 'relationship' && (
        <FlatTable kind="relationship" titleEditable
          columns={[{ head: 'Relation', cell: (r) => r.kind === 'relationship' ? <span>{r.from ? <Ref id={r.from} /> : '?'} <span className="muted">{r.fromCard} — {r.toCard}</span> {r.to ? <Ref id={r.to} /> : '?'}</span> : null }]}
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
                    <td key={g} className="na" title="Instantaneous control action: no duration"><span className="muted">N/A – instantaneous</span></td>
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
  const order = new Map([...sortedUcas, ...sortedCas].map((x, i) => [x.id, i]))
  const grouped = [...scenarios].sort((a, b) => (order.get(scenarioTarget(a) ?? '') ?? 1e9) - (order.get(scenarioTarget(b) ?? '') ?? 1e9))
  const sel = useStore((s) => s.selected)
  const cur = sel ? p.items[sel] : null
  const uca = cur?.kind === 'uca' ? cur.id : cur?.kind === 'scenario' && cur.uca ? cur.uca : ucas[0]?.id ?? null
  const ca = cur?.kind === 'ca' ? cur.id : cur?.kind === 'scenario' && cur.ca ? cur.ca : cas[0]?.id ?? null
  return (
    <div className="page full">
      <FlatTable kind="scenario" items={grouped}
        groupBy={(s) => scenarioTarget(s)} groups={[...sortedUcas, ...sortedCas].map((x) => x.id)}
        groupAdd={(g) => (g && p.items[g]?.kind === 'ca' ? { scenarioType: 'ca', ca: g } : { scenarioType: 'uca', uca: g })}
        adds={[
          { label: `Scenario for ${uca ? labels[uca] : 'a UCA'}`, init: { scenarioType: 'uca', uca } },
          { label: `Scenario for ${ca ? labels[ca] : 'a control action'} not executed properly`, init: { scenarioType: 'ca', ca } },
        ]}
        columns={[
          { head: 'STRIDE', cell: (s) => <span className="muted">{s.stride.map((x) => x[0]).join('') || (s.adversarial ? '?' : '')}</span>, width: '70px' },
          { head: 'Risk', cell: (s) => (s.severity && s.likelihood ? <b>{s.severity * s.likelihood}</b> : <span className="muted">—</span>), width: '50px' },
          { head: 'Trace', cell: (s) => (s.trace.steps.length ? <span className="muted">{s.trace.steps.length} steps</span> : null), width: '70px' },
        ]} />
      {cur?.kind === 'scenario' ? <ScenarioTrace key={cur.id} s={cur} /> : <p className="hint">Select a scenario to see or edit its trace and play it on the control structure.</p>}
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
