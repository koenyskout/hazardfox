import { useLabels, useProject } from './hooks'
import { renderText } from '../model/labels'
import { isGroup, conditionComplete, conditionText, leaves } from '../model/variables'
import type { Condition, Group, When } from '../model/types'

export type Verdict = (w: When) => boolean | null | undefined

const mark = (v: boolean | null | undefined) => v === undefined ? null : <span className={'wv-ver ' + (v === true ? 't' : v === false ? 'f' : 'u')} title={v === true ? 'holds' : v === false ? 'does not hold' : 'unknown'}>{v === true ? '✓' : v === false ? '✕' : '?'}</span>

/** A condition tree: a coloured tag (ALL OF / ANY OF / NOT) over a bar with a dot (filled: all of, hollow: any of) and a tick per member. With `verdict`, each line shows ✓ / ✕ / ? and failing groups turn red. */
export function WhenView({ ws, verdict }: { ws: When[]; verdict?: Verdict }) {
  const p = useProject()
  const labels = useLabels()
  const complete = (w: When): boolean => (isGroup(w) ? w.of.some(complete) : conditionComplete(w))
  const text = (c: Condition, before: Condition[]) => renderText(labels, conditionText(p, c, before))
  const leaf = (c: Condition, before: Condition[]) => <span className="wv-b">{verdict && mark(verdict(c))}{text(c, before)}</span>
  const group = (g: Group, before: Condition[]) => {
    const members = g.of.filter(complete)
    const kind = g.not ? 'not' : g.any ? 'any' : 'all'
    const bad = verdict?.(g) === false
    if (g.not && members.length === 1 && !isGroup(members[0])) return <span className="wv-b">{verdict && mark(verdict(g))}<span className="wv-tag wv-not">not</span> {text(members[0] as Condition, before)}</span>
    return (
      <div className={`wv wv-${kind}${bad ? ' bad' : ''}`}>
        <div className="wv-h">{verdict && mark(verdict(g))}<span className="wv-tag">{g.not ? 'not' : g.any ? 'any of' : 'all of'}</span></div>
        <div className="wv-its">
          {members.map((x, i) => <div className="wv-it" key={i}>{isGroup(x) ? group(x, [...before, ...members.slice(0, i).flatMap(leaves)]) : leaf(x, [...before, ...members.slice(0, i).flatMap(leaves)])}</div>)}
        </div>
      </div>
    )
  }
  const top = ws.filter(complete)
  if (top.length === 1) return isGroup(top[0]) ? group(top[0], []) : <div className="wv-single">{leaf(top[0], [])}</div>
  return group({ kind: 'group', any: false, of: top }, [])
}
