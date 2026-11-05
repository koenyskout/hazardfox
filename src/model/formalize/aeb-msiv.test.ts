import { describe, expect, it } from 'vitest'
import { publishedExampleProject } from '../publishedExamples'
import { formalizeAebMsiv } from './aeb-msiv'
import { validate } from '../validate'
import { computeLabels } from '../labels'
import { generateUcaText } from '../uca'
import { itemsOfKind, isLeaf } from '../tree'
import { isOnVariable, leaves, conditionComplete, conditionError, conditionTexts, nameAllInstances } from '../variables'
import { deserialize, serialize } from '../serialize'
import { beliefsAbout } from '../formal'
import type { Condition, Project } from '../types'

const IDS = ['pub-aeb', 'pub-thomas-msiv'] as const

describe.each(IDS)('formalized %s', (id) => {
  const base = publishedExampleProject(id)
  const p: Project = formalizeAebMsiv(id, base)
  const L = computeLabels(p)

  it('has no validation errors and no new warnings about the formal layers', () => {
    const errors = validate(p).filter((i) => i.severity === 'error')
    expect(errors).toEqual([])
    const bad = validate(p).filter((i) => ['context-unrepresented', 'context-not-world', 'instance-unnamed', 'instance-name', 'refinement-invalid', 'refinement-cycle'].includes(i.rule ?? ''))
    expect(bad.map((i) => i.message)).toEqual([])
  })

  it('gives every leaf hazard and every UCA complete, valid conditions', () => {
    const complete = (cs: Condition[]) => cs.length > 0 && cs.every((c) => conditionComplete(c) && (!isOnVariable(c) || !conditionError(p.items[c.variable] as never, c, p)))
    for (const h of itemsOfKind(p, 'hazard').filter((x) => isLeaf(p, x.id))) expect(complete(h.conditions.flatMap(leaves)), L[h.id]).toBe(true)
    for (const u of itemsOfKind(p, 'uca')) expect(complete(u.conditions.flatMap(leaves)), L[u.id]).toBe(true)
  })

  it('gives the issuing controller a belief about each world variable of a UCA context', () => {
    for (const u of itemsOfKind(p, 'uca')) {
      const from = (p.items[u.ca] as { from: string }).from
      for (const c of u.conditions.flatMap(leaves).filter(isOnVariable)) expect(beliefsAbout(p, from, c.variable).length, `${L[u.id]} ${c.variable}`).toBeGreaterThan(0)
    }
  })

  it('is idempotent, adds only formal data and survives a file round trip', () => {
    expect(serialize(formalizeAebMsiv(id, p))).toBe(serialize(p))
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
    expect(nameAllInstances(p)).toBe(p)
    for (const it of Object.values(base.items)) {
      const q = p.items[it.id]
      expect(q.title, it.id).toBe(it.title)
      if (it.kind === 'uca' || it.kind === 'hazard') expect(q.description).toBe(it.description)
      if (it.kind === 'uca') expect((q as typeof it).override).toBe(it.override)
    }
  })

  it('prints the sentences', () => {
    const out: string[] = []
    for (const h of itemsOfKind(p, 'hazard').filter((x) => isLeaf(p, x.id))) out.push(`${L[h.id]} ${h.title}\n    state: ${conditionTexts(p, h.conditions.flatMap(leaves)).join(' and ')}`)
    for (const u of itemsOfKind(p, 'uca')) out.push(`${L[u.id]} ${generateUcaText(p, L, { ...u, override: '' })}`)
    console.log(`\n${id}\n  ` + out.join('\n  '))
  })
})
