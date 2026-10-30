import { describe, expect, it } from 'vitest'
import { parseRich, plainRich, serializeRich } from './richtext'

describe('richtext', () => {
  it('round-trips formatting, references, escapes and paragraphs', () => {
    for (const t of ['plain', 'a **b** *c* ***d*** e', 'see @[x-1] and @[y]', 'line1\nline2\n\nline4', 'lit \\* star \\\\ \\@[no]', '**bold @[r] bold**'])
      expect(serializeRich(parseRich(t))).toBe(t)
  })
  it('renders plain text', () => {
    expect(plainRich('a **b** @[x]\n*c*', (id) => id.toUpperCase())).toBe('a b X\nc')
  })
})
