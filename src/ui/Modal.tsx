import { Icon } from './Icon'
import { useEffect, type ReactNode } from 'react'

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [props])
  return (
    <div className="modal-back" onMouseDown={props.onClose}>
      <div className={'modal' + (props.wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <button className="modal-x" title="Close (Esc)" onClick={props.onClose}><Icon name="x" size={14} /></button>
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  )
}
