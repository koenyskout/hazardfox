import { useEffect, useMemo, useRef, useState } from 'react'
import { byLabel, renderText } from '../model/labels'
import { useStore } from '../model/store'
import { KIND_NAMES } from '../model/types'
import { VIEW_OF } from './Fields'
import { useLabels, useProject } from './hooks'

export function Palette() {
  const open = useStore((s) => s.paletteOpen)
  const setOpen = useStore((s) => s.setPalette)
  const goto = useStore((s) => s.goto)
  const p = useProject()
  const labels = useLabels()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => ref.current?.focus(), 0) } }, [open])
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    return Object.values(p.items)
      .map((it) => ({ it, text: `${labels[it.id]} ${it.title} ${renderText(labels, it.description)} ${it.tags.join(' ')}`.toLowerCase() }))
      .filter((x) => !t || t.split(/\s+/).every((w) => x.text.includes(w)))
      .sort((a, b) => byLabel(labels)(a.it, b.it))
      .slice(0, 40)
  }, [p, labels, q])
  if (!open) return null
  const go = (n: number) => { const h = hits[n]; if (h) { goto(VIEW_OF[h.it.kind], h.it.id); setOpen(false) } }
  return (
    <div className="modal-back" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={ref} value={q} placeholder="Jump to… (id, title, text, tag)" onChange={(e) => { setQ(e.target.value); setI(0) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)) }
            else if (e.key === 'Enter') go(i)
          }} />
        <ul>
          {hits.map((h, n) => (
            <li key={h.it.id} className={n === i ? 'on' : ''} onMouseEnter={() => setI(n)} onClick={() => go(n)}>
              <span className={'chip k-' + h.it.kind}>{labels[h.it.id]}</span> {h.it.title || <i className="muted">{KIND_NAMES[h.it.kind]}</i>}
            </li>
          ))}
          {hits.length === 0 && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  )
}
