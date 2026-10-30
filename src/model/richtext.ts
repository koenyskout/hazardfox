import type { Id } from './types'

/** Rich free text is stored as a plain string: paragraphs split by `\n`, `**bold**`, `*italic*`, `@[id]` references, `\` escapes. */
export type Run = { text: string; bold: boolean; italic: boolean }
export type Seg = Run | { id: Id }
export const isRef = (s: Seg): s is { id: Id } => 'id' in s

const MENTION_AT = /^@\[([^\]]+)\]/

/** Text as paragraphs of runs and references. */
export function parseRich(text: string): Seg[][] {
  return text.split('\n').map((line) => {
    const out: Seg[] = []
    let bold = false, italic = false, buf = ''
    const flush = () => { if (buf) out.push({ text: buf, bold, italic }); buf = '' }
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      const m = c === '@' ? MENTION_AT.exec(line.slice(i)) : null
      if (m) { flush(); out.push({ id: m[1] }); i += m[0].length - 1 }
      else if (c === '\\' && i + 1 < line.length) buf += line[++i]
      else if (c === '*' && line[i + 1] === '*') { flush(); bold = !bold; i++ }
      else if (c === '*') { flush(); italic = !italic }
      else buf += c
    }
    flush()
    return out
  })
}

const esc = (s: string) => s.replace(/[\\*]/g, '\\$&').replace(/@\[/g, '\\@[')

export function serializeRich(paras: Seg[][]): string {
  return paras.map((segs) => {
    let out = '', bold = false, italic = false
    for (const s of segs) {
      if (isRef(s)) { out += `@[${s.id}]`; continue }
      if (s.bold !== bold) { out += '**'; bold = s.bold }
      if (s.italic !== italic) { out += '*'; italic = s.italic }
      out += esc(s.text)
    }
    return out + (bold ? '**' : '') + (italic ? '*' : '')
  }).join('\n')
}

/** Text without formatting marks, references resolved by `ref`. */
export const plainRich = (text: string, ref: (id: Id) => string): string =>
  parseRich(text).map((segs) => segs.map((s) => (isRef(s) ? ref(s.id) : s.text)).join('')).join('\n')
