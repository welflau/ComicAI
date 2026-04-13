/**
 * Returns true when 2 or more nodes are currently selected in the ReactFlow canvas.
 * When this is true, individual nodes should render in their idle appearance
 * (no selected-highlight border/glow), because the multi-selection toolbar takes
 * over the "selected" affordance instead.
 */
import { useStore } from 'reactflow'

export function useIsMultiSelected(): boolean {
  return useStore(s => {
    let count = 0
    // nodeInternals is a Map<id, Node> in ReactFlow v11
    s.nodeInternals.forEach(n => {
      if (n.selected) count++
    })
    return count >= 2
  })
}
