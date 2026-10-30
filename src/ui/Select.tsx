import { Children, Fragment, isValidElement, useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Opt { value: string; label: ReactNode; disabled: boolean }

const textOf = (n: ReactNode): string => Children.toArray(n).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('')

function options(children: ReactNode): Opt[] {
  return Children.toArray(children).flatMap((c): Opt[] => {
    if (!isValidElement(c)) return []
    const p = c.props as { value?: string | number; children?: ReactNode; disabled?: boolean }
    if (c.type === Fragment) return options(p.children)
    return [{ value: p.value !== undefined ? String(p.value) : textOf(p.children), label: p.children, disabled: !!p.disabled }]
  })
}

/** Drop-in for `<select>` with `<option>` children (single choice), with a styled popup instead of the OS menu. `onChange` gets `{ target: { value } }`. */
export function Select({ value, onChange, children, className, style, title, disabled }: {
  value: string | number; onChange?: (e: ChangeEvent<HTMLSelectElement>) => void; children?: ReactNode; className?: string; style?: CSSProperties; title?: string; disabled?: boolean
}) {
  const opts = options(children)
  const v = String(value)
  const idx = opts.findIndex((o) => o.value === v)
  const btn = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ x: number; y: number; w: number; up: boolean } | null>(null)
  const [hi, setHi] = useState(0)
  const close = () => setAt(null)
  const pick = (o: Opt) => { if (o.disabled) return; close(); if (o.value !== v) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } } as unknown as ChangeEvent<HTMLSelectElement>) }
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const room = window.innerHeight - r.bottom
    const up = room < 220 && r.top > room
    setAt({ x: r.left, y: up ? r.top - 4 : r.bottom + 4, w: r.width, up })
    setHi(Math.max(idx, 0))
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
  const key = (e: React.KeyboardEvent) => {
    if (!at) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); open() } return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, opts.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[hi]) pick(opts[hi]) }
    else if (e.key === 'Escape' || e.key === 'Tab') close()
  }
  return (
    <>
      <button ref={btn} type="button" className={'select ' + (className ?? '')} style={style} title={title} disabled={disabled} onClick={() => (at ? close() : open())} onKeyDown={key}>
        <span className="select-val">{idx >= 0 ? opts[idx].label : v}</span>
      </button>
      {at && createPortal(
        <ul className="select-pop" style={{ left: at.x, minWidth: at.w, ...(at.up ? { bottom: window.innerHeight - at.y } : { top: at.y }), maxHeight: Math.max(160, at.up ? at.y - 12 : window.innerHeight - at.y - 12) }}>
          {opts.map((o, n) => (
            <li key={n} className={(n === hi ? 'hi ' : '') + (o.value === v ? 'cur ' : '') + (o.disabled ? 'off' : '')} ref={(el) => { if (el && n === hi) el.scrollIntoView({ block: 'nearest' }) }} onMouseEnter={() => setHi(n)} onClick={() => pick(o)}>{o.label}</li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  )
}
