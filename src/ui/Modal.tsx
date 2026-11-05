import { Icon } from './Icon'
import { useEffect, type ReactNode } from 'react'

/** `behind` > 0: a dialog stacked under a newer one (peeks out offset, inert); `stacked`: not the lowest, so no extra dimming. */
export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; huge?: boolean; behind?: number; stacked?: boolean }) {
  const behind = props.behind ?? 0
  useEffect(() => {
    if (behind) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [props, behind])
  return (
    <div className={'modal-back' + (props.stacked ? ' stacked' : '')} onMouseDown={behind ? undefined : props.onClose}>
      <div className={'modal' + (props.wide ? ' wide' : '') + (props.huge ? ' huge' : '') + (behind ? ' under' : '')} style={behind ? { transform: `translateY(${-10 * behind}px) scaleX(${1 - 0.03 * behind})` } : undefined} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <button className="modal-x" title="Close (Esc)" onClick={props.onClose}><Icon name="x" size={14} /></button>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  )
}
