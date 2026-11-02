import type { ReactNode } from 'react'
import { shortName, variableName } from '../model/labels'
import { isComputed, useProject } from './hooks'
import { LAYER_SHORT, type Item, type Status, type VariableLayer } from '../model/types'

const PATHS: Record<string, ReactNode> = {
  plus: <path d="M8 3v10M3 8h10" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v4M9 7v4" />,
  /** delete the item only: the box stays, children are lifted out */
  'trash-keep': <><path d="M3 5.5h6M5 5.5V4h2v1.5M3.8 5.5l.4 6h3.6l.4-6" /><path d="M12 12V6.5M9.8 8.4L12 6.2l2.2 2.2" /></>,
  /** delete item and everything below it */
  'trash-all': <><path d="M3 4h10M6 4V2.8h4V4M4 4l.6 9h6.8l.6-9" /><path d="M6.5 7v4M9.5 7v4" /></>,
  up: <path d="M8 13V3M4 7l4-4 4 4" />,
  down: <path d="M8 3v10M4 9l4 4 4-4" />,
  group: <><rect x="2.5" y="2.5" width="11" height="4" rx="1" /><rect x="4.5" y="9.5" width="3" height="4" rx=".7" /><rect x="9" y="9.5" width="3" height="4" rx=".7" /><path d="M8 6.5v1.5M6 8h4M6 8v1.5M10 8v1.5" /></>,
  split: <><rect x="5" y="2" width="6" height="3.5" rx="1" /><path d="M8 5.5V8M4.5 8h7M4.5 8v2M11.5 8v2" /><rect x="2.5" y="10" width="4" height="3.5" rx="1" /><rect x="9.5" y="10" width="4" height="3.5" rx="1" /></>,
  merge: <><rect x="2.5" y="2" width="4" height="3.5" rx="1" /><rect x="9.5" y="2" width="4" height="3.5" rx="1" /><path d="M4.5 5.5V8h7V5.5M8 8v2.5" /><rect x="5" y="10.5" width="6" height="3.5" rx="1" /></>,
  sparkle: <path d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12 6.6 8.4 3 7l3.6-1.4zM12.5 11l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  warn: <path d="M8 2.5l6 10.5H2zM8 7v3M8 11.5v.2" />,
  draft: <path d="M3 13l.6-3L10.5 3.1a1.2 1.2 0 011.7 0l.7.7a1.2 1.2 0 010 1.7L6 12.4zM9.5 4.2l2.3 2.3" />,
  review: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="1.8" /></>,
  approved: <><circle cx="8" cy="8" r="6" /><path d="M5.2 8.3l2 2 3.6-4" /></>,
  error: <><circle cx="8" cy="8" r="6" /><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" /></>,
  info: <><circle cx="8" cy="8" r="6" /><path d="M8 7.3v3.6M8 5v.2" /></>,
  /** variable layers: world (globe), signal (measured pulse), belief (thought bubble), internal (memory chip) */
  'layer-domain': <><circle cx="8" cy="8" r="5.8" /><path d="M2.2 8h11.6M8 2.2c-2.2 2.6-2.2 9 0 11.6M8 2.2c2.2 2.6 2.2 9 0 11.6" /></>,
  /** computed world variable: globe with an f */
  'layer-computed': <><circle cx="8" cy="8" r="5.8" /><path d="M9.8 4.8c-1.4-.5-2.4.3-2.4 1.6V11.5M5.8 7.4h3.8" /></>,
  'layer-signal': <path d="M1.5 9h2.5l1.8-4.5 2.7 8 2-5.5 1 2h3" />,
  'layer-belief': <><path d="M4.8 10.8a2.6 2.6 0 01-.6-5.1 3.7 3.7 0 017.1-1.1 3 3 0 01.6 6.2z" /><circle cx="4.6" cy="13.3" r="1" /><circle cx="2.2" cy="15" r=".5" /></>,
  'layer-internal': <><rect x="4.5" y="4.5" width="7" height="7" rx="1" /><path d="M6.5 2.5v2M9.5 2.5v2M6.5 11.5v2M9.5 11.5v2M2.5 6.5h2M2.5 9.5h2M11.5 6.5h2M11.5 9.5h2" /></>,
  /** domain entity: class box */
  entity: <><rect x="2.5" y="3" width="11" height="10" rx="1.2" /><path d="M2.5 6.5h11M2.5 9.8h11" /></>,
  /** relationship: two boxes joined by a line */
  relationship: <><rect x="1.5" y="5.5" width="4" height="5" rx="1" /><rect x="10.5" y="5.5" width="4" height="5" rx="1" /><path d="M5.5 8h5" /></>,
  'type-range': <path d="M1.5 6v4M14.5 6v4M1.5 8h13M5.5 7v2M8 7v2M10.5 7v2" />,
  'type-enum': <><path d="M6 4h8M6 8h8M6 12h8" /><circle cx="2.8" cy="4" r=".7" /><circle cx="2.8" cy="8" r=".7" /><circle cx="2.8" cy="12" r=".7" /></>,
  'type-boolean': <><rect x="1.5" y="4.5" width="13" height="7" rx="3.5" /><circle cx="11" cy="8" r="1.7" /></>,
  'type-symbolic': <path d="M8 2l5.5 6L8 14 2.5 8z" />,
  gear: <><circle cx="8" cy="8" r="2" /><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3" /></>,
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 15 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name]}
    </svg>
  )
}

export const StatusIcon = ({ status, size = 14 }: { status: Status; size?: number }) => (
  <span className={'status-ico st-' + status} title={status[0].toUpperCase() + status.slice(1)}><Icon name={status} size={size} /></span>
)

export const LayerIcon = ({ layer, size = 13, computed }: { layer: VariableLayer; size?: number; computed?: boolean }) => (
  <span className={'layer-ico l-' + layer} title={computed ? 'Computed world variable' : LAYER_SHORT[layer] + ' variable'}><Icon name={computed ? 'layer-computed' : `layer-${layer}`} size={size} /></span>
)

/** Chip content: the item's label; a variable shown by name gets its layer icon and drops the owner (shown on hover). */
export function ChipLabel({ it, label }: { it: Item; label: string }) {
  const p = useProject()
  if (it.kind === 'entity') {
    const [, first, rest] = /^(\S*)([^]*)$/.exec(it.title.trim() || label)!
    return <><span className="nowrap"><span className="layer-ico l-entity" title="Entity"><Icon name="entity" size={12} /></span>{first}</span>{rest}</>
  }
  if (it.kind === 'relationship') {
    const [, first, rest] = /^(\S*)([^]*)$/.exec([p.items[it.from]?.title, it.title, p.items[it.to]?.title].map((x) => x?.trim() || '?').join(' '))!
    return <><span className="nowrap"><span className="layer-ico l-relationship" title="Relationship"><Icon name="relationship" size={12} /></span>{first}</span>{rest}</>
  }
  if (it.kind !== 'variable') return <>{label}</>
  if (label === variableName(p, it)) label = shortName(p, it) || label
  // icon stays on one line with the first word
  const [, first, rest] = /^(\S*)([^]*)$/.exec(label)!
  return <><span className="nowrap"><LayerIcon layer={it.layer} size={12} computed={isComputed(p, it)} />{first}</span>{rest}</>
}

/** A layer badge: icon and short name. */
export const LayerTag = ({ layer, text = LAYER_SHORT[layer] }: { layer: VariableLayer; text?: string }) => (
  <span className={'layer l-' + layer}><LayerIcon layer={layer} />{text}</span>
)
