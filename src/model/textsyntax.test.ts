import { describe, expect, it } from 'vitest'
import { complete, highlight } from './textsyntax'
import { crossingExampleProject } from './crossingExample'

const p = crossingExampleProject()
describe('text syntax', () => {
  it('highlight keeps the text and colours kinds', () => {
    const src = 'some tr1 in Train: Gate position = open and not tr1 approaches Crossing'
    const segs = highlight(p, src)
    expect(segs.map((s) => s.text).join('')).toBe(src)
    const cls = (t: string) => segs.find((s) => s.text === t)?.cls
    expect(cls('some')).toBe('tx-kw')
    expect(cls('Train')).toBe('tx-ent')
    expect(cls('Gate position')).toBe('tx-var')
    expect(cls('and')).toBe('tx-and')
    expect(cls('tr1')).toBe('tx-inst')
  })
  it('never throws', () => { expect(highlight(p, 'a ¤ "open').map((s) => s.text).join('')).toBe('a ¤ "open') })
  it('completes names, keywords and values', () => {
    expect(complete(p, 'Gate po', 7).map((c) => c.text)).toContain('Gate position')
    expect(complete(p, 'x an', 4).map((c) => c.text)).toContain('and')
    const v = complete(p, 'Gate position = ', 16)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every((c) => c.kind === 'value')).toBe(true)
  })
})
