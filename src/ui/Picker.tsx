import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { generateUcaText } from '../model/uca'
import { useStore } from '../model/store'
import { KIND_NAMES, type Id, type Item } from '../model/types'
import { VIEW_OF } from './Fields'
import { useLabels, useProject } from './hooks'
import { ItemCard, summary } from './ItemCard'

/** Searchable item picker: each option shows label, title and a summary; the highlighted one is previewed as a full card. */
export function Picker({ options, onPick, children, className }: { options: Item[]; onPick: (id: Id | null) => void; children: ReactNode; className?: string }) {
  const p = useProject()
  const labels = useLabels()
  const goto = useStore((s) => s.goto)
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const text = (it: Item) => it.title || (it.kind === 'uca' ? generateUcaText(p, labels, it) : '')
  const hits = useMemo(() => {
    const t = q.toLowerCase().split(/\s+/).filter(Boolean)
    return options.filter((o) => { const s = `${labels[o.id]} ${text(o)} ${KIND_NAMES[o.kind]} ${summary(p, labels, o)}`.toLowerCase(); return t.every((w) => s.includes(w)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, options, labels, p])
  const close = () => { setAt(null); setQ(''); setSel(0) }
  const pick = (id: Id | null) => { onPick(id); close() }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.picker-pop') && !btn.current?.contains(e.target as Node)) close() }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [at])
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const w = window.innerWidth >= 780 ? 740 : 380
    setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), y: r.bottom + 4 })
  }
  const cur = hits[Math.min(sel, hits.length - 1)]
  const wide = window.innerWidth >= 780
  return (
    <>
      <button ref={btn} type="button" className={'picker-btn ' + (className ?? '')} onClick={() => (at ? close() : open())}>{children}</button>
      {at && createPortal(
        <div className="picker-pop" style={{ left: at.x, top: at.y, maxHeight: Math.max(240, window.innerHeight - at.y - 12) }}>
          <div className="picker-list">
            <input autoFocus placeholder="Search label, title, kind…" value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, hits.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)) }
                else if (e.key === 'Enter' && cur) pick(cur.id)
                else if (e.key === 'Escape') close()
              }} />
            <ul>
              {hits.map((o, n) => (
                <li key={o.id} className={n === sel ? 'on' : ''} ref={(el) => { if (el && n === sel) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => setSel(n)} onClick={() => pick(o.id)}>
                  <span className={'chip k-' + o.kind}>{labels[o.id]}</span>
                  <span className="pk-main">
                    <span className="pk-title">{text(o) || <i className="muted">{KIND_NAMES[o.kind]}</i>}</span>
                    <span className="pk-sub">{[KIND_NAMES[o.kind], summary(p, labels, o)].filter(Boolean).join(' · ')}</span>
                  </span>
                </li>
              ))}
              {hits.length === 0 && <li className="muted">No matches</li>}
            </ul>
          </div>
          {wide && cur && <div className="picker-card"><ItemCard it={cur} p={p} labels={labels} go={(t) => { close(); goto(VIEW_OF[p.items[t].kind], t) }} /></div>}
        </div>,
        document.body,
      )}
    </>
  )
}
