import { useMemo, useState } from 'react'
import { CHECKS } from '../llm/review'
import { useStore } from '../model/store'
import { computeLabels, renderText } from '../model/labels'
import { generateUcaText } from '../model/uca'
import { KIND_NAMES, type Id, type Kind } from '../model/types'
import { RULES, SEVERITIES, validate, type RuleId, type Severity } from '../model/validate'
import { Ref, VIEW_OF } from './Fields'
import { addItem, commit, useProject } from './hooks'
import { askConfirm } from './dialogs'
import { addBelief } from '../model/formal'
import { updateItem } from '../model/ops'
import { draftTrace } from '../model/traces'
import { Icon, type IconName } from './Icon'
import { AiStatus, ReviewView, useAiFindings } from './Review'

const SEV_ICON: Record<Severity, IconName> = { error: 'error', warning: 'warn', info: 'info' }
export const SevIcon = ({ s, size }: { s: Severity; size?: number }) => <span className={'sev-ico sev-' + s} title={s}><Icon name={SEV_ICON[s]} size={size} /></span>

interface Finding {
  severity: Severity
  /** groups findings of the same kind */
  group: string
  title: string
  why: string
  fix: string
  item: Id
  kind: Kind
  rule?: RuleId
  related?: Id[]
  detail?: string
  /** AI check probability */
  p?: number
}
interface Group { key: string; severity: Severity; title: string; why: string; fix: string; ai: boolean; rows: Finding[] }

const pct = (p: number) => Math.round(p * 100)

/** One-click repairs for findings where the missing piece can be created right away. */
const ACTIONS: Partial<Record<RuleId, { label: string; run: (id: Id, related: Id[]) => void }>> = {
  'context-unrepresented': { label: 'Add belief', run: (id, [w]) => commit((p) => { const u = p.items[id], ca = u?.kind === 'uca' ? p.items[u.ca] : null; return ca?.kind === 'ca' && w ? addBelief(p, ca.from, w).project : p }) },
  'signal-unused': { label: 'Add belief', run: (id) => commit((p) => { const v = p.items[id], fb = v?.kind === 'variable' && v.parent ? p.items[v.parent] : null; return fb?.kind === 'feedback' && v?.kind === 'variable' && v.about ? addBelief(p, fb.to, v.about).project : p }) },
  'trace-no-witness': { label: 'Redraft trace', run: async (id) => { if (await askConfirm('The trace is replaced by a drafted one.', { title: 'Redraft trace?', confirm: 'Replace' })) commit((p) => { const s = p.items[id]; return s?.kind === 'scenario' ? updateItem(p, id, { trace: draftTrace(p, s) }) : p }) } },
  'hazard-no-constraint': { label: 'Add constraint', run: (id) => { const n = addItem('constraint', { hazards: [id] }); useStore.getState().goto('step1', n) } },
  'uca-no-scenario': { label: 'Add scenario', run: (id) => { const n = addItem('scenario', { scenarioType: 'uca', uca: id }); useStore.getState().goto('scenarios', n) } },
  'ca-no-scenarios': { label: 'Add scenario', run: (id) => { const n = addItem('scenario', { scenarioType: 'ca', ca: id }); useStore.getState().goto('scenarios', n) } },
}

function FindingRow({ f, showItem = true }: { f: Finding; showItem?: boolean }) {
  const p = useProject()
  const goto = useStore((s) => s.goto)
  const it = p.items[f.item]
  const text = useMemo(() => { if (it.kind !== 'uca') return it.title; const L = computeLabels(p); return renderText(L, generateUcaText(p, L, it)) }, [p, it])
  const action = f.rule && ACTIONS[f.rule]
  return (
    <li className="finding-row">
      {showItem && <><Ref id={f.item} /> <span className="ftitle">{text || <i className="muted">untitled</i>}</span></>}
      {f.related && f.related.length > 0 && <span className="reflist">links to {f.related.map((r) => <Ref key={r} id={r} />)}</span>}
      {f.detail && <span className="muted">{f.detail}</span>}
      {f.p !== undefined && (
        <span className="meter" title={`Probability that this mistake is present: ${pct(f.p)}%`}><i style={{ width: `${pct(f.p)}%` }} /></span>
      )}
      {f.p !== undefined && <span className="pct">{pct(f.p)}%</span>}
      <span className="spacer" />
      {action && <button onClick={() => action.run(f.item, f.related ?? [])}><Icon name="plus" size={13} /> {action.label}</button>}
      <button onClick={() => goto(VIEW_OF[it.kind], it.id)}>Open</button>
    </li>
  )
}

function Explain({ why, fix }: { why: string; fix: string }) {
  return (
    <dl className="explain">
      <dt>What is wrong</dt><dd>{why}</dd>
      <dt>How to improve</dt><dd>{fix}</dd>
    </dl>
  )
}

export function Validation({ details }: { details?: boolean }) {
  const p = useProject()
  const rules = useMemo(() => validate(p), [p])
  const ai = useAiFindings()
  const [sev, setSev] = useState<'all' | Severity>('all')
  const [by, setBy] = useState<'rule' | 'element'>('rule')
  const [showDetails, setShowDetails] = useState(!!details)

  const findings = useMemo(() => {
    const out: Finding[] = []
    for (const i of rules) {
      if (!i.item || !p.items[i.item] || !i.rule) continue
      const r = RULES[i.rule]
      out.push({ severity: i.severity, group: i.rule, title: r.title, why: r.why, fix: r.fix, item: i.item, kind: p.items[i.item].kind, rule: i.rule, related: i.related?.filter((x) => p.items[x]), detail: i.rule === 'ca-na-conflict' ? i.message.split(': ').slice(1).join(': ') : undefined })
    }
    for (const a of ai)
      for (const c of a.review.checks) {
        if (c.verdict === 'pass') continue
        const ch = (CHECKS[a.kind] ?? []).find((x) => x.id === c.id)
        out.push({ severity: c.verdict === 'fail' ? 'warning' : 'info', group: `ai:${a.kind}:${c.id}`, title: `Wording: ${c.label}`, why: ch?.ask ?? c.ask, fix: ch?.fix ?? '', item: a.item, kind: a.kind, p: c.p })
      }
    return out
  }, [rules, ai, p.items])

  const shown = findings.filter((f) => sev === 'all' || f.severity === sev)
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length
  const rank = (s: Severity) => SEVERITIES.indexOf(s)

  const groups = useMemo(() => {
    const m = new Map<string, Group>()
    for (const f of shown) {
      const key = by === 'rule' ? f.group : f.item
      let g = m.get(key)
      if (!g) m.set(key, (g = { key, severity: f.severity, title: f.title, why: f.why, fix: f.fix, ai: f.p !== undefined, rows: [] }))
      if (rank(f.severity) < rank(g.severity)) g.severity = f.severity
      g.rows.push(f)
    }
    return [...m.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || b.rows.length - a.rows.length)
  }, [shown, by]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <h2>Validation <small className="muted">{findings.length} finding(s)</small></h2>
      <AiStatus />
      <div className="tabs">
        <button className={!showDetails ? 'on' : ''} onClick={() => setShowDetails(false)}>Findings</button>
        <button className={showDetails ? 'on' : ''} onClick={() => setShowDetails(true)}>AI review details &amp; rewrites</button>
      </div>
      {showDetails ? <ReviewView embedded /> : (
        <>
          <div className="sev-tiles">
            {SEVERITIES.map((s) => (
              <button key={s} className={`sev-tile sev-${s}` + (sev === s ? ' on' : '')} onClick={() => setSev(sev === s ? 'all' : s)} title={sev === s ? 'Show all' : `Show only ${s}s`}>
                <SevIcon s={s} size={20} /><b>{count(s)}</b><span>{s === 'info' ? 'hints' : s + 's'}</span>
              </button>
            ))}
            <span className="spacer" />
            <span className="hint">Group by</span>
            <span className="tabs inline">
              <button className={by === 'rule' ? 'on' : ''} onClick={() => setBy('rule')}>Problem</button>
              <button className={by === 'element' ? 'on' : ''} onClick={() => setBy('element')}>Element</button>
            </span>
          </div>
          {groups.length === 0 && <p className="empty">{findings.length ? 'Nothing at this level.' : 'Nothing to report.'}</p>}
          {groups.map((g) => (
            <details key={g.key} className={'finding-group sev-' + g.severity} open={groups.length <= 6 || g.severity !== 'info'}>
              <summary>
                <SevIcon s={g.severity} />
                {by === 'rule' ? <b>{g.title}</b> : <><Ref id={g.key} /> <b>{p.items[g.key].title || (p.items[g.key].kind === 'uca' ? '' : 'untitled')}</b> <small className="muted">{KIND_NAMES[p.items[g.key].kind]}</small></>}
                {g.ai && by === 'rule' && <span className="ai-tag" title="From the AI review: a hint, not a verdict">AI</span>}
                <span className="count">{g.rows.length}</span>
              </summary>
              {by === 'rule' ? (
                <>
                  <Explain why={g.why} fix={g.fix} />
                  <ul className="finding-rows">{g.rows.map((f, n) => <FindingRow key={n} f={f} />)}</ul>
                </>
              ) : (
                <ul className="finding-rows">
                  {g.rows.map((f, n) => (
                    <li key={n} className="finding-el">
                      <div className="finding-row">
                        <SevIcon s={f.severity} /><b>{f.title}</b>
                        {f.p !== undefined && <span className="ai-tag" title="From the AI review">AI {pct(f.p)}%</span>}
                        {f.related && f.related.length > 0 && <span className="reflist">links to {f.related.map((r) => <Ref key={r} id={r} />)}</span>}
                        {f.detail && <span className="muted">{f.detail}</span>}
                        <span className="spacer" />
                        {f.rule && ACTIONS[f.rule] && <button onClick={() => ACTIONS[f.rule!]!.run(f.item, f.related ?? [])}><Icon name="plus" size={13} /> {ACTIONS[f.rule]!.label}</button>}
                      </div>
                      <Explain why={f.why} fix={f.fix} />
                    </li>
                  ))}
                  <li><button onClick={() => useStore.getState().goto(VIEW_OF[p.items[g.key].kind], g.key)}>Open element</button></li>
                </ul>
              )}
            </details>
          ))}
        </>
      )}
    </div>
  )
}
