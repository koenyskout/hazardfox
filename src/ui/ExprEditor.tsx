import { useEffect, useState, type ReactNode } from 'react'
import { Select } from './Select'
import { Cascade, type CGroup, type COpt } from './Cascade'
import { ChipLabel, Icon } from './Icon'
import { RichText, TextInput } from './Fields'
import { useLabels, useProject } from './hooks'
import { readRel, relName, renderText, shortName, variableName } from '../model/labels'
import { isPredicate } from '../model/formal'
import { itemsOfKind } from '../model/tree'
import { manyEntity } from '../model/variables'
import { QUANTIFIERS, QUANT_LABELS, TIME_UNITS, type Id, type Item, type Project, type Quantifier, type Relationship, type TimeUnit, type Variable } from '../model/types'
import { ANY, BOOL, HOLE, val, at, check, checkError, children, eq, fills, namesOf, num, opsFor, parseExpr, printExpr, quant, replaceAt, scopeAt, slotType, typeOf, walk, type Candidate, type CmpOp, type Ctx, type Expr, type Fn, type Ty } from '../model/lang'

type Q = Extract<Expr, { k: 'quant' }>
type Edit = (path: number[], to: Expr) => void
interface Env { p: Project; root: Expr; ctx: Ctx; vars: Variable[]; edit: Edit; wrap: (path: number[], q: Q) => void; remove: (path: number[]) => void }

const ARITY_WORD: Record<Fn, string> = { '+': '+', '−': '−', '×': '×', min: 'min', max: 'max', abs: 'abs', prev: 'previous', succ: 'next', pred: 'before', since: 'since', heldFor: 'held for' }

/** A variable as a pill (layer icon, short name); the owner follows when the name does not say it (or other listed variables share the name). */
function VarPill({ v, vars, owned }: { v: Variable; vars: Variable[]; /** the owner is shown elsewhere (a heading) */ owned?: boolean }) {
  const p = useProject()
  const labels = useLabels()
  const short = shortName(p, v)
  const par = v.parent ? p.items[v.parent] : null
  const owner = !par ? '' : par.kind === 'relationship' ? relName(p, par) : par.title.trim() || labels[par.id]
  const show = !owned && !!owner && owner !== short && (!short.toLowerCase().includes(owner.toLowerCase()) || vars.some((o) => o.id !== v.id && shortName(p, o) === short))
  return <span className="chip k-variable"><ChipLabel it={v} label={labels[v.id]} />{show && <span className="pill-owner"> · {owner}</span>}</span>
}
const EntityPill = ({ e }: { e: Item }) => <span className="chip k-entity"><ChipLabel it={e} label={e.title} /></span>
/** Variables for the picker, listed under their owner. */
function varOpts(p: Project, labels: ReturnType<typeof useLabels>, vars: Variable[], all: Variable[], value: (v: Variable) => string): COpt[] {
  const owner = (v: Variable) => (v.parent && p.items[v.parent] ? p.items[v.parent] : null)
  const key = (v: Variable) => owner(v)?.id ?? ''
  const order = [...new Set(vars.map(key))]
  return order.flatMap((k) => vars.filter((v) => key(v) === k).map((v): COpt => {
    const o = owner(v)
    return { value: value(v), text: `${labels[v.id]} ${o ? labels[o.id] ?? o.title : ''}`, node: <VarPill v={v} vars={all} owned />, section: o ? { key: o.id, node: <span className={'chip k-' + o.kind}><ChipLabel it={o} label={labels[o.id]} /></span> } : { key: '', node: <>Other variables</> } }
  }))
}

/** Names used by quantifiers anywhere in the condition. */
const usedNames = (e: Expr): Set<string> => { const s = new Set<string>(); walk(e, (x) => { if (x.k === 'quant') s.add(x.name) }); return s }
const freshName = (p: Project, root: Expr, entity: Id): string => {
  const base = ((p.items[entity]?.title ?? '').trim()[0] ?? 'x').toLowerCase()
  const used = usedNames(root)
  let n = 1
  while (used.has(base + n)) n++
  return base + n
}

/** The condition (the root, or a sub-condition); `null` while empty. Edits are always well typed: slots offer only what fits. */
export function ConditionEditor({ e, onChange, vars, head }: { e: Expr | null; onChange: (e: Expr | null) => void; vars?: Variable[]; head?: ReactNode }) {
  const p = useProject()
  const [mode, setMode] = useState<'rows' | 'text'>('rows')
  const root = e ?? HOLE
  const all = vars ?? itemsOfKind(p, 'variable')
  const ctx: Ctx = { p }
  const set = (x: Expr) => onChange(x.k === 'hole' ? null : x)
  const env: Env = {
    p, root, ctx, vars: all,
    edit: (path, to) => set(replaceAt(root, path, to)),
    // a quantifier around the condition (atom) the path is in
    wrap: (path, q) => {
      let k = 0
      let x: Expr | undefined = root
      while (x && k < path.length && (x.k === 'and' || x.k === 'or' || x.k === 'not' || x.k === 'quant')) { x = children(x)[path[k]]; k++ }
      const atom = path.slice(0, k)
      const inner = at(root, atom) ?? HOLE
      set(replaceAt(root, atom, { ...q, body: inner }))
    },
    remove: (path) => {
      if (!path.length) return set(HOLE)
      const parent = at(root, path.slice(0, -1))
      const i = path[path.length - 1]
      if (parent && (parent.k === 'and' || parent.k === 'or')) { const rest = parent.of.filter((_, j) => j !== i); set(replaceAt(root, path.slice(0, -1), rest.length === 1 ? rest[0] : { ...parent, of: rest })); return }
      set(replaceAt(root, path, HOLE))
    },
  }
  return (
    <div className="rule">
      <div className="tx-tabs">
        <button type="button" className={mode === 'rows' ? 'on' : ''} onClick={() => setMode('rows')}>Rows</button>
        <button type="button" className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')} title="Edit the condition as text">Text</button>
      </div>
      {mode === 'text'
        ? <><span className="rule-head">{head}</span><TextEdit e={root} ctx={ctx} onChange={set} /></>
        : <Group env={env} x={root} path={[]} head={head} top />}
    </div>
  )
}

function TextEdit({ e, ctx, onChange }: { e: Expr; ctx: Ctx; onChange: (e: Expr) => void }) {
  const { p } = ctx
  const name = (id: Id) => { const it = p.items[id]; return it?.kind === 'variable' ? variableName(p, it) : it?.title ?? '' }
  const canonical = e.k === 'hole' ? '' : printExpr(e, name)
  const [draft, setDraft] = useState(canonical)
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setDraft(canonical) }, [canonical, focus])
  let parsed: Expr | null = null
  let error: string | null = null
  if (draft.trim()) { try { parsed = parseExpr(p, draft, namesOf(p)); error = checkError(ctx, parsed) } catch (x) { error = (x as Error).message } }
  const commit = () => { setFocus(false); if (!draft.trim()) onChange(HOLE); else if (parsed && !error) onChange(parsed) }
  return (
    <div>
      <div className="tx">
        <pre aria-hidden>{draft.split('\n').map((l, i) => <div key={i}>{l}{'​'}</div>)}</pre>
        <textarea spellCheck={false} value={draft} onFocus={() => setFocus(true)} onChange={(x) => setDraft(x.target.value)} onBlur={commit} />
      </div>
      {error ? <div className="tx-msg">{error}</div> : <div className="tx-hint">Variables by name; <code>and</code>, <code>or</code>, <code>not</code>, <code>some|all|no name in Entity: …</code>, <code>x between a and b</code>, <code>x in {'{a, b}'}</code>, <code>heldFor(c) ≥ 5 s</code>, <code>text("…")</code>.</div>}
    </div>
  )
}

/** and / or: members as rows, with buttons for what may be added. */
function Group({ env, x, path, head, top, onRemove }: { env: Env; x: Expr; path: number[]; head?: ReactNode; top?: boolean; onRemove?: () => void }) {
  const members = x.k === 'and' || x.k === 'or' ? x.of : x.k === 'hole' ? [] : [x]
  const kind = x.k === 'or' ? 'any' : 'all'
  const { edit } = env
  const setMembers = (of: Expr[]) => edit(path, of.length === 1 && top ? of[0] : { k: x.k === 'or' ? 'or' : 'and', of })
  const base = x.k === 'and' || x.k === 'or' ? path : null
  const pathOf = (i: number) => (base ? [...path, i] : path)
  const add = (m: Expr) => setMembers([...members, m])
  // a lone quantifier owns the add bar (inside it): one bar, not one inside and one outside
  const sole = members.length === 1 && members[0].k === 'quant'
  return (
    <>
      <div className="rule-head">
        {head}
        {top && members.length < 2 ? (sole ? null : <span className="wv-tag">all of</span>) : <Select className={'tagsel ' + kind} value={kind} onChange={(ev) => edit(path, { k: ev.target.value === 'any' ? 'or' : 'and', of: members })}><option value="all">All of</option><option value="any">Any of</option></Select>}
        {onRemove && <button className="x" title="Remove group" onClick={onRemove}><Icon name="x" size={12} /></button>}
      </div>
      <div className={'conds g-' + kind + (top ? '' : ' group') + (sole && top ? ' sole' : '')}>
        {members.map((m, i) => <Row key={i} env={env} x={m} path={pathOf(i)} onRemove={() => setMembers(members.filter((_, j) => j !== i))} />)}
        {!sole && <div className="rule-add">
          <button onClick={() => add(HOLE)}><Icon name="plus" size={12} /> condition</button>
          <button title="Time since a control action or feedback occurred. Only checked in traces whose steps have times such as 5 s." onClick={() => add({ k: 'cmp', op: '≥', l: { k: 'app', fn: 'since', args: [{ k: 'event', id: '' as never }] }, r: num('', 's') })}><Icon name="plus" size={12} /> time since an event</button>
          <button title="A condition written in words, for something that is not a variable. Traces treat it as true or false." onClick={() => add({ k: 'text', text: '' })}><Icon name="plus" size={12} /> free text</button>
          <button title="A nested group" onClick={() => add({ k: x.k === 'or' ? 'and' : 'or', of: [HOLE, HOLE] })}><Icon name="plus" size={12} /> {x.k === 'or' ? 'all of' : 'any of'}</button>
          <button title="Holds when the condition does not" onClick={() => add({ k: 'not', e: HOLE })}><Icon name="plus" size={12} /> not</button>
          <button title="About instances of an entity with several instances: some / every / no instance" onClick={() => add(quant('some', '', firstMany(env.p) ?? ('' as Id<'entity'>), HOLE))}><Icon name="plus" size={12} /> instance</button>
        </div>}
      </div>
    </>
  )
}
const firstMany = (p: Project) => itemsOfKind(p, 'entity').find((x) => manyEntity(p, x.id))?.id

/** One member of a group: a nested group, negation, quantifier, or a single condition. */
function Row({ env, x, path, onRemove }: { env: Env; x: Expr; path: number[]; onRemove: () => void }) {
  const { edit } = env
  const remove = <button className="x" title="Remove" onClick={onRemove}><Icon name="x" size={12} /></button>
  switch (x.k) {
    case 'and': case 'or': return <Group env={env} x={x} path={path} onRemove={onRemove} />
    case 'not': return (
      <div className="cond xr">
        <span className="wv-tag wv-not">not</span>
        <div className="cond-in"><Row env={env} x={x.e} path={[...path, 0]} onRemove={() => edit(path, x.e)} /></div>
        {remove}
      </div>
    )
    case 'quant': return <QuantRow env={env} x={x} path={path} remove={remove} />
    case 'text': return (
      <div className="cond xr">
        <span className="cond-text"><RichText compact value={x.text} onChange={(text) => edit(path, { k: 'text', text })} only={(it) => it.kind === 'variable' || it.kind === 'entity' || it.kind === 'relationship'} placeholder="condition in words… (type @ to refer to a variable)" /></span>
        <span className="cond-word">holds</span>
        {remove}
      </div>
    )
    case 'hole': return <div className="cond xr"><Starter env={env} path={path} />{remove}</div>
    default: return <Leaf env={env} x={x} path={path} remove={remove} />
  }
}

function QuantRow({ env, x, path, remove }: { env: Env; x: Q; path: number[]; remove: ReactNode }) {
  const { p, edit } = env
  const entities = itemsOfKind(p, 'entity').filter((e) => manyEntity(p, e.id))
  const body = x.body
  const multi = body.k === 'and' || body.k === 'or'
  return (
    <div className="cond xr cond-q">
      <div className="decl">
        <span className="cond-word">for</span>
        <Select value={x.q} onChange={(ev) => edit(path, { ...x, q: ev.target.value as Quantifier })}>{QUANTIFIERS.map((q) => <option key={q} value={q}>{QUANT_LABELS[q]}</option>)}</Select>
        <Select value={x.entity} onChange={(ev) => edit(path, { ...x, entity: ev.target.value as Id<'entity'>, name: x.name || freshName(p, env.root, ev.target.value as Id) })}>
          <option value="" disabled hidden>entity…</option>
          {entities.map((e) => <option key={e.id} value={e.id} label={e.title.trim() || 'instance'}><EntityPill e={e} /></option>)}
        </Select>
        <input className="decl-name" value={x.name} placeholder="name" onChange={(ev) => edit(path, { ...x, name: ev.target.value.replace(/\s/g, '') })} />
        {!multi && <button type="button" className="decl-add" title="Add another condition inside" onClick={() => edit([...path, 0], { k: 'and', of: [body, HOLE] })}><Icon name="plus" size={12} /> and</button>}
        {remove}
      </div>
      <div className="cond-in">{multi ? <Group env={env} x={body} path={[...path, 0]} /> : <Row env={env} x={body} path={[...path, 0]} onRemove={() => edit([...path, 0], HOLE)} />}</div>
    </div>
  )
}

/** An empty condition: choose what it is about. Only variables the editor may use, plus the non-variable forms. */
function Starter({ env, path }: { env: Env; path: number[] }) {
  const { p, edit, vars } = env
  const labels = useLabels()
  const pick = (v: string) => {
    if (v === '\0words') return edit(path, { k: 'text', text: '' })
    if (v === '\0event') return edit(path, { k: 'cmp', op: '≥', l: { k: 'app', fn: 'since', args: [{ k: 'event', id: '' as never }] }, r: num('', 's') })
    const x = p.items[v]
    if (x?.kind !== 'variable') return
    ensureNames(env, path, mkVar(x.id), (e) => edit(path, x.type === 'boolean' ? e : eq(e, HOLE)))
  }
  const groups: CGroup[] = [
    { key: 'var', label: 'Variable', options: varOpts(p, labels, vars, vars, (v) => v.id) },
    { key: 'cond', label: 'Other condition', options: [{ value: '\0words', text: 'in words', node: <>in words…</> }, { value: '\0event', text: 'time since an event', node: <>time since an event…</> }] },
  ]
  return <Cascade className="cond-var" groups={groups} onPick={pick} display={<span className="muted">variable or condition…</span>} />
}

/** Names for the many-ends of a variable put in a slot: an instance name in scope, else a new quantifier around the condition. */
type V = Extract<Expr, { k: 'var' }>
const mkVar = (id: Id<'variable'>): V => ({ k: 'var', id })
function ensureNames(env: Env, path: number[], v: V, done: (e: Expr) => void): void {
  const cand = fills(scopeAt(env.ctx, env.root, path), ANY).find((c): c is Extract<Candidate, { k: 'var' }> => c.k === 'var' && c.id === v.id)
  const ends = cand?.ends ?? []
  const at: string[] = []
  let wrapped: Q | null = null
  for (const e of ends) {
    if (!e.many) { at.push(''); continue }
    if (e.names.length) { at.push(e.names[0]); continue }
    const name = freshName(env.p, env.root, e.entity)
    at.push(name); wrapped = { k: 'quant', q: 'some', name, entity: e.entity, body: HOLE }
  }
  done(at.some(Boolean) ? { ...v, at } : v)
  if (wrapped) setTimeout(() => env.wrap(path, wrapped!), 0)
}

/** A comparison, range or set test, or a duration over a condition. */
function Leaf({ env, x, path, remove }: { env: Env; x: Expr; path: number[]; remove: ReactNode }) {
  const { edit } = env
  if (x.k === 'cmp' && x.l.k === 'app' && x.l.fn === 'heldFor') return (
    <div className="cond xr">
      <div className="cond-in"><Row env={env} x={x.l.args[0]} path={[...path, 0, 0]} onRemove={() => edit(path, HOLE)} /></div>
      <span className="cond-word">held for</span>
      <TimeEdit x={x} onChange={(n) => edit(path, n)} />
      {remove}
    </div>
  )
  if (x.k === 'cmp' && x.l.k === 'app' && x.l.fn === 'since') return <SinceRow env={env} x={x} path={path} remove={remove} />
  const l = x.k === 'cmp' || x.k === 'between' || x.k === 'in' ? (x.k === 'cmp' ? x.l : x.e) : x
  const lpath = [...path, 0]
  const sc = scopeAt(env.ctx, env.root, path)
  const lt = x.k === 'var' || x.k === 'name' || x.k === 'const' ? BOOL : typeOf(sc, l)
  const ops = opsFor(lt)
  // a yes/no variable: "holds" / "does not hold" instead of "= true"
  const bvar = x.k === 'var' ? x : x.k === 'cmp' && x.l.k === 'var' ? x.l : null
  const truth: boolean | null = x.k === 'var' ? true : x.k === 'cmp' && bvar && (x.op === '=' || x.op === '≠') && x.r.k === 'const' && (x.r.v === 'true' || x.r.v === 'false') && env.p.items[bvar.id]?.kind === 'variable' && (env.p.items[bvar.id] as Variable).type === 'boolean' ? (x.op === '=') === (x.r.v === 'true') : null
  const op = x.k === 'cmp' ? x.op : x.k === 'between' ? 'between' : x.k === 'in' ? 'in' : null
  const setOp = (o: string) => {
    if (o === 'between') return edit(path, { k: 'between', e: l, lo: HOLE, hi: HOLE })
    if (o === 'in') return edit(path, { k: 'in', e: l, set: [HOLE] })
    edit(path, { k: 'cmp', op: o as CmpOp, l, r: x.k === 'cmp' ? x.r : HOLE })
  }
  return (
    <div className="cond xr">
      {truth !== null ? <>
        <Operand env={env} x={bvar!} path={x.k === 'var' ? path : lpath} ty={BOOL} />
        <Select className="cond-op" value={truth ? 'y' : 'n'} onChange={(ev) => edit(path, eq(bvar!, val(ev.target.value === 'y' ? 'true' : 'false')))}><option value="y">holds</option><option value="n">does not hold</option></Select>
      </> : <>
        <Operand env={env} x={l} path={lpath} ty={ANY} />
        {op !== null && (ops.length
          ? <Select className="cond-op" value={op} onChange={(ev) => setOp(ev.target.value)}>{ops.map((o) => <option key={o} value={o}>{o === 'between' ? 'between' : o === 'in' ? '∈ one of' : o}</option>)}</Select>
          : <span className="cond-word">{op}</span>)}
        {x.k === 'cmp' && <Operand env={env} x={x.r} path={[...path, 1]} ty={slotType(env.ctx, env.root, [...path, 1])} />}
        {x.k === 'between' && <><Operand env={env} x={x.lo} path={[...path, 1]} ty={slotType(env.ctx, env.root, [...path, 1])} /><span className="cond-word">and</span><Operand env={env} x={x.hi} path={[...path, 2]} ty={slotType(env.ctx, env.root, [...path, 2])} /></>}
        {x.k === 'in' && <span className="cond-set">{x.set.map((m, i) => <Operand key={i} env={env} x={m} path={[...path, i + 1]} ty={slotType(env.ctx, env.root, [...path, i + 1])} />)}<button type="button" className="x" title="Add a value" onClick={() => edit(path, { ...x, set: [...x.set, HOLE] })}><Icon name="plus" size={12} /></button></span>}
      </>}
      {remove}
      <Problems env={env} path={path} />
    </div>
  )
}

/** Type problems of the condition at path, if any (the editor does not create them, but text and old data can). */
function Problems({ env, path }: { env: Env; path: number[] }) {
  const x = at(env.root, path)
  const sc = scopeAt(env.ctx, env.root, path)
  const d = x ? check(sc, x).filter((m) => m.level === 'error' && !m.msg.startsWith('incomplete')) : []
  return d.length ? <div className="cond-err">{d[0].msg}</div> : null
}

function TimeEdit({ x, onChange }: { x: Extract<Expr, { k: 'cmp' }>; onChange: (x: Expr) => void }) {
  const r = x.r.k === 'const' ? x.r : { v: '', unit: 's' as TimeUnit }
  const unit = (r.unit ?? 's') as TimeUnit
  return (
    <span className="cond-time">
      <Select value={x.op} onChange={(e) => onChange({ ...x, op: e.target.value as CmpOp })}><option value="≥">at least</option><option value="<">less than</option></Select>
      <input className="time-amount" type="number" min={0} step="any" value={r.v} placeholder="…" onChange={(e) => onChange({ ...x, r: num(e.target.value, unit) })} />
      <Select value={unit} onChange={(e) => onChange({ ...x, r: num(r.v, e.target.value as TimeUnit) })}>{TIME_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
    </span>
  )
}

function SinceRow({ env, x, path, remove }: { env: Env; x: Extract<Expr, { k: 'cmp' }>; path: number[]; remove: ReactNode }) {
  const { p, edit } = env
  const labels = useLabels()
  const ev = x.l.k === 'app' && x.l.args[0].k === 'event' ? x.l.args[0].id : ''
  const events = Object.values(p.items).filter((i) => i.kind === 'ca' || i.kind === 'feedback' || i.kind === 'operation')
  return (
    <div className="cond cond-ev">
      <TimeEdit x={x} onChange={(n) => edit(path, n)} />
      <span className="cond-word">after</span>
      <Select value={ev} onChange={(e) => edit(path, { ...x, l: { k: 'app', fn: 'since', args: [{ k: 'event', id: e.target.value as never }] } })}>
        <option value="" disabled hidden>control action or feedback…</option>
        {events.map((i) => <option key={i.id} value={i.id} label={`${labels[i.id]} ${renderText(labels, i.title)}`}><span className={'chip k-' + i.kind}>{labels[i.id]}</span> {renderText(labels, i.title)}</option>)}
      </Select>
      <span className="cond-word">occurred</span>
      {remove}
    </div>
  )
}

/** A slot of type `ty`: filled by one of the candidates that fit (variables, constants, instance names, functions). */
function Operand({ env, x, path, ty }: { env: Env; x: Expr; path: number[]; ty: Ty }) {
  const { p, edit, vars } = env
  const labels = useLabels()
  const sc = scopeAt(env.ctx, env.root, path)
  const cands = fills(sc, ty).filter((c) => c.k !== 'var' || vars.some((v) => v.id === c.id))
  const here = (e: Expr) => edit(path, e)
  const unit = ty.t === 'num' ? ty.unit : null
  const pick = (v: string) => {
    const [k, a] = v.split('\0')
    switch (k) {
      case 'var': return ensureNames(env, path, mkVar(a as Id<'variable'>), here)
      case 'const': return here({ k: 'const', v: a })
      case 'number': return here({ k: 'const', v: '', ...(unit ? { unit: unit as never } : {}) })
      case 'duration': return here({ k: 'const', v: '', unit: 's' })
      case 'symbol': return here({ k: 'const', v: '' })
      case 'name': return here({ k: 'name', name: a })
      case 'param': return here({ k: 'param', name: a })
      case 'fn': return here({ k: 'app', fn: a as Fn, args: a === 'abs' || a === 'prev' || a === 'succ' || a === 'pred' ? [HOLE] : [HOLE, HOLE] })
    }
  }
  const groups: CGroup[] = [
    { key: 'var', label: 'Variable', options: varOpts(p, labels, cands.flatMap((c) => (c.k === 'var' ? [p.items[c.id] as Variable] : [])), vars, (v) => 'var\0' + v.id) },
    { key: 'val', label: 'Value', options: [
      ...cands.flatMap((c): COpt[] => (c.k === 'const' ? [{ value: 'const\0' + c.v, text: c.v, node: <>{c.v}</> }] : [])),
      ...cands.filter((c) => c.k === 'number' || c.k === 'symbol' || c.k === 'duration').slice(0, 1).map((c): COpt => { const t = c.k === 'number' ? 'a number…' : c.k === 'duration' ? 'a duration…' : 'a value…'; return { value: c.k + '\0', text: t, node: <>{t}</> } }),
    ] },
    { key: 'inst', label: 'Instance', options: cands.flatMap((c): COpt[] => (c.k === 'name' || c.k === 'param' ? [{ value: c.k + '\0' + c.name, text: c.name, node: <>{c.name}</> }] : [])) },
    { key: 'fn', label: 'Function', options: cands.flatMap((c): COpt[] => (c.k === 'fn' ? [{ value: 'fn\0' + c.fn, text: ARITY_WORD[c.fn], node: <>{ARITY_WORD[c.fn]}(…)</> }] : [])) },
  ]
  const choose = (display: ReactNode, value?: string) => <Cascade className="cond-var" groups={groups} value={value} onPick={pick} display={display} />
  switch (x.k) {
    case 'hole': return choose(<span className="muted">…</span>)
    case 'var': {
      const cand = cands.find((c): c is Extract<Candidate, { k: 'var' }> => c.k === 'var' && c.id === x.id)
      const v = p.items[x.id]
      const rel = v?.kind === 'variable' && isPredicate(p, v) ? (p.items[v.parent!] as Relationship) : null
      const pick1 = (end: number) => {
        const e = cand?.ends.find((m) => m.end === end)
        if (!e) return null
        return e.many
          ? <Select key={'at' + end} className="cond-at" value={x.at?.[end] ?? ''} onChange={(ev) => { const at = [...(x.at ?? [])]; at[end] = ev.target.value; here({ ...x, at }) }}>
              <option value="">any {p.items[e.entity]?.title.trim() || 'instance'}</option>
              {e.names.map((n) => <option key={n}>{n}</option>)}
            </Select>
          : <EntityPill key={'en' + end} e={p.items[e.entity]} />
      }
      const sel = (display?: ReactNode) => choose(display ?? (v?.kind === 'variable' ? <VarPill v={v} vars={vars} /> : '?'), 'var\0' + x.id)
      // a relationship predicate reads as its sentence: "tr1 approaches Crossing", ends as pickers, the words open the variable list
      if (rel) {
        const parts = readRel(rel, rel.ends.map((_, i) => `\0${i}\0`)).split('\0')
        let words = false
        return <span className="cond-sentence">{parts.map((t, i) => i % 2 ? pick1(+t) : !t.trim() ? null : words ? <span key={i} className="cond-word">{t.trim()}</span> : (words = true, <span key={i}>{sel(t.trim())}</span>))}</span>
      }
      return (
        <>
          {sel()}
          {cand?.ends.filter((e) => e.many).map((e) => pick1(e.end))}
        </>
      )
    }
    case 'const': {
      if (ty.t === 'enum') return <Select value={x.v} onChange={(ev) => here({ k: 'const', v: ev.target.value })}><option value="" disabled hidden>value…</option>{ty.states.map((s) => <option key={s}>{s}</option>)}</Select>
      if (ty.t === 'bool') return <Select value={x.v} onChange={(ev) => here({ k: 'const', v: ev.target.value })}><option>true</option><option>false</option></Select>
      return <TextInput value={x.v} onChange={(v) => here({ ...x, v })} placeholder={ty.t === 'num' ? 'number' : 'value'} />
    }
    case 'name': return choose(x.name, 'name\0' + x.name)
    case 'param': return choose(x.name, 'param\0' + x.name)
    case 'app': {
      const a = x.args
      return (
        <span className="cond-fn">
          {choose(ARITY_WORD[x.fn], 'fn\0' + x.fn)}
          {a.map((m, i) => <Operand key={i} env={env} x={m} path={[...path, i]} ty={slotType(env.ctx, env.root, [...path, i])} />)}
        </span>
      )
    }
    default: return <span className="cond-word">{printExpr(x)}</span>
  }
}
