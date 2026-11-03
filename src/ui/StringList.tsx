import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

const clean = (rows: string[]) => rows.map((s) => s.trim()).filter(Boolean)

/** One input per entry: Enter adds a row below, Backspace on an empty row removes it, ↑/↓ move between rows, pasted lines split into rows. Empty rows live only here; `onChange` gets the trimmed non-empty entries. */
export function StringList(props: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; addLabel?: string; bullet?: boolean }) {
  const { value, onChange } = props
  const [rows, setRows] = useState(value)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const focus = useRef<number | null>(null)

  // follow external changes (undo/redo, other editors) but keep our empty rows
  useEffect(() => {
    setRows((r) => (clean(r).join('\n') === value.join('\n') ? r : value))
  }, [value])
  useEffect(() => {
    if (focus.current !== null) { inputs.current[focus.current]?.focus(); focus.current = null }
  })

  const update = (next: string[], focusAt?: number) => {
    setRows(next)
    if (focusAt !== undefined) focus.current = focusAt
    onChange(clean(next))
  }
  const edit = (i: number, v: string) => update(rows.map((r, j) => (j === i ? v : r)))
  const insert = (i: number, vals: string[]) => update([...rows.slice(0, i), ...vals, ...rows.slice(i)], i + vals.length - 1)
  const remove = (i: number) => update(rows.filter((_, j) => j !== i), Math.max(0, i - 1))
  const move = (i: number, d: number) => {
    const next = [...rows]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    update(next, i + d)
  }

  return (
    <div className="strlist">
      {rows.map((r, i) => (
        <div key={i} className="strrow">
          {props.bullet && <span className="muted" aria-hidden style={{ width: 14, textAlign: 'center', flex: 'none' }}>•</span>}
          <input
            ref={(el) => { inputs.current[i] = el }}
            value={r}
            placeholder={props.placeholder}
            onChange={(e) => edit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); if (r.trim()) insert(i + 1, ['']) }
              else if (e.key === 'Backspace' && r === '' ) { e.preventDefault(); remove(i) }
              else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); inputs.current[i - 1]?.focus() }
              else if (e.key === 'ArrowDown' && i < rows.length - 1) { e.preventDefault(); inputs.current[i + 1]?.focus() }
            }}
            onPaste={(e) => {
              const lines = e.clipboardData.getData('text').split(/\r?\n/)
              if (lines.length < 2) return
              e.preventDefault()
              const next = [...rows]
              next.splice(i, 1, ...(r.trim() ? [r, ...lines] : lines))
              update(clean(next))
            }}
          />
          <button type="button" className="icon" title="Move up" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="up" size={12} /></button>
          <button type="button" className="icon" title="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><Icon name="down" size={12} /></button>
          <button type="button" className="icon" title="Remove" onClick={() => remove(i)}><Icon name="x" size={12} /></button>
        </div>
      ))}
      <button type="button" className="add" onClick={() => insert(rows.length, [''])}><Icon name="plus" size={12} /> {props.addLabel ?? 'Add'}</button>
    </div>
  )
}
