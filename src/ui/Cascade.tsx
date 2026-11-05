import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface COpt { value: string; /** searched text */ text: string; node: ReactNode; /** options with the same section key are listed under its heading */ section?: { key: string; node: ReactNode } }
export interface CGroup { key: string; label: string; options: COpt[] }
type Entry = { t: 'g'; g: CGroup } | { t: 'o'; o: COpt; g: CGroup }

/** Two-step, searchable picker: first the kind of thing (variable, value, function, …), then the choice. Typing searches all kinds at once. */
export function Cascade({ groups, onPick, display, className, value, title }: { groups: CGroup[]; onPick: (value: string) => void; display: ReactNode; className?: string; value?: string; title?: string }) {
  const gs = groups.filter((g) => g.options.length)
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const [q, setQ] = useState('')
  const [grp, setGrp] = useState<string | null>(null)
  const [hi, setHi] = useState(0)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const cur = gs.length === 1 ? gs[0] : gs.find((g) => g.key === grp) ?? null
  const entries: Entry[] = words.length
    ? gs.flatMap((g) => g.options.filter((o) => words.every((w) => (o.text + ' ' + g.label).toLowerCase().includes(w))).map((o): Entry => ({ t: 'o', o, g })))
    : cur ? cur.options.map((o): Entry => ({ t: 'o', o, g: cur })) : gs.map((g): Entry => ({ t: 'g', g }))
  const close = () => { setAt(null); setQ(''); setGrp(null) }
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom
    setAt({ x: Math.min(r.left, window.innerWidth - 300), y: up ? r.top - 4 : r.bottom + 4, up })
    const i = gs.findIndex((g) => g.options.some((o) => o.value === value))
    setGrp(gs.length > 1 && i >= 0 ? gs[i].key : null)
    setHi(0)
  }
  const choose = (e: Entry) => { if (e.t === 'g') { setGrp(e.g.key); setHi(0); return } close(); onPick(e.o.value) }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.cascade-pop') && !btn.current?.contains(e.target as Node)) close() }
    const away = (e: Event) => { if (!(e.target as Element).closest?.('.cascade-pop')) close() }
    window.addEventListener('mousedown', down)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', close) }
  }, [at])
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, entries.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (entries[hi]) choose(entries[hi]) }
    else if (e.key === 'Backspace' && !q && grp && gs.length > 1) { setGrp(null); setHi(0) }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus() }
  }
  let prevSection = ''
  return (
    <>
      <button ref={btn} type="button" className={'select ' + (className ?? '')} title={title} onClick={() => (at ? close() : open())}><span className="select-val">{display}</span></button>
      {at && createPortal(
        <ul className="select-pop cascade-pop" style={{ left: at.x, minWidth: 260, ...(at.up ? { bottom: window.innerHeight - at.y } : { top: at.y }), maxHeight: Math.max(200, at.up ? at.y - 12 : window.innerHeight - at.y - 12) }}>
          <li className="srch"><input ref={(el) => el?.focus({ preventScroll: true })} placeholder={cur ? `Search ${cur.label.toLowerCase()}…` : 'Search…'} value={q} onChange={(e) => { setQ(e.target.value); setHi(0) }} onKeyDown={key} /></li>
          {cur && !words.length && gs.length > 1 && <li className="cas-back" onClick={() => { setGrp(null); setHi(0) }}>‹ {cur.label}</li>}
          {!entries.length && <li className="off">No matches</li>}
          {entries.map((e, n) => {
            const sec = e.t === 'o' && !words.length ? e.o.section : undefined
            const head = sec && sec.key !== prevSection
            prevSection = sec?.key ?? ''
            return (
              <Fragment key={n}>
                {head && <li className="grp cas-sec">{sec.node}</li>}
                <li className={(n === hi ? 'hi ' : '') + (e.t === 'o' && e.o.value === value ? 'cur ' : '') + (sec ? 'cas-in' : '')} ref={(el) => { if (el && n === hi) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => setHi(n)} onClick={() => choose(e)}>
                  {e.t === 'g' ? <><span>{e.g.label}</span><span className="cas-n">{e.g.options.length} ›</span></> : <>{e.o.node}{words.length > 0 && gs.length > 1 && <span className="cas-tag">{e.g.label}</span>}</>}
                </li>
              </Fragment>
            )
          })}
        </ul>,
        document.body,
      )}
    </>
  )
}
