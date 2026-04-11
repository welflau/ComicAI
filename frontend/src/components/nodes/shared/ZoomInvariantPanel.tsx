import { useRef, useState, useLayoutEffect } from 'react'
import { useStore } from 'reactflow'

/**
 * Wraps children so they render at a fixed screen size, immune to canvas zoom.
 *
 * How it works:
 *   ReactFlow's canvas applies scale(zoom) to all nodes.
 *   We counter-scale with scale(1/zoom), so the net visual scale = 1×.
 *
 *   The outer div reserves the correct flow-space height (naturalH / zoom),
 *   so that CollapsibleSection's scrollHeight measurement stays accurate.
 *   The inner div is position:absolute to avoid affecting layout/scrollHeight.
 *
 * @param naturalWidth  The desired screen width of the panel (= the node width at zoom=1)
 */
export default function ZoomInvariantPanel({
  children,
  naturalWidth,
}: {
  children: React.ReactNode
  naturalWidth: number
}) {
  const zoom = useStore(s => s.transform[2])
  const innerRef = useRef<HTMLDivElement>(null)
  const [naturalH, setNaturalH] = useState(0)

  // Measure once on mount (and whenever naturalH resets to 0 after remount).
  // offsetHeight is the CSS layout height, unaffected by CSS transform.
  useLayoutEffect(() => {
    if (innerRef.current) {
      const h = innerRef.current.offsetHeight
      if (h > 0 && h !== naturalH) setNaturalH(h)
    }
  })

  const scale = 1 / zoom
  // Horizontal offset so the counter-scaled panel stays centred within the node.
  // With transformOrigin='top left': visual centre = left + (naturalWidth * scale) / 2
  // Setting that equal to naturalWidth / 2 gives:
  //   left = (naturalWidth / 2) * (1 - scale)
  const centreLeft = (naturalWidth / 2) * (1 - scale)

  return (
    // Outer div: reserves the right amount of flow-space so the parent's layout
    // (and CollapsibleSection's scrollHeight) see the correct reduced height.
    <div style={{
      position: 'relative',
      height: naturalH > 0 ? naturalH * scale : undefined,
      overflow: 'visible',
    }}>
      {/* Inner div: the actual content, counter-scaled to stay at natural screen size */}
      <div
        ref={innerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: centreLeft,
          width: naturalWidth,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
