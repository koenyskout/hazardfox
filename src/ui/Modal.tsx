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
        <h3>{props.title}</h3>
        {props.children}
      </div>
    </div>
  )
}
