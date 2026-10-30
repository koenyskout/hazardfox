import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { computeLabels } from '../model/labels'
import { itemsOfKind } from '../model/tree'
import { KIND_NAMES, type Id, type Kind, type Item } from '../model/types'
import { chat, decide, defaultLlm, listDecisionModels, loadLlm, saveLlm, type LlmSettings } from '../llm/ollama'
import { FAIL, PASS, REVIEW_KINDS, WRITER_SYSTEM, canSuggest, cleanSuggestion, decisionRequest, suggestionPrompt, summarise, withTitle, type CheckResult, type ItemReview, type Verdict } from '../llm/review'
import { freshReview, saveReview, getAuto, reviewStale, setAutoEnabled, subscribe } from '../llm/auto'
import { updateItem } from '../model/ops'
import { commit, useLabels, useProject } from './hooks'
import { Icon } from './Icon'
import { ItemHover } from './Fields'

/** Connection settings for the local Ollama server; checks the endpoint and lists installed decision models. */
function Settings({ value, onChange }: { value: LlmSettings; onChange: (s: LlmSettings) => void }) {
  const [models, setModels] = useState<string[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    const ac = new AbortController()
    listDecisionModels(value, ac.signal)
      .then((m) => { setModels(m); setErr('') })
      .catch((e) => { if (!ac.signal.aborted) { setModels(null); setErr(String(e.message ?? e)) } })
    return () => ac.abort()
  }, [value.endpoint]) // eslint-disable-line react-hooks/exhaustive-deps
  const installed = models?.find((m) => m === value.model || m === value.model + ':latest')
  const set = (patch: Partial<LlmSettings>) => { const s = { ...value, ...patch }; saveLlm(s); onChange(s) }
  return (
    <div className="llm-settings">
      <label>Ollama endpoint <input value={value.endpoint} onChange={(e) => set({ endpoint: e.target.value })} /></label>
      <label>Model
        {models ? (
          <select value={installed ?? value.model} onChange={(e) => set({ model: e.target.value })}>
            {!installed && <option value={value.model}>{value.model} (not installed)</option>}
            {models.map((m) => <option key={m}>{m}</option>)}
          </select>
        ) : <input value={value.model} onChange={(e) => set({ model: e.target.value })} />}
      </label>
      <label>Writer model <input value={value.writer} onChange={(e) => set({ writer: e.target.value })} title="Generative model that drafts improvements; the decision model verifies them" /></label>
      <span className={'llm-status ' + (models ? 'ok' : 'bad')}>
        <Icon name={models ? 'check' : 'warn'} /> {models ? `connected · ${models.length} model${models.length === 1 ? '' : 's'}` : err ? 'not reachable' : 'checking…'}
      </span>
      {err && <p className="hint">Start Ollama (<code>ollama serve</code>). If the browser blocks the request, allow this origin with <code>OLLAMA_ORIGINS={location.origin}</code>. Nothing leaves your machine.</p>}
    </div>
  )
}

const VERDICT_TEXT: Record<Verdict, string> = { pass: 'Looks fine', unsure: 'Unsure', fail: 'Possible problem' }

type Suggestion = { status: 'working' } | { status: 'none' } | { status: 'ok'; text: string; tries: number } | { status: 'error'; message: string }
type Result = { review: ItemReview; suggestion?: Suggestion }

/** One item's result: overall verdict, the criteria that are not fulfilled (with the model's probability) and a verified rewrite. */
function ItemResult({ id, label, title, result }: { id: Id; label: string; title?: string; result: Result }) {
  const { review, suggestion } = result
  const shown = review.checks.filter((c) => c.verdict !== 'pass')
  const fine = review.checks.length - shown.length
  return (
    <div className={'verdict-item ' + review.verdict}>
      <div className="verdict-head">
        <Icon name={review.verdict === 'pass' ? 'check' : 'warn'} />
        <b><ItemHover id={id}>{label}</ItemHover></b>
        {title && <span className="verdict-title">{title}</span>}
        <span className="verdict-badge">{VERDICT_TEXT[review.verdict]}</span>
      </div>
      {shown.map((c) => (
        <div key={c.id} className={'verdict-check ' + c.verdict} title={c.ask}>
          <span>{c.verdict === 'fail' ? 'Problem: ' : 'Possible problem: '}{c.label}</span>
          <span className="meter" title={`Probability that this mistake is present: ${Math.round(c.p * 100)}%`}>
            <i style={{ width: `${Math.round(c.p * 100)}%` }} />
          </span>
          <span className="pct">{Math.round(c.p * 100)}%</span>
        </div>
      ))}
      {fine > 0 && <div className="hint">{fine} of {review.checks.length} checks passed</div>}
      {suggestion?.status === 'working' && <div className="hint">Drafting an improvement and checking it…</div>}
      {suggestion?.status === 'none' && <div className="hint">No rewrite found that passes all checks.</div>}
      {suggestion?.status === 'error' && <div className="hint">Could not draft a rewrite: {suggestion.message}</div>}
      {suggestion?.status === 'ok' && (
        <div className="verdict-suggest">
          <div className="hint">Suggested wording – passes all {review.checks.length} checks{suggestion.tries > 1 ? ` (attempt ${suggestion.tries})` : ''}:</div>
          <q>{suggestion.text}</q>
          <button onClick={() => commit((q) => updateItem(q, id, { title: suggestion.text }))}><Icon name="check" /> Apply</button>
        </div>
      )}
    </div>
  )
}

const MAX_TRIES = 3

/** Asks the decision model the checks for each item (one request per item) and shows the probabilities. */
export function ReviewRunner({ kind, ids, settings }: { kind: Kind; ids: Id[]; settings: LlmSettings }) {
  const p = useProject()
  const [results, setResults] = useState<Record<Id, Result>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ac = useRef<AbortController | null>(null)
  useEffect(() => () => ac.current?.abort(), [])
  useEffect(() => { setResults({}); setErr('') }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Lets the writer model draft a rewrite and keeps it only if the decision model finds no unmet criterion. */
  const suggest = async (it: Item, failed: CheckResult[], L: Record<Id, string>, signal: AbortSignal): Promise<Suggestion> => {
    const tried: { text: string; failed: CheckResult[] }[] = []
    try {
      for (let n = 1; n <= MAX_TRIES; n++) {
        const text = cleanSuggestion(await chat(settings, WRITER_SYSTEM, suggestionPrompt(p, L, it, failed, tried), signal))
        if (!text || text === it.title) continue
        const q = withTitle(p, it, text)
        const { state, questions } = decisionRequest(q, L, q.items[it.id])
        const bad = summarise(q.items[it.id], await decide(settings, state, questions, signal)).checks.filter((x) => x.verdict !== 'pass')
        if (!bad.length) return { status: 'ok', text, tries: n }
        tried.push({ text, failed: bad })
      }
      return { status: 'none' }
    } catch (e) {
      return { status: 'error', message: String((e as Error).message ?? e) }
    }
  }

  const run = async () => {
    ac.current?.abort()
    const c = new AbortController()
    ac.current = c
    setBusy(true); setErr(''); setResults({})
    const L = computeLabels(p)
    try {
      for (const id of ids) {
        const it = p.items[id]
        if (!it) continue
        const req = decisionRequest(p, L, it)
        const { state, questions } = req
        const probs = await decide(settings, state, questions, c.signal)
        saveReview(id, req, probs)
        const review = summarise(it, probs)
        const wants = review.verdict !== 'pass' && canSuggest(it)
        setResults((r) => ({ ...r, [id]: { review, suggestion: wants ? { status: 'working' } : undefined } }))
        if (!wants) continue
        const suggestion = await suggest(it, review.checks.filter((x) => x.verdict !== 'pass'), L, c.signal)
        setResults((r) => ({ ...r, [id]: { review, suggestion } }))
      }
    } catch (e) {
      if (!c.signal.aborted) setErr(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }
  const L = computeLabels(p)
  useAuto()
  const shown = (id: Id): Result | undefined => results[id] ?? (() => { const r = freshReview(p, L, id); return r && { review: r } })()
  return (
    <div className="review-run">
      <div className="toolbar">
        <button className="primary" disabled={busy || ids.length === 0} onClick={run}><Icon name="sparkle" /> Review {ids.length} {KIND_NAMES[kind].toLowerCase()}{ids.length === 1 ? '' : 's'}</button>
        {busy && <button onClick={() => ac.current?.abort()}><Icon name="x" /> Stop</button>}
        <span className="hint">{settings.model} · flagged at ≥{Math.round(FAIL * 100)}%, fine at ≤{Math.round(PASS * 100)}%</span>
      </div>
      {err && <p className="note-warn"><Icon name="warn" /> {err}</p>}
      {ids.filter((id) => shown(id)).map((id) => (
        <ItemResult key={id} id={id} label={L[id]} title={ids.length > 1 ? p.items[id].title : undefined} result={shown(id)!} />
      ))}
      {busy && <p className="hint">Asking the model…</p>}
    </div>
  )
}

/** Compact review for the selected item (used in the details panel). */
export function ReviewItem({ it }: { it: Item }) {
  const [settings, setSettings] = useState(loadLlm)
  const [open, setOpen] = useState(false)
  if (!REVIEW_KINDS.includes(it.kind)) return null
  return (
    <div className="review-box">
      <button onClick={() => setOpen(!open)}><Icon name="sparkle" /> AI review {open ? '▾' : '▸'}</button>
      {open && (
        <>
          <Settings value={settings} onChange={setSettings} />
          <ReviewRunner kind={it.kind} ids={[it.id]} settings={settings} />
        </>
      )}
    </div>
  )
}

export function ReviewView() {
  const p = useProject()
  const [settings, setSettings] = useState(loadLlm)
  const [kind, setKind] = useState<Kind>('hazard')
  const items = itemsOfKind(p, kind)
  return (
    <div className="page">
      <h2>AI review <span className="hint">decision model via Ollama</span></h2>
      <p className="hint">For each artifact a local decision model estimates how likely it is that a common mistake from the STPA Handbook is present (e.g. a component failure in a hazard). The percentages are the model's probabilities, not verdicts – always judge them yourself.</p>
      <Settings value={settings} onChange={setSettings} />
      <div className="tabs">
        {REVIEW_KINDS.map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{KIND_NAMES[k]}s <i>{itemsOfKind(p, k).length}</i></button>
        ))}
      </div>
      <ReviewRunner kind={kind} ids={items.map((i) => i.id)} settings={settings} />
    </div>
  )
}

export { defaultLlm }

const useAuto = () => useSyncExternalStore(subscribe, getAuto, getAuto)

/** Runs the checks in the background whenever the project changes (debounced), if switched on. */
export function useAutoReview() {
  const p = useProject()
  const { enabled } = useAuto()
  useEffect(() => {
    if (!enabled) return
    const ac = new AbortController()
    const t = setTimeout(() => void reviewStale(p, ac.signal), 1500)
    return () => { clearTimeout(t); ac.abort() }
  }, [p.items, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function AutoReviewToggle() {
  const { enabled, busy, error } = useAuto()
  return (
    <button className={enabled ? 'on' : ''} onClick={() => setAutoEnabled(!enabled)}
      title={error ? `Auto review failed: ${error}` : enabled ? 'Checks run in the background after edits (click to switch off)' : 'Run the AI checks in the background after edits'}>
      <Icon name={error ? 'warn' : 'sparkle'} /> Auto review {enabled ? (busy ? '…' : 'on') : 'off'}
    </button>
  )
}

/** Small verdict marker for an item in a list; nothing until the background checks have produced a current result. */
export function ReviewDot({ id }: { id: Id }) {
  const p = useProject()
  const L = useLabels()
  useAuto()
  const r = freshReview(p, L, id)
  if (!r || r.verdict === 'pass') return null
  const bad = r.checks.filter((c) => c.verdict !== 'pass').map((c) => c.label).join('; ')
  return <ItemHover id={id}><span className={'review-dot ' + r.verdict} aria-label={`${VERDICT_TEXT[r.verdict]}: ${bad}`}>●</span></ItemHover>
}
