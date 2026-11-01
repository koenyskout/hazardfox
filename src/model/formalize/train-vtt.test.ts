import { describe, expect, it } from 'vitest'
import { computeLabels, renderText } from '../labels'
import { publishedExampleProject } from '../publishedExamples'
import { deserialize, serialize } from '../serialize'
import { itemsOfKind } from '../tree'
import { generateUcaText } from '../uca'
import { validate } from '../validate'
import { leaves as leafConds, conditionTexts } from '../variables'
import { complete, formalizeTrainVtt } from './train-vtt'

const IDS = ['pub-train-door', 'pub-vtt-am'] as const

describe.each(IDS)('formalized %s', (id) => {
  const base = publishedExampleProject(id)
  const p = formalizeTrainVtt(id, base)
  const L = computeLabels(p)

  it('validates without errors, and without formalization warnings', () => {
    const issues = validate(p)
    for (const i of issues) console.log(id, i.severity, i.message)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(issues.filter((i) => /^(instance|context|refinement|trace|quantifier|belief|signal|variable)/.test(i.rule ?? ''))).toEqual([])
  })

  it('gives every leaf hazard and every UCA complete conditions', () => {
    const hazards = itemsOfKind(p, 'hazard')
    const leaves = hazards.filter((h) => !hazards.some((o) => o.parent === h.id))
    expect(leaves.length).toBeGreaterThan(0)
    for (const h of leaves) expect(complete(h.conditions.flatMap(leafConds)), L[h.id]).toBe(true)
    for (const u of itemsOfKind(p, 'uca')) expect(complete(u.conditions.flatMap(leafConds)), L[u.id]).toBe(true)
  })

  it('is idempotent, only adds, and survives a file round trip', () => {
    expect(formalizeTrainVtt(id, p)).toEqual(p)
    for (const it of Object.values(base.items)) expect(p.items[it.id], it.id).toBeDefined()
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
  })

  it('prints the sentences', () => {
    const lines: string[] = []
    for (const h of itemsOfKind(p, 'hazard')) lines.push(`${L[h.id]} ${h.title}\n    when ${conditionTexts(p, h.conditions.flatMap(leafConds)).map((t) => renderText(L, t)).join(' and ') || '(none)'}`)
    for (const u of itemsOfKind(p, 'uca')) lines.push(`${L[u.id]} ${generateUcaText(p, L, { ...u, override: '' })}\n    source: ${u.override || '(generated)'}`)
    console.log(`\n${id}\n` + lines.join('\n'))
    expect(lines.length).toBeGreaterThan(0)
  })
})

describe('what the formalization adds', () => {
  it('train: several doors, refined variable, traces still witness their UCAs', () => {
    const p = formalizeTrainVtt('pub-train-door', publishedExampleProject('pub-train-door'))
    const door = itemsOfKind(p, 'entity').find((e) => e.title === 'Door')!
    expect(door.many).toBe(true)
    expect(itemsOfKind(p, 'variable').some((v) => v.title === 'Door-opening situation' && v.rules.length === 1)).toBe(true)
    expect(validate(p).filter((i) => (i.rule ?? '').startsWith('trace'))).toEqual([])
  })
  it('vtt: people, objects, environment; beliefs in the traffic and mission control system', () => {
    const p = formalizeTrainVtt('pub-vtt-am', publishedExampleProject('pub-vtt-am'))
    expect(itemsOfKind(p, 'entity').filter((e) => e.many).map((e) => e.title).sort()).toEqual(['Person', 'Vehicle or object'])
    const tmcs = itemsOfKind(p, 'node').find((n) => n.title === 'Traffic and mission control system')!
    expect(itemsOfKind(p, 'variable').filter((v) => v.layer === 'belief' && v.parent === tmcs.id).length).toBeGreaterThanOrEqual(6)
  })
})
