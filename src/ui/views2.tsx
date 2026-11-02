import { useState } from 'react'
import { hazardScope, hazardTrace } from '../model/derived'
import { flatten, itemsOfKind } from '../model/tree'
import { Ref } from './Fields'
import { byLabel } from '../model/labels'
import { useLabels, useProject } from './hooks'

const chips = (ids: string[], labels?: Record<string, string>) => <span className="reflist">{(labels ? [...ids].sort(byLabel(labels)) : ids).map((i) => <Ref key={i} id={i} />)}</span>

export function Trace() {
  const p = useProject()
  const labels = useLabels()
  const rows = flatten(p, 'hazard')
  const ucas = itemsOfKind(p, 'uca').sort(byLabel(labels))
  const [matrix, setMatrix] = useState(false)
  return (
    <div className="page">
      <div className="tabs">
        <button className={!matrix ? 'on' : ''} onClick={() => setMatrix(false)}>Per hazard</button>
        <button className={matrix ? 'on' : ''} onClick={() => setMatrix(true)}>Hazard × UCA matrix</button>
      </div>
      {!matrix ? (
        <>
        <p className="hint">Tinted cells mark hazards without a constraint or UCA yet.</p>
        <table className="grid left">
          <thead><tr><th>Hazard</th><th>Losses</th><th>Constraints</th><th>UCAs</th><th>Scenarios</th><th>Requirements</th></tr></thead>
          <tbody>
            {rows.map(({ item, depth }, ri) => {
              const leaf = !(rows[ri + 1] && rows[ri + 1].depth > depth)
              const t = hazardTrace(p, item.id)
              const ids = (xs: { id: string }[]) => chips(xs.map((x) => x.id), labels)
              return (
                <tr key={item.id}>
                  <td style={{ paddingLeft: 8 + depth * 16 }}><Ref id={item.id} /> {item.title}</td>
                  <td>{chips(t.losses, labels)}</td>
                  <td className={leaf && !t.constraints.length ? 'gap' : ''}>{ids(t.constraints)}</td>
                  <td className={leaf && !t.ucas.length ? 'gap' : ''}>{ids(t.ucas)}</td>
                  <td>{ids(t.scenarios)}</td>
                  <td>{ids(t.requirements)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </>
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
