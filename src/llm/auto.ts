import { computeLabels } from '../model/labels'
import { useStore } from '../model/store'
import type { Issue } from '../model/validate'
import type { Id, Item, Project } from '../model/types'
import { decide, loadLlm } from './ollama'
import { REVIEW_KINDS, decisionRequest, summarise, type ItemReview } from './review'

interface State { enabled: boolean; busy: boolean; error: string }

const KEY = 'hazardfox.autoreview'
let state: State = { enabled: read(), busy: false, error: '' }
const subs = new Set<() => void>()

function read() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}
function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}

export const subscribe = (f: () => void) => { subs.add(f); return () => void subs.delete(f) }
export const getAuto = () => state
export function setAutoEnabled(enabled: boolean) {
  try { localStorage.setItem(KEY, enabled ? '1' : '0') } catch { /* storage unavailable */ }
  set({ enabled, error: '' })
}

/** Identifies what was checked: the exact prompt state plus the model, so only edited items (or a new model) are re-checked. */
const keyOf = (req: ReturnType<typeof decisionRequest>, model: string) => {
  let h = 0x811c9dc5
  for (const ch of model + '\n' + req.state + JSON.stringify(req.questions)) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193)
  return (h >>> 0).toString(36)
}

/** Remember a result in the project (so it is saved with the file). */
export const saveReview = (id: Id, req: ReturnType<typeof decisionRequest>, probs: Record<string, number>) =>
  useStore.getState().saveReviews({ [id]: { key: keyOf(req, loadLlm().model), p: probs } })

/** Reviews every item with a missing or outdated saved result, one request each; stops when `signal` aborts. */
export async function reviewStale(p: Project, signal: AbortSignal) {
  const L = computeLabels(p)
  const s = loadLlm()
  const todo = Object.values(p.items)
    .filter((it) => REVIEW_KINDS.includes(it.kind))
    .map((it) => ({ it, req: decisionRequest(p, L, it) }))
    .filter((x) => p.reviews?.[x.it.id]?.key !== keyOf(x.req, s.model))
  if (!todo.length) return
  set({ busy: true, error: '' })
  try {
    for (const x of todo) {
      const probs = await decide(s, x.req.state, x.req.questions, signal)
      if (signal.aborted) return
      useStore.getState().saveReviews({ [x.it.id]: { key: keyOf(x.req, s.model), p: probs } })
    }
  } catch (e) {
    if (!signal.aborted) set({ error: String((e as Error).message ?? e) })
  } finally {
    if (!signal.aborted) set({ busy: false })
  }
}

/** Saved review of an item if it still matches the current content. */
export const freshReview = (p: Project, L: Record<Id, string>, id: Id): ItemReview | undefined => {
  const it: Item | undefined = p.items[id]
  const c = p.reviews?.[id]
  if (!it || !c || !REVIEW_KINDS.includes(it.kind)) return undefined
  if (c.key !== keyOf(decisionRequest(p, L, it), loadLlm().model)) return undefined
  return summarise(it, c.p)
}

/** Number of reviewable items without a current saved result, and the total. */
export function reviewProgress(p: Project): { done: number; total: number } {
  const L = computeLabels(p)
  const items = Object.values(p.items).filter((it) => REVIEW_KINDS.includes(it.kind))
  return { done: items.filter((it) => freshReview(p, L, it.id)).length, total: items.length }
}

/** Validation findings from the saved AI reviews: one per item with a failing (warning) or unsure (info) check. */
export function aiIssues(p: Project): Issue[] {
  const L = computeLabels(p)
  const out: Issue[] = []
  for (const it of Object.values(p.items)) {
    const r = freshReview(p, L, it.id)
    if (!r || r.verdict === 'pass') continue
    const bad = r.checks.filter((c) => c.verdict !== 'pass').map((c) => `${c.label} (${Math.round(c.p * 100)}%)`)
    out.push({ severity: r.verdict === 'fail' ? 'warning' : 'info', item: it.id, source: 'ai', message: `${L[it.id]} ${it.title}: ${bad.join('; ')}`.replace(/\s+:/, ':') })
  }
  return out
}
