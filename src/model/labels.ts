import { plainRich } from './richtext'
import { children, flatten, itemsOfKind, TREE_KINDS } from './tree'
import type { Id, Kind, Labels, Project, Variable } from './types'

export const PREFIX: Record<Kind, string> = {
  loss: 'L',
  hazard: 'H',
  constraint: 'SC',
  requirement: 'R',
  assumption: 'A',
  entity: 'E',
  relationship: 'REL',
  variable: 'V',
  node: 'CS',
  ca: 'CA',
  feedback: 'FB',
  uca: 'UCA',
  scenario: 'LS',
}

/** Derive all display labels from kind + position. Labels are never stored. */
export function computeLabels(p: Project): Labels {
  const out: Labels = {}

  for (const kind of TREE_KINDS) {
    const walk = (pid: Id | null, path: string) => {
      children(p, pid, kind).forEach((c, i) => {
        const here = path ? `${path}.${i + 1}` : `${i + 1}`
        out[c.id] = `${PREFIX[kind]}-${here}`
        walk(c.id, here)
      })
    }
    walk(null, '')
  }

  // Variables: numbered globally by owner – entity tree (world), node tree (beliefs, internal state), feedback (signals).
  let v = 0
  for (const { item: ent } of flatten(p, 'entity')) {
    for (const x of children(p, ent.id, 'variable')) out[x.id] = `V-${++v}`
  }
  for (const r of itemsOfKind(p, 'relationship').sort((a, b) => a.rank - b.rank)) {
    for (const x of children(p, r.id, 'variable')) out[x.id] = `V-${++v}`
  }
  for (const { item: n } of flatten(p, 'node')) {
    for (const x of children(p, n.id, 'variable')) out[x.id] = `V-${++v}`
  }
  for (const f of itemsOfKind(p, 'feedback').sort((a, b) => a.rank - b.rank)) {
    for (const x of children(p, f.id, 'variable')) out[x.id] = `V-${++v}`
  }
  for (const x of itemsOfKind(p, 'variable')) if (!out[x.id]) out[x.id] = `V-${++v}`

  const flat = (kind: 'relationship' | 'ca' | 'feedback' | 'assumption') =>
    itemsOfKind(p, kind)
      .sort((a, b) => a.rank - b.rank)
      .forEach((x, i) => (out[x.id] = `${PREFIX[kind]}-${i + 1}`))
  flat('relationship')
  flat('ca')
  flat('feedback')
  flat('assumption')

  // UCAs numbered globally in control-action order, scenarios under their UCA.
  let n = 0
  const cas = itemsOfKind(p, 'ca').sort((a, b) => a.rank - b.rank)
  for (const ca of cas) {
    for (const u of itemsOfKind(p, 'uca').filter((u) => u.ca === ca.id).sort((a, b) => a.rank - b.rank)) {
      const num = ++n
      out[u.id] = `UCA-${num}`
      itemsOfKind(p, 'scenario')
        .filter((s) => s.scenarioType === 'uca' && s.uca === u.id)
        .sort((a, b) => a.rank - b.rank)
        .forEach((s, i) => (out[s.id] = `LS-${num}.${i + 1}`))
    }
  }
  // Type-2 scenarios (control action not executed properly) are numbered under their control action.
  for (const ca of cas) {
    itemsOfKind(p, 'scenario')
      .filter((s) => s.scenarioType === 'ca' && s.ca === ca.id)
      .sort((a, b) => a.rank - b.rank)
      .forEach((s, i) => (out[s.id] = `LS-${out[ca.id]}.${i + 1}`))
  }
  return out
}

/** Name of a variable as shown: world variables by name, the others namespaced by their owner ("Pump controller.Line occlusion").
 *  A relationship's untitled predicate is named after it ("Pump infuses Patient"). */
export const variableName = (p: Project, v: Variable): string => {
  const par = v.parent ? p.items[v.parent] : null
  if (par?.kind === 'relationship' && !v.title.trim()) return [p.items[par.from]?.title, par.title, p.items[par.to]?.title].map((x) => x?.trim() || '?').join(' ')
  const owner = v.layer !== 'domain' && par ? par.title.trim() : ''
  return v.title.trim() && owner ? `${owner}.${v.title.trim()}` : v.title.trim()
}

/** Labels for the UI: variables show their (namespaced) name, when unique and non-empty, instead of their V-n id. */
export function displayLabels(p: Project, ids: Labels): Labels {
  const out = { ...ids }
  const taken = new Set<string>()
  const vars = itemsOfKind(p, 'variable').map((x) => [x, variableName(p, x)] as const)
  for (const [, n] of vars) {
    const name = n.toLowerCase()
    if (name) taken.has(name) ? taken.add(name + '\0dup') : taken.add(name)
  }
  for (const [x, name] of vars) if (name && !taken.has(name.toLowerCase() + '\0dup')) out[x.id] = name
  return out
}

/** Shown in place of a reference to an item that no longer exists. */
export const DELETED = '⟨deleted⟩'

/** Render text, replacing `@[id]` with the live label (or a visible dangling marker). */
export const renderText = (labels: Labels, text: string) => plainRich(text, (id) => labels[id] ?? DELETED)

export const labelOf = (labels: Labels, id: Id | null | undefined) => (id && labels[id]) || '—'

/** Natural label order (H-2 before H-10). */
export const compareLabels = (a = '', b = '') => a.localeCompare(b, undefined, { numeric: true })
/** Comparator for items (or ids) by their label. */
export const byLabel =
  (labels: Labels) =>
  (a: Id | { id: Id }, b: Id | { id: Id }) =>
    compareLabels(labels[typeof a === 'string' ? a : a.id], labels[typeof b === 'string' ? b : b.id])
