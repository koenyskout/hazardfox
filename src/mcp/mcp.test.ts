import { describe, expect, it } from 'vitest'
import { emptyProject } from '../model/create'
import { exampleProject } from '../model/example'
import type { Project } from '../model/types'
import { TOOLS } from './tools'

const run = (p: Project, name: string, args: Record<string, unknown> = {}) => {
  const t = TOOLS.find((x) => x.name === name)!
  const out = t.run(p, args as never)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { p: out.project ?? p, r: out.result as any }
}

describe('mcp tools', () => {
  it('builds an analysis with labels and aliases', () => {
    let p = emptyProject()
    ;({ p } = run(p, 'create_items', { items: [
      { kind: 'loss', fields: { title: 'Loss of life' }, alias: 'l' },
      { kind: 'hazard', fields: { title: 'Vehicle leaves lane', lossLinks: ['$l'] }, alias: 'h' },
      { kind: 'constraint', fields: { title: 'Vehicle must stay in lane', hazards: ['H-1'], description: 'see @[$l]' } },
      { kind: 'node', fields: { title: 'Driver' }, alias: 'd' },
      { kind: 'node', fields: { title: 'Steering' }, alias: 's' },
      { kind: 'ca', fields: { title: 'Steer', from: '$d', to: '$s' }, alias: 'ca' },
      { kind: 'uca', fields: { ca: '$ca', guide: 'provided', hazards: ['$h'], context: 'in a curve' } },
    ] }))
    const list = run(p, 'list_items', { kind: 'uca' }).r
    expect(list.items[0].ref).toBe('UCA-1')
    expect(list.items[0].statement).toBe('Driver provides Steer when in a curve')
    expect(run(p, 'get_item', { ref: 'sc-1' }).r.description).toBe('see @[L-1]')
    expect(run(p, 'uca_coverage').r[0].missing).toHaveLength(3)
  })

  it('rejects bad input atomically', () => {
    const p = exampleProject()
    expect(() => run(p, 'create_items', { items: [{ kind: 'loss', fields: { title: 'ok' } }, { kind: 'constraint', fields: { hazards: ['L-1'] } }] })).toThrow(/items\[1\].*hazards: L-1 is a loss/)
    expect(() => run(p, 'create_items', { items: [{ kind: 'hazard', fields: { bogus: 1 } }] })).toThrow(/unknown field/)
    expect(() => run(p, 'create_items', { items: [{ kind: 'ca', fields: { from: 'CS-1' } }] })).toThrow(/to is required/)
  })

  it('updates, moves and deletes', () => {
    let p = exampleProject()
    ;({ p } = run(p, 'update_items', { updates: [{ ref: 'H-1.2', fields: { parent: null, title: 'Underdose' } }] }))
    expect(run(p, 'get_item', { ref: 'H-3' }).r.title).toBe('Underdose')
    const dry = run(p, 'delete_items', { refs: ['CA-2'], dry_run: true })
    expect(dry.r.deleted.length).toBeGreaterThan(1)
    expect(dry.p).toBe(p)
    ;({ p } = run(p, 'delete_items', { refs: ['CA-2'] }))
    expect(run(p, 'list_items', { kind: 'ca' }).r.total).toBe(1)
    expect(() => run(p, 'move_item', { ref: 'H-1', parent: 'H-1' })).toThrow()
  })

  it('reports validation, summary and report', () => {
    const p = exampleProject()
    expect(run(p, 'validate', { severity: 'warning' }).r.length).toBeGreaterThan(0)
    expect(run(p, 'export_report').r).toContain('UCA-1')
    expect(run(p, 'project_summary').r.nextSteps.length).toBeGreaterThan(0)
  })

  it('fixes agent usability issues', () => {
    let p = emptyProject()
    ;({ p } = run(p, 'create_items', { items: [
      { kind: 'loss', fields: { title: 'Loss of life' } },
      { kind: 'hazard', fields: { title: 'Vehicle leaves lane', lossLinks: ['Loss of life'] } },
      { kind: 'entity', fields: { title: 'Car' }, alias: 'e' },
      { kind: 'variable', fields: { title: 'Gear', parent: '$e', states: ['drive', 'park'] } },
      { kind: 'node', fields: { title: 'Driver' }, alias: 'd' },
      { kind: 'node', fields: { title: 'Steering' }, alias: 's' },
      { kind: 'ca', fields: { title: 'Steer', from: '$d', to: '$s' } },
    ] }))
    const mk = (state: string) => run(p, 'create_items', { items: [{ kind: 'uca', fields: { ca: 'Steer', guide: 'provided', hazards: ['H-1'], conditions: [{ variable: 'Gear', state }] } }] })
    expect(() => mk('reverse')).toThrow(/is not one of drive, park/)
    ;({ p } = mk('park'))
    expect(run(p, 'list_items', { kind: 'uca' }).r.items[0].title).toBe('Driver provides Steer when Gear is park')
    expect('parent' in run(p, 'describe_kinds', { kind: 'ca' }).r.ca.fields).toBe(false)
    ;({ p } = run(p, 'update_items', { updates: [{ ref: 'CA-1', fields: { duration: 'instantaneous', notApplicable: [{ guide: 'not-provided', reason: 'x' }, { guide: 'too-early-late', reason: 'x' }] } }] }))
    expect(run(p, 'project_summary').r.nextSteps.join()).not.toMatch(/lack at least one guide word/)
  })

  it('links a control action to an operation and keeps trace event args and instance conditions', () => {
    let p = emptyProject()
    ;({ p } = run(p, 'create_items', { items: [
      { kind: 'entity', fields: { title: 'Train', many: true }, alias: 't' },
      { kind: 'variable', fields: { title: 'Speed', parent: '$t', type: 'range', min: 0, max: 100 }, alias: 'sp' },
      { kind: 'operation', fields: { title: 'Brake', params: [{ name: 'train', entity: '$t' }], effects: [{ variable: '$sp', state: '0', on: 'train' }] }, alias: 'op' },
      { kind: 'node', fields: { title: 'Ctrl' }, alias: 'c' },
      { kind: 'node', fields: { title: 'Brakes' }, alias: 'b' },
      { kind: 'ca', fields: { title: 'Brake', from: '$c', to: '$b', operation: '$op' }, alias: 'ca' },
      { kind: 'hazard', fields: { title: 'Fast' }, alias: 'h' },
      { kind: 'uca', fields: { ca: '$ca', guide: 'not-provided', hazards: ['$h'], conditions: [{ variable: '$sp', op: '>', state: '5', quant: 'all' }, { text: '@[$sp] > 3', expr: true }] }, alias: 'u' },
      { kind: 'scenario', fields: { uca: '$u', trace: { lanes: [], steps: [{ t: '0', events: [{ on: '$ca', what: 'occurs', args: { train: 't1' } }] }] } } },
    ] }))
    expect(p.items[Object.values(p.items).find((i) => i.kind === 'ca')!.id]).toMatchObject({ operation: Object.values(p.items).find((i) => i.kind === 'operation')!.id })
    expect(run(p, 'get_item', { ref: 'CA-1' }).r.operation).toBe('OP-1')
    const op = run(p, 'get_item', { ref: 'OP-1' }).r
    expect(op.params).toEqual([{ name: 'train', entity: 'E-1' }])
    expect(op.effects).toEqual([{ variable: 'V-1', state: '0', on: 'train' }])
    const u = run(p, 'get_item', { ref: 'UCA-1' }).r
    expect(u.conditions[0]).toMatchObject({ quant: 'all' })
    expect(u.conditions[1]).toMatchObject({ expr: true })
    const sc = Object.values(p.items).find((i) => i.kind === 'scenario')!
    expect(sc.kind === 'scenario' && sc.trace.steps[0].events[0].args).toEqual({ train: 't1' })
    expect(() => run(p, 'create_items', { items: [{ kind: 'uca', fields: { ca: 'CA-1', guide: 'provided', hazards: ['H-1'], conditions: [{ variable: 'Speed', state: '1', quant: 'most' }] } }] })).toThrow(/quant must be/)
  })
})
