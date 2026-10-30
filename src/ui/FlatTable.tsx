import type { ReactNode } from 'react'
import { deleteItems, shift, updateItem } from '../model/ops'
import { useStore } from '../model/store'
import { KIND_NAMES, type Id, type ItemOf, type Kind, type Patch } from '../model/types'
import { addItem, commit, select, useIds } from './hooks'
import { ReviewDot } from './Review'
import { ChipLabel, Icon, StatusIcon } from './Icon'

export interface Column<K extends Kind> {
  head: string
  cell: (it: ItemOf<K>) => ReactNode
  width?: string
}

/** Table for flat (non-tree) kinds: add, edit title inline, reorder, delete. */
export function FlatTable<K extends Kind>(props: {
  kind: K
  items: ItemOf<K>[]
  columns: Column<K>[]
  init?: Patch<K>
  titleEditable?: boolean
  addLabel?: string
  /** Several add buttons (e.g. different kinds of one item); replaces the default one. */
  adds?: { label: string; init?: Patch<K> }[]
}) {
  const idLabels = useIds()
  const selected = useStore((s) => s.selected)
  return (
    <div className="tree">
      <div className="toolbar">
        {(props.adds ?? [{ label: props.addLabel ?? `Add ${KIND_NAMES[props.kind].toLowerCase()}`, init: props.init }]).map((a) => (
          <button key={a.label} onClick={() => addItem(props.kind, a.init)}><Icon name="plus" /> {a.label}</button>
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
            <span className="lbl"><span className={'chip k-' + it.kind}><ChipLabel it={it} label={idLabels[it.id]} /></span></span>
            {props.titleEditable !== false && (
              <span className="ttl">
                <input
                  value={it.title}
                  placeholder={`${KIND_NAMES[it.kind]} title`}
                  onFocus={() => select(it.id)}
                  onChange={(e) => commit((q) => updateItem(q, it.id, { title: e.target.value }), 'title:' + it.id)}
                />
                <StatusIcon status={it.status} />
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
