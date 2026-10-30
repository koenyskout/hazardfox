import { useState } from 'react'
import { EXAMPLES } from '../llm/handbook'
import { CHECKS, PRIMERS, REVIEW_KINDS, WRITE_GUIDE, type Check } from '../llm/review'
import { KIND_NAMES, type Kind } from '../model/types'
import { Icon } from './Icon'
import { Modal } from './Modal'

/** What a check means: the question put to the model and how to repair a text that fails it. */
export function CheckHelp({ check }: { check: Check }) {
  return (
    <div className="check-help">
      <div><b>Question:</b> {check.ask}</div>
      <div><b>How to fix:</b> {check.fix}</div>
    </div>
  )
}

/** Criteria, best practice and Handbook examples for one kind of artifact (all derived from the checks the review uses). */
export function CriteriaPanel({ kind }: { kind: Kind }) {
  const primer = (PRIMERS[kind] ?? '').split('\n')
  const examples = EXAMPLES.filter((e) => e.kind === kind)
  const label = (id: string) => (CHECKS[kind] ?? []).find((c) => c.id === id)?.label
  return (
    <div className="criteria">
      <h4>Background (STPA Handbook)</h4>
      {primer.map((l, i) => <p key={i}>{l}</p>)}
      {WRITE_GUIDE[kind] && <><h4>What a good {KIND_NAMES[kind].toLowerCase()} looks like</h4><p>{WRITE_GUIDE[kind]}</p></>}
      <h4>Criteria checked</h4>
      <ul>
        {(CHECKS[kind] ?? []).map((c) => (
          <li key={c.id}><b>{c.label}</b><CheckHelp check={c} /></li>
        ))}
      </ul>
      {examples.length > 0 && (
        <>
          <h4>Examples</h4>
          <ul className="examples">
            {examples.map((e) => (
              <li key={e.id} className={e.good ? 'good' : 'bad'}>
                <span className="mark">{e.good ? '✓' : '✗'}</span> {e.text}
                <small className="muted"> – {e.source}{!e.good && e.flaws?.length ? `; ${e.flaws.map(label).filter(Boolean).join(', ')}` : ''}</small>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="hint">The AI review asks these questions with a small local model; the percentages are hints, never verdicts. Source: STPA Handbook (Leveson &amp; Thomas, 2018).</p>
    </div>
  )
}

/** Button that opens the criteria dialog, starting at `kind`. */
export function CriteriaButton({ kind, label = 'Criteria & best practices' }: { kind?: Kind; label?: string }) {
  const [open, setOpen] = useState(false)
  const [k, setK] = useState<Kind>(kind ?? 'hazard')
  return (
    <>
      <button onClick={() => { if (kind) setK(kind); setOpen(true) }}><Icon name="info" /> {label}</button>
      {open && (
        <Modal title="Review criteria & best practices" wide onClose={() => setOpen(false)}>
          <div className="tabs">
            {REVIEW_KINDS.map((x) => <button key={x} className={k === x ? 'on' : ''} onClick={() => setK(x)}>{KIND_NAMES[x]}s</button>)}
          </div>
          <CriteriaPanel kind={k} />
        </Modal>
      )}
    </>
  )
}
