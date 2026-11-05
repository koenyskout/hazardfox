import { renderText } from './labels'
import { argTexts } from './params'
import { say } from './say'
import type { ControlAction, GuideWord, Id, Project, Uca } from './types'

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
  const conds = [renderText(labels, say(p, u.when))]
  const ctx = [...conds, renderText(labels, u.context).trim()].filter(Boolean).join(' and ')
  const args = argTexts(p, u).join(' and ')
  return `${from?.title || '⟨controller⟩'} ${PHRASE[u.guide]} ${ca?.title || '⟨control action⟩'}${args ? ` (${args})` : ''}${ctx ? ' when ' + ctx : ''}`
}

/** Guide words that can apply to a control action: only continuous ones can be stopped too soon / applied too long. */
export const guideApplies = (ca: ControlAction, g: GuideWord) => !(g === 'stopped-too-soon' && ca.duration === 'instantaneous')
