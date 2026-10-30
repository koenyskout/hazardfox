import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js'
import { predicateOf, variablesIn } from './formal'
import { variableName } from './labels'
import type { Pt } from './structure'
import { itemsOfKind } from './tree'
import type { Id, Labels, Project } from './types'
import { describeStates } from './variables'

export interface DomainBox { id: Id; x: number; y: number; w: number; h: number; head: string; title: string; attrs: { id: Id; text: string; detail: string }[]; ops: string[] }
export interface DomainEdge { id: Id; kind: 'rel' | 'part'; pts: Pt[]; label: string; fromCard: string; toCard: string; self: boolean }
export interface DomainLayout { boxes: DomainBox[]; edges: DomainEdge[]; width: number; height: number }

export const DOM = { charW: 7, row: 18, head: 40, pad: 10 }
const elk = new ELK()

/** Class-diagram style layout of the domain model: entities with attributes (world variables) and operations, relationships and part/specialisation links. */
export async function layoutDomain(p: Project, labels: Labels): Promise<DomainLayout> {
  const entities = itemsOfKind(p, 'entity').sort((a, b) => a.rank - b.rank)
  const boxes: Record<Id, DomainBox> = {}
  for (const e of entities) {
    const attrs = variablesIn(p, 'domain', e.id).map((v) => ({ id: v.id, text: variableName(p, v), detail: v.type === 'enum' && v.states.length > 3 ? `: ${v.states.slice(0, 3).join(' | ')} …` : `: ${describeStates(v)}` }))
    const head = labels[e.id] ?? ''
    const title = e.title.trim() || '(untitled)'
    const w = Math.max(120, ...[title, head, ...attrs.map((a) => a.text + (a.detail.length * 0.8 | 0 ? ' ' + a.detail.slice(0, Math.ceil(a.detail.length * 0.85)) : '')), ...e.operations.map((o) => o + '()')].map((s) => s.length * DOM.charW + 2 * DOM.pad))
    const rows = attrs.length + e.operations.length
    boxes[e.id] = { id: e.id, x: 0, y: 0, w, h: DOM.head + rows * DOM.row + (attrs.length ? 8 : 0) + (e.operations.length ? 8 : 0) + 4, head, title, attrs, ops: e.operations }
  }
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
    meta[r.id] = { id: r.id, kind: 'rel', label, fromCard: r.fromCard, toCard: r.toCard, self: r.from === r.to }
    if (r.from !== r.to) edges.push({ id: r.id, sources: [r.from], targets: [r.to] } as ElkExtendedEdge)
  }
  const graph: ElkNode = {
    id: 'root',
    children: entities.map((e) => ({ id: e.id, width: boxes[e.id].w, height: boxes[e.id].h })),
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
    if (!s) continue
    const pts = [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
    out.push({ ...meta[e.id], pts: meta[e.id].kind === 'part' ? pts.reverse() : pts })
  }
  for (const [id, m] of Object.entries(meta)) {
    if (!m.self) continue
    const b = boxes[(p.items[id] as { from: Id }).from]
    out.push({ ...m, pts: [{ x: b.x + b.w, y: b.y + 16 }, { x: b.x + b.w + 34, y: b.y + 16 }, { x: b.x + b.w + 34, y: b.y + 50 }, { x: b.x + b.w, y: b.y + 50 }] })
  }
  return { boxes: Object.values(boxes), edges: out, width: (res.width ?? 0) + 40, height: res.height ?? 0 }
}
