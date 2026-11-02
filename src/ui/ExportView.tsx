import { Select } from './Select'
import { useMemo, useState } from 'react'
import { defaultOptions, SECTIONS, type ExportOptions, type SectionKey } from '../export/tables'
import { download, saveProject } from '../model/persist'
import { STATUSES } from '../model/types'
import { toggled, useProject } from './hooks'

export function ExportView() {
  const p = useProject()
  const [o, setO] = useState<ExportOptions>(defaultOptions)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const tags = useMemo(() => [...new Set(Object.values(p.items).flatMap((i) => i.tags))].sort(), [p])
  const base = (p.meta.name || 'analysis').replace(/[^\w.-]+/g, '_')
  const run = async (what: string, f: () => Promise<void>) => {
    setBusy(what); setErr('')
    try { await f() } catch (e) { setErr(String((e as Error).message ?? e)) }
    setBusy('')
  }
  const toggle = (k: SectionKey) => setO({ ...o, sections: toggled(o.sections, k) })
  return (
    <div className="page">
      <h2>Export</h2>
      <div className="card form">
        <h4>Sections</h4>
        <div className="stride">
          {SECTIONS.map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={o.sections.includes(k)} onChange={() => toggle(k)} /> {l}</label>)}
        </div>
        <h4>Filter</h4>
        <div className="stride">
          {STATUSES.map((s) => <label key={s} className="check"><input type="checkbox" checked={o.statuses.includes(s)} onChange={() => setO({ ...o, statuses: toggled(o.statuses, s) })} /> {s}</label>)}
          <label className="check">Tag
            <Select value={o.tag} onChange={(e) => setO({ ...o, tag: e.target.value })}><option value="">any</option>{tags.map((t) => <option key={t}>{t}</option>)}</Select>
          </label>
        </div>
        <div className="actions left">
          <button className="primary" disabled={!!busy} onClick={() => run('docx', async () => download(`${base}.docx`, await (await import('../export/docx')).buildDocx(p, o)))}>{busy === 'docx' ? 'Building…' : 'Word (.docx)'}</button>
          <button className="primary" disabled={!!busy} onClick={() => run('xlsx', async () => download(`${base}.xlsx`, await (await import('../export/xlsx')).buildXlsx(p, o)))}>{busy === 'xlsx' ? 'Building…' : 'Excel (.xlsx)'}</button>
          <button disabled={!!busy} onClick={() => run('svg', async () => { const s = await (await import('../export/structureImage')).structureSvg(p); if (s) download(`${base}-control-structure.svg`, s.svg, 'image/svg+xml') })}>Diagram (.svg)</button>
          <button disabled={!!busy} onClick={() => run('json', () => saveProject(true))}>Project file (.json)</button>
        </div>
        {err && <p className="err">{err}</p>}
        <p className="hint">Items are numbered as in the app (H-1, UCA-2, …), so a new export always shows the current numbers.</p>
      </div>
    </div>
  )
}
