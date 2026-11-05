import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface COpt { value: string; /** searched text */ text: string; node: ReactNode; /** options with the same section key are listed under its heading */ section?: { key: string; node: ReactNode } }
export interface CGroup { key: string; label: string; options: COpt[] }
type Entry = { t: 'o'; o: COpt; g: CGroup }

/** Two-pane, searchable picker (like the data type picker): kinds of thing on the left (variable, value, function, …), the choices of the hovered kind on the right. Typing searches all kinds at once. */
export function Cascade({ groups, onPick, display, className, value, title }: { groups: CGroup[]; onPick: (value: string) => void; display: ReactNode; className?: string; value?: string; title?: string }) {
  const gs = groups.filter((g) => g.options.length)
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; up: boolean } | null>(null)
  const [q, setQ] = useState('')
  const [vk, setVk] = useState('')
  const [hi, setHi] = useState(0)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const cur = gs.find((g) => g.key === vk) ?? gs[0]
  const entries: Entry[] = words.length
    ? gs.flatMap((g) => g.options.filter((o) => words.every((w) => (o.text + ' ' + g.label).toLowerCase().includes(w))).map((o): Entry => ({ t: 'o', o, g })))
    : cur ? cur.options.map((o): Entry => ({ t: 'o', o, g: cur })) : []
  const close = () => { setAt(null); setQ('') }
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom
    setAt({ x: Math.max(8, Math.min(r.left, window.innerWidth - 500)), y: up ? r.top - 4 : r.bottom + 4, up })
    setVk(gs.find((g) => g.options.some((o) => o.value === value))?.key ?? gs[0]?.key ?? '')
    setHi(0)
  }
  const choose = (e: Entry) => { close(); onPick(e.o.value) }
  const show = (k: string) => { setVk(k); setHi(0) }
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
    const gi = gs.findIndex((g) => g.key === cur?.key)
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, entries.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'ArrowLeft' && !q && gi > 0) { e.preventDefault(); show(gs[gi - 1].key) }
    else if (e.key === 'ArrowRight' && !q && gi < gs.length - 1) { e.preventDefault(); show(gs[gi + 1].key) }
    else if (e.key === 'Enter') { e.preventDefault(); if (entries[hi]) choose(entries[hi]) }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); btn.current?.focus() }
  }
  let prevSection = ''
  return (
    <>
      <button ref={btn} type="button" className={'select ' + (className ?? '')} title={title} onClick={() => (at ? close() : open())}><span className="select-val">{display}</span></button>
      {at && createPortal(
        <div className="select-pop cascade-pop" style={{ left: at.x, width: 480, ...(at.up ? { bottom: window.innerHeight - at.y } : { top: at.y }), maxHeight: Math.max(220, at.up ? at.y - 12 : window.innerHeight - at.y - 12) }}>
          <ul className="cas-kinds">
            {gs.map((g) => <li key={g.key} className={(!words.length && g.key === cur?.key ? 'hi ' : '') + (g.options.some((o) => o.value === value) ? 'cur' : '')} onMouseEnter={() => !words.length && show(g.key)} onClick={() => { setQ(''); show(g.key) }}>{g.label}<span className="cas-n">{g.options.length}</span></li>)}
          </ul>
          <ul className="cas-opts">
            <li className="srch"><input ref={(el) => el?.focus({ preventScroll: true })} placeholder={words.length || !cur ? 'Search all…' : `Search ${cur.label.toLowerCase()}…`} value={q} onChange={(e) => { setQ(e.target.value); setHi(0) }} onKeyDown={key} /></li>
            {!entries.length && <li className="off">No matches</li>}
            {entries.map((e, n) => {
              const sec = !words.length ? e.o.section : undefined
              const head = sec && sec.key !== prevSection
              prevSection = sec?.key ?? ''
              return (
                <Fragment key={n}>
                  {head && <li className="grp cas-sec">{sec.node}</li>}
                  <li className={(n === hi ? 'hi ' : '') + (e.o.value === value ? 'cur ' : '') + (sec ? 'cas-in' : '')} ref={(el) => { if (el && n === hi) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => setHi(n)} onClick={() => choose(e)}>
                    {e.o.node}{words.length > 0 && gs.length > 1 && <span className="cas-tag">{e.g.label}</span>}
                  </li>
                </Fragment>
              )
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
