import { emptyProject, makeItem } from './create'
import { groupKey } from './tree'
import { nameAllInstances } from './variables'
import { KINDS, type Item, type Project } from './types'

const sortKeys = (_: string, v: unknown) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    : v

/** Stable, diff-friendly JSON: items as an ordered array, keys sorted. */
export function serialize(p: Project): string {
  const items = Object.values(p.items).sort(
    (a, b) =>
      KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
      (groupKey(a) < groupKey(b) ? -1 : groupKey(a) > groupKey(b) ? 1 : 0) ||
      a.rank - b.rank,
  )
  return JSON.stringify({ app: 'hazardfox', schema: p.schema, meta: p.meta, items, ...(Object.keys(p.rangeTypes ?? {}).length ? { rangeTypes: p.rangeTypes } : {}), ...(Object.keys(p.enumTypes ?? {}).length ? { enumTypes: p.enumTypes } : {}), ...(Object.keys(p.structTypes ?? {}).length ? { structTypes: p.structTypes } : {}), ...(Object.keys(p.reviews ?? {}).length ? { reviews: p.reviews } : {}) }, sortKeys, 2) + '\n'
}

export function deserialize(text: string): Project {
  const raw = JSON.parse(text)
  if (raw?.app !== 'hazardfox') throw new Error('Not a HazardFox project file')
  if (raw.schema !== 1) throw new Error(`Unsupported schema version ${raw.schema}`)
  const p = emptyProject()
  p.meta = { ...p.meta, ...raw.meta }
  for (const it of raw.items as Item[]) p.items[it.id] = it.kind === 'scenario' || it.kind === 'hazard' || it.kind === 'node' || it.kind === 'ca' || it.kind === 'feedback' || it.kind === 'uca' || it.kind === 'variable' || it.kind === 'operation' ? ({ ...makeItem(it.kind), ...it } as Item) : it
  if (raw.rangeTypes) p.rangeTypes = raw.rangeTypes
  if (raw.enumTypes) p.enumTypes = raw.enumTypes
  if (raw.structTypes) p.structTypes = raw.structTypes
  for (const [id, r] of Object.entries((raw.reviews ?? {}) as NonNullable<Project['reviews']>)) if (p.items[id]) (p.reviews ??= {})[id] = r
  return nameAllInstances(p)
}
