import { describe, expect, it } from 'vitest'
import { EXAMPLES, agrees, buildExample } from './handbook'
import { CHECKS, FAIL, PASS, REVIEW_KINDS, checksFor, decisionRequest, summarise } from './review'
import { decide, loadLlm } from './ollama'
import { validate } from '../model/validate'

describe('handbook examples (offline)', () => {
  it('have unique ids and cover every reviewed kind except requirements', () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length)
    for (const k of REVIEW_KINDS.filter((k) => k !== 'requirement')) {
      expect(EXAMPLES.some((e) => e.kind === k && e.good), k).toBe(true)
      expect(EXAMPLES.some((e) => e.kind === k && !e.good), k).toBe(true)
    }
  })

  it('expected flaws are checks that exist and apply to the example', () => {
    for (const e of EXAMPLES) {
      const { it: item } = buildExample(e)
      const ids = checksFor(e.kind, item).map((c) => c.id)
      for (const f of e.flaws ?? []) expect(ids, `${e.id}: ${f}`).toContain(f)
      if (e.good) expect(e.flaws).toBeUndefined()
    }
  })

  it('build into items with linked context and a complete decision request', () => {
    for (const e of EXAMPLES) {
      const { p, L, it: item } = buildExample(e)
      expect(item.kind).toBe(e.kind)
      const { state, questions } = decisionRequest(p, L, item)
      expect(state).toContain(e.text.slice(0, 40))
      expect(Object.keys(questions).length).toBeGreaterThan(0)
      expect(validate(p).filter((i) => i.item === item.id && /dangling|missing/i.test(i.message))).toEqual([])
    }
    expect(Object.keys(CHECKS).length).toBeGreaterThan(0)
  })
})

/** Live tests need a running Ollama with the decision model; they are skipped when it is unreachable. */
const settings = { ...loadLlm(), endpoint: process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434', model: process.env.OLLAMA_MODEL ?? 'd1' }
const live = await fetch(`${settings.endpoint}/api/tags`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false)

describe.skipIf(!live)('handbook examples (decision model)', () => {
  it('judges good and bad examples like the Handbook', async () => {
    const rows: Record<string, string | number>[] = []
    const tally: Record<string, { good: number; goodOk: number; bad: number; badOk: number }> = {}
    for (const e of EXAMPLES) {
      const { p, L, it: item } = buildExample(e)
      const { state, questions } = decisionRequest(p, L, item)
      const probs = await decide(settings, state, questions)
      const ok = agrees(e, probs, PASS, FAIL)
      const t = (tally[e.kind] ??= { good: 0, goodOk: 0, bad: 0, badOk: 0 })
      if (e.good) { t.good++; if (ok) t.goodOk++ } else { t.bad++; if (ok) t.badOk++ }
      const worst = summarise(item, probs).checks.reduce((a, b) => (b.p > a.p ? b : a))
      rows.push({ kind: e.kind, id: e.id, expected: e.good ? 'good' : `bad:${(e.flaws ?? ['any']).join(',')}`, worst: `${worst.id} ${Math.round(worst.p * 100)}%`, agrees: ok ? 'yes' : 'NO' })
    }
    console.table(rows)
    console.table(tally)
    // Thresholds are deliberately loose: the model is probabilistic and some Handbook mistakes are subtle. Raise them as the checks improve.
    const sum = Object.values(tally).reduce((a, t) => ({ good: a.good + t.good, goodOk: a.goodOk + t.goodOk, bad: a.bad + t.bad, badOk: a.badOk + t.badOk }), { good: 0, goodOk: 0, bad: 0, badOk: 0 })
    expect(sum.goodOk / sum.good, 'good examples not flagged').toBeGreaterThanOrEqual(0.9)
    expect(sum.badOk / sum.bad, 'bad examples flagged on the expected check').toBeGreaterThanOrEqual(0.7)
  }, 600_000)
})
