import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js'
import { clusterStructs, predicateOf, structPath, variablesIn } from './formal'
import { variableName } from './labels'
import type { Pt } from './structure'
import { itemsOfKind } from './tree'
import type { Id, Labels, Project, Variable } from './types'
import { describeStates } from './variables'

export interface DomainBox { assoc?: boolean; id: Id; x: number; y: number; w: number; h: number; head: string; title: string; attrs: { id: Id; text: string; detail: string; indent: number; head?: boolean }[] }
export interface DomainEdge { id: Id; kind: 'rel' | 'part' | 'assoc'; pts: Pt[]; label: string; fromCard: string; toCard: string; self: boolean }
export interface DomainLayout { boxes: DomainBox[]; edges: DomainEdge[]; width: number; height: number }

export const DOM = { charW: 7, row: 18, head: 40, pad: 10 }
const elk = new ELK()

/** Class-diagram style layout of the domain model: entities with attributes (world variables) and operations, relationships and part/specialisation links. */
export async function layoutDomain(p: Project, labels: Labels): Promise<DomainLayout> {
  const entities = itemsOfKind(p, 'entity').sort((a, b) => a.rank - b.rank)
  const boxes: Record<Id, DomainBox> = {}
  const build = (e: { id: Id; title: string }, vars: Variable[], assoc?: boolean) => {
    const attrs: DomainBox['attrs'] = []
    clusterStructs(vars).forEach((v, i, all) => {
      const path = structPath(v), prev = i ? structPath(all[i - 1]) : []
      let k = 0
      while (k < path.length && path[k] === prev[k]) k++
      path.slice(k).forEach((h, j) => {
        let t = v.struct!.type
        for (const seg of path.slice(1, k + j + 1)) t = p.structTypes?.[t]?.fields.find((f) => f.name === seg)?.structType ?? t
        attrs.push({ id: `${v.id}:h${k + j}`, text: h, detail: `: ${t}`, indent: k + j, head: true })
      })
      attrs.push({ id: v.id, text: v.struct ? v.struct.path.split('.').pop()! : variableName(p, v), detail: v.type === 'enum' && v.states.length > 3 ? `: ${v.states.slice(0, 3).join(' | ')} …` : `: ${describeStates(v)}`, indent: path.length })
    })
    const head = labels[e.id] ?? ''
    const title = e.title.trim() || '(untitled)'
    const w = Math.max(120, ...[title, head, ...attrs.map((a) => ' '.repeat(a.indent * 2) + a.text + (a.detail.length * 0.8 | 0 ? ' ' + a.detail.slice(0, Math.ceil(a.detail.length * 0.85)) : ''))].map((s) => s.length * DOM.charW + 2 * DOM.pad))
    const rows = attrs.length
    boxes[e.id] = { assoc, id: e.id, x: 0, y: 0, w, h: DOM.head + rows * DOM.row + (attrs.length ? 8 : 0) + 4, head, title, attrs }
  }
  for (const e of entities) build(e, variablesIn(p, 'domain', e.id))
  const assocs = itemsOfKind(p, 'relationship').filter((r) => boxes[r.from] && boxes[r.to]).map((r) => ({ r, vars: variablesIn(p, 'domain', r.id).filter((v) => v.id !== predicateOf(p, r.id)?.id) })).filter((a) => a.vars.length)
  for (const { r, vars } of assocs) build({ id: r.id, title: r.title.trim() || (predicateOf(p, r.id) ? variableName(p, predicateOf(p, r.id)!) : '') }, vars, true)
  const edges: ElkExtendedEdge[] = []
  const meta: Record<string, Omit<DomainEdge, 'pts'>> = {}
  for (const e of entities) {
    if (e.parent && boxes[e.parent]) {
      meta['part:' + e.id] = { id: e.id, kind: 'part', label: '', fromCard: '', toCard: '', self: false }
      // laid out parent → child so that parents sit above their parts; drawn (reversed) with the arrow at the parent
      edges.push({ id: 'part:' + e.id, sources: [e.parent], targets: [e.id] } as ElkExtendedEdge)
    }
  }
  for (const r of itemsOfKind(p, 'relationship')) {
    if (!boxes[r.from] || !boxes[r.to]) continue
    const pred = predicateOf(p, r.id)
    const label = r.title.trim() || (pred ? variableName(p, pred) : '')
    // relationship with attributes: an association class box, tied to the line by a dashed link (the hidden edge only keeps it near the first entity)
    if (boxes[r.id]) edges.push({ id: 'h:' + r.id, sources: [r.from], targets: [r.id] } as ElkExtendedEdge)
    meta[r.id] = { id: r.id, kind: 'rel', label, fromCard: r.fromCard, toCard: r.toCard, self: r.from === r.to }
    if (r.from !== r.to) edges.push({ id: r.id, sources: [r.from], targets: [r.to] } as ElkExtendedEdge)
  }
  const graph: ElkNode = {
    id: 'root',
    children: [...entities.map((e) => e.id), ...assocs.map((a) => a.r.id)].map((id) => ({ id, width: boxes[id].w, height: boxes[id].h })),
    edges,
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60', 'elk.spacing.edgeNode': '16', 'elk.spacing.edgeEdge': '10',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH', 'elk.separateConnectedComponents': 'true', 'elk.padding': '[top=20,left=20,bottom=20,right=40]',
    },
  }
  const res = await elk.layout(graph)
  for (const c of res.children ?? []) Object.assign(boxes[c.id], { x: c.x ?? 0, y: c.y ?? 0 })
  const out: DomainEdge[] = []
  for (const e of res.edges ?? []) {
    const s = (e as ElkExtendedEdge).sections?.[0]
    if (!s || !meta[e.id]) continue
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
    out.push({ ...meta[e.id], pts: meta[e.id].kind === 'part' ? pts.reverse() : pts })
  }
  for (const [id, m] of Object.entries(meta)) {
    if (!m.self) continue
    const b = boxes[(p.items[id] as { from: Id }).from]
    out.push({ ...m, pts: [{ x: b.x + b.w, y: b.y + 16 }, { x: b.x + b.w + 34, y: b.y + 16 }, { x: b.x + b.w + 34, y: b.y + 50 }, { x: b.x + b.w, y: b.y + 50 }] })
  }
  const mid = (pts: Pt[]): Pt => {
    const len = (i: number) => Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    let total = 0
    for (let i = 1; i < pts.length; i++) total += len(i)
    let acc = 0
    for (let i = 1; i < pts.length; i++) {
      const d = len(i)
      if (acc + d >= total / 2) { const t = d ? (total / 2 - acc) / d : 0; return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t } }
      acc += d
    }
    return pts[0]
  }
  for (const { r } of assocs) {
    const rel = out.find((e) => e.id === r.id && e.kind === 'rel')
    if (!rel) continue
    const m = mid(rel.pts), b = boxes[r.id]
    const q = { x: Math.min(Math.max(m.x, b.x), b.x + b.w), y: Math.min(Math.max(m.y, b.y), b.y + b.h) }
    out.push({ id: r.id, kind: 'assoc', pts: [m, q], label: '', fromCard: '', toCard: '', self: false })
  }
  return { boxes: Object.values(boxes), edges: out, width: (res.width ?? 0) + 40, height: res.height ?? 0 }
}
