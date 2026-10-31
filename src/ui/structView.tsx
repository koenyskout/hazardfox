import { useSyncExternalStore } from 'react'

export type StructView = 'nested' | 'dotted'
const KEY = 'hazardfox.structview'
const subs = new Set<() => void>()
let mode: StructView = (() => { try { return localStorage.getItem(KEY) === 'dotted' ? 'dotted' : 'nested' } catch { return 'nested' } })()
const set = (m: StructView) => { mode = m; try { localStorage.setItem(KEY, m) } catch { /* ignore */ } subs.forEach((f) => f()) }

export const useStructView = (): StructView => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => mode)

/** How struct fields are listed: grouped under their struct names, or flat with dotted names. */
export function StructViewToggle() {
  const m = useStructView()
  return (
    <span className="struct-toggle muted" title="How struct fields are listed">
      Struct fields:{' '}
      <button className={m === 'nested' ? 'on' : ''} onClick={() => set('nested')}>nested</button>
      <button className={m === 'dotted' ? 'on' : ''} onClick={() => set('dotted')}>dotted</button>
    </span>
  )
}
