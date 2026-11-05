import { describe, expect, it } from 'vitest'
import { projectBuilder } from './build'
import { attributesOf, generalisations, isA, sameInstance } from './formal'
import { inheritedOperations } from './operations'
import { isMany } from './variables'
import { endName, relName } from './labels'
import { deleteItems } from './ops'

function setup() {
  const b = projectBuilder()
  const person = b.add('entity', { title: 'Person', many: true })
  const nurse = b.add('entity', { title: 'Nurse', parent: person, relation: 'specialisation' })
  const night = b.add('entity', { title: 'Night nurse', parent: nurse, relation: 'specialisation' })
  const badge = b.add('entity', { title: 'Badge', parent: person, relation: 'part' })
  const group = b.add('entity', { title: 'Group', parent: person, relation: 'part' })
  const age = b.add('variable', { layer: 'domain', parent: person, title: 'age', type: 'range', min: 0, max: 120 })
  const shift = b.add('variable', { layer: 'domain', parent: nurse, title: 'shift', type: 'enum', states: ['day', 'night'] })
  const op = b.add('operation', { title: 'Greet', params: [{ name: 'p', entity: person }], effects: [] })
  return { b, person, nurse, night, badge, group, age, shift, op }
}

describe('entity relation', () => {
  it('inherits only along specialisation links', () => {
    const { b, person, nurse, night, badge, group } = setup()
    expect(generalisations(b.project, night)).toEqual([nurse, person])
    expect(generalisations(b.project, badge)).toEqual([])
    expect(generalisations(b.project, group)).toEqual([])
    expect(isA(b.project, night, person)).toBe(true)
    expect(isA(b.project, badge, person)).toBe(false)
    expect(sameInstance(b.project, person, night)).toBe(true)
    expect(sameInstance(b.project, badge, night)).toBe(false)
  })
  it('lists inherited attributes and operations with their origin', () => {
    const { b, person, nurse, night, age, shift, op, badge } = setup()
    expect(attributesOf(b.project, night).map((a) => [a.v.id, a.from, a.inherited])).toEqual([[shift, nurse, true], [age, person, true]])
    expect(attributesOf(b.project, badge)).toEqual([])
    expect(inheritedOperations(b.project, nurse)).toEqual([{ o: b.project.items[op], from: person }])
  })
  it('a specialisation of a many-instance entity has several instances too', () => {
    const { b, shift, badge } = setup()
    expect(isMany(b.project, b.project.items[shift] as never)).toBe(true)
    const v = b.add('variable', { layer: 'domain', parent: badge, title: 'worn', type: 'boolean' })
    expect(isMany(b.project, b.project.items[v] as never)).toBe(false)
  })
})

describe('relationship ends', () => {
  it('names an end by its role, by default the entity title; relationships name all ends', () => {
    const b = projectBuilder()
    const a = b.add('entity', { title: 'Driver' }), v = b.add('entity', { title: 'Vehicle' })
    const r = b.add('relationship', { title: 'drives', ends: [{ entity: a, role: '', card: '1' }, { entity: v, role: 'car', card: '*' }] })
    const rel = b.project.items[r]
    if (rel.kind !== 'relationship') throw new Error('kind')
    expect(rel.ends.map((e) => endName(b.project, e))).toEqual(['Driver', 'car'])
    expect(relName(b.project, rel)).toBe('Driver drives car')
  })
  it('deleting an end entity removes the relationship', () => {
    const b = projectBuilder()
    const a = b.add('entity', { title: 'A' }), c = b.add('entity', { title: 'C' }), d = b.add('entity', { title: 'D' })
    const r = b.add('relationship', { title: 'x', ends: [{ entity: a, role: '', card: '1' }, { entity: c, role: '', card: '1' }, { entity: d, role: '', card: '1' }] })
    expect(deleteItems(b.project, [d]).items[r]).toBeUndefined()
  })
})
