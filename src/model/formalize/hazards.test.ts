import { describe, expect, it } from 'vitest'
import { handbookExampleProject } from '../handbookExamples'
import { deserialize, serialize } from '../serialize'
import { itemsOfKind } from '../tree'
import { validate } from '../validate'
import { isOnVariable, leaves as leafConds, conditionComplete, conditionTexts, conditionError } from '../variables'
import { computeLabels } from '../labels'
import { FORMALIZED_HAZARD_EXAMPLES, formalizeHazardExample } from './hazards'

describe('formalized hazard examples', () => {
  for (const id of FORMALIZED_HAZARD_EXAMPLES) {
    it(id, () => {
      const p = formalizeHazardExample(id, handbookExampleProject(id))
      const L = computeLabels(p)
      const hazards = itemsOfKind(p, 'hazard')
      const leaves = hazards.filter((h) => !hazards.some((o) => o.parent === h.id))
      const lines: string[] = []
      for (const h of leaves) {
        expect(h.conditions.length, h.title).toBeGreaterThan(0)
        for (const c of h.conditions.flatMap(leafConds)) {
          if (!isOnVariable(c)) continue
          expect(conditionComplete(c), h.title).toBe(true)
          const v = p.items[c.variable]
          if (v?.kind === 'variable') expect(conditionError(v, c, p), h.title).toBeNull()
        }
        lines.push(`${L[h.id]} ${h.title}: ${conditionTexts(p, h.conditions.flatMap(leafConds)).join(' AND ')}`)
      }
      console.log(`${id}\n  ` + lines.join('\n  '))
      expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
      expect(validate(p).filter((i) => i.severity === 'warning' && /instance|condition/.test(i.message)).map((i) => i.message)).toEqual([])
      expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
    })
  }
})
