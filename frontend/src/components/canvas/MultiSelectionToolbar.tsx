import { memo, useMemo } from 'react'
import { useStore } from 'reactflow'
import { Copy, Trash2, Layers } from 'lucide-react'
import type { Node } from 'reactflow'

interface MultiSelectionToolbarProps {
  selectedNodes: Node[]
  onDelete: () => void
  onDuplicate: () => void
  onCopy: () => void
}

function calculateBoundingBox(nodes: Node[]) {
  if (nodes.length === 0) return null
  
  const xs = nodes.map(n => n.position.x)
  const ys = nodes.map(n => n.position.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  
  return {
    x: minX,
    y: minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    top: minY,
    bottom: maxY,
    left: minX,
    right: maxX,
  }
}

export const MultiSelectionToolbar = memo(function MultiSelectionToolbar({
  selectedNodes,
  onDelete,
  onDuplicate,
  onCopy,
}: MultiSelectionToolbarProps) {
  const zoom = useStore(s => s.transform[2])
  const scale = 1 / zoom
  
  const bbox = useMemo(() => calculateBoundingBox(selectedNodes), [selectedNodes])
  
  if (!bbox || selectedNodes.length === 0) {
    return null
  }
  
  const GAP = 8
  const TOOLBAR_HEIGHT = 44
  const upShift = (TOOLBAR_HEIGHT + GAP) * scale
  
  return (
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute',
        left: bbox.centerX,
        top: bbox.top - upShift,
        transformOrigin: 'center top',
        transform: `translateX(-50%) scale(${scale})`,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#1c1c1c',
        border: '1px solid #333',
        borderRadius: 24,
        padding: '6px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
    >
      <button
        className="nodrag nopan"
        title="复制"
        onClick={onCopy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#777',
          borderRadius: 7,
          transition: 'color 0.12s, background 0.12s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#ddd'
          ;(e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#777'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
      >
        <Copy size={14} />
      </button>

      <button
        className="nodrag nopan"
        title="复制节点"
        onClick={onDuplicate}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#777',
          borderRadius: 7,
          transition: 'color 0.12s, background 0.12s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#ddd'
          ;(e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#777'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
      >
        <Layers size={14} />
      </button>

      <button
        className="nodrag nopan"
        title="删除"
        onClick={onDelete}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#dd6b6b',
          borderRadius: 7,
          transition: 'color 0.12s, background 0.12s',
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#ff8888'
          ;(e.currentTarget as HTMLButtonElement).style.background = '#3a2a2a'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.color = '#dd6b6b'
          ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
        }}
      >
        <Trash2 size={14} />
      </button>

      <span style={{ width: 1, height: 14, background: '#2e2e2e', margin: '0 8px' }} />
    </div>
  )
})

MultiSelectionToolbar.displayName = 'MultiSelectionToolbar'
