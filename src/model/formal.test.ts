import { describe, expect, it } from 'vitest'
import { emptyProject } from './create'
import { exampleProject } from './example'
import { publishedExampleProject } from './publishedExamples'
import { addBelief, addSignal, beliefsAbout, beliefsOf, predicateOf, signalsOf, updatedBy } from './formal'
import { computeLabels, displayLabels } from './labels'
import { createItem, deleteItems, updateItem } from './ops'
import { deserialize, serialize } from './serialize'
import { diagnose, draftTrace, holds, pickValue, ruleConflicts, ruleValue, traceState, valueAt, witness } from './traces'
import { expand, refineUca } from './refinement'
import { itemsOfKind } from './tree'
import { allOf, anyOf, whenText } from './variables'
import { validate } from './validate'
import type { Condition, Id, Project, Scenario, Trace, Variable } from './types'

function base() {
  let p: Project = emptyProject()
  const mk = <T,>(r: { project: Project; id: Id }) => { p = r.project; return r.id as T & Id }
  const ent = mk(createItem(p, 'entity', { title: 'Tank' }))
  const level = mk(createItem(p, 'variable', { title: 'Level', parent: ent, states: ['ok', 'high'] }))
  const ctrl = mk(createItem(p, 'node', { title: 'Ctrl', role: 'controller' }))
  const proc = mk(createItem(p, 'node', { title: 'Tank', role: 'process' }))
  const ca = mk(createItem(p, 'ca', { title: 'Open inlet', from: ctrl, to: proc, affects: [level] }))
  const fb = mk(createItem(p, 'feedback', { title: 'Level reading', from: proc, to: ctrl }))
  const uca = mk(createItem(p, 'uca', { ca, guide: 'provided', conditions: [{ variable: level, op: '=', state: 'high' }] }))
  return { p, level, ctrl, ca, fb, uca }
}

describe('formal variable layers', () => {
  it('adding a signal gives the receiving controller a belief, once', () => {
    let { p, level, ctrl, fb } = base()
    p = addSignal(p, fb, level).project
    p = addSignal(p, fb, level).project
    expect(signalsOf(p, fb)).toHaveLength(1)
    const [b] = beliefsAbout(p, ctrl, level)
    expect(b.states).toEqual(['ok', 'high'])
    expect(updatedBy(p, b).map((s) => s.id)).toEqual([signalsOf(p, fb)[0].id])
    expect(addBelief(p, ctrl, level).project).toBe(p)
  })

  it('flags unrepresented and non-world context variables', () => {
    let { p, level, ctrl, uca } = base()
    expect(validate(p).some((i) => i.rule === 'context-unrepresented')).toBe(true)
    p = addBelief(p, ctrl, level).project
    expect(validate(p).some((i) => i.rule === 'context-unrepresented')).toBe(false)
    const b = beliefsOf(p, ctrl)[0].id
    p = updateItem(p, uca, { conditions: [{ variable: b, op: '=', state: 'high' }] })
    expect(validate(p).some((i) => i.rule === 'context-not-world')).toBe(true)
  })

  it('deleting a world variable removes its trace values and clears about', () => {
    let { p, level, ctrl, fb, uca } = base()
    p = addSignal(p, fb, level).project
    const r = createItem(p, 'scenario', { uca, cause: 'feedback' })
    p = updateItem(r.project, r.id, { trace: draftTrace(r.project, r.project.items[r.id] as Scenario) })
    p = deleteItems(p, [level])
    const s = p.items[r.id] as Scenario
    expect(s.trace.lanes).not.toContain(level)
    expect(s.trace.steps.every((x) => !(level in x.values))).toBe(true)
    expect(beliefsOf(p, ctrl)[0].about).toBeNull()
  })

  it('migrates old process models and feedback variables', () => {
    const { p, level, ctrl, fb } = base()
    const raw = JSON.parse(serialize(p))
    const at = (id: Id) => raw.items.find((i: { id: Id }) => i.id === id)
    at(ctrl).processModel = [level]
    at(fb).variables = [level]
    const q = deserialize(JSON.stringify(raw))
    expect(beliefsAbout(q, ctrl, level)).toHaveLength(1)
    expect(signalsOf(q, fb).map((s) => s.about)).toEqual([level])
    expect('processModel' in q.items[ctrl]).toBe(false)
  })
})

describe('traces', () => {
  const range: Variable = { ...(base().p.items[base().level] as Variable), type: 'range', min: 0, max: 100, unit: '', states: [] }
  it('picks values that satisfy (or violate) a condition', () => {
    const cs: Condition[] = [{ variable: '', op: '>', state: '50' }, { variable: '', op: 'between', state: '20', to: '40' }, { variable: '', op: 'not between', state: '0', to: '40' }]
    for (const c of cs) {
      expect(holds(range, c, pickValue(range, c))).toBe(true)
      expect(holds(range, c, pickValue(range, c, true))).toBe(false)
    }
  })

  it('carries values forward', () => {
    const t: Trace = { lanes: ['a'], steps: [{ t: '0', note: '', values: { a: '1' }, events: [] }, { t: '1', note: '', values: {}, events: [] }] }
    expect(valueAt(t, 1, 'a')).toEqual({ value: '1', set: false })
  })

  it.each([['pump', exampleProject], ['train door', () => publishedExampleProject('pub-train-door')]])('drafted %s traces witness their UCA and match their cause', (_, make) => {
    const p = make()
    expect(validate(p).filter((i) => i.severity === 'error' || i.rule?.startsWith('context-'))).toEqual([])
    for (const s of itemsOfKind(p, 'scenario').filter((s) => s.trace.steps.length)) {
      if (s.scenarioType === 'uca') {
        expect(witness(p, s)?.ok).toBe(true)
        expect(diagnose(p, s)?.cause).toBe(s.cause)
      }
    }
    expect(validate(p).filter((i) => i.rule?.startsWith('trace-'))).toEqual([])
  })

  it('makes entity attributes world variables and relationships boolean predicates', () => {
    let p = emptyProject()
    const a = createItem(p, 'entity', { title: 'Person' }); p = a.project
    const d = createItem(p, 'entity', { title: 'Door' }); p = d.project
    const r = createItem(p, 'relationship', { title: 'is in doorway of', from: a.id, to: d.id }); p = r.project
    const pred = predicateOf(p, r.id)!
    expect(pred).toMatchObject({ layer: 'domain', type: 'boolean', parent: r.id })
    expect(displayLabels(p, computeLabels(p))[pred.id]).toBe('Person is in doorway of Door')
    const c = createItem(p, 'node', { title: 'Ctrl', role: 'controller' }); p = addBelief(c.project, c.id, pred.id).project
    expect(beliefsAbout(p, c.id, pred.id)[0]).toMatchObject({ title: 'Person is in doorway of Door', type: 'boolean' })
    expect(validate(p).filter((i) => i.rule === 'no-title' || i.rule === 'variable-owner')).toEqual([])
    const old = JSON.parse(serialize(p))
    for (const it of old.items) if (it.kind === 'entity') it.attributes = [{ name: 'Open', type: 'boolean' }, { name: 'Width', type: 'number' }]
    old.items = old.items.filter((it: { parent?: string }) => it.parent !== r.id)
    const q = deserialize(JSON.stringify(old))
    const vars = itemsOfKind(q, 'variable').filter((v) => v.parent === d.id).map((v) => [v.title, v.type])
    expect(vars).toEqual([['Open', 'boolean'], ['Width', 'range']])
    expect(predicateOf(q, r.id)).toBeTruthy()
    expect('attributes' in q.items[d.id]).toBe(false)
  })

  it('links a node to several entities; old single `entity` links migrate', () => {
    let p = emptyProject()
    const a = createItem(p, 'entity', { title: 'Door' }); p = a.project
    const b = createItem(p, 'entity', { title: 'Platform' }); p = b.project
    const n = createItem(p, 'node', { title: 'Physical process', role: 'process', entities: [a.id, b.id] }); p = n.project
    expect(deserialize(serialize(p)).items[n.id]).toMatchObject({ entities: [a.id, b.id] })
    const old = JSON.parse(serialize(p))
    for (const it of old.items) if (it.kind === 'node') { delete it.entities; it.entity = a.id }
    const q = deserialize(JSON.stringify(old))
    expect(q.items[n.id]).toMatchObject({ entities: [a.id] })
    expect('entity' in q.items[n.id]).toBe(false)
    expect(deleteItems(p, [b.id]).items[n.id]).toMatchObject({ entities: [a.id] })
  })
})

describe('refinement', () => {
  function train() {
    let p = emptyProject()
    const mk = (r: { project: Project; id: Id }) => { p = r.project; return r.id }
    const ent = mk(createItem(p, 'entity', { title: 'Train' }))
    const speed = mk(createItem(p, 'variable', { title: 'Speed', parent: ent, type: 'range', min: 0, max: 200, unit: 'km/h' }))
    const fire = mk(createItem(p, 'variable', { title: 'Fire', parent: ent, type: 'boolean' }))
    const smoke = mk(createItem(p, 'variable', { title: 'Smoke', parent: ent, type: 'boolean' }))
    const moving = mk(createItem(p, 'variable', { title: 'Motion', parent: ent, states: ['stopped', 'moving'], rules: [{ state: 'moving', when: allOf({ variable: speed, op: '>', state: '0.5' }) }], otherwise: 'stopped' }))
    const em = mk(createItem(p, 'variable', { title: 'Emergency', parent: ent, states: ['none', 'evacuation'], rules: [{ state: 'evacuation', when: allOf({ variable: fire, op: '=', state: 'true' }) }, { state: 'evacuation', when: allOf({ variable: smoke, op: '=', state: 'true' }) }], otherwise: 'none' }))
    const ctrl = mk(createItem(p, 'node', { title: 'Ctrl', role: 'controller' }))
    const proc = mk(createItem(p, 'node', { title: 'Door', role: 'process' }))
    const ca = mk(createItem(p, 'ca', { title: 'Open', from: ctrl, to: proc }))
    const uca = mk(createItem(p, 'uca', { ca, guide: 'provided', conditions: [{ variable: moving, op: '=', state: 'moving' }, { variable: em, op: '=', state: 'none' }] }))
    return { p, speed, fire, smoke, moving, em, ctrl, uca }
  }

  it('expands a refined condition into contexts over the parts', () => {
    const { p, fire, smoke, em } = train()
    const v = p.items[em] as Variable
    expect(expand(p, v, { variable: em, op: '=', state: 'evacuation' })).toEqual([[{ variable: fire, op: '=', state: 'true' }], [{ variable: smoke, op: '=', state: 'true' }]])
    expect(expand(p, v, { variable: em, op: '=', state: 'none' })).toEqual([[{ variable: fire, op: '=', state: 'false' }, { variable: smoke, op: '=', state: 'false' }]])
  })

  it('evaluates and expands nested all / any groups; old condition lists load as all of', () => {
    let { p, fire, smoke, speed, em } = train()
    const [f, s, fast] = [{ variable: fire, op: '=' as const, state: 'true' }, { variable: smoke, op: '=' as const, state: 'true' }, { variable: speed, op: '>' as const, state: '100' }]
    p = updateItem(p, em, { rules: [{ state: 'evacuation', when: allOf(fast, anyOf(f, s)) }] })
    const v = p.items[em] as Variable
    expect(whenText(p, v.rules[0].when)).toBe('Speed is greater than 100 km/h and (Fire is true or Smoke is true)')
    expect(ruleValue(p, v, (id) => ({ [speed]: '120', [fire]: 'false', [smoke]: 'true' })[id])).toBe('evacuation')
    expect(ruleValue(p, v, (id) => ({ [speed]: '50' })[id])).toBe('none')
    expect(ruleValue(p, v, (id) => ({ [speed]: '120', [fire]: 'false' })[id])).toBeUndefined()
    expect(expand(p, v, { variable: em, op: '=', state: 'evacuation' })).toEqual([[fast, f], [fast, s]])
    expect(expand(p, v, { variable: em, op: '=', state: 'none' })).toEqual([[{ ...fast, op: '≤' }], [{ ...f, state: 'false' }, { ...s, state: 'false' }]])
    const raw = JSON.parse(serialize(p))
    raw.items.find((x: { id: Id }) => x.id === em).rules = [{ state: 'evacuation', when: [f, s] }]
    expect((deserialize(JSON.stringify(raw)).items[em] as Variable).rules[0].when).toEqual(allOf(f, s))
  })

  it('refines a UCA once, linked to its parent', () => {
    const { p: p0, uca, speed } = train()
    let r = refineUca(p0, uca, 0)
    expect(r.ids).toHaveLength(1)
    expect(r.project.items[r.ids[0]]).toMatchObject({ refines: uca, guide: 'provided' })
    expect((r.project.items[r.ids[0]] as { conditions: Condition[] }).conditions.map((c) => c.variable)).toContain(speed)
    r = refineUca(r.project, uca, 0)
    expect(itemsOfKind(r.project, 'uca')).toHaveLength(2)
    const q = deleteItems(r.project, [uca])
    expect((q.items[r.ids[0]] as { refines: Id | null }).refines).toBeNull()
  })

  it('computes refined values in traces and flags contradictions', () => {
    let { p, speed, moving, ctrl, fire } = train()
    p = addBelief(p, ctrl, speed).project
    p = addBelief(p, ctrl, moving).project
    const [bs, bm] = [beliefsAbout(p, ctrl, speed)[0].id, beliefsAbout(p, ctrl, moving)[0].id]
    const t: Trace = { lanes: [speed, moving, bs, bm], steps: [{ t: '0', note: '', values: { [speed]: '0', [bs]: '0' }, events: [] }, { t: '1', note: '', values: { [speed]: '40', [moving]: 'stopped' }, events: [] }] }
    expect(traceState(p, t, 0)).toMatchObject({ [moving]: 'stopped', [bm]: 'stopped' })
    expect(traceState(p, t, 1)).toMatchObject({ [moving]: 'moving', [bm]: 'stopped' })
    expect(ruleConflicts(p, t, 1)).toEqual([[moving, 'stopped', 'moving']])
    p = updateItem(p, fire, { rules: [{ state: 'true', when: allOf({ variable: moving, op: '=', state: 'moving' }) }] })
    p = updateItem(p, moving, { rules: [{ state: 'moving', when: allOf({ variable: fire, op: '=', state: 'true' }) }] })
    expect(validate(p).some((i) => i.rule === 'refinement-cycle')).toBe(true)
  })

  it('counts signals about a part as updating a belief about the whole', () => {
    let { p, speed, moving, ctrl, em } = train()
    const proc = itemsOfKind(p, 'node').find((n) => n.role === 'process')!.id
    const fb = createItem(p, 'feedback', { title: 'Speed', from: proc, to: ctrl }); p = fb.project
    p = addSignal(p, fb.id, speed).project
    p = addBelief(p, ctrl, moving).project
    expect(validate(p).filter((i) => i.rule === 'belief-no-source' && i.item === beliefsAbout(p, ctrl, moving)[0].id)).toEqual([])
    expect(validate(p).filter((i) => i.rule === 'context-unrepresented').map((i) => i.related)).toEqual([[em]])
  })
})
