import { useRef, useEffect, useState } from 'react'

interface Props {
  expanded: boolean
  children: React.ReactNode
  /** Animation duration in ms, default 180 */
  duration?: number
}

/**
 * Smoothly collapses/expands its children based on `expanded`.
 * Uses scrollHeight measurement so animation duration is exact.
 * When fully collapsed the children are removed from the DOM.
 */
export default function CollapsibleSection({ expanded, children, duration = 180 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Track whether the element should be in the DOM at all
  const [visible, setVisible]   = useState(expanded)
  const [height,  setHeight]    = useState<number | 'auto'>(expanded ? 'auto' : 0)
  const [opacity, setOpacity]   = useState(expanded ? 1 : 0)
  // Prevent re-entrancy when animated props fire quickly
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Clear any pending timer
    if (timerRef.current) clearTimeout(timerRef.current)

    if (expanded) {
      setVisible(true)
      // Allow one frame for the children to render, then read scrollHeight
      requestAnimationFrame(() => {
        if (!ref.current) return
        setHeight(ref.current.scrollHeight)
        setOpacity(1)
        timerRef.current = setTimeout(() => {
          setHeight('auto')
        }, duration)
      })
    } else {
      // Pin height to current rendered height first
      setHeight(el.scrollHeight)
      setOpacity(0)
      // Double rAF: ensure browser has painted the pinned height before animating to 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setHeight(0)
        })
      })
      timerRef.current = setTimeout(() => {
        setVisible(false)
      }, duration)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [expanded, duration])

  if (!visible && !expanded) return null

  return (
    <div
      ref={ref}
      style={{
        height: height === 'auto' ? 'auto' : `${height}px`,
        opacity,
        overflow: 'hidden',
        transition: `height ${duration}ms cubic-bezier(0.4,0,0.2,1), opacity ${duration}ms ease`,
      }}
    >
      {children}
    </div>
  )
}
