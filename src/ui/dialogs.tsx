import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Modal } from './Modal'

/** In-app replacements for window.prompt / confirm / alert: promise-based, rendered by `<DialogHost />`. */
type Ask =
  | { kind: 'text'; title: string; label: string; initial: string; confirm: string; done: (v: string | null) => void }
  | { kind: 'confirm'; title: string; message: ReactNode; confirm: string; done: (v: boolean) => void }
  | { kind: 'notice'; title: string; message: ReactNode; done: () => void }

let queue: Ask[] = []
const subs = new Set<() => void>()
const push = (a: Ask) => { queue = [...queue, a]; subs.forEach((f) => f()) }
const pop = () => { queue = queue.slice(1); subs.forEach((f) => f()) }

/** Resolves to the trimmed text, or null when cancelled or empty. */
export const askText = (o: { title: string; label?: string; initial?: string; confirm?: string }) =>
  new Promise<string | null>((res) => push({ kind: 'text', title: o.title, label: o.label ?? '', initial: o.initial ?? '', confirm: o.confirm ?? 'OK', done: (v) => res(v?.trim() || null) }))

export const askConfirm = (message: ReactNode, o: { title?: string; confirm?: string } = {}) =>
  new Promise<boolean>((res) => push({ kind: 'confirm', title: o.title ?? 'Please confirm', message, confirm: o.confirm ?? 'OK', done: res }))

export const showNotice = (message: ReactNode, title = 'Notice') =>
  new Promise<void>((res) => push({ kind: 'notice', title, message, done: res }))

function TextAsk({ a }: { a: Extract<Ask, { kind: 'text' }> }) {
  const [v, setV] = useState(a.initial)
  const close = (r: string | null) => { pop(); a.done(r) }
  return (
    <Modal title={a.title} onClose={() => close(null)}>
      <label className="field">
        {a.label}
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v.trim() && close(v)} />
      </label>
      <div className="modal-actions">
        <button className="btn" onClick={() => close(null)}>Cancel</button>
        <button className="primary" disabled={!v.trim()} onClick={() => close(v)}>{a.confirm}</button>
      </div>
    </Modal>
  )
}

export function DialogHost() {
  const a = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => queue[0], () => undefined)
  if (!a) return null
  if (a.kind === 'text') return <TextAsk key={queue.length + a.title} a={a} />
  const close = (r?: boolean) => { pop(); a.kind === 'confirm' ? a.done(!!r) : a.done() }
  return (
    <Modal title={a.title} onClose={() => close(false)}>
      <p>{a.message}</p>
      <div className="modal-actions">
        {a.kind === 'confirm' && <button className="btn" onClick={() => close(false)}>Cancel</button>}
        <button className="primary" autoFocus onClick={() => close(true)}>{a.kind === 'confirm' ? a.confirm : 'OK'}</button>
      </div>
    </Modal>
  )
}
