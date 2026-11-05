import { useLabels, useProject } from './hooks'
import { renderText } from '../model/labels'
import type { Expr } from '../model/lang'
import { say } from '../model/say'
import { QUANT_LABELS } from '../model/types'

/** Whether a part of the condition holds; a part inside quantifiers arrives wrapped in them. */
export type Verdict = (e: Expr) => boolean | null | undefined

const mark = (v: boolean | null | undefined) => v === undefined ? null : <span className={'wv-ver ' + (v === true ? 't' : v === false ? 'f' : 'u')} title={v === true ? 'holds' : v === false ? 'does not hold' : 'unknown'}>{v === true ? '✓' : v === false ? '✕' : '?'}</span>

/** A condition tree: a coloured tag (ALL OF / ANY OF / NOT / a quantifier) over a bar with a dot (filled: all of, hollow: any of) and a tick per member. With `verdict`, each line shows ✓ / ✕ / ? and failing groups turn red. */
export function WhenView({ e, verdict }: { e: Expr | null; verdict?: Verdict }) {
  const p = useProject()
  const labels = useLabels()
  type Q = Extract<Expr, { k: 'quant' }>
  const ver = (x: Expr, qs: Q[]) => (verdict ? verdict(qs.reduceRight<Expr>((b, q) => ({ ...q, body: b }), x)) : undefined)
  const leaf = (x: Expr, qs: Q[]) => <span className="wv-b">{verdict && mark(ver(x, qs))}{renderText(labels, say(p, x))}</span>
  const block = (x: Expr, qs: Q[], kind: string, tag: string, members: Expr[], qsIn = qs) => (
    <div className={`wv wv-${kind}${ver(x, qs) === false ? ' bad' : ''}`}>
      <div className="wv-h">{verdict && mark(ver(x, qs))}<span className="wv-tag">{tag}</span></div>
      <div className="wv-its">{members.map((m, i) => <div className="wv-it" key={i}>{node(m, qsIn)}</div>)}</div>
    </div>
  )
  const node = (x: Expr, qs: Q[]): React.ReactNode => {
    switch (x.k) {
      case 'and': return block(x, qs, 'all', 'all of', x.of.filter((m) => m.k !== 'hole'))
      case 'or': return block(x, qs, 'any', 'any of', x.of.filter((m) => m.k !== 'hole'))
      case 'not': return x.e.k === 'and' || x.e.k === 'or' || x.e.k === 'quant' ? block(x, qs, 'not', 'not', [x.e]) : <span className="wv-b">{verdict && mark(ver(x, qs))}<span className="wv-tag wv-not">not</span> {renderText(labels, say(p, x.e))}</span>
      case 'quant': return block(x, qs, 'all', `for ${QUANT_LABELS[x.q]} ${(p.items[x.entity]?.title ?? '').trim() || 'instance'} ${x.name}`, [x.body], [...qs, x])
      case 'hole': return null
      default: return leaf(x, qs)
    }
  }
  if (!e || e.k === 'hole') return null
  return e.k === 'and' || e.k === 'or' || e.k === 'not' || e.k === 'quant' ? node(e, []) : <div className="wv-single">{leaf(e, [])}</div>
}
