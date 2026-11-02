import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Variable } from '../model/types'
import { ChipLabel } from './Icon'
import { useLabels, useProject } from './hooks'
import { useStore } from '../model/store'
import { ItemCard } from './ItemCard'
import { VIEW_OF } from './Fields'

/** One way to start a condition: a variable with its instances ("every Train", "the same Train t1", …). `text` is what typing is matched against. */
export interface SubjectChoice { key: string; variable: Variable; before?: string; after?: string; text: string; pick: () => void }

const norm = (s: string) => s.toLowerCase().replace(/[._·:()\-]+/g, ' ')
const STOP = new Set(['of', 'the', 'a', 'an', 'that', 'same', 'is'])

/** Completion box for the subject of a condition: type words of the variable and instance ("t1 pos x", "every train speed") and pick. */
export function SubjectPicker({ choices, create, children }: { choices: () => SubjectChoice[]; create?: { label: string; run: () => void }; children: ReactNode }) {
  const labels = useLabels()
  const p = useProject()
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [stage, setStage] = useState<string | null>(null)
  const [pb, setPb] = useState<string | null>(null)
  const [pa, setPa] = useState<string | null>(null)
  const close = () => { setAt(null); setQ(''); setSel(0); setStage(null); setPb(null); setPa(null) }
  const back = () => { setStage(null); setPb(null); setPa(null); setQ(''); setSel(0) }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.picker-pop') && !btn.current?.contains(e.target as Node)) close() }
    window.addEventListener('mousedown', down)
    return () => window.removeEventListener('mousedown', down)
  }, [at])
  const open = () => { const r = btn.current!.getBoundingClientRect(); setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - (window.innerWidth >= 900 ? 860 : 480))), y: r.bottom + 4 }) }
  const words = norm(q).split(/\s+/).filter((w) => w && !STOP.has(w))
  const all = at ? choices() : []
  // Without typing the list is one row per variable; one with several instance choices opens a second list of them. Typing searches all choices at once.
  const byVar = new Map<string, SubjectChoice[]>()
  for (const c of all) byVar.set(c.variable.id, [...(byVar.get(c.variable.id) ?? []), c])
  const grouped = !words.length && stage === null
  const owner = (v: Variable) => (v.layer === 'domain' && v.parent ? v.parent : '')
  // A relationship between several-instance entities has two ends: a screen with the relationship fixed in the middle and the choices for each end beside it.
  const inVar = stage !== null ? byVar.get(stage) ?? [] : []
  const bs = [...new Set(inVar.map((c) => c.before ?? ''))], as = [...new Set(inVar.map((c) => c.after ?? ''))]
  const two = stage !== null && !words.length && bs.length > 1 && as.length > 1
  const [curB, curA] = [pb ?? bs[0], pa ?? as[0]]
  const both = inVar.find((c) => (c.before ?? '') === curB && (c.after ?? '') === curA)
  const rows: { key: string; choice: SubjectChoice; more: number }[] = two ? [] : grouped
    ? [...byVar.values()].map((cs) => ({ key: cs[0].variable.id, choice: cs[0], more: cs.length > 1 ? cs.length : 0 })).sort((a, b) => (owner(a.choice.variable) ? 0 : 1) - (owner(b.choice.variable) ? 0 : 1) || labels[owner(a.choice.variable)]?.localeCompare(labels[owner(b.choice.variable)] ?? '') || 0)
    : (stage !== null ? inVar : all).filter((c) => { const t = norm(c.text); return words.every((w) => t.includes(w)) }).slice(0, 60).map((c) => ({ key: c.key, choice: c, more: 0 }))
  const cur = rows[Math.min(sel, rows.length - 1)]
  const goto = useStore((s) => s.goto)
  const wide = window.innerWidth >= 900
  const pick = (r: { choice: SubjectChoice; more: number }) => { if (r.more) { setStage(r.choice.variable.id); setQ(''); setSel(0) } else { close(); r.choice.pick() } }
  return (
    <>
      <button ref={btn} type="button" className="picker-btn subject-btn" onClick={() => (at ? close() : open())}>{children}</button>
      {at && createPortal(
        <div className="picker-pop subject-pop" style={{ left: at.x, top: at.y, maxHeight: Math.max(240, window.innerHeight - at.y - 12) }}>
          <div className="picker-list">
            <button type="button" className="pk-close" title="Close" aria-label="Close" onClick={close}>×</button>
            <input autoFocus placeholder={stage !== null ? 'Filter the instances…' : 'Type the variable and instance, e.g. “t1 position x”, “every train speed”…'} value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(Math.min(sel + 1, rows.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(Math.max(sel - 1, 0)) }
                else if (e.key === 'Enter' && two && both) { close(); both.pick() }
                else if (e.key === 'Enter' && cur) pick(cur)
                else if (e.key === 'Escape') (stage !== null ? back() : close())
                else if (e.key === 'Backspace' && !q && stage !== null) back()
              }} />
            {stage !== null && <div className="subj-back" onClick={back}>← {two ? 'Back to the variables' : byVar.get(stage)?.[0] && <ChipLabel it={byVar.get(stage)![0].variable} label={labels[stage]} />} {!two && '— which instance?'}</div>}
            {two && both && (
              <div className="pk-ends">
                <div className="pk-mid"><span className={'chip k-' + both.variable.kind}><ChipLabel it={both.variable} label={labels[both.variable.id]} /></span></div>
                <div>{bs.map((b) => <label key={b} className={b === curB ? 'on' : ''}><input type="radio" checked={b === curB} onChange={() => setPb(b)} />{b}</label>)}</div>
                <div>{as.map((a) => <label key={a} className={a === curA ? 'on' : ''}><input type="radio" checked={a === curA} onChange={() => setPa(a)} />{a}</label>)}</div>
                <button type="button" className="pk-use" onClick={() => { close(); both.pick() }}>Use</button>
              </div>
            )}
            <ul>
              {create && stage === null && <li className="pk-create" onClick={() => { close(); create.run() }}>{create.label}</li>}
              {rows.map((r, n) => { const c = r.choice, g = grouped ? owner(c.variable) : '', head = grouped && (n === 0 || owner(rows[n - 1].choice.variable) !== g), po = p.items[g]; return (
                <Fragment key={r.key}>{head && <li className={'pk-group' + (po ? ' k-' + po.kind : '')}>{po ? <ChipLabel it={po} label={labels[g]} /> : 'Other variables'}</li>}
                <li className={(n === sel ? 'on' : '') + (grouped ? ' pk-in' : '')} ref={(el) => { if (el && n === sel) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => setSel(n)} onClick={() => pick(r)}>
                  {!r.more && c.before && <span className="subj-inst">{c.before}</span>}
                  {stage === null || !r.more ? <span className={'chip k-' + c.variable.kind}><ChipLabel it={c.variable} label={labels[c.variable.id]} /></span> : null}
                  {!r.more && c.after && <span className="subj-inst">{c.after}</span>}
                  {r.more > 0 && <span className="muted pk-more">{r.more} instance choices ▸</span>}
                </li></Fragment>
              ) })}
              {rows.length === 0 && !two && <li className="muted">No matches</li>}
            </ul>
          </div>
          {wide && cur && !two && <div className="picker-card"><ItemCard it={cur.choice.variable} p={p} labels={labels} go={(t) => { close(); goto(VIEW_OF[p.items[t].kind], t) }} /></div>}
        </div>,
        document.body,
      )}
    </>
  )
}
