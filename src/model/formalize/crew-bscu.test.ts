import { describe, expect, it } from 'vitest'
import { handbookExampleProject } from '../handbookExamples'
import { computeLabels } from '../labels'
import { deserialize, serialize } from '../serialize'
import { itemsOfKind } from '../tree'
import { generateUcaText } from '../uca'
import { validate } from '../validate'
import { conditionComplete, conditionError, isText, whenText } from '../variables'
import { formalizeCrewBscu } from './crew-bscu'

describe.each(['hb-crew', 'hb-bscu'] as const)('formalize %s', (id) => {
  const base = handbookExampleProject(id)
  const p = formalizeCrewBscu(id, base)

  it('is valid (no errors)', () => {
    const issues = validate(p)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    for (const i of issues.filter((i) => i.severity === 'warning' && !/no loss scenarios/.test(i.message))) console.log(id, i.severity, i.message)
  })

  it('has complete conditions on every UCA and hazard', () => {
    expect(itemsOfKind(p, 'uca').length).toBe(itemsOfKind(base, 'uca').length)
    for (const it of [...itemsOfKind(p, 'uca'), ...itemsOfKind(p, 'hazard')]) {
      expect(it.conditions.length, it.title || it.description).toBeGreaterThan(0)
      for (const cnd of it.conditions) {
        expect(conditionComplete(cnd)).toBe(true)
        if (!isText(cnd)) expect(conditionError(p.items[cnd.variable] as never, cnd, p)).toBeNull()
      }
    }
  })

  it('round-trips and prints the UCA sentences', () => {
    expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
    const labels = computeLabels(p)
    for (const h of itemsOfKind(p, 'hazard')) console.log(`${labels[h.id]}: ${h.title} :: ${h.conditions.map((x) => whenText(p, x)).join(' and ')}`)
    for (const u of itemsOfKind(p, 'uca')) console.log(`${labels[u.id]}: ${generateUcaText(p, labels, u)}`)
  })
})
