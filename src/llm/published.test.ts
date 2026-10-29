import { describe, expect, it } from 'vitest'
import { PUBLISHED_EXAMPLES, publishedExampleProject } from '../model/publishedExamples'
import { computeLabels } from '../model/labels'
import { REVIEW_KINDS, decisionRequest, itemsForReview, summarise } from './review'
import { decide, loadLlm } from './ollama'

describe('published analyses (offline)', () => {
  it('give every reviewable item a decision request', () => {
    for (const e of PUBLISHED_EXAMPLES) {
      const p = publishedExampleProject(e.id)
      const L = computeLabels(p)
      for (const k of REVIEW_KINDS) for (const it of itemsForReview(p, k)) {
        const { state, questions } = decisionRequest(p, L, it)
        expect(state, `${e.id} ${L[it.id]}`).toContain(it.title.slice(0, 30))
        expect(Object.keys(questions).length).toBeGreaterThan(0)
      }
    }
  })
})

/** Live tests need a running Ollama with the decision model; they are skipped when it is unreachable. */
const settings = { ...loadLlm(), endpoint: process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434', model: process.env.OLLAMA_MODEL ?? 'd1' }
const live = await fetch(`${settings.endpoint}/api/tags`, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false)

describe.skipIf(!live)('published analyses (decision model)', () => {
  it('does not flag published expert analyses as flawed', async () => {
    const rows: Record<string, string | number>[] = []
    const tally: Record<string, { items: number; fail: number; unsure: number }> = {}
    for (const e of PUBLISHED_EXAMPLES) {
      const p = publishedExampleProject(e.id)
      const L = computeLabels(p)
      for (const k of REVIEW_KINDS) for (const it of itemsForReview(p, k)) {
        const { state, questions } = decisionRequest(p, L, it)
        const r = summarise(it, await decide(settings, state, questions))
        const t = (tally[`${e.id} ${k}`] ??= { items: 0, fail: 0, unsure: 0 })
        t.items++
        if (r.verdict === 'fail') t.fail++
        if (r.verdict === 'unsure') t.unsure++
        const worst = r.checks.reduce((a, b) => (b.p > a.p ? b : a))
        if (r.verdict !== 'pass') rows.push({ ex: e.id, item: L[it.id], verdict: r.verdict, worst: `${worst.id} ${Math.round(worst.p * 100)}%`, title: it.title.slice(0, 70) })
      }
    }
    console.table(rows)
    console.table(tally)
    const all = Object.values(tally).reduce((a, t) => ({ items: a.items + t.items, fail: a.fail + t.fail }), { items: 0, fail: 0 })
    // Measured on d1: 18 of 71 items fail, almost all terse VTT scenarios ("Failure in the ... itself") and multi-part requirements, which do
    // breach the Handbook's rules. Core items (UCAs, constraints, AEB hazards) are never failed. Tighten as the checks improve.
    expect(all.fail / all.items, 'share of published items flagged as failing').toBeLessThanOrEqual(0.35)
    for (const [k, t] of Object.entries(tally)) if (/ (uca|constraint)$/.test(k)) expect(t.fail, k).toBe(0)
  }, 900_000)
})
