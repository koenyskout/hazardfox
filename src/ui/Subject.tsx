import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Variable } from '../model/types'
import { ChipLabel } from './Icon'
import { useLabels } from './hooks'

/** One way to start a condition: a variable with its instances ("every Train", "the same Train t1", …). `text` is what typing is matched against. */
export interface SubjectChoice { key: string; variable: Variable; before?: string; after?: string; text: string; pick: () => void }

const norm = (s: string) => s.toLowerCase().replace(/[._·:()\-]+/g, ' ')
const STOP = new Set(['of', 'the', 'a', 'an', 'that', 'same', 'is'])

/** Completion box for the subject of a condition: type words of the variable and instance ("t1 pos x", "every train speed") and pick. */
export function SubjectPicker({ choices, create, children }: { choices: () => SubjectChoice[]; create?: { label: string; run: () => void }; children: ReactNode }) {
  const labels = useLabels()
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const close = () => { setAt(null); setQ(''); setSel(0) }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.picker-pop') && !btn.current?.contains(e.target as Node)) close() }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [at])
  const open = () => { const r = btn.current!.getBoundingClientRect(); setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 480)), y: r.bottom + 4 }) }
  const words = norm(q).split(/\s+/).filter((w) => w && !STOP.has(w))
  const hits = at ? choices().filter((c) => { const t = norm(c.text); return words.every((w) => t.includes(w)) }).slice(0, 60) : []
  const cur = hits[Math.min(sel, hits.length - 1)]
  const pick = (c: SubjectChoice) => { close(); c.pick() }
  return (
    <>
      <button ref={btn} type="button" className="picker-btn subject-btn" onClick={() => (at ? close() : open())}>{children}</button>
      {at && createPortal(
        <div className="picker-pop subject-pop" style={{ left: at.x, top: at.y, maxHeight: Math.max(240, window.innerHeight - at.y - 12) }}>
          <div className="picker-list">
            <input autoFocus placeholder="Type the variable and instance, e.g. “t1 position x”, “every train speed”…" value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, hits.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)) }
                else if (e.key === 'Enter' && cur) pick(cur)
                else if (e.key === 'Escape') close()
              }} />
            <ul>
              {create && <li className="pk-create" onClick={() => { close(); create.run() }}>{create.label}</li>}
              {hits.map((c, n) => (
                <li key={c.key} className={n === sel ? 'on' : ''} ref={(el) => { if (el && n === sel) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => setSel(n)} onClick={() => pick(c)}>
                  {c.before && <span className="subj-inst">{c.before}</span>}
                  <span className={'chip k-' + c.variable.kind}><ChipLabel it={c.variable} label={labels[c.variable.id]} /></span>
                  {c.after && <span className="subj-inst">{c.after}</span>}
                </li>
              ))}
              {hits.length === 0 && <li className="muted">No matches</li>}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
