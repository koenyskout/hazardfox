import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js'
import { clusterStructs, predicateOf, structPath, variablesIn } from './formal'
import { variableName } from './labels'
import type { Pt } from './structure'
import { itemsOfKind } from './tree'
import type { Id, Labels, Project, Variable } from './types'
import { describeStates } from './variables'

export interface DomainBox { assoc?: boolean; id: Id; x: number; y: number; w: number; h: number; head: string; title: string; attrs: { id: Id; text: string; detail: string; indent: number; head?: boolean }[] }
export interface DomainEdge { id: Id; a: Id; b: Id; kind: 'rel' | 'part'; pts: Pt[]; label: string; fromCard: string; toCard: string; self: boolean }
export interface DomainLayout { boxes: DomainBox[]; edges: DomainEdge[]; width: number; height: number }

export const DOM = { charW: 7, row: 18, head: 28, pad: 10 }
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
    const w = Math.max(120, ...['    ' + title, ...attrs.map((a) => ' '.repeat(a.indent * 2) + a.text + (a.detail.length * 0.8 | 0 ? ' ' + a.detail.slice(0, Math.ceil(a.detail.length * 0.85)) : ''))].map((s) => s.length * DOM.charW + 2 * DOM.pad))
    const rows = attrs.length
    boxes[e.id] = { assoc, id: e.id, x: 0, y: 0, w, h: DOM.head + (assoc && !rows ? 0 : rows * DOM.row + (rows ? 8 : 0) + 4), head, title, attrs }
  }
  for (const e of entities) build(e, variablesIn(p, 'domain', e.id))
  const assocs = itemsOfKind(p, 'relationship').filter((r) => boxes[r.from] && boxes[r.to]).map((r) => ({ r, vars: variablesIn(p, 'domain', r.id).filter((v) => v.id !== predicateOf(p, r.id)?.id) }))
  for (const { r, vars } of assocs) build({ id: r.id, title: r.title.trim() || (predicateOf(p, r.id) ? variableName(p, predicateOf(p, r.id)!) : '') }, vars, true)
  const edges: ElkExtendedEdge[] = []
  const meta: Record<string, Omit<DomainEdge, 'pts'>> = {}
  for (const e of entities) {
    if (e.parent && boxes[e.parent]) {
      meta['part:' + e.id] = { id: e.id, a: e.id, b: e.parent, kind: 'part', label: '', fromCard: '', toCard: '', self: false }
      // laid out parent → child so that parents sit above their parts; drawn (reversed) with the arrow at the parent
      edges.push({ id: 'part:' + e.id, sources: [e.parent], targets: [e.id] } as ElkExtendedEdge)
    }
  }
  // every relationship is a box on its line (entity — box — entity); without attributes it is a compact name box
  for (const { r } of assocs) {
    meta['a:' + r.id] = { id: r.id, a: r.from, b: r.id, kind: 'rel', label: '', fromCard: r.fromCard, toCard: '', self: false }
    meta['b:' + r.id] = { id: r.id, a: r.id, b: r.to, kind: 'rel', label: '', fromCard: '', toCard: r.toCard, self: false }
    edges.push({ id: 'a:' + r.id, sources: [r.from], targets: [r.id] } as ElkExtendedEdge, { id: 'b:' + r.id, sources: [r.id], targets: [r.to] } as ElkExtendedEdge)
  }
  const graph: ElkNode = {
    id: 'root',
    children: [...entities.map((e) => e.id), ...assocs.map((a) => a.r.id)].map((id) => ({ id, width: boxes[id].w, height: boxes[id].h })),
    edges,
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.nodeNode': '40',
      'elk.layered.spacing.nodeNodeBetweenLayers': '60', 'elk.spacing.edgeNode': '16', 'elk.spacing.edgeEdge': '10',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.nodePlacement.favorStraightEdges': 'true', 'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH', 'elk.separateConnectedComponents': 'true', 'elk.padding': '[top=20,left=20,bottom=20,right=40]',
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
  return { boxes: Object.values(boxes), edges: out, width: (res.width ?? 0) + 40, height: res.height ?? 0 }
}

/** Orthogonal route between two boxes: straight when they overlap in x or y, otherwise one Z-shaped elbow. */
function route(a: DomainBox, b: DomainBox): Pt[] {
  const ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w)
  const oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.h, b.y + b.h)
  if (ox1 - ox0 >= 12) { const x = (ox0 + ox1) / 2, up = b.y < a.y; return [{ x, y: up ? a.y : a.y + a.h }, { x, y: up ? b.y + b.h : b.y }] }
  if (oy1 - oy0 >= 12) { const y = (oy0 + oy1) / 2, left = b.x < a.x; return [{ x: left ? a.x : a.x + a.w, y }, { x: left ? b.x + b.w : b.x, y }] }
  const up = b.y < a.y, ax = a.x + a.w / 2, bx = b.x + b.w / 2
  const y0 = up ? a.y : a.y + a.h, y1 = up ? b.y + b.h : b.y, my = (y0 + y1) / 2
  return [{ x: ax, y: y0 }, { x: ax, y: my }, { x: bx, y: my }, { x: bx, y: y1 }]
}

/** The auto layout with the manual nudges of entities / relationships applied; edges at a moved box are re-routed. */
export function nudgeDomain(l: DomainLayout, p: Project): DomainLayout {
  const nudge = (id: Id) => { const it = p.items[id]; return it && (it.kind === 'entity' || it.kind === 'relationship') ? it.nudge : null }
  if (!l.boxes.some((b) => nudge(b.id))) return l
  const boxes = l.boxes.map((b) => { const n = nudge(b.id); return n ? { ...b, x: Math.max(10, b.x + n.dx), y: Math.max(10, b.y + n.dy) } : b })
  const by = Object.fromEntries(boxes.map((b) => [b.id, b]))
  const edges = l.edges.map((e) => (nudge(e.a) || nudge(e.b) ? { ...e, pts: route(by[e.a], by[e.b]) } : e))
  return { boxes, edges, width: Math.max(l.width, ...boxes.map((b) => b.x + b.w + 40)), height: Math.max(l.height, ...boxes.map((b) => b.y + b.h + 20)) }
}
