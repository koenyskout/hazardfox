import { computeLabels, renderText } from '../model/labels'
import { effectiveLosses, scenarioHazards } from '../model/ops'
import { descendants, flatten, itemsOfKind } from '../model/tree'
import { generateUcaText } from '../model/uca'
import { CAUSES, GUIDE_WORD_LABELS, type Id, type Item, type Kind, type Project, type Status } from '../model/types'

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
  const lab = (ids: Id[]) => ids.map((i) => L[i] ?? '⟨deleted⟩').join(', ')
  const name = (id: Id) => (id && p.items[id] ? `${L[id]} ${p.items[id].title}`.trim() : '')
  const keep = (it: Item) => o.statuses.includes(it.status) && (!o.tag || it.tags.includes(o.tag))
  const common = (it: Item) => [L[it.id], it.title]
  const tail = (it: Item) => [T(it.description), it.status, it.tags.join(', '), T(it.notes)]
  const tailH = ['Description', 'Status', 'Tags', 'Notes']
  const tree = (kind: Kind) => flatten(p, kind).filter(({ item }) => keep(item))
  const flat = <K extends Kind>(kind: K) => itemsOfKind(p, kind).sort((a, b) => a.rank - b.rank).filter(keep)
  const out: Table[] = []
  const push = (section: SectionKey, name: string, columns: string[], rows: string[][], widths?: number[]) => out.push({ section, name, columns, rows, widths })

  push('step1', 'Losses', ['ID', 'Loss', ...tailH], tree('loss').map(({ item }) => [...common(item), ...tail(item)]), [1, 3, 5, 1.2, 1.5, 3])
  push('step1', 'Hazards', ['ID', 'Hazard', 'Losses', 'Security', ...tailH], tree('hazard').map(({ item }) => [...common(item), lab(effectiveLosses(p, item.id)), item.kind === 'hazard' && item.security ? 'yes' : '', ...tail(item)]), [1, 3, 1.3, 1, 4, 1.2, 1.5, 2.5])
  push('step1', 'System constraints', ['ID', 'Constraint', 'Hazards', ...tailH], tree('constraint').map(({ item }) => [...common(item), item.kind === 'constraint' ? lab(item.hazards) : '', ...tail(item)]), [1, 3, 1.3, 4, 1.2, 1.5, 2.5])

  push('domain', 'Entities', ['ID', 'Entity', 'Attributes', 'Operations', 'Description', 'Status', 'Tags'],
    tree('entity').map(({ item: e }) => e.kind === 'entity' ? [...common(e), e.attributes.map((a) => (a.type ? `${a.name}: ${a.type}` : a.name)).join('\n'), e.operations.join('\n'), T(e.description), e.status, e.tags.join(', ')] : []))
  push('domain', 'Process variables', ['ID', 'Variable', 'Entity', 'States', 'Description', 'Status'],
    itemsOfKind(p, 'variable').sort((a, b) => (L[a.id] ?? '').localeCompare(L[b.id] ?? '', undefined, { numeric: true })).filter(keep).map((v) => [...common(v), name(v.parent as Id), v.states.join(' | '), T(v.description), v.status]))
  push('domain', 'Relationships', ['ID', 'Name', 'From', 'To', 'Cardinality'], flat('relationship').map((r) => [...common(r), name(r.from), name(r.to), `${r.fromCard} : ${r.toCard}`]))

  push('structure', 'Control structure elements', ['ID', 'Element', 'Role', 'Parent', 'Process model', 'Description', 'Status'],
    tree('node').map(({ item: n }) => n.kind === 'node' ? [...common(n), n.role, n.parent ? name(n.parent) : '', n.processModel.map((v) => p.items[v]?.title).filter(Boolean).join(', '), T(n.description), n.status] : []))
  push('structure', 'Control actions', ['ID', 'Control action', 'From', 'To', 'Description', 'Status'], flat('ca').map((c) => [...common(c), name(c.from), name(c.to), T(c.description), c.status]))
  push('structure', 'Feedback', ['ID', 'Feedback', 'From', 'To', 'Variables', 'Description', 'Status'], flat('feedback').map((c) => [...common(c), name(c.from), name(c.to), lab(c.variables), T(c.description), c.status]))

  push('ucas', 'Unsafe control actions', ['ID', 'Control action', 'Type', 'Unsafe control action', 'Hazards', 'Controller constraint', 'Status', 'Tags'],
    flat('uca').sort((a, b) => (L[a.id] ?? '').localeCompare(L[b.id] ?? '', undefined, { numeric: true })).map((u) => [L[u.id], name(u.ca), GUIDE_WORD_LABELS[u.guide], generateUcaText(p, L, u), lab(u.hazards), T(u.constraint), u.status, u.tags.join(', ')]), [1, 2, 1.6, 4, 1.3, 3, 1, 1.2])
  push('scenarios', 'Loss scenarios', ['ID', 'Type', 'Applies to', 'Cause', 'Scenario', 'Hazards', 'Adversarial', 'STRIDE', 'Threat', 'Severity', 'Likelihood', 'Risk', 'Status'],
    flat('scenario').sort((a, b) => (L[a.id] ?? '').localeCompare(L[b.id] ?? '', undefined, { numeric: true })).map((s) => [L[s.id], s.scenarioType === 'ca' ? 'Control action not executed properly' : 'Unsafe control action', L[(s.scenarioType === 'ca' ? s.ca : s.uca) ?? ''] ?? '', CAUSES[s.scenarioType].find((c) => c.value === s.cause)?.label ?? '', s.title + (s.description ? '\n' + T(s.description) : ''), lab(scenarioHazards(p, s)), s.adversarial ? 'yes' : '', s.stride.join(', '), T(s.threat), s.severity ? String(s.severity) : '', s.likelihood ? String(s.likelihood) : '', s.severity && s.likelihood ? String(s.severity * s.likelihood) : '', s.status]), [1, 1.4, 1, 2, 4, 1.2, 1, 2, 3, 1, 1, 0.8, 1])
  push('requirements', 'Requirements & mitigations', ['ID', 'Requirement', 'Type', 'Derived from', ...tailH], tree('requirement').map(({ item }) => [...common(item), item.kind === 'requirement' ? item.type : '', item.kind === 'requirement' ? lab(item.sources) : '', ...tail(item)]))
  push('assumptions', 'Assumptions', ['ID', 'Assumption', 'About', ...tailH], flat('assumption').map((a) => [...common(a), lab(a.about), ...tail(a)]))

  // trace
  const ucas = itemsOfKind(p, 'uca')
  push('trace', 'Traceability per hazard', ['Hazard', 'Losses', 'Constraints', 'UCAs', 'Scenarios', 'Requirements'],
    flatten(p, 'hazard').map(({ item }) => {
      const s = new Set([item.id, ...descendants(p, item.id).map((d) => d.id)])
      const us = ucas.filter((u) => u.hazards.some((h) => s.has(h)))
      const sc = itemsOfKind(p, 'scenario').filter((x) => scenarioHazards(p, x).some((h) => s.has(h)))
      const cons = itemsOfKind(p, 'constraint').filter((c) => c.hazards.some((h) => s.has(h)))
      const reqs = itemsOfKind(p, 'requirement').filter((r) => r.sources.some((x) => [...cons, ...sc, ...us].some((y) => y.id === x)))
      return [name(item.id), lab(effectiveLosses(p, item.id)), lab(cons.map((c) => c.id)), lab(us.map((u) => u.id)), lab(sc.map((x) => x.id)), lab(reqs.map((r) => r.id))]
    }), [3, 1.5, 1.5, 2, 2, 2])

  return out.filter((t) => o.sections.includes(t.section)).filter((t) => t.rows.length > 0 || t.section === 'trace').map((t) => ({ ...t, rows: t.rows.filter((r) => r.length) }))
}
