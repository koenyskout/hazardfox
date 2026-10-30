import { useMemo, useState } from 'react'
import { hazardScope, hazardTrace } from '../model/derived'
import { flatten, itemsOfKind } from '../model/tree'
import { SEVERITIES, validate, type Severity } from '../model/validate'
import { useStore } from '../model/store'
import { ItemHover, Ref, VIEW_OF } from './Fields'
import { useProject } from './hooks'

const chips = (ids: string[]) => <span className="reflist">{ids.map((i) => <Ref key={i} id={i} />)}</span>

export function Trace() {
  const p = useProject()
  const rows = flatten(p, 'hazard')
  const ucas = itemsOfKind(p, 'uca')
  const [matrix, setMatrix] = useState(false)
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
              const t = hazardTrace(p, item.id)
              const ids = (xs: { id: string }[]) => chips(xs.map((x) => x.id))
              return (
                <tr key={item.id}>
                  <td style={{ paddingLeft: 8 + depth * 16 }}><Ref id={item.id} /> {item.title}</td>
                  <td>{chips(t.losses)}</td>
                  <td>{ids(t.constraints)}</td>
                  <td>{ids(t.ucas)}</td>
                  <td>{ids(t.scenarios)}</td>
                  <td>{ids(t.requirements)}</td>
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
                const s = hazardScope(p, item.id)
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
  const [sev, setSev] = useState<'all' | Severity>('all')
  const shown = issues.filter((i) => sev === 'all' || i.severity === sev)
  return (
    <div className="page">
      <h2>Validation <small className="muted">{issues.length} finding(s)</small></h2>
      <div className="tabs">
        {(['all', ...SEVERITIES] as const).map((s) => (
          <button key={s} className={sev === s ? 'on' : ''} onClick={() => setSev(s)}>{s} <i>{s === 'all' ? issues.length : issues.filter((i) => i.severity === s).length}</i></button>
        ))}
      </div>
      {shown.length === 0 && <p className="empty">Nothing to report.</p>}
      <ul className="issues">
        {shown.map((i, n) => (
          <li key={n} className={'sev-' + i.severity}>
            <b>{i.severity}</b>
            {i.item && p.items[i.item] ? <ItemHover id={i.item}><a href="#" onClick={(e) => { e.preventDefault(); const it = p.items[i.item!]; goto(VIEW_OF[it.kind], it.id) }}>{i.message}</a></ItemHover> : <span>{i.message}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}
