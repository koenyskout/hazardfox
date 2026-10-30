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
})
