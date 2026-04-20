/**
 * SelectionBoundingBox
 *
 * Renders a single dashed rectangle that wraps all currently-selected nodes,
 * giving the "group selection" visual feedback shown in professional canvas tools.
 *
 * - Only visible when ≥ 2 nodes are selected
 * - Positioned in screen-space using the ReactFlow viewport transform
 * - pointer-events: none — never blocks interaction
 */
import { memo, useMemo } from 'react'
import { useStore } from 'reactflow'
import type { Node } from 'reactflow'

const PADDING_PX = 16   // screen-pixel padding around the bounding box

interface Props {
  selectedNodes: Node[]
}

export const SelectionBoundingBox = memo(function SelectionBoundingBox({ selectedNodes }: Props) {
  const [tx, ty, zoom] = useStore(s => s.transform)

  const bbox = useMemo(() => {
    if (selectedNodes.length < 2) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of selectedNodes) {
      const x0 = n.position.x
      const y0 = n.position.y
      const x1 = x0 + (n.width  ?? 280)
      const y1 = y0 + (n.height ?? 220)
      if (x0 < minX) minX = x0
      if (y0 < minY) minY = y0
      if (x1 > maxX) maxX = x1
      if (y1 > maxY) maxY = y1
    }
    return { minX, minY, maxX, maxY }
  }, [selectedNodes])

  if (!bbox) return null

  // Convert flow-space coords → screen-space, then apply fixed padding
  const left   = tx + bbox.minX * zoom - PADDING_PX
  const top    = ty + bbox.minY * zoom - PADDING_PX
  const width  = (bbox.maxX - bbox.minX) * zoom + PADDING_PX * 2
  const height = (bbox.maxY - bbox.minY) * zoom + PADDING_PX * 2

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        border: '1.5px dashed rgba(160, 160, 160, 0.30)',
        borderRadius: 18,
        pointerEvents: 'none',
        zIndex: 1,
        boxSizing: 'border-box',
      }}
    />
  )
})

SelectionBoundingBox.displayName = 'SelectionBoundingBox'
