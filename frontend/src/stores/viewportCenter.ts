/**
 * Tiny singleton so LeftSidebar can ask WorkflowCanvas
 * "where is the viewport centre right now?" without prop drilling.
 */
let _getCenter: (() => { x: number; y: number }) | null = null

export function registerViewportCenter(fn: () => { x: number; y: number }) {
  _getCenter = fn
}

export function getViewportCenter(): { x: number; y: number } {
  return _getCenter ? _getCenter() : { x: 300, y: 300 }
}

/**
 * Singleton to allow AI panel (or any panel) to pan canvas to a specific node.
 */
let _focusNode: ((nodeId: string) => void) | null = null

export function registerFocusNode(fn: (nodeId: string) => void) {
  _focusNode = fn
}

export function focusCanvasNode(nodeId: string) {
  if (_focusNode) _focusNode(nodeId)
}
