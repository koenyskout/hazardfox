import { describe, expect, it } from 'vitest'
import { handbookExampleProject } from '../handbookExamples'
import { deserialize, serialize } from '../serialize'
import { itemsOfKind } from '../tree'
import { validate } from '../validate'
import { say } from '../say'
import { problem } from './train-vtt'
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
        expect(problem(p, h.when), h.title).toBeNull()
        lines.push(`${L[h.id]} ${h.title}: ${say(p, h.when)}`)
      }
      console.log(`${id}\n  ` + lines.join('\n  '))
      expect(validate(p).filter((i) => i.severity === 'error')).toEqual([])
      expect(validate(p).filter((i) => i.severity === 'warning' && /instance|condition/.test(i.message)).map((i) => i.message)).toEqual([])
      expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
    })
  }
})
