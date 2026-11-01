import { effectiveLosses, hazardTrace, scenarioHazards } from '../model/derived'
import { byLabel, computeLabels, DELETED, renderText } from '../model/labels'
import { operationsOf } from '../model/operations'
import { scenarioTarget } from '../model/refs'
import { flatten, itemsOfKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { paramSummary } from '../model/params'
import { describeStates, whenText, whenTexts } from '../model/variables'
import { beliefsOf, controlledBy, signalsOf, variablesIn } from '../model/formal'
import { CAUSE_LABELS, GUIDE_WORD_LABELS, LAYER_SHORT, TRACE_EVENT_LABELS, type Id, type Item, type Kind, type Project, type Status } from '../model/types'

export const SECTIONS = [
  ['summary', 'Summary'],
  ['step1', 'Losses, hazards, system constraints'],
  ['domain', 'Domain model'],
  ['structure', 'Control structure'],
  ['ucas', 'Unsafe control actions'],
  ['scenarios', 'Loss scenarios'],
  ['requirements', 'Requirements & mitigations'],
  ['assumptions', 'Assumptions'],
  ['trace', 'Traceability'],
] as const
export type SectionKey = (typeof SECTIONS)[number][0]

export interface ExportOptions {
  sections: SectionKey[]
  statuses: Status[]
  tag: string
}
export const defaultOptions = (): ExportOptions => ({ sections: SECTIONS.map((s) => s[0]), statuses: ['draft', 'review', 'approved'], tag: '' })

export interface Table {
  section: SectionKey
  name: string
  columns: string[]
  rows: string[][]
  /** Relative column weights for Word */
  widths?: number[]
}

/** Build all report tables with resolved, current labels – shared by the Word and Excel exports. */
export function buildTables(p: Project, o: ExportOptions): Table[] {
  const L = computeLabels(p)
  const T = (t: string) => renderText(L, t)
  const lab = (ids: Id[]) => ids.map((i) => L[i] ?? DELETED).join(', ')
  const name = (id: Id) => (id && p.items[id] ? `${L[id]} ${p.items[id].title}`.trim() : '')
  const keep = (it: Item) => o.statuses.includes(it.status) && (!o.tag || it.tags.includes(o.tag))
  const common = (it: Item) => [L[it.id], it.title]
  const tail = (it: Item) => [T(it.description), it.status, it.tags.join(', '), T(it.notes)]
  const tailH = ['Description', 'Status', 'Tags', 'Notes']
  const tree = <K extends Kind>(kind: K) => flatten(p, kind).filter(({ item }) => keep(item))
  const flat = <K extends Kind>(kind: K) => itemsOfKind(p, kind).sort((a, b) => a.rank - b.rank).filter(keep)
  const out: Table[] = []
  const push = (section: SectionKey, name: string, columns: string[], rows: string[][], widths?: number[]) => out.push({ section, name, columns, rows, widths })

  push('step1', 'Losses', ['ID', 'Loss', ...tailH], tree('loss').map(({ item }) => [...common(item), ...tail(item)]), [1, 3, 5, 1.2, 1.5, 3])
  push('step1', 'Hazards', ['ID', 'Hazard', 'Losses', 'State variables', 'Condition', 'Security', ...tailH], tree('hazard').map(({ item }) => [...common(item), lab(effectiveLosses(p, item.id)), lab(item.variables), T(whenTexts(p, item.conditions).join(' and ')), item.security ? 'yes' : '', ...tail(item)]), [1, 3, 1.3, 1.5, 2.5, 1, 4, 1.2, 1.5, 2.5])
  push('step1', 'System constraints', ['ID', 'Constraint', 'Hazards', ...tailH], tree('constraint').map(({ item }) => [...common(item), lab(item.hazards), ...tail(item)]), [1, 3, 1.3, 4, 1.2, 1.5, 2.5])

  push('domain', 'Entities', ['ID', 'Entity', 'Variables', 'Operations', 'Description', 'Status', 'Tags'],
    tree('entity').map(({ item: e }) => [...common(e), itemsOfKind(p, 'variable').filter((v) => v.parent === e.id).map((v) => v.title).join('\n'), operationsOf(p, e.id).map((o) => o.title).join('\n'), T(e.description), e.status, e.tags.join(', ')]))
  push('domain', 'Variables', ['ID', 'Variable', 'Layer', 'Owner', 'About', 'States', 'Definition', 'Computed from', 'Description', 'Status'],
    itemsOfKind(p, 'variable').sort(byLabel(L)).filter(keep).map((v) => [...common(v), LAYER_SHORT[v.layer], name(v.parent as Id), v.about ? name(v.about) : '', describeStates(v), T(v.definition), v.rules.map((r) => `${r.state} when ${T(whenText(p, r.when))}`).concat(v.rules.length && v.otherwise ? [`otherwise ${v.otherwise}`] : []).join('\n'), T(v.description), v.status]))
  push('domain', 'Variable map', ['World variable', 'Observed by (signals)', 'Believed by (process models)', 'Controlled by'],
    itemsOfKind(p, 'variable').filter((v) => v.layer === 'domain').sort(byLabel(L)).filter(keep).map((v) => {
      const about = itemsOfKind(p, 'variable').filter((x) => x.about === v.id)
      const of = (layer: string) => about.filter((x) => x.layer === layer).map((x) => `${L[x.id]} ${p.items[x.parent ?? '']?.title ?? ''}.${x.title}`).join('\n')
      return [name(v.id), of('signal'), of('belief'), lab(controlledBy(p, v.id).map((c) => c.id))]
    }))
  push('domain', 'Relationships', ['ID', 'Name', 'From', 'To', 'Cardinality'], flat('relationship').map((r) => [...common(r), name(r.from), name(r.to), `${r.fromCard} : ${r.toCard}`]))

  const titles = (vs: { title: string }[]) => vs.map((v) => v.title).join(', ')
  push('structure', 'Control structure elements', ['ID', 'Element', 'Role', 'Parent', 'Domain entities', 'Process model', 'Internal state', 'Description', 'Status'],
    tree('node').map(({ item: n }) => [...common(n), n.role, n.parent ? name(n.parent) : '', n.entities.map(name).join(', '), titles(beliefsOf(p, n.id)), titles(variablesIn(p, 'internal', n.id)), T(n.description), n.status]))
  push('structure', 'Control actions', ['ID', 'Control action', 'From', 'To', 'Actuator', 'Parameters', 'Affects', 'Description', 'Status'], flat('ca').map((c) => [...common(c), name(c.from), name(c.to), c.actuator, c.params.map((x) => paramSummary(p, x)).join('; '), lab(c.affects), T(c.description), c.status]))
  push('structure', 'Feedback', ['ID', 'Feedback', 'From', 'To', 'Sensor', 'Signals', 'Description', 'Status'], flat('feedback').map((c) => [...common(c), name(c.from), name(c.to), c.sensor, titles(signalsOf(p, c.id)), T(c.description), c.status]))

  push('ucas', 'Unsafe control actions', ['ID', 'Control action', 'Type', 'Unsafe control action', 'Hazards', 'Controller constraint', 'Status', 'Tags'],
    flat('uca').sort(byLabel(L)).map((u) => [L[u.id], name(u.ca), GUIDE_WORD_LABELS[u.guide], generateUcaText(p, L, u), lab(u.hazards), T(u.constraint), u.status, u.tags.join(', ')]), [1, 2, 1.6, 4, 1.3, 3, 1, 1.2])
  push('scenarios', 'Loss scenarios', ['ID', 'Type', 'Applies to', 'Cause', 'Scenario', 'Hazards', 'Adversarial', 'STRIDE', 'Threat', 'Severity', 'Likelihood', 'Risk', 'Status'],
    flat('scenario').sort(byLabel(L)).map((s) => [L[s.id], s.scenarioType === 'ca' ? 'Control action not executed properly' : 'Unsafe control action', L[scenarioTarget(s) ?? ''] ?? '', s.cause ? CAUSE_LABELS[s.cause] : '', s.title + (s.description ? '\n' + T(s.description) : ''), lab(scenarioHazards(p, s)), s.adversarial ? 'yes' : '', s.stride.join(', '), T(s.threat), s.severity ? String(s.severity) : '', s.likelihood ? String(s.likelihood) : '', s.severity && s.likelihood ? String(s.severity * s.likelihood) : '', s.status]), [1, 1.4, 1, 2, 4, 1.2, 1, 2, 3, 1, 1, 0.8, 1])
  push('scenarios', 'Scenario traces', ['Scenario', 'Step', 'Events', 'State changes', 'Note'],
    flat('scenario').sort(byLabel(L)).flatMap((s) => s.trace.steps.map((st, i) => [i ? '' : L[s.id], st.t || String(i), st.events.map((e) => `${L[e.on] ?? DELETED} ${TRACE_EVENT_LABELS[e.what]}`).join('\n'), Object.entries(st.values).map(([k, x]) => `${L[k] ?? DELETED} ${p.items[k]?.title ?? ''} = ${x}`).join('\n'), T(st.note)])), [1, 0.8, 2, 3, 4])
  push('requirements', 'Requirements & mitigations', ['ID', 'Requirement', 'Type', 'Derived from', ...tailH], tree('requirement').map(({ item }) => [...common(item), item.type, lab(item.sources), ...tail(item)]))
  push('assumptions', 'Assumptions', ['ID', 'Assumption', 'About', ...tailH], flat('assumption').map((a) => [...common(a), lab(a.about), ...tail(a)]))

  // trace
  push('trace', 'Traceability per hazard', ['Hazard', 'Losses', 'Constraints', 'UCAs', 'Scenarios', 'Requirements'],
    flatten(p, 'hazard').map(({ item }) => {
      const t = hazardTrace(p, item.id)
      const ids = (xs: { id: Id }[]) => lab(xs.map((x) => x.id))
      return [name(item.id), lab(t.losses), ids(t.constraints), ids(t.ucas), ids(t.scenarios), ids(t.requirements)]
    }), [3, 1.5, 1.5, 2, 2, 2])

  return out.filter((t) => o.sections.includes(t.section)).filter((t) => t.rows.length > 0 || t.section === 'trace').map((t) => ({ ...t, rows: t.rows.filter((r) => r.length) }))
}
