import { describe, expect, it } from 'vitest'
import { computeLabels, renderText } from './labels'
import { effectiveLosses } from './derived'
import { applyStructType, blankField, createItem, defineEnumType, defineRangeType, defineStructType, deleteStructType, deleteItems, deleteRangeType, group, indent, merge, outdent, renameRangeType, shift, split, updateItem } from './ops'
import { emptyProject, makeItem } from './create'
import { deserialize, serialize } from './serialize'
import { validate } from './validate'
import { guideApplies } from './uca'
import type { Hazard, Id, Kind, Patch, Project, Variable } from './types'

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
    ;[p, n2] = add(p, 'node', { title: 'A', role: 'process' })
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
    const msiv = publishedExampleProject('pub-thomas-msiv')
    const of = (k: string) => Object.values(msiv.items).filter((i) => i.kind === k)
    expect(of('loss')).toHaveLength(4)
    expect(of('hazard')).toHaveLength(4)
    expect(of('constraint')).toHaveLength(6)
    expect(of('uca')).toHaveLength(6)
    expect(of('scenario').some((i) => i.kind === 'scenario' && i.scenarioType === 'ca')).toBe(true)
    expect(validate(msiv).filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('sensors and actuators', () => {
  it('are attributes of arrows, never nodes, in every example', async () => {
    const { HANDBOOK_EXAMPLES, handbookExampleProject } = await import('./handbookExamples')
    const { PUBLISHED_EXAMPLES, publishedExampleProject } = await import('./publishedExamples')
    const { exampleProject } = await import('./example')
    const all = [exampleProject(), ...HANDBOOK_EXAMPLES.map((e) => handbookExampleProject(e.id)), ...PUBLISHED_EXAMPLES.map((e) => publishedExampleProject(e.id))]
    for (const q of all) for (const i of Object.values(q.items)) if (i.kind === 'node') expect(['controller', 'process', 'external']).toContain(i.role)
    const acc = Object.values(handbookExampleProject('hb-cs-acc').items)
    expect(acc.filter((i) => i.kind === 'ca' && i.actuator)).toHaveLength(5)
    expect(acc.filter((i) => i.kind === 'feedback' && i.sensor)).toHaveLength(4)
  })
})

describe('control action duration', () => {
  it('stopped-too-soon applies only to continuous control actions', () => {
    let p = emptyProject()
    let ca: Id
    ;[p, ca] = add(p, 'ca', { title: 'Brake' })
    const get = () => p.items[ca] as Extract<Project['items'][Id], { kind: 'ca' }>
    expect(guideApplies(get(), 'stopped-too-soon')).toBe(true)
    p = updateItem(p, ca, { duration: 'instantaneous' })
    expect(guideApplies(get(), 'stopped-too-soon')).toBe(false)
    expect(guideApplies(get(), 'provided')).toBe(true)
  })
})

describe('variable types and conditions', () => {
  it('compares a variable with another variable', async () => {
    const { conditionText, conditionError } = await import('./variables')
    const { condHolds } = await import('./traces')
    const { makeItem } = await import('./create')
    let q = emptyProject()
    const mk = (title: string) => { const r = createItem(q, 'variable', { ...makeItem('variable'), type: 'range' as const, title, unit: 'ml' }); q = r.project; return r.id }
    const flow = mk('Flow'), dose = mk('Prescribed dose')
    const c = { kind: 'var' as const, variable: flow, op: '>' as const, other: dose }
    expect(conditionText(q, c)).toBe('Flow is greater than Prescribed dose')
    expect(conditionError(q.items[flow] as never, c, q)).toBeNull()
    expect(condHolds(q, c, (id) => ({ [flow]: '5', [dose]: '3' })[id])).toBe(true)
    expect(condHolds(q, c, (id) => ({ [flow]: '2', [dose]: '3' })[id])).toBe(false)
    expect(condHolds(q, c, (id) => ({ [flow]: '2' })[id])).toBeNull()
    const h = createItem(q, 'hazard', { conditions: [c] })
    q = deleteItems(h.project, [dose])
    expect((q.items[h.id] as Hazard).conditions).toEqual([])
  })
  it('describes states, validates conditions per type', async () => {
    const { describeStates, conditionError, conditionText, opsFor } = await import('./variables')
    const { makeItem } = await import('./create')
    const range = { ...makeItem('variable'), type: 'range' as const, unit: '%', min: 0, max: 100 }
    expect(describeStates(range)).toBe('0–100 %')
    expect(opsFor(range)).toContain('between')
    expect(opsFor({ ...makeItem('variable'), type: 'boolean' })).toEqual(['=', '≠'])
    expect(conditionError(range, { kind: 'value', variable: 'x', op: 'between', state: '20', to: '10' })).toMatch(/exceeds/)
    expect(conditionError(range, { kind: 'value', variable: 'x', op: '>', state: 'abc' })).toMatch(/not a number/)
    expect(conditionText({ ...emptyProject(), items: { x: { ...range, id: 'x', title: 'Rate' } } }, { kind: 'value', variable: 'x', op: 'not between', state: '1', to: '5' })).toBe('Rate is not between 1 and 5 %')
    expect(conditionError(range, { kind: 'value', variable: 'x', op: '≥', state: '5' })).toBeNull()
    expect(conditionError({ ...range, type: 'boolean' }, { kind: 'value', variable: 'x', op: '<', state: 'true' })).toMatch(/does not apply/)
    const en = { ...makeItem('variable'), title: 'Mode', states: ['a', 'b', 'c'] }
    expect(opsFor(en)).toEqual(['=', '≠', 'in', 'not in'])
    expect(conditionError(en, { kind: 'value', variable: 'x', op: 'in', state: '', set: ['a', 'z'] })).toMatch(/"z" is not one of/)
    expect(conditionError(en, { kind: 'value', variable: 'x', op: 'not in', state: '', set: ['a', 'b'] })).toBeNull()
    let p = emptyProject()
    p = createItem(p, 'variable', { ...range, title: 'Rate' }).project
    const v = Object.values(p.items)[0]
    expect(conditionText(p, { kind: 'value', variable: v.id, op: 'between', state: '1', to: '5' })).toBe('Rate is between 1 and 5 %')
  })
})

describe('struct and enum types', () => {
  it('apply a struct as one variable per field, sharing named types', () => {
    const e = createItem(emptyProject(), 'entity', { title: 'Train' })
    let p = defineRangeType(defineEnumType(e.project, 'OnOff', ['on', 'off']), 'Pct', { min: 0, max: 100, unit: '%' })
    p = defineStructType(p, 'Door', { fields: [{ ...blankField(), name: 'open', type: 'enum', enumType: 'OnOff' }, { ...blankField(), name: 'gap', type: 'range', rangeType: 'Pct' }, blankField()] })
    p = applyStructType(p, 'Door', 'front', e.id)
    const vs = Object.values(p.items).filter((i): i is Variable => i.kind === 'variable')
    expect(vs.map((v) => v.title).sort()).toEqual(['front.gap', 'front.open'])
    expect(vs.find((v) => v.title === 'front.open')!.states).toEqual(['on', 'off'])
    expect(vs.find((v) => v.title === 'front.gap')!.max).toBe(100)
    expect(deserialize(serialize(p)).structTypes!.Door.fields).toHaveLength(3)
    p = defineStructType(p, 'Train', { fields: [{ ...blankField(), name: 'door', structType: 'Door' }, { ...blankField(), name: 'self', structType: 'Train' }] })
    p = applyStructType(p, 'Train', 't', e.id)
    expect(Object.values(p.items).filter((i) => i.kind === 'variable' && i.title.startsWith('t.door.')).length).toBe(2)
    // variables follow the type: add / rename / remove fields
    const doorT = p.structTypes!.Door
    p = defineStructType(p, 'Door', { fields: [{ ...doorT.fields[0], name: 'state' }, doorT.fields[1], { ...blankField(), name: 'locked', type: 'boolean' }] })
    const titles = () => Object.values(p.items).filter((i): i is Variable => i.kind === 'variable').map((v) => v.title).sort()
    expect(titles()).toEqual(['front.gap', 'front.locked', 'front.state', 't.door.gap', 't.door.locked', 't.door.state'])
    p = defineStructType(p, 'Door', { fields: [doorT.fields[1]] })
    expect(titles()).toEqual(['front.gap', 't.door.gap'])
    p = deleteStructType(p, 'Door')
    expect(titles()).toEqual(['front.gap', 't.door.gap'])
    expect(Object.values(p.items).some((i) => i.kind === 'variable' && i.struct)).toBe(false)
  })
})

describe('range types', () => {
  it('are shared by variables and follow edits', () => {
    const mk = (p: Project, title: string) => createItem(p, 'variable', { ...makeItem('variable'), type: 'range' as const, title, min: 0, max: 100, unit: '%' })
    const first = mk(emptyProject(), 'A')
    const second = mk(first.project, 'B')
    const [a, b] = [first.id, second.id]
    let p = defineRangeType(second.project, 'Percentage', { min: 0, max: 100, unit: '%' })
    p = updateItem(updateItem(p, a, { rangeType: 'Percentage' }), b, { rangeType: 'Percentage' })
    p = updateItem(p, a, { max: 200 })
    expect((p.items[b] as Variable).max).toBe(200)
    expect(p.rangeTypes!.Percentage.max).toBe(200)
    p = renameRangeType(p, 'Percentage', 'Pct')
    expect((p.items[a] as Variable).rangeType).toBe('Pct')
    expect(deserialize(serialize(p)).rangeTypes!.Pct.max).toBe(200)
    p = deleteRangeType(p, 'Pct')
    expect((p.items[a] as Variable).rangeType).toBe('')
    expect((p.items[a] as Variable).max).toBe(200)
  })
})
