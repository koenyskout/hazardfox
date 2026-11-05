import { describe, expect, it } from 'vitest'
import { publishedExampleProject } from '../publishedExamples'
import { formalizeAebMsiv } from './aeb-msiv'
import { validate } from '../validate'
import { computeLabels } from '../labels'
import { generateUcaText } from '../uca'
import { itemsOfKind, isLeaf } from '../tree'
import { say } from '../say'
import { varsOf } from '../atoms'
import { problem } from './train-vtt'
import { deserialize, serialize } from '../serialize'
import { beliefsAbout } from '../formal'
import type { Project } from '../types'

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
    for (const h of itemsOfKind(p, 'hazard').filter((x) => isLeaf(p, x.id))) expect(problem(p, h.when), L[h.id]).toBeNull()
    for (const u of itemsOfKind(p, 'uca')) expect(problem(p, u.when), L[u.id]).toBeNull()
  })

  it('gives the issuing controller a belief about each world variable of a UCA context', () => {
    for (const u of itemsOfKind(p, 'uca')) {
      const from = (p.items[u.ca] as { from: string }).from
      for (const v of varsOf(u.when)) expect(beliefsAbout(p, from, v).length, `${L[u.id]} ${v}`).toBeGreaterThan(0)
    }
  })

  it('is idempotent, adds only formal data and survives a file round trip', () => {
    expect(serialize(formalizeAebMsiv(id, p))).toBe(serialize(p))
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
    for (const it of Object.values(base.items)) {
      const q = p.items[it.id]
      expect(q.title, it.id).toBe(it.title)
      if (it.kind === 'uca' || it.kind === 'hazard') expect(q.description).toBe(it.description)
      if (it.kind === 'uca') expect((q as typeof it).override).toBe(it.override)
    }
  })

  it('prints the sentences', () => {
    const out: string[] = []
    for (const h of itemsOfKind(p, 'hazard').filter((x) => isLeaf(p, x.id))) out.push(`${L[h.id]} ${h.title}\n    state: ${say(p, h.when)}`)
    for (const u of itemsOfKind(p, 'uca')) out.push(`${L[u.id]} ${generateUcaText(p, L, { ...u, override: '' })}`)
    console.log(`\n${id}\n  ` + out.join('\n  '))
  })
})
