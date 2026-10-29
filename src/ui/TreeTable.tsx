import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  deleteItems,
  group,
  indent,
  merge,
  moveItem,
  outdent,
  shift,
  split,
  updateItem,
} from '../model/ops'
import { useStore } from '../model/store'
import { cascadeSet, linkedTo } from '../model/refs'
import { children, descendants, flatten, isLeaf } from '../model/tree'
import { KIND_NAMES, type Id, type Item, type ItemOf, type Kind, type Patch } from '../model/types'
import { addItem, commit, select, useLabels, useProject } from './hooks'
import { Modal } from './Modal'
import { ReviewDot } from './Review'
import { Icon } from './Icon'
import { ItemHover } from './Fields'

type Dialog = null | { type: 'group' | 'merge' } | { type: 'split'; id: Id } | { type: 'delete'; ids: Id[] }

export interface TreeTableProps<K extends Kind> {
  kind: K
  /** Extra cell content per row (e.g. linked losses). */
  extra?: (it: ItemOf<K>) => ReactNode
  extraHeader?: string
  empty?: string
  /** Defaults applied to newly created items. */
  defaults?: Patch<K>
}

function dropPos(e: React.DragEvent<HTMLElement>): 'before' | 'after' | 'into' {
  const r = e.currentTarget.getBoundingClientRect()
  const y = (e.clientY - r.top) / r.height
  return y < 0.25 ? 'before' : y > 0.75 ? 'after' : 'into'
}

export function TreeTable<K extends Kind>({ kind, extra, extraHeader, empty, defaults }: TreeTableProps<K>) {
  const p = useProject()
  const labels = useLabels()
  const selected = useStore((s) => s.selected)
  const [multi, setMulti] = useState<Set<Id>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<Id>>(new Set())
  const [dialog, setDialog] = useState<Dialog>(null)
  const [drop, setDrop] = useState<{ id: Id; pos: 'before' | 'after' | 'into' } | null>(null)
  const dragId = useRef<Id | null>(null)
  const refs = useRef<Record<Id, HTMLInputElement | null>>({})

  const rows = useMemo(() => {
    const all = flatten(p, kind)
    const hidden = new Set<Id>()
    return all.filter(({ item }) => {
      if (item.parent && (hidden.has(item.parent) || collapsed.has(item.parent))) {
        hidden.add(item.id)
        return false
      }
      return true
    })
  }, [p, kind, collapsed])

  const focusRow = (id: Id) => setTimeout(() => refs.current[id]?.focus(), 0)
  const add = (parent: Id | null, index?: number) => {
    const newId = addItem(kind, { ...defaults, parent } as Patch<K>, index)
    setMulti(new Set([newId]))
    focusRow(newId)
  }
  const siblingIndex = (it: Item) => children(p, it.parent, kind).findIndex((x) => x.id === it.id)

  const click = (e: React.MouseEvent, id: Id) => {
    select(id)
    setMulti((m) => {
      if (e.metaKey || e.ctrlKey) {
        const n = new Set(m)
        n.has(id) ? n.delete(id) : n.add(id)
        return n
      }
      if (e.shiftKey && selected) {
        const ids = rows.map((r) => r.item.id)
        const a = ids.indexOf(selected)
        const b = ids.indexOf(id)
        return new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1))
      }
      return new Set([id])
    })
  }

  const onKey = (e: KeyboardEvent, it: Item, i: number) => {
    const mod = e.metaKey || e.ctrlKey
    if (e.key === 'Enter') {
      e.preventDefault()
      e.shiftKey ? add(it.id) : add(it.parent, siblingIndex(it) + 1)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      commit((q) => (e.shiftKey ? outdent(q, it.id) : indent(q, it.id)))
      focusRow(it.id)
    } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      commit((q) => shift(q, it.id, e.key === 'ArrowUp' ? -1 : 1))
      focusRow(it.id)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const t = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]
      if (t) {
        select(t.item.id)
        setMulti(new Set([t.item.id]))
        focusRow(t.item.id)
      }
    } else if (mod && e.key === 'Backspace') {
      e.preventDefault()
      setDialog({ type: 'delete', ids: multi.size ? [...multi] : [it.id] })
    } else if (mod && e.key.toLowerCase() === 'g') {
      e.preventDefault()
      if (multi.size) setDialog({ type: 'group' })
    }
  }

  const dropOn = (target: Item, pos: 'before' | 'after' | 'into') => {
    const id = dragId.current
    dragId.current = null
    setDrop(null)
    if (!id || id === target.id) return
    commit((q) => {
      if (pos === 'into') return moveItem(q, id, target.id, children(q, target.id, kind).length)
      const idx = children(q, target.parent, kind).filter((x) => x.id !== id).findIndex((x) => x.id === target.id)
      return moveItem(q, id, target.parent, pos === 'before' ? idx : idx + 1)
    })
  }

  const ids = [...multi].filter((id) => p.items[id])
  const one = ids.length === 1 ? p.items[ids[0]] : null

  return (
    <div className="tree">
      <div className="toolbar">
        <button onClick={() => add(null)}><Icon name="plus" /> Add {KIND_NAMES[kind].toLowerCase()}</button>
        <button disabled={!one} onClick={() => one && add(one.id)}><Icon name="plus" /> Child</button>
        <span className="sep" />
        <button disabled={ids.length < 1} onClick={() => setDialog({ type: 'group' })} title="Ctrl+G"><Icon name="group" /> Group…</button>
        <button disabled={!one} onClick={() => one && setDialog({ type: 'split', id: one.id })}><Icon name="split" /> Split…</button>
        <button disabled={ids.length < 2} onClick={() => setDialog({ type: 'merge' })}><Icon name="merge" /> Merge…</button>
        <span className="sep" />
        <button disabled={ids.length < 1} className="danger" onClick={() => setDialog({ type: 'delete', ids })} title="Ctrl+Backspace"><Icon name="trash" /> Delete</button>
        <span className="hint">Enter: new · Tab/⇧Tab: indent · Alt+↑↓: move · drag to reorder</span>
      </div>
      <div className="rows">
        <div className="row head">
          <span className="lbl">ID</span>
          <span className="ttl">Title</span>
          {extraHeader && <span className="ext">{extraHeader}</span>}
        </div>
        {rows.length === 0 && <div className="empty">{empty ?? 'Nothing here yet – add the first item.'}</div>}
        {rows.map(({ item, depth }, i) => {
          const hasKids = !isLeaf(p, item.id)
          const sel = multi.has(item.id)
          return (
            <div
              key={item.id}
              className={'row' + (sel ? ' sel' : '') + (selected === item.id ? ' cur' : '') + (drop?.id === item.id ? ' drop-' + drop.pos : '')}
              draggable
              onDragStart={() => (dragId.current = item.id)}
              onDragOver={(e) => {
                e.preventDefault()
                setDrop({ id: item.id, pos: dropPos(e) })
              }}
              onDragLeave={() => setDrop(null)}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(item, dropPos(e))
              }}
              onClick={(e) => click(e, item.id)}
            >
              <span className="lbl"><ItemHover id={item.id}>{labels[item.id]}</ItemHover></span>
              <span className="ttl" style={{ paddingLeft: depth * 20 }}>
                <button
                  className={'twisty' + (hasKids ? '' : ' none')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setCollapsed((c) => {
                      const n = new Set(c)
                      n.has(item.id) ? n.delete(item.id) : n.add(item.id)
                      return n
                    })
                  }}
                >
                  {collapsed.has(item.id) ? '▸' : '▾'}
                </button>
                <input
                  ref={(el) => void (refs.current[item.id] = el)}
                  value={item.title}
                  placeholder={`${KIND_NAMES[kind]} title`}
                  onFocus={() => select(item.id)}
                  onChange={(e) => commit((q) => updateItem(q, item.id, { title: e.target.value }), 'title:' + item.id)}
                  onKeyDown={(e) => onKey(e, item, i)}
                />
                <ReviewDot id={item.id} />
              </span>
              {extra && <span className="ext">{extra(item)}</span>}
            </div>
          )
        })}
      </div>

      {dialog?.type === 'group' && (
        <PromptDialog
          title={`Group ${ids.length} ${KIND_NAMES[kind].toLowerCase()}(s) under a new parent`}
          label="Parent title"
          confirm="Group"
          onClose={() => setDialog(null)}
          onOk={(t) => {
            try {
              commit((q) => group(q, ids, t).project)
              setDialog(null)
            } catch (e) {
              alert((e as Error).message)
            }
          }}
        />
      )}
      {dialog?.type === 'merge' && (
        <PromptDialog
          title={`Merge ${ids.length} items into ${labels[ids[0]] ?? ''}`}
          label="Title of merged item"
          initial={p.items[ids[0]]?.title}
          confirm="Merge"
          onClose={() => setDialog(null)}
          onOk={(t) => {
            try {
              commit((q) => merge(q, ids, t))
              setDialog(null)
            } catch (e) {
              alert((e as Error).message)
            }
          }}
        />
      )}
      {dialog?.type === 'split' && (
        <SplitDialog id={dialog.id} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'delete' && (
        <DeleteDialog ids={dialog.ids} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}

export function PromptDialog(props: {
  title: string
  label: string
  confirm: string
  initial?: string
  onOk: (v: string) => void
  onClose: () => void
}) {
  const [v, setV] = useState(props.initial ?? '')
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <label className="field">
        {props.label}
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && props.onOk(v)} />
      </label>
      <div className="actions">
        <button onClick={props.onClose}>Cancel</button>
        <button className="primary" onClick={() => props.onOk(v)}>{props.confirm}</button>
      </div>
    </Modal>
  )
}

function SplitDialog({ id, onClose }: { id: Id; onClose: () => void }) {
  const p = useProject()
  const labels = useLabels()
  const it = p.items[id]
  const [titles, setTitles] = useState(['', ''])
  const refs = linkedTo(p, id)
  const [assign, setAssign] = useState<Record<Id, number[]>>({})
  if (!it) return null
  const toggle = (ref: Id, i: number) =>
    setAssign((a) => {
      const cur = a[ref] ?? []
      return { ...a, [ref]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] }
    })
  const named = titles.map((t, i) => [t, i] as const).filter(([t]) => t.trim())
  return (
    <Modal title={`Split ${labels[id]} ${it.title}`} onClose={onClose} wide>
      <p>The original stays as the parent; the new items become its sub-items.</p>
      {titles.map((t, i) => (
        <label className="field" key={i}>
          Sub-item {i + 1}
          <input autoFocus={i === 0} value={t} onChange={(e) => setTitles(titles.map((x, j) => (j === i ? e.target.value : x)))} />
        </label>
      ))}
      <button onClick={() => setTitles([...titles, ''])}>+ Another</button>
      {refs.length > 0 && (
        <>
          <h4>Reassign links</h4>
          <p className="hint">Unassigned links stay on the parent and are flagged by the validation panel.</p>
          <table className="plain">
            <tbody>
              {refs.map((r) => (
                <tr key={r.id}>
                  <td>{labels[r.id]} {r.title}</td>
                  {titles.map((t, i) => (
                    <td key={i}>
                      <label>
                        <input type="checkbox" checked={(assign[r.id] ?? []).includes(i)} onChange={() => toggle(r.id, i)} /> {t || `#${i + 1}`}
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={named.length < 1}
          onClick={() => {
            const idx = new Map(named.map(([, i], n) => [i, n]))
            const mapped: Record<Id, number[]> = {}
            for (const [r, list] of Object.entries(assign)) mapped[r] = list.filter((i) => idx.has(i)).map((i) => idx.get(i)!)
            commit((q) => split(q, id, named.map(([t]) => t), mapped).project)
            onClose()
          }}
        >
          Split
        </button>
      </div>
    </Modal>
  )
}

function DeleteDialog({ ids, onClose }: { ids: Id[]; onClose: () => void }) {
  const p = useProject()
  const labels = useLabels()
  const below = new Set(ids.flatMap((i) => descendants(p, i).map((d) => d.id)))
  for (const i of ids) below.delete(i)
  const dependents = [...cascadeSet(p, [...ids, ...below])].filter((i) => !ids.includes(i) && !below.has(i))
  const names = ids.map((i) => labels[i]).join(', ')
  const run = (promote: boolean) => {
    commit((q) => deleteItems(q, ids, promote ? { promote: true } : undefined))
    onClose()
  }
  return (
    <Modal title={`Delete ${names}?`} onClose={onClose}>
      <p className="muted">Links pointing to {ids.length > 1 ? 'these items' : 'this item'} are removed.</p>
      {below.size > 0 ? (
        <div className="choices">
          <button className="choice" onClick={() => run(true)}>
            <Icon name="trash-keep" size={22} />
            <span><b>Delete only {ids.length > 1 ? 'these items' : 'this item'}</b><small>The {below.size} sub-item{below.size > 1 ? 's' : ''} move up one level and are kept.</small></span>
          </button>
          <button className="choice danger" onClick={() => run(false)}>
            <Icon name="trash-all" size={22} />
            <span><b>Delete with all sub-items</b><small>Removes {below.size} sub-item{below.size > 1 ? 's' : ''} as well.</small></span>
          </button>
        </div>
      ) : (
        <div className="choices">
          <button className="choice danger" autoFocus onClick={() => run(false)}>
            <Icon name="trash" size={22} />
            <span><b>Delete {ids.length > 1 ? `${ids.length} items` : names}</b></span>
          </button>
        </div>
      )}
      {dependents.length > 0 && (
        <p className="note-warn"><Icon name="warn" /> Also deleted because they depend on {ids.length > 1 ? 'these' : 'it'}: {dependents.map((i) => labels[i]).join(', ')}</p>
      )}
      <div className="actions"><button onClick={onClose}>Cancel</button></div>
    </Modal>
  )
}
