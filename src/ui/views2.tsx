import { useMemo, useState } from 'react'
import { effectiveLosses, scenarioHazards } from '../model/ops'
import { descendants, flatten, itemsOfKind } from '../model/tree'
import { validate } from '../model/validate'
import { useStore } from '../model/store'
import { Ref, VIEW_OF } from './Fields'
import { useProject } from './hooks'

const chips = (ids: string[]) => <span className="reflist">{ids.map((i) => <Ref key={i} id={i} />)}</span>

export function Trace() {
  const p = useProject()
  const rows = flatten(p, 'hazard')
  const ucas = itemsOfKind(p, 'uca')
  const [matrix, setMatrix] = useState(false)
  const scope = (hid: string) => new Set([hid, ...descendants(p, hid).map((d) => d.id)])
  return (
    <div className="page">
      <div className="tabs">
        <button className={!matrix ? 'on' : ''} onClick={() => setMatrix(false)}>Per hazard</button>
        <button className={matrix ? 'on' : ''} onClick={() => setMatrix(true)}>Hazard × UCA matrix</button>
      </div>
      {!matrix ? (
        <table className="grid left">
          <thead><tr><th>Hazard</th><th>Losses</th><th>Constraints</th><th>UCAs</th><th>Scenarios</th><th>Requirements</th></tr></thead>
          <tbody>
            {rows.map(({ item, depth }) => {
              const s = scope(item.id)
              const us = ucas.filter((u) => u.hazards.some((h) => s.has(h)))
              const sc = itemsOfKind(p, 'scenario').filter((x) => scenarioHazards(p, x).some((h) => s.has(h)))
              const cons = itemsOfKind(p, 'constraint').filter((c) => c.hazards.some((h) => s.has(h)))
              const reqs = itemsOfKind(p, 'requirement').filter((r) => r.sources.some((x) => [...cons, ...sc, ...us].some((y) => y.id === x)))
              return (
                <tr key={item.id}>
                  <td style={{ paddingLeft: 8 + depth * 16 }}><Ref id={item.id} /> {item.title}</td>
                  <td>{chips(effectiveLosses(p, item.id))}</td>
                  <td>{chips(cons.map((c) => c.id))}</td>
                  <td>{chips(us.map((u) => u.id))}</td>
                  <td>{chips(sc.map((x) => x.id))}</td>
                  <td>{chips(reqs.map((r) => r.id))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <div className="scroll">
          <table className="grid">
            <thead><tr><th>Hazard</th>{ucas.map((u) => <th key={u.id}><Ref id={u.id} /></th>)}</tr></thead>
            <tbody>
              {rows.map(({ item }) => {
                const s = scope(item.id)
                return <tr key={item.id}><th className="left"><Ref id={item.id} /> {item.title}</th>{ucas.map((u) => <td key={u.id}>{u.hazards.some((h) => s.has(h)) ? '●' : ''}</td>)}</tr>
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Validation() {
  const p = useProject()
  const goto = useStore((s) => s.goto)
  const issues = useMemo(() => validate(p), [p])
  const [sev, setSev] = useState<'all' | 'error' | 'warning' | 'info'>('all')
  const shown = issues.filter((i) => sev === 'all' || i.severity === sev)
  return (
    <div className="page">
      <h2>Validation <small className="muted">{issues.length} finding(s)</small></h2>
      <div className="tabs">
        {(['all', 'error', 'warning', 'info'] as const).map((s) => (
          <button key={s} className={sev === s ? 'on' : ''} onClick={() => setSev(s)}>{s} <i>{s === 'all' ? issues.length : issues.filter((i) => i.severity === s).length}</i></button>
        ))}
      </div>
      {shown.length === 0 && <p className="empty">Nothing to report.</p>}
      <ul className="issues">
        {shown.map((i, n) => (
          <li key={n} className={'sev-' + i.severity}>
            <b>{i.severity}</b>
            <a href="#" onClick={(e) => { e.preventDefault(); const it = i.item ? p.items[i.item] : null; if (it) goto(VIEW_OF[it.kind], it.id) }}>{i.message}</a>
          </li>
        ))}
      </ul>
    </div>
  )
}
