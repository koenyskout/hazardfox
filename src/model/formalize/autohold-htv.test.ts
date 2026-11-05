import { describe, expect, it } from 'vitest'
import { handbookExampleProject } from '../handbookExamples'
import { formalizeAutoholdHtv } from './autohold-htv'
import { itemsOfKind } from '../tree'
import { computeLabels } from '../labels'
import { generateUcaText } from '../uca'
import { validate } from '../validate'
import { deserialize, serialize } from '../serialize'
import { leaves, conditionComplete, conditionError, conditionTexts, isOnVariable, whenText, allOf } from '../variables'
import type { Project } from '../types'

const IDS = ['hb-autohold', 'hb-htv'] as const
/** UCAs the model cannot express as a context (the action's own magnitude), kept as free text. */
const TEXT_ONLY = ['ISS crew performs Capture with excessive/insufficient movement']

describe.each(IDS)('formalize %s', (id) => {
  const base = handbookExampleProject(id)
  const p: Project = formalizeAutoholdHtv(id, base)
  const L = computeLabels(p)

  it('has no validation errors', () => {
    const issues = validate(p)
    console.log(id, 'issues:', issues.filter((i) => i.severity !== 'error').map((i) => `${i.severity} ${i.rule}: ${i.message}`).join('\n  '))
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    expect(issues.filter((i) => i.rule === 'context-unrepresented' || i.rule === 'instance-name' || i.rule === 'instance-unnamed' || i.rule === 'context-not-world')).toEqual([])
  })

  it('formalizes every hazard with complete conditions', () => {
    for (const h of itemsOfKind(p, 'hazard')) {
      expect(h.conditions.length, h.title).toBeGreaterThan(0)
      console.log(`${L[h.id]} ${whenText(p, allOf(...h.conditions))}`)
      for (const c of h.conditions.flatMap(leaves)) { expect(conditionComplete(c), h.title).toBe(true); if (isOnVariable(c)) { const v = p.items[c.variable]; if (v?.kind === 'variable') expect(conditionError(v, c, p), h.title).toBeNull() } }
    }
  })

  it('formalizes every UCA with complete conditions', () => {
    const ucas = itemsOfKind(p, 'uca')
    expect(ucas.length).toBe(itemsOfKind(base, 'uca').length)
    for (const u of ucas) {
      const t = generateUcaText(p, L, u)
      console.log(`${L[u.id]} [${u.guide}] ${t}`)
      expect(u.override).toBe('')
      if (TEXT_ONLY.some((x) => u.notes.includes(x))) { expect(u.context).not.toBe(''); continue }
      expect(u.conditions.length, t).toBeGreaterThan(0)
      for (const c of u.conditions.flatMap(leaves)) { expect(conditionComplete(c), t).toBe(true); if (isOnVariable(c)) { const v = p.items[c.variable]; if (v?.kind === 'variable') expect(conditionError(v, c, p), t).toBeNull() } }
      expect(conditionTexts(p, u.conditions.flatMap(leaves)).every(Boolean)).toBe(true)
    }
  })

  it('round-trips through serialize / deserialize and is idempotent', () => {
    expect(deserialize(serialize(p))).toEqual(p)
    expect(formalizeAutoholdHtv(id, p)).toBe(p)
  })
})
