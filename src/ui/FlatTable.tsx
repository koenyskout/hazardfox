import { type ReactNode } from 'react'
import { deleteItems, shift, updateItem } from '../model/ops'
import { useStore } from '../model/store'
import { KIND_NAMES, type Id, type ItemOf, type Kind, type Patch } from '../model/types'
import { generateUcaText } from '../model/uca'
import { Ref } from './Fields'
import { addItem, commit, select, useIds, useLabels, useProject } from './hooks'
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
  /** Adds a button to each group header that creates an item with this patch (first item of the group given). */
  groupAdd?: (group: Id | null, first?: ItemOf<K>) => Patch<K>
  /** Groups always shown (in this order, before any others), also when they have no items. */
  groups?: Id[]
  addLabel?: string
  /** Several add buttons (e.g. different kinds of one item); replaces the default one. */
  adds?: { label: string; init?: Patch<K> }[]
}) {
  const ids = useIds()
  const names = useLabels()
  /** variables show their name pill, as everywhere else */
  const idLabels = props.kind === 'variable' ? names : ids
  const selected = useStore((s) => s.selected)
  const rows: ({ group: Id | null; first?: ItemOf<K> } | { item: ItemOf<K> })[] = []
  const push = (g: Id | null | undefined, first?: ItemOf<K>) => { rows.push({ group: g ?? null, first }) }
  if (props.groupBy) {
    for (const g of props.groups ?? []) {
      const its = props.items.filter((it) => props.groupBy!(it) === g)
      push(g, its[0])
      its.forEach((item) => rows.push({ item }))
    }
    props.items.forEach((item, i) => {
      const g = props.groupBy!(item)
      if (props.groups?.includes(g as Id)) return
      if (i === 0 || props.groupBy!(props.items[i - 1]) !== g || !rows.some((r) => 'group' in r && r.group === (g ?? null))) push(g, item)
      rows.push({ item })
    })
  } else props.items.forEach((item) => rows.push({ item }))
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
          <span className={'lbl' + (props.kind === 'variable' ? ' wide' : '')}>ID</span>
          {props.titleEditable !== false && <span className="ttl">Title</span>}
          {props.columns.map((c) => (
            <span key={c.head} className="col" style={{ flex: c.width ? `0 0 ${c.width}` : 1 }}>{c.head}</span>
          ))}
        </div>
        {props.items.length === 0 && !props.groups?.length && <div className="empty">Nothing here yet.</div>}
        {rows.map((r, i) => {
          if ('group' in r) {
            const g = r.group
            return <div key={'g' + i + (g ?? '')} className="row group">{g ? <><Ref id={g} /><GroupTitle id={g} /></> : <span className="muted">No owner</span>}{props.groupAdd && <button className="add" title="Add to this group" onClick={() => addItem(props.kind, props.groupAdd!(g, r.first))}><Icon name="plus" size={12} /> {KIND_NAMES[props.kind].toLowerCase()}</button>}</div>
          }
          const it = r.item
          return (
          <div key={it.id} className={'row' + (selected === it.id ? ' sel cur' : '')} onClick={() => select(it.id)}>
            <span className={'lbl' + (props.kind === 'variable' ? ' wide' : '')}><span className={'chip k-' + it.kind}><ChipLabel it={it} label={idLabels[it.id]} /></span></span>
            {props.titleEditable !== false && (
              <span className={'ttl' + (props.sub ? ' wrap' : '')}>
                <span className="tline">
                <input
                  value={it.title}
                  placeholder={`${KIND_NAMES[it.kind]} title`}
                  onFocus={() => select(it.id)}
                  onChange={(e) => commit((q) => updateItem(q, it.id, { title: e.target.value }), 'title:' + it.id)}
                />
                <StatusIcon status={it.status} />
                <ReviewDot id={it.id} />
                </span>
                {props.sub && <div className="subline">{props.sub(it)}</div>}
              </span>
            )}
            {props.columns.map((c) => (
              <span key={c.head} className="col" style={{ flex: c.width ? `0 0 ${c.width}` : 1 }}>{c.cell(it)}</span>
            ))}
          </div>
          )
        })}
      </div>
    </div>
  )
}

/** Name next to an owner chip, for kinds whose chip shows only the label (entities and relationships already show theirs). */
function GroupTitle({ id }: { id: Id }) {
  const p = useProject()
  const labels = useLabels()
  const it = p.items[id]
  if (!it || it.kind === 'entity' || it.kind === 'relationship') return null
  const text = it.kind === 'uca' ? generateUcaText(p, labels, it) : it.title.trim()
  return text ? <span className="gtitle" title={text}> {text}</span> : null
}
