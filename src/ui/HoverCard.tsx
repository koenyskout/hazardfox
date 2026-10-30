import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface Anchor { left: number; top: number; bottom: number }

/** Floating card state: `open` after a short delay, `closeSoon` leaves time to move the pointer into the card. */
export function useHoverCard() {
  const box = useRef<HTMLDivElement>(null)
  const timer = useRef<number>(0)
  const content = useRef<() => ReactNode>(() => null)
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const close = () => { window.clearTimeout(timer.current); setPos(null) }
  const closeSoon = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(close, 200) }
  const keep = () => window.clearTimeout(timer.current)
  const open = (anchor: () => Anchor | undefined, card: () => ReactNode) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const r = anchor()
      if (!r) return
      content.current = card
      const below = r.bottom + 260 < window.innerHeight || r.top < 260
      setPos({ x: Math.max(8, Math.min(r.left, window.innerWidth - 356)), y: below ? r.bottom + 6 : r.top - 6, below })
    }, 250)
  }
  useEffect(() => {
    if (!pos) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    const scroll = (e: Event) => !(e.target instanceof Node && box.current?.contains(e.target)) && close()
    window.addEventListener('keydown', esc)
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('keydown', esc); window.removeEventListener('scroll', scroll, true) }
  }, [pos])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const node = pos && createPortal(
    <div ref={box} className="hovercard" onMouseEnter={keep} onMouseLeave={closeSoon} style={{ left: pos.x, top: pos.y, transform: pos.below ? undefined : 'translateY(-100%)' }}>{content.current()}</div>,
    document.body,
  )
  return { open, close, closeSoon, node }
}

/** Wraps a trigger; shows a floating card after a short hover or on keyboard focus. */
export function HoverCard({ children, card }: { children: ReactNode; card: () => ReactNode }) {
  const trigger = useRef<HTMLSpanElement>(null)
  const hc = useHoverCard()
  const open = () => hc.open(() => trigger.current?.getBoundingClientRect(), card)
  return (
    <span ref={trigger} className="hc-trigger" onMouseEnter={open} onMouseLeave={hc.closeSoon} onFocus={open} onBlur={hc.close} onClick={hc.close}>
      {children}
      {hc.node}
    </span>
  )
}
