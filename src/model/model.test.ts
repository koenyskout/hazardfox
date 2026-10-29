import { describe, expect, it } from 'vitest'
import { computeLabels, renderText } from './labels'
import { effectiveLosses } from './derived'
import { createItem, deleteItems, group, indent, merge, outdent, shift, split, updateItem } from './ops'
import { emptyProject } from './create'
import { validate } from './validate'
import type { Hazard, Id, Kind, Patch, Project } from './types'

function add<K extends Kind>(p: Project, kind: K, init?: Patch<K>) {
  const r = createItem(p, kind, init)
  return [r.project, r.id] as const
}

describe('labels and tree ops', () => {
  it('renumbers on move without touching ids', () => {
    let p = emptyProject()
    let a: Id, b: Id, c: Id
    ;[p, a] = add(p, 'hazard', { title: 'A' })
    ;[p, b] = add(p, 'hazard', { title: 'B' })
    ;[p, c] = add(p, 'hazard', { title: 'C' })
    expect(computeLabels(p)[c]).toBe('H-3')
    p = shift(p, c, -2)
    expect(computeLabels(p)[c]).toBe('H-1')
    expect(computeLabels(p)[a]).toBe('H-2')
    p = indent(p, a) // A under C
    expect(computeLabels(p)[a]).toBe('H-1.1')
    expect(computeLabels(p)[b]).toBe('H-2')
    p = outdent(p, a)
    expect(computeLabels(p)[a]).toBe('H-2')
  })

  it('keeps mentions live', () => {
    let p = emptyProject()
    let h: Id, l: Id
    ;[p, h] = add(p, 'hazard', { title: 'H' })
    ;[p, l] = add(p, 'loss', { title: 'L', description: `see @[${h}]` })
    const t = (q: Project) => renderText(computeLabels(q), q.items[l].description)
    expect(t(p)).toBe('see H-1')
    let h0: Id
    ;[p, h0] = add(p, 'hazard', { title: 'first' })
    p = shift(p, h0, -1)
    expect(t(p)).toBe('see H-2')
    p = deleteItems(p, [h])
    expect(t(p)).toBe('see ⟨deleted⟩')
  })

  it('group preserves effective loss links', () => {
    let p = emptyProject()
    let l1: Id, l2: Id, a: Id, b: Id
    ;[p, l1] = add(p, 'loss', { title: 'L1' })
    ;[p, l2] = add(p, 'loss', { title: 'L2' })
    ;[p, a] = add(p, 'hazard', { title: 'A', lossLinks: [l1] })
    ;[p, b] = add(p, 'hazard', { title: 'B', lossLinks: [l2] })
    const { project, id: g } = group(p, [a, b], 'G')
    expect(new Set(effectiveLosses(project, g))).toEqual(new Set([l1, l2]))
    expect(effectiveLosses(project, a)).toEqual([l1])
    expect(effectiveLosses(project, b)).toEqual([l2])
    expect(computeLabels(project)[b]).toBe('H-1.2')
  })

  it('split reassigns links, merge unions them', () => {
    let p = emptyProject()
    let h: Id, c: Id
    ;[p, h] = add(p, 'hazard', { title: 'H' })
    ;[p, c] = add(p, 'constraint', { hazards: [h] })
    expect(validate(p).some((i) => /no loss/.test(i.message) || /not linked to any loss/.test(i.message))).toBe(true)
    const r = split(p, h, ['H a', 'H b'], { [c]: [1] })
    p = r.project
    const con = p.items[c]
    expect(con.kind === 'constraint' && con.hazards).toEqual([r.ids[1]])
    p = merge(p, [r.ids[0], r.ids[1]], 'merged')
    expect((p.items[c] as { hazards: Id[] }).hazards).toEqual([r.ids[0]])
    expect(p.items[r.ids[1]]).toBeUndefined()
  })

  it('cascades deletes (ca → uca → scenario)', () => {
    let p = emptyProject()
    let n1: Id, n2: Id, ca: Id, u: Id, s: Id
    ;[p, n1] = add(p, 'node', { title: 'C' })
    ;[p, n2] = add(p, 'node', { title: 'P', role: 'process' })
    ;[p, ca] = add(p, 'ca', { from: n1, to: n2 })
    ;[p, u] = add(p, 'uca', { ca })
    ;[p, s] = add(p, 'scenario', { uca: u })
    expect(computeLabels(p)[s]).toBe('LS-1.1')
    p = deleteItems(p, [n2])
    expect(Object.keys(p.items)).toEqual([n1])
  })

  it('supports scenarios for a control action not executed properly', () => {
    let p = emptyProject()
    let n1: Id, n2: Id, ca: Id, h: Id, s: Id
    ;[p, n1] = add(p, 'node', { title: 'C' })
    ;[p, n2] = add(p, 'node', { title: 'A', role: 'actuator' })
    ;[p, ca] = add(p, 'ca', { from: n1, to: n2 })
    ;[p, h] = add(p, 'hazard', { title: 'H' })
    ;[p, s] = add(p, 'scenario', { scenarioType: 'ca', ca, hazards: [h] })
    expect(computeLabels(p)[s]).toBe('LS-CA-1.1')
    expect(validate(p).some((i) => i.item === s)).toBe(false)
    p = deleteItems(p, [h])
    expect((p.items[s] as { hazards: Id[] }).hazards).toEqual([])
    p = deleteItems(p, [ca])
    expect(p.items[s]).toBeUndefined()
  })

  it('delete with promote lifts children', () => {
    let p = emptyProject()
    let a: Id, b: Id
    ;[p, a] = add(p, 'loss', { title: 'A' })
    ;[p, b] = add(p, 'loss', { title: 'B', parent: a })
    p = deleteItems(p, [a], { promote: true })
    expect(computeLabels(p)[b]).toBe('L-1')
    p = updateItem(p, b, { title: 'x' })
    expect((p.items[b] as Hazard).title).toBe('x')
  })
})

describe('file round trip', () => {
  it('serialises stably and loads older scenario files', async () => {
    const { exampleProject } = await import('./example')
    const { serialize, deserialize } = await import('./serialize')
    const p = exampleProject()
    const text = serialize(p)
    expect(serialize(deserialize(text))).toBe(text)
    const withReview = { ...p, reviews: { [Object.keys(p.items)[0]]: { key: 'k', p: { cause: 0.2 } }, gone: { key: 'x', p: {} } } as Record<string, { key: string; p: Record<string, number> }> }
    const back = deserialize(serialize(withReview))
    expect(Object.values(back.reviews ?? {})).toEqual([{ key: 'k', p: { cause: 0.2 } }])
    const old = JSON.parse(text)
    for (const it of Object.values<Record<string, unknown>>(old.items)) {
      if (it.kind === 'scenario') for (const k of ['scenarioType', 'ca', 'hazards', 'cause', 'element']) delete it[k]
    }
    const q = deserialize(JSON.stringify(old))
    const s = Object.values(q.items).find((i) => i.kind === 'scenario')!
    expect(s.kind === 'scenario' && s.scenarioType).toBe('uca')
  })
})

describe('handbook appendix examples', () => {
  it('build into valid projects that survive a file round trip', async () => {
    const { HANDBOOK_EXAMPLES, handbookExampleProject } = await import('./handbookExamples')
    const { serialize, deserialize } = await import('./serialize')
    for (const e of HANDBOOK_EXAMPLES) {
      const p = handbookExampleProject(e.id)
      expect(validate(p).filter((i) => /dangling|leaf/i.test(i.message)), e.id).toEqual([])
      expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
    }
    const bscu = handbookExampleProject('hb-bscu')
    expect(Object.values(bscu.items).filter((i) => i.kind === 'uca')).toHaveLength(13)
    const ah = Object.values(handbookExampleProject('hb-autohold').items)
    expect(ah.filter((i) => i.kind === 'uca' && i.ca)).toHaveLength(15)
    expect(ah.some((i) => i.kind === 'feedback')).toBe(true)
  })
})

describe('published STPA analyses', () => {
  it('build into valid, complete projects that survive a file round trip', async () => {
    const { PUBLISHED_EXAMPLES, publishedExampleProject } = await import('./publishedExamples')
    const { serialize, deserialize } = await import('./serialize')
    for (const e of PUBLISHED_EXAMPLES) {
      const p = publishedExampleProject(e.id)
      expect(validate(p).filter((i) => /dangling|leaf/i.test(i.message)), e.id).toEqual([])
      expect(serialize(deserialize(serialize(p)))).toBe(serialize(p))
      const kinds = new Set(Object.values(p.items).map((i) => i.kind))
      for (const k of ['loss', 'hazard', 'constraint', 'node', 'ca', 'uca', 'scenario', 'requirement', 'assumption'] as const) expect(kinds.has(k), `${e.id} ${k}`).toBe(true)
    }
    const vtt = Object.values(publishedExampleProject('pub-vtt-am').items)
    expect(vtt.filter((i) => i.kind === 'uca')).toHaveLength(6)
    expect(vtt.filter((i) => i.kind === 'loss')).toHaveLength(4)
  })
})
