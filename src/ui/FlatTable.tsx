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
  /** Names of the nested groups an item sits in (below its group); a header row is shown when they change. Items of one nesting must be adjacent. */
  nest?: (it: ItemOf<K>) => string[]
  /** Draw nest headers as group rows (a pill, like a referenced item's header) instead of small muted subheadings. */
  nestAsGroup?: boolean
  /** Shown instead of the (read-only) title of items it returns text for, e.g. managed names. */
  titleView?: (it: ItemOf<K>) => string | null | undefined
  /** Second line under the title. */
  sub?: (it: ItemOf<K>) => ReactNode
  /** Shown on the title line, after the title. */
  tail?: (it: ItemOf<K>) => ReactNode
  /** Adds a button to each group header that creates an item with this patch (first item of the group given). */
  groupAdd?: (group: Id | null, first?: ItemOf<K>) => Patch<K>
  /** Groups always shown (in this order, before any others), also when they have no items. */
  groups?: { id: Id; depth?: number }[]
  addLabel?: string
  /** Several add buttons (e.g. different kinds of one item); replaces the default one. */
  adds?: { label: string; init?: Patch<K> }[]
}) {
  const ids = useIds()
  const names = useLabels()
  /** variables show their name pill, as everywhere else */
  const idLabels = props.kind === 'variable' ? names : ids
  const selected = useStore((s) => s.selected)
  const rows: ({ group: Id | null; first?: ItemOf<K>; depth: number } | { item: ItemOf<K>; depth: number } | { head: string; depth: number })[] = []
  const push = (g: Id | null | undefined, first?: ItemOf<K>, depth = 0) => { rows.push({ group: g ?? null, first, depth }) }
  if (props.groupBy) {
    for (const { id: g, depth } of props.groups ?? []) {
      const its = props.items.filter((it) => props.groupBy!(it) === g)
      push(g, its[0], depth)
      its.forEach((item, i) => {
        const path = props.nest?.(item) ?? [], prev = i ? props.nest?.(its[i - 1]) ?? [] : []
        let k = 0
        while (k < path.length && path[k] === prev[k]) k++
        path.slice(k).forEach((head, j) => rows.push({ head, depth: (depth ?? 0) + 1 + k + j }))
        rows.push({ item, depth: (depth ?? 0) + 1 + path.length })
      })
    }
    props.items.forEach((item, i) => {
      const g = props.groupBy!(item)
      if (props.groups?.some((x) => x.id === g)) return
      if (i === 0 || props.groupBy!(props.items[i - 1]) !== g || !rows.some((r) => 'group' in r && r.group === (g ?? null))) push(g, item)
      const path = props.nest?.(item) ?? [], prev = props.nest && i > 0 && props.groupBy!(props.items[i - 1]) === g ? props.nest(props.items[i - 1]) : []
      let k = 0
      while (k < path.length && path[k] === prev[k]) k++
      path.slice(k).forEach((head, j) => rows.push({ head, depth: 1 + k + j }))
      rows.push({ item, depth: 1 + path.length })
    })
  } else props.items.forEach((item) => rows.push({ item, depth: 0 }))
  return (
    <div className="tree">
      <div className="toolbar">
        {(props.adds ?? [{ label: props.addLabel ?? `Add ${KIND_NAMES[props.kind].toLowerCase()}`, init: props.init }]).map((a) => (
          <button key={a.label} onClick={() => addItem(props.kind, a.init)}><Icon name="plus" /> {a.label}</button>
        ))}
        <button disabled={!selected} title="Move up" onClick={() => selected && commit((q) => shift(q, selected, -1))}><Icon name="up" /></button>
        <button disabled={!selected} title="Move down" onClick={() => selected && commit((q) => shift(q, selected, 1))}><Icon name="down" /></button>
        <button
          className="icon-btn danger"
          title="Delete"
          aria-label="Delete"
          disabled={!selected || !props.items.some((i) => i.id === selected)}
          onClick={() => selected && (commit((q) => deleteItems(q, [selected as Id])), select(null))}
        >
          <Icon name="trash" size={16} />
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
          if ('head' in r && props.nestAsGroup) return <div key={'h' + i} className="row group" style={{ paddingLeft: 12 + r.depth * 18, position: 'relative' }}><span className="muted" style={{ position: 'absolute', left: 12 + r.depth * 18 - 16 }}>↳</span><span className="gtitle">{r.head}</span></div>
          if ('head' in r) return <div key={'h' + i} className="row group sub" style={{ paddingLeft: 12 + r.depth * 18 }}><span className="muted">▸</span> <b>{r.head}</b></div>
          if ('group' in r) {
            const g = r.group
            return <div key={'g' + i + (g ?? '')} className="row group" style={r.depth ? { paddingLeft: 12 + r.depth * 18, position: 'relative' } : undefined}>{g ? <>{r.depth > 0 && <span className="muted" style={{ position: 'absolute', left: 12 + r.depth * 18 - 16 }}>↳</span>}<Ref id={g} /><GroupTitle id={g} /></> : <span className="muted">No owner</span>}{props.groupAdd && <button className="add" title="Add to this group" onClick={() => addItem(props.kind, props.groupAdd!(g, r.first))}><Icon name="plus" size={12} /> {KIND_NAMES[props.kind].toLowerCase()}</button>}</div>
          }
          const it = r.item
          return (
          <div key={it.id} className={'row' + (selected === it.id ? ' sel cur' : '')} style={(props.groups || props.nest) && r.depth ? { paddingLeft: 10 + r.depth * 18 } : undefined} onClick={() => select(it.id)}>
            <span className={'lbl' + (props.kind === 'variable' ? ' wide' : '')}><span className={'chip k-' + it.kind}><ChipLabel it={it} label={idLabels[it.id]} /></span></span>
            {props.titleEditable !== false && (
              <span className={'ttl' + (props.sub ? ' wrap' : '')}>
                <span className="tline">
                {it.kind === 'scenario' ? <textarea rows={2} value={it.title} placeholder={`${KIND_NAMES[it.kind]} title`} onFocus={() => select(it.id)} onChange={(e) => commit((q) => updateItem(q, it.id, { title: e.target.value }), 'title:' + it.id)} /> : <input
                  value={props.titleView?.(it) ?? it.title}
                  readOnly={props.titleView?.(it) != null}
                  title={props.titleView?.(it) != null ? it.title + ' (named by its struct type)' : undefined}
                  placeholder={`${KIND_NAMES[it.kind]} title`}
                  onFocus={() => select(it.id)}
                  onChange={(e) => commit((q) => updateItem(q, it.id, { title: e.target.value }), 'title:' + it.id)}
                />}
                <StatusIcon status={it.status} />
                <ReviewDot id={it.id} />
                {props.tail?.(it)}
                </span>
                {props.sub?.(it) != null && <div className="subline">{props.sub(it)}</div>}
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
