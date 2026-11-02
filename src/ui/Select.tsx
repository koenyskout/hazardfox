import { Children, Fragment, isValidElement, useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Opt { value: string; label: ReactNode; disabled: boolean; group?: boolean }

const textOf = (n: ReactNode): string => Children.toArray(n).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('')

function options(children: ReactNode): Opt[] {
  return Children.toArray(children).flatMap((c): Opt[] => {
    if (!isValidElement(c)) return []
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }
    if (c.type === Fragment) return options(p.children)
    if (c.type === 'optgroup') return [{ value: '', label: p.label, disabled: true, group: true }, ...options(p.children)]
    return [{ value: p.value !== undefined ? String(p.value) : textOf(p.children), label: p.children, disabled: !!p.disabled }]
  })
}

const SEARCH_FROM = 8

/** Drop-in for `<select>` with `<option>` children (single choice), with a styled popup instead of the OS menu. `onChange` gets `{ target: { value } }`.
 *  With `search`, a filter box appears once there are more than a few options; groups named in `always` stay visible while filtering. */
export function Select({ value, onChange, children, className, style, title, disabled, search, always }: {
  value: string | number; onChange?: (e: ChangeEvent<HTMLSelectElement>) => void; children?: ReactNode; className?: string; style?: CSSProperties; title?: string; disabled?: boolean; search?: boolean; always?: string[]
}) {
  const all = options(children)
  const [q, setQ] = useState('')
  const searching = !!search && all.filter((o) => !o.group).length > SEARCH_FROM
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const opts = !searching || !words.length ? all : (() => {
    const out: Opt[] = []
    let grp: Opt | null = null, keep = false, kept: Opt[] = []
    const flush = () => { if (grp && kept.length) out.push(grp, ...kept); kept = [] }
    for (const o of all) {
      if (o.group) { flush(); grp = o; keep = !!always?.includes(textOf(o.label)); continue }
      const t = textOf(o.label).toLowerCase()
      if (keep || words.every((w) => t.includes(w))) kept.push(o)
    }
    flush()
    return out
  })()
  const v = String(value)
  const idx = all.findIndex((o) => !o.group && o.value === v)
  const first = (l: Opt[]) => Math.max(l.findIndex((o) => !o.disabled), 0)
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; w: number; up: boolean } | null>(null)
  const [hi, setHi] = useState(0)
  const close = () => { setAt(null); setQ('') }
  const pick = (o: Opt) => { if (o.disabled) return; close(); if (o.value !== v) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>) }
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const room = window.innerHeight - r.bottom
    const up = room < 220 && r.top > room
    setAt({ x: r.left, y: up ? r.top - 4 : r.bottom + 4, w: r.width, up })
    setHi(Math.max(opts.findIndex((o) => !o.group && o.value === v), 0))
  }
  useEffect(() => {
    if (!at) return
    const down = (e: MouseEvent) => { if (!(e.target as Element).closest('.select-pop') && !btn.current?.contains(e.target as Node)) close() }
    const away = (e: Event) => { if (!(e.target as Element).closest?.('.select-pop')) close() }
    window.addEventListener('mousedown', down)
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', close)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('scroll', away, true); window.removeEventListener('resize', close) }
  }, [at])
  useEffect(() => { setHi(first(opts)) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const step = (h: number, d: number) => { let n = h + d; while (opts[n]?.disabled) n += d; return n < 0 || n >= opts.length ? h : n }
  const key = (e: React.KeyboardEvent) => {
    if (!at) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open() } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => step(h, 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => step(h, -1)) }
    else if (e.key === 'Enter' || (e.key === ' ' && !searching)) { e.preventDefault(); if (opts[hi]) pick(opts[hi]) }
    else if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.stopPropagation(); close(); btn.current?.focus() }
  }
  return (
    <>
      <button ref={btn} type="button" className={'select ' + (className ?? '')} style={style} title={title} disabled={disabled} onClick={() => (at ? close() : open())} onKeyDown={key}>
        <span className="select-val">{idx >= 0 ? all[idx].label : v}</span>
      </button>
      {at && createPortal(
        <ul className="select-pop" style={{ left: at.x, minWidth: at.w, ...(at.up ? { bottom: window.innerHeight - at.y } : { top: at.y }), maxHeight: Math.max(160, at.up ? at.y - 12 : window.innerHeight - at.y - 12) }}>
          {searching && <li className="srch"><input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} /></li>}
          {!opts.some((o) => !o.group) && <li className="off">No matches</li>}
          {opts.map((o, n) => (
            <li key={n} className={o.group ? 'grp' : (n === hi ? 'hi ' : '') + (o.value === v ? 'cur ' : '') + (o.disabled ? 'off' : '')} ref={(el) => { if (el && n === hi) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => !o.disabled && setHi(n)} onClick={() => pick(o)}>{o.label}</li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
