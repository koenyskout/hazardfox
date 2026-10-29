import { children, flatten, itemsOfKind } from './tree'
import type { Id, Kind, Project } from './types'

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
export function computeLabels(p: Project): Record<Id, string> {
  const out: Record<Id, string> = {}

  for (const kind of ['loss', 'hazard', 'constraint', 'requirement', 'entity', 'node'] as const) {
    const walk = (pid: Id | null, path: string) => {
      children(p, pid, kind).forEach((c, i) => {
        const here = path ? `${path}.${i + 1}` : `${i + 1}`
        out[c.id] = `${PREFIX[kind]}-${here}`
        walk(c.id, here)
      })
    }
    walk(null, '')
  }

  // Variables: numbered globally in entity-tree order.
  let v = 0
  for (const { item: ent } of flatten(p, 'entity')) {
    for (const x of children(p, ent.id, 'variable')) out[x.id] = `V-${++v}`
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

/** Render text, replacing `@[id]` with the live label (or a visible dangling marker). */
export function renderText(labels: Record<Id, string>, text: string): string {
  return text.replace(/@\[([^\]]+)\]/g, (_, id: string) => labels[id] ?? '⟨deleted⟩')
}

export const labelOf = (labels: Record<Id, string>, id: Id | null | undefined) =>
  (id && labels[id]) || '—'
