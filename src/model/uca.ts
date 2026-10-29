import { renderText } from './labels'
import type { Id, Project, Uca } from './types'

const PHRASE: Record<Uca['guide'], string> = {
  'not-provided': 'does not provide',
  provided: 'provides',
  'too-early-late': 'provides too early, too late or out of order',
  'stopped-too-soon': 'stops too soon / applies too long',
}

/** Generated UCA statement: "<Controller> <guide> <CA> when <conditions>". */
export function generateUcaText(p: Project, labels: Record<Id, string>, u: Uca): string {
  if (u.override) return u.override
  const ca = p.items[u.ca]
  const from = ca && ca.kind === 'ca' ? p.items[ca.from] : null
  const conds = u.conditions
    .filter((c) => p.items[c.variable] && c.state)
    .map((c) => `${p.items[c.variable].title} ${c.negate ? '≠' : '='} ${c.state}`)
  const ctx = [...conds, renderText(labels, u.context).trim()].filter(Boolean).join(' and ')
  return `${from?.title || '⟨controller⟩'} ${PHRASE[u.guide]} ${ca?.title || '⟨control action⟩'}${ctx ? ' when ' + ctx : ''}`
}
