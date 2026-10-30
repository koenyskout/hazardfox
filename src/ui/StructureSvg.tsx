import type { MouseEvent } from 'react'
import { DEVICE_STYLE, labelLeader, ROLE_FILL, ROLE_STROKE, type Drawn, type EdgeRoute, type Pt } from '../model/structure'
import type { Id, Project } from '../model/types'

export interface SvgHandlers {
  onNodeDown?: (e: MouseEvent, id: Id) => void
  onResizeDown?: (e: MouseEvent, id: Id) => void
  onResizeLDown?: (e: MouseEvent, id: Id) => void
  onResizeHDown?: (e: MouseEvent, id: Id) => void
  onEdgeDown?: (e: MouseEvent, id: Id) => void
  onLabelDown?: (e: MouseEvent, id: Id) => void
  /** Pointer entered (id) or left (null) a box or arrow. */
  onHover?: (id: Id | null, e: MouseEvent) => void
  selected?: Id | null
  hideDevices?: boolean
}

const path = (pts: Pt[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ')

/** Pure SVG (presentation attributes only) so it can be serialised for export unchanged. */
export function StructureSvg({ p, d, h = {} }: { p: Project; d: Drawn; h?: SvgHandlers }) {
  const ordered = [...d.nodes].sort((a, b) => a.depth - b.depth)
  const edgeColor = (e: EdgeRoute) => (e.kind === 'ca' ? '#111827' : '#15803d')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={d.width} height={d.height} viewBox={`${d.minX} ${d.minY} ${d.width} ${d.height}`} fontFamily="Helvetica, Arial, sans-serif" fontSize={12}>
      <defs>
        {['ca', 'fb'].map((k) => (
          <marker key={k} id={'arrow-' + k} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={k === 'ca' ? '#111827' : '#15803d'} />
          </marker>
        ))}
      </defs>
      <rect x={d.minX} y={d.minY} width={d.width} height={d.height} fill="#ffffff" />
      {ordered.map((n) => {
        const it = p.items[n.id]
        if (!it || it.kind !== 'node') return null
        const sel = h.selected === n.id
        return (
          <g key={n.id} onMouseDown={(e) => h.onNodeDown?.(e, n.id)} onMouseEnter={(e) => h.onHover?.(n.id, e)} onMouseLeave={(e) => h.onHover?.(null, e)} style={{ cursor: h.onNodeDown ? 'grab' : undefined }}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.compound ? 10 : 6}
              fill={n.compound ? ROLE_FILL[it.role] + '66' : ROLE_FILL[it.role]} stroke={sel ? '#f97316' : ROLE_STROKE[it.role]} strokeWidth={sel ? 3 : 1.5} strokeDasharray={n.compound ? '6 3' : undefined} />
            {n.compound ? (
              <text x={n.x + 12} y={n.y + 24} fontWeight={700} fill="#111827">{n.lines.join(' ')}</text>
            ) : (
              <>
                <text x={n.x + n.w / 2} y={n.y + 13} textAnchor="middle" fontSize={9} fill="#6b7280" fontStyle="italic">{it.role}</text>
                {n.lines.map((l, i) => (
                  <text key={i} x={n.x + n.w / 2} y={n.y + 29 + i * 16} textAnchor="middle" fontWeight={600} fill="#111827">{l}</text>
                ))}
              </>
            )}
            {sel && h.onResizeDown && (
              <rect x={n.x + n.w - 5} y={n.y + n.h / 2 - 12} width={10} height={24} rx={3} fill="#f97316" stroke="#ffffff" style={{ cursor: 'ew-resize' }}
                onMouseDown={(e) => h.onResizeDown!(e, n.id)} />
            )}
            {sel && h.onResizeLDown && (
              <rect x={n.x - 5} y={n.y + n.h / 2 - 12} width={10} height={24} rx={3} fill="#f97316" stroke="#ffffff" style={{ cursor: 'ew-resize' }}
                onMouseDown={(e) => h.onResizeLDown!(e, n.id)} />
            )}
            {sel && h.onResizeHDown && (
              <rect x={n.x + n.w / 2 - 12} y={n.y + n.h - 5} width={24} height={10} rx={3} fill="#f97316" stroke="#ffffff" style={{ cursor: 'ns-resize' }}
                onMouseDown={(e) => h.onResizeHDown!(e, n.id)} />
            )}
          </g>
        )
      })}
      {d.edges.map((e) => {
        const sel = h.selected === e.id
        return (
          <g key={e.id} onMouseDown={(ev) => h.onEdgeDown?.(ev, e.id)} onMouseEnter={(ev) => h.onHover?.(e.id, ev)} onMouseLeave={(ev) => h.onHover?.(null, ev)} style={{ cursor: h.onEdgeDown ? 'pointer' : undefined }}>
            <path d={path(e.points)} fill="none" stroke="transparent" strokeWidth={12} />
            <path d={path(e.points)} fill="none" stroke={sel ? '#f97316' : edgeColor(e)} strokeWidth={sel ? 2.5 : 1.5}
              strokeDasharray={e.kind === 'feedback' ? '5 3' : undefined} markerEnd={`url(#arrow-${e.kind === 'ca' ? 'ca' : 'fb'})`} />
            {e.device && !h.hideDevices && (
              <g>
                <rect x={e.device.x} y={e.device.y} width={e.device.w} height={e.device.h} rx={8} fill={DEVICE_STYLE[e.device.kind].fill} stroke={sel ? '#f97316' : DEVICE_STYLE[e.device.kind].stroke} strokeWidth={1.2} />
                <text x={e.device.x + e.device.w / 2} y={e.device.y + 11.5} textAnchor="middle" fontSize={10} fill="#111827">{e.device.name}</text>
              </g>
            )}
            {e.text && e.label && (() => {
              const l = labelLeader(e.label, e.points)
              return l && <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} stroke="#9ca3af" strokeWidth={0.75} />
            })()}
            {e.text && e.label && <rect x={e.label.x} y={e.label.y} width={e.label.w} height={e.label.h} rx={2} fill="#ffffff" fillOpacity={0.92} style={{ cursor: h.onLabelDown ? 'move' : undefined }} onMouseDown={(ev) => h.onLabelDown?.(ev, e.id)} />}
            {e.text && e.label && (
              <text x={e.label.x + e.label.w / 2} y={e.label.y + 11} textAnchor="middle" fontSize={11} fill={edgeColor(e)} fontStyle={e.kind === 'feedback' ? 'italic' : undefined}
                stroke="#ffffff" strokeWidth={3} paintOrder="stroke" style={{ cursor: h.onLabelDown ? 'move' : undefined }} onMouseDown={(ev) => h.onLabelDown?.(ev, e.id)}>
                {e.label.lines.map((l, i) => <tspan key={i} x={e.label!.x + e.label!.w / 2} dy={i ? 13 : 0}>{l}</tspan>)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
