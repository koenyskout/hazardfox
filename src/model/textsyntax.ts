import { FNS, namesOf } from './lang'
import { TIME_UNITS, type Id, type Project, type Variable } from './types'

/** Syntax colouring and completion for the condition text editor. Tolerant: never throws, whatever the text. */
export interface Seg { text: string; cls: string }
type NameEntry = [string, Id]
interface Tok { start: number; end: number; t: 'ws' | 'num' | 'str' | 'word' | 'ref' | 'op' | 'bad'; v: string; id?: Id; cls: string }

const WORD = /^[\p{L}_][\p{L}\p{N}_.]*/u
const KEYWORDS = ['and', 'or', 'not', 'some', 'all', 'no', 'in', 'between', 'true', 'false']
const KW_CLS: Record<string, string> = { and: 'tx-and', or: 'tx-or', not: 'tx-not' }
const KIND_CLS: Record<string, string> = { variable: 'tx-var', entity: 'tx-ent', ca: 'tx-ev', feedback: 'tx-ev', operation: 'tx-ev' }

const instanceNames = (src: string) => new Set([...src.matchAll(/\b(?:some|all|no)\s+([\p{L}_][\p{L}\p{N}_]*)\s+in\b/gu)].map((m) => m[1]))

function scan(p: Project, src: string, names: NameEntry[]): Tok[] {
  const out: Tok[] = []
  const inst = instanceNames(src)
  let i = 0
  const push = (t: Tok['t'], n: number, cls: string, id?: Id) => { out.push({ start: i, end: i + n, t, v: src.slice(i, i + n), id, cls }); i += n }
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpExecArray | null
    if ((m = /^\s+/.exec(rest))) { push('ws', m[0].length, ''); continue }
    if ((m = /^@\[([^\]]+)\]/.exec(rest))) { push('ref', m[0].length, KIND_CLS[p.items[m[1]]?.kind ?? ''] ?? 'tx-err', m[1] as Id); continue }
    const nm = names.find(([n]) => rest.startsWith(n) && !/[\p{L}\p{N}_]/u.test(rest[n.length] ?? ''))
    if (nm) { push('ref', nm[0].length, KIND_CLS[p.items[nm[1]]?.kind ?? ''] ?? '', nm[1]); continue }
    if ((m = /^\d+(\.\d+)?/.exec(rest))) { push('num', m[0].length, 'tx-num'); continue }
    if ((m = /^"[^"]*"?/.exec(rest))) { push('str', m[0].length, 'tx-str'); continue }
    if ((m = WORD.exec(rest))) {
      const w = m[0]
      const prev = out.filter((x) => x.t !== 'ws').at(-1)
      const cls = KW_CLS[w] ?? (KEYWORDS.includes(w) ? 'tx-kw'
        : (w === 'text' || (FNS as readonly string[]).includes(w)) && /^\s*\(/.test(rest.slice(w.length)) ? 'tx-fn'
        : prev?.t === 'num' && (TIME_UNITS as readonly string[]).includes(w) ? 'tx-num'
        : inst.has(w) ? 'tx-inst' : '')
      push('word', w.length, cls); continue
    }
    if ((m = /^(\/\\|\\\/|<=|>=|!=|[=<>+\-−×*(),{}:?@|$≠≤≥])/.exec(rest))) { push('op', m[0].length, m[0] === '/\\' ? 'tx-and' : m[0] === '\\/' ? 'tx-or' : 'tx-op'); continue }
    push('bad', 1, 'tx-err')
  }
  return out
}

/** The text split into coloured segments; their texts concatenate to exactly `src`. */
export function highlight(p: Project, src: string, names: NameEntry[] = namesOf(p)): Seg[] {
  return scan(p, src, names).map((t) => ({ text: t.v, cls: t.cls }))
}

export interface Completion { /** where the replaced text starts */ from: number; text: string; insert: string; kind: 'variable' | 'entity' | 'event' | 'keyword' | 'function' | 'instance' | 'value'; /** move the caret this many characters back after inserting */ back: number }

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}_.]/u.test(c)
const KIND_ORDER: Completion['kind'][] = ['value', 'instance', 'variable', 'entity', 'event', 'function', 'keyword']

/** Suggestions for the text before the caret. */
export function complete(p: Project, src: string, caret: number, names: NameEntry[] = namesOf(p)): Completion[] {
  const before = src.slice(0, caret)
  const low = before.toLowerCase()
  const out: Completion[] = []
  const prefixOf = (cand: string, min = 1): number => {
    const c = cand.toLowerCase()
    for (let len = Math.min(c.length, before.length); len >= min; len--) {
      if (/\s/.test(before[before.length - len]) || isWordChar(before[before.length - len - 1])) continue
      if (c.startsWith(low.slice(-len))) return len
    }
    return 0
  }
  // after "variable =" / "≠": the values of that variable
  const toks = scan(p, before, names).filter((t) => t.t !== 'ws')
  let opAt = -1
  for (let k = toks.length - 1; k >= 0 && k >= toks.length - 3; k--) if (toks[k].t === 'op' && (toks[k].v === '=' || toks[k].v === '≠' || toks[k].v === '!=')) { opAt = k; break }
  if (opAt > 0) {
    let j = opAt - 1
    while (j >= 0 && (toks[j].t === 'word' || (toks[j].t === 'op' && (toks[j].v === '@' || toks[j].v === '|')))) j--
    const v = j >= 0 && toks[j].t === 'ref' ? p.items[toks[j].id!] : undefined
    if (v?.kind === 'variable') {
      const vv = v as Variable
      const states = vv.type === 'boolean' ? ['true', 'false'] : vv.type === 'enum' ? vv.states : []
      const rest = before.slice(toks[opAt].end).replace(/^\s+/, '')
      for (const s of states) if (s.toLowerCase().startsWith(rest.toLowerCase()) && s.toLowerCase() !== rest.toLowerCase()) out.push({ from: caret - rest.length, text: s, insert: s, kind: 'value', back: 0 })
      if (out.length || !rest) return out
    }
  }
  for (const n of instanceNames(src)) { const l = prefixOf(n); if (l && l < n.length) out.push({ from: caret - l, text: n, insert: n, kind: 'instance', back: 0 }) }
  for (const [n, id] of names) {
    const l = prefixOf(n)
    const k = p.items[id]?.kind
    if (l && l < n.length) out.push({ from: caret - l, text: n, insert: n, kind: k === 'variable' ? 'variable' : k === 'entity' ? 'entity' : 'event', back: 0 })
  }
  for (const f of ['text', ...FNS.filter((x) => /^[a-z]/i.test(x))]) {
    const l = prefixOf(f)
    if (l && l < f.length) out.push({ from: caret - l, text: f + '(…)', insert: f === 'text' ? 'text("")' : f + '()', kind: 'function', back: f === 'text' ? 2 : 1 })
  }
  for (const w of KEYWORDS) { const l = prefixOf(w); if (l && l < w.length) out.push({ from: caret - l, text: w, insert: w + ' ', kind: 'keyword', back: 0 }) }
  const seen = new Set<string>()
  return out
    .filter((c) => { const k = c.kind + c.text; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => (caret - a.from < caret - b.from ? 1 : caret - a.from > caret - b.from ? -1 : 0) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.text.localeCompare(b.text))
    .slice(0, 10)
}
