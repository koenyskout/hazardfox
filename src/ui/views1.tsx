import { useState } from 'react'
import { effectiveLosses } from '../model/derived'
import { byLabel } from '../model/labels'
import { updateItem, updateMeta } from '../model/ops'
import { scenarioTarget } from '../model/refs'
import { itemsOfKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { GUIDE_WORD_LABELS, GUIDE_WORDS, KINDS, KIND_NAMES, type GuideWord } from '../model/types'
import { useStore } from '../model/store'
import { Field, ItemHover, Ref, TextInput } from './Fields'
import { FlatTable } from './FlatTable'
import { addItem, commit, select, useLabels, useProject } from './hooks'
import { TreeTable } from './TreeTable'

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
          extra={(h) => chips(effectiveLosses(p, h.id))} />
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
  const [tab, setTab] = useState<'entity' | 'variable' | 'relationship'>('entity')
  return (
    <div className="page full">
      <div className="tabs">
        <button className={tab === 'entity' ? 'on' : ''} onClick={() => setTab('entity')}>Entities <i>{itemsOfKind(p, 'entity').length}</i></button>
        <button className={tab === 'variable' ? 'on' : ''} onClick={() => setTab('variable')}>Process variables <i>{itemsOfKind(p, 'variable').length}</i></button>
        <button className={tab === 'relationship' ? 'on' : ''} onClick={() => setTab('relationship')}>Relationships <i>{itemsOfKind(p, 'relationship').length}</i></button>
      </div>
      {tab === 'entity' && (
        <TreeTable kind="entity" extraHeader="Attributes / operations / variables"
          empty="Entities model the things in the domain: controllers, controlled processes, devices, data…"
          extra={(e) => <span className="muted">{e.attributes.length} attr · {e.operations.length} ops · {itemsOfKind(p, 'variable').filter((v) => v.parent === e.id).length} vars</span>} />
      )}
      {tab === 'variable' && (
        <FlatTable kind="variable" init={{ parent: owner ?? itemsOfKind(p, 'entity')[0]?.id ?? null }}
          items={itemsOfKind(p, 'variable').sort(byLabel(labels))}
          columns={[
            { head: 'Entity', cell: (v) => (v.parent ? <Ref id={v.parent} /> : <span className="muted">none</span>), width: '110px' },
            { head: 'States', cell: (v) => <span className="muted">{v.states.join(' | ')}</span> },
          ]} />
      )}
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
  const sel = useStore((s) => s.selected)
  const cur = sel ? p.items[sel] : null
  const uca = cur?.kind === 'uca' ? cur.id : cur?.kind === 'scenario' && cur.uca ? cur.uca : ucas[0]?.id ?? null
  const ca = cur?.kind === 'ca' ? cur.id : cur?.kind === 'scenario' && cur.ca ? cur.ca : cas[0]?.id ?? null
  return (
    <div className="page full">
      <FlatTable kind="scenario" items={scenarios}
        adds={[
          { label: `Scenario for ${uca ? labels[uca] : 'a UCA'}`, init: { scenarioType: 'uca', uca } },
          { label: `Scenario for ${ca ? labels[ca] : 'a control action'} not executed properly`, init: { scenarioType: 'ca', ca } },
        ]}
        columns={[
          { head: 'Applies to', cell: (s) => <><Ref id={scenarioTarget(s) ?? ''} /> <span className="muted">{s.scenarioType === 'ca' ? 'CA' : 'UCA'}</span></>, width: '130px' },
          { head: 'STRIDE', cell: (s) => <span className="muted">{s.stride.map((x) => x[0]).join('') || (s.adversarial ? '?' : '')}</span>, width: '70px' },
          { head: 'Risk', cell: (s) => (s.severity && s.likelihood ? <b>{s.severity * s.likelihood}</b> : <span className="muted">—</span>), width: '50px' },
        ]} />
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
