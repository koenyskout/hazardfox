import type { ReactNode } from 'react'
import { createItem, deleteItems, shift, updateItem } from '../model/ops'
import { useStore } from '../model/store'
import { KIND_NAMES, type Id, type Item, type Kind } from '../model/types'
import { commit, select, useLabels } from './hooks'
import { ReviewDot } from './Review'
import { Icon } from './Icon'

export interface Column {
  head: string
  cell: (it: Item) => ReactNode
  width?: string
}

/** Table for flat (non-tree) kinds: add, edit title inline, reorder, delete. */
export function FlatTable(props: {
  kind: Kind
  items: Item[]
  columns: Column[]
  init?: Record<string, unknown>
  titleEditable?: boolean
  addLabel?: string
  /** Several add buttons (e.g. different kinds of one item); replaces the default one. */
  adds?: { label: string; init: Record<string, unknown> }[]
}) {
  const labels = useLabels()
  const selected = useStore((s) => s.selected)
  const addNew = (init: Record<string, unknown> = props.init ?? {}) => {
    let id = ''
    commit((q) => {
      const r = createItem(q, props.kind, init)
      id = r.id
      return r.project
    })
    select(id)
  }
  return (
    <div className="tree">
      <div className="toolbar">
        {(props.adds ?? [{ label: props.addLabel ?? `Add ${KIND_NAMES[props.kind].toLowerCase()}`, init: props.init ?? {} }]).map((a) => (
          <button key={a.label} onClick={() => addNew(a.init)}><Icon name="plus" /> {a.label}</button>
        ))}
        <button disabled={!selected} title="Move up" onClick={() => selected && commit((q) => shift(q, selected, -1))}><Icon name="up" /></button>
        <button disabled={!selected} title="Move down" onClick={() => selected && commit((q) => shift(q, selected, 1))}><Icon name="down" /></button>
        <button
          className="danger"
          disabled={!selected || !props.items.some((i) => i.id === selected)}
          onClick={() => selected && (commit((q) => deleteItems(q, [selected as Id])), select(null))}
        >
          <Icon name="trash" /> Delete
        </button>
      </div>
      <div className="rows">
        <div className="row head">
          <span className="lbl">ID</span>
          {props.titleEditable !== false && <span className="ttl">Title</span>}
          {props.columns.map((c) => (
            <span key={c.head} className="col" style={{ flex: c.width ? `0 0 ${c.width}` : 1 }}>{c.head}</span>
          ))}
        </div>
        {props.items.length === 0 && <div className="empty">Nothing here yet.</div>}
        {props.items.map((it) => (
          <div key={it.id} className={'row' + (selected === it.id ? ' sel cur' : '')} onClick={() => select(it.id)}>
            <span className="lbl">{labels[it.id]}</span>
            {props.titleEditable !== false && (
              <span className="ttl">
                <input
                  value={it.title}
                  placeholder={`${KIND_NAMES[it.kind]} title`}
                  onFocus={() => select(it.id)}
                  onChange={(e) => commit((q) => updateItem(q, it.id, { title: e.target.value }), 'title:' + it.id)}
                />
                <ReviewDot id={it.id} />
              </span>
            )}
            {props.columns.map((c) => (
              <span key={c.head} className="col" style={{ flex: c.width ? `0 0 ${c.width}` : 1 }}>{c.cell(it)}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
