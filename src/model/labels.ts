import { plainRich } from './richtext'
import { children, flatten, itemsOfKind, TREE_KINDS } from './tree'
import type { Id, Kind, Labels, Project } from './types'

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

  // Variables are shown by name (V-n only while unnamed or when the name is already taken), numbered globally in entity-tree order.
  const vars = [...flatten(p, 'entity').flatMap(({ item: ent }) => children(p, ent.id, 'variable')), ...itemsOfKind(p, 'variable')]
  const seen = new Set<string>()
  const taken = new Set<string>()
  let v = 0
  for (const x of vars) {
    if (seen.has(x.id)) continue
    seen.add(x.id)
    const n = ++v
    const name = x.title.trim()
    out[x.id] = name && !taken.has(name.toLowerCase()) ? name : `V-${n}`
    taken.add(out[x.id].toLowerCase())
  }

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
