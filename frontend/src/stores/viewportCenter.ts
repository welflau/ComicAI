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
