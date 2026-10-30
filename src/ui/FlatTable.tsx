import { Fragment, type ReactNode } from 'react'
import { deleteItems, shift, updateItem } from '../model/ops'
import { useStore } from '../model/store'
import { KIND_NAMES, type Id, type ItemOf, type Kind, type Patch } from '../model/types'
import { Ref } from './Fields'
import { addItem, commit, select, useIds, useProject } from './hooks'
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
  /** Items must be ordered so that equal groups are adjacent; a header row (a reference to the group) is shown whenever it changes. */
  groupBy?: (it: ItemOf<K>) => Id | null | undefined
  /** Second line under the title. */
  sub?: (it: ItemOf<K>) => ReactNode
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
        {props.items.map((it, i) => {
          const g = props.groupBy?.(it)
          const header = props.groupBy && (i === 0 || props.groupBy(props.items[i - 1]) !== g)
          return (
          <Fragment key={it.id}>
          {header && <div className="row group">{g ? <><Ref id={g} /><GroupTitle id={g} /></> : <span className="muted">No owner</span>}</div>}
          <div className={'row' + (selected === it.id ? ' sel cur' : '')} onClick={() => select(it.id)}>
            <span className="lbl"><span className={'chip k-' + it.kind}><ChipLabel it={it} label={idLabels[it.id]} /></span></span>
            {props.titleEditable !== false && (
              <span className={'ttl' + (props.sub ? ' wrap' : '')}>
                <input
                  value={it.title}
                  placeholder={`${KIND_NAMES[it.kind]} title`}
                  onFocus={() => select(it.id)}
                  onChange={(e) => commit((q) => updateItem(q, it.id, { title: e.target.value }), 'title:' + it.id)}
                />
                <StatusIcon status={it.status} />
                <ReviewDot id={it.id} />
                {props.sub && <div className="subline">{props.sub(it)}</div>}
              </span>
            )}
            {props.columns.map((c) => (
              <span key={c.head} className="col" style={{ flex: c.width ? `0 0 ${c.width}` : 1 }}>{c.cell(it)}</span>
            ))}
          </div>
          </Fragment>
          )
        })}
      </div>
    </div>
  )
}

/** Name next to an owner chip, for kinds whose chip shows only the label (entities and relationships already show theirs). */
function GroupTitle({ id }: { id: Id }) {
  const it = useProject().items[id]
  return it && it.kind !== 'entity' && it.kind !== 'relationship' && it.title.trim() ? <span> {it.title}</span> : null
}
