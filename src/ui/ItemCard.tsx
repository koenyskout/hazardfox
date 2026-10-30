import { ChipLabel, Icon, LayerTag } from './Icon'
import { useStore } from '../model/store'
import { Fragment, type ReactNode } from 'react'
import { effectiveLosses, hazardTrace, upstream } from '../model/derived'
import { byLabel, DELETED } from '../model/labels'
import { incoming, refsOf } from '../model/refs'
import { isRef, parseRich } from '../model/richtext'
import { children } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { validate } from '../model/validate'
import { freshReview } from '../llm/auto'
import { HoverCard } from './HoverCard'
import { CAUSE_LABELS, GUIDE_WORD_LABELS, KIND_NAMES, type Id, type Item, type Kind, type Labels, type Project } from '../model/types'
import { describeStates } from '../model/variables'
import { VARIABLE_TYPE_LABELS, type VariableLayer } from '../model/types'

const MAX_PER_KIND = 5
type Go = (id: Id) => void
interface Ctx { p: Project; labels: Labels; go: Go }

/** Items grouped by kind, ordered by label. */
function group(p: Project, labels: Labels, ids: Iterable<Id>): [Kind, Id[]][] {
  const by = new Map<Kind, Id[]>()
  for (const id of new Set(ids)) {
    const it = p.items[id]
    if (it) by.set(it.kind, [...(by.get(it.kind) ?? []), id])
  }
  return [...by].map(([k, v]) => [k, v.sort(byLabel(labels))] as [Kind, Id[]])
}

export function ChipLink({ id, p, labels, go }: { id: Id } & Ctx) {
  const it = p.items[id]
  if (!it) return <span className="chip dead">{DELETED}</span>
  return (
    <HoverCard card={() => <ItemCard it={it} p={p} labels={labels} go={go} />}>
      <a href="#" className={'chip k-' + it.kind} onClick={(e) => { e.preventDefault(); go(id) }}><ChipLabel it={it} label={labels[id]} /></a>
    </HoverCard>
  )
}

const Chips = ({ ids, c }: { ids: Id[]; c: Ctx }) => (
  <span className="hc-chips">
    {ids.slice(0, MAX_PER_KIND + 3).map((i) => <ChipLink key={i} id={i} {...c} />)}
    {ids.length > MAX_PER_KIND + 3 && <span className="muted">+{ids.length - MAX_PER_KIND - 3}</span>}
  </span>
)

/** Rich text with `@[id]` references as chips. */
function Mentions({ text, c }: { text: string; c: Ctx }) {
  return (
    <>
      {parseRich(text).map((segs, k) => (
        <Fragment key={k}>
          {k > 0 && <br />}
          {segs.map((s, i) => isRef(s) ? <ChipLink key={i} id={s.id} {...c} /> : s.bold || s.italic ? <span key={i} style={{ fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined }}>{s.text}</span> : <Fragment key={i}>{s.text}</Fragment>)}
        </Fragment>
      ))}
    </>
  )
}

function Section({ title, children: kids }: { title?: string; children: ReactNode }) {
  return (
    <div className="hc-sec">
      {title && <div className="hc-head">{title}</div>}
      {kids}
    </div>
  )
}

const Row = ({ k, children: v }: { k: string; children: ReactNode }) => (
  <>
    <span className="hc-kind">{k}</span>
    <span className="hc-val">{v}</span>
  </>
)

const Badge = ({ children: t, tone }: { children: ReactNode; tone?: 'warn' }) => <span className={'hc-badge' + (tone ? ' ' + tone : '')}>{t}</span>

const OWNER_ROW: Record<VariableLayer, string> = { domain: 'Of', signal: 'Carried by', belief: 'Belief of', internal: 'Internal to' }

const list = (xs: string[], max = 4) => (xs.length ? xs.slice(0, max).join(', ') + (xs.length > max ? ` +${xs.length - max}` : '') : '')

/** Kind-specific badges (shown next to the kind) and fact rows. */
function facts(it: Item, c: Ctx): { badges: ReactNode[]; rows: ReactNode[] } {
  const { p } = c
  const badges: ReactNode[] = []
  const rows: ReactNode[] = []
  const row = (k: string, v: ReactNode) => v && rows.push(<Row key={k} k={k}>{v}</Row>)
  switch (it.kind) {
    case 'hazard':
      if (it.security) badges.push(<Badge key="s" tone="warn">Security</Badge>)
      break
    case 'requirement':
      badges.push(<Badge key="t">{it.type}</Badge>)
      break
    case 'node':
      badges.push(<Badge key="r">{it.role}</Badge>)
      row('Contains', children(p, it.id, 'node').length ? <Chips ids={children(p, it.id, 'node').map((n) => n.id)} c={c} /> : null)
      break
    case 'ca': {
      row('Operation', it.operation ? it.operation.split(':').slice(1).join(':') : null)
      row('Duration', it.duration)
      row('Actuator', it.actuator)
      row('Not applicable', it.notApplicable.length ? it.notApplicable.map((n) => GUIDE_WORD_LABELS[n.guide] + (n.reason ? ` (${n.reason})` : '')).join('; ') : null)
      break
    }
    case 'feedback':
      row('Sensor', it.sensor)
      break
    case 'uca':
      badges.push(<Badge key="g">{GUIDE_WORD_LABELS[it.guide]}</Badge>)
      row('Constraint', it.constraint)
      row('Context', it.context && <Mentions text={it.context} c={c} />)
      break
    case 'scenario': {
      badges.push(<Badge key="s">{it.scenarioType === 'uca' ? 'UCA scenario' : 'CA scenario'}</Badge>)
      if (it.adversarial) badges.push(<Badge key="a" tone="warn">Adversarial</Badge>)
      row('Explains', it.scenarioType === 'uca' ? it.uca && <ChipLink id={it.uca} {...c} /> : it.ca && <ChipLink id={it.ca} {...c} />)
      row('Cause', it.cause ? CAUSE_LABELS[it.cause] : null)
      row('Element', it.element && <ChipLink id={it.element} {...c} />)
      row('STRIDE', list(it.stride))
      row('Threat', it.threat)
      row('Risk', it.severity && it.likelihood ? `severity ${it.severity} × likelihood ${it.likelihood} = ${it.severity * it.likelihood}` : null)
      break
    }
    case 'entity':
      row('Operations', list(it.operations))
      break
    case 'variable': {
      badges.push(<Badge key="l"><LayerTag layer={it.layer} /></Badge>)
      const owner = it.parent && p.items[it.parent]
      if (owner) row(OWNER_ROW[it.layer], <><ChipLink id={owner.id} {...c} /> {owner.title}</>)
      row('About', it.about && <ChipLink id={it.about} {...c} />)
      row('Type', VARIABLE_TYPE_LABELS[it.type].split(' (')[0])
      row('States', it.type === 'enum' ? list(it.states, 6) : describeStates(it))
      break
    }
    default:
  }
  return { badges, rows }
}

function Review({ it, c }: { it: Item; c: Ctx }) {
  const { p, labels } = c
  const issues = validate(p).filter((i) => i.item === it.id)
  const r = freshReview(p, labels, it.id)
  const bad = r?.checks.filter((k) => k.verdict !== 'pass') ?? []
  if (!issues.length && !r) return null
  return (
    <Section title="Quality">
      {issues.slice(0, 3).map((i, n) => <div key={n} className={'hc-issue ' + i.severity}>{i.message.replace(/^[^:]*: /, '')}</div>)}
      {issues.length > 3 && <div className="muted">+{issues.length - 3} more findings</div>}
      {r && (bad.length === 0
        ? <div className="hc-issue ok">AI review: looks fine</div>
        : bad.map((k) => <div key={k.id} className={'hc-issue ' + (k.verdict === 'fail' ? 'warning' : 'info')}>AI: {k.label} ({Math.round(k.p * 100)}%)</div>))}
    </Section>
  )
}

export function ItemCard({ it, p, labels, go }: { it: Item } & Ctx) {
  const c: Ctx = { p, labels, go }
  const openEditor = useStore((s) => s.openEditor)
  const edge = it.kind === 'ca' || it.kind === 'feedback' || it.kind === 'relationship' ? it : null
  const ends = edge ? [edge.from, edge.to] : []
  const refs = [...(it.parent ? [it.parent] : []), ...refsOf(it), ...(it.kind === 'hazard' ? effectiveLosses(p, it.id) : [])]
  const shown = it.kind === 'variable' ? [it.parent, it.about] : ends
  const out = group(p, labels, refs.filter((i) => i !== it.id && !shown.includes(i)))
  const inc = group(p, labels, incoming(p, it.id).map((o) => o.id))
  const title = it.title || (it.kind === 'uca' ? generateUcaText(p, labels, it) : '')
  const { badges, rows } = facts(it, c)
  const up = it.kind === 'hazard' ? null : upstream(p, it)
  const down = it.kind === 'hazard' ? hazardTrace(p, it.id) : null
  const downText = down && [['constraint', down.constraints], ['UCA', down.ucas], ['scenario', down.scenarios], ['requirement', down.requirements]]
    .filter(([, xs]) => (xs as unknown[]).length).map(([n, xs]) => `${(xs as unknown[]).length} ${n}${(xs as unknown[]).length > 1 ? 's' : ''}`).join(' · ')
  const linkRows = (title: string, groups: [Kind, Id[]][]) => groups.length > 0 && (
    <Section title={title}>
      {groups.map(([k, ids]) => (
        <Row key={k} k={KIND_NAMES[k] + (ids.length > 1 ? 's' : '')}><Chips ids={ids} c={c} /></Row>
      ))}
    </Section>
  )
  return (
    <>
      <div className="hc-top">
        <span className={'chip k-' + it.kind}><ChipLabel it={it} label={labels[it.id]} /></span>
        <span className="hc-type">{KIND_NAMES[it.kind]}</span>
        <span className="hc-badges">
          {badges}
          <span className={'hc-badge st-' + it.status}><Icon name={it.status} size={12} /> {it.status}</span>
          <button className="hc-edit" title="Edit" onClick={() => openEditor(it.id)}><Icon name="draft" size={13} /></button>
        </span>
      </div>
      <div className="hc-title">{title || <span className="muted">(untitled)</span>}</div>
      {it.description.trim() && <div className="hc-desc"><Mentions text={it.description.trim()} c={c} /></div>}
      {it.tags.length > 0 && <div className="hc-tags">{it.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
      {(rows.length > 0 || edge) && (
        <Section>
          {edge && ends.map((id, n) => (
            <Row key={n} k={n ? 'To' : 'From'}>
              <ChipLink id={id} {...c} /> {p.items[id]?.title}
              {edge.kind === 'relationship' && <span className="muted"> {n ? edge.toCard : edge.fromCard}</span>}
            </Row>
          ))}
          {rows}
        </Section>
      )}
      {up && (up.hazards.length > 0 || up.losses.length > 0) && (
        <Section title="Traces to">
          {up.hazards.length > 0 && <Row k="Hazards"><Chips ids={up.hazards} c={c} /></Row>}
          {up.losses.length > 0 && <Row k="Losses"><Chips ids={up.losses} c={c} /></Row>}
        </Section>
      )}
      {downText && <Section title="Traces down"><Row k="Derived">{downText}</Row></Section>}
      {linkRows('Refers to', out)}
      {linkRows('Referenced by', inc)}
      {it.notes.trim() && <Section title="Notes"><div className="hc-desc"><Mentions text={it.notes.trim()} c={c} /></div></Section>}
      <Review it={it} c={c} />
      {!out.length && !inc.length && !ends.length && <div className="hc-sec muted">Not linked to anything yet.</div>}
    </>
  )
}

/** One-line description of what an item is or links to, for lists and pickers. */
export function summary(p: Project, labels: Labels, it: Item): string {
  const l = (id: Id | null) => (id && labels[id]) || ''
  const ls = (ids: Id[]) => ids.map((i) => labels[i]).filter(Boolean).join(', ')
  switch (it.kind) {
    case 'hazard': return ls(effectiveLosses(p, it.id)) && '→ ' + ls(effectiveLosses(p, it.id))
    case 'constraint': return ls(it.hazards) && 'prevents ' + ls(it.hazards)
    case 'requirement': return `${it.type}${it.sources.length ? ' from ' + ls(it.sources) : ''}`
    case 'assumption': return ls(it.about) && 'about ' + ls(it.about)
    case 'node': return it.role
    case 'ca': case 'feedback': case 'relationship': return `${l(it.from)} → ${l(it.to)}`
    case 'variable': return it.parent ? 'of ' + (p.items[it.parent]?.title.trim() || l(it.parent)) : ''
    case 'uca': return `${GUIDE_WORD_LABELS[it.guide]} · ${l(it.ca)}`
    case 'scenario': return (it.scenarioType === 'uca' ? l(it.uca) : l(it.ca)) + (it.cause ? ' · ' + CAUSE_LABELS[it.cause] : '')
    default: return ''
  }
}
