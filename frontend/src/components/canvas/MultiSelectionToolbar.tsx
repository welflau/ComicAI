import { memo, useMemo } from 'react'
import { useStore } from 'reactflow'
import { LayoutGrid, Bookmark, Download, Copy, Group } from 'lucide-react'
import type { Node } from 'reactflow'

/* ── Props ──────────────────────────────────────────────────────── */

interface MultiSelectionToolbarProps {
  selectedNodes: Node[]
  onSave: () => void
  onDownload: () => void
  onDuplicate: () => void
  onGroup: () => void
}

/* ── Bounding box (flow coords, including node size) ────────────── */

function calculateBoundingBox(nodes: Node[]) {
  if (nodes.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    const x0 = n.position.x
    const y0 = n.position.y
    const x1 = x0 + (n.width  ?? 260)
    const y1 = y0 + (n.height ?? 200)
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
  }
  return { minX, minY, maxX, maxY, centerX: (minX + maxX) / 2 }
}

/* ── Single toolbar button ──────────────────────────────────────── */

interface TBtnProps {
  icon: React.ReactNode
  label?: string
  onClick: () => void
  title: string
}

function TBtn({ icon, label, onClick, title }: TBtnProps) {
  return (
    <button
      className="nodrag nopan"
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: label ? 5 : 0,
        padding: label ? '0 10px' : '0 8px',
        height: 32,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: '#aaa',
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 8,
        transition: 'color 0.12s, background 0.12s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color = '#fff'
        e.currentTarget.style.background = '#2a2a2a'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color = '#aaa'
        e.currentTarget.style.background = 'none'
      }}
    >
      <span style={{ flexShrink: 0, opacity: 0.85, lineHeight: 0 }}>{icon}</span>
      {label && <span>{label}</span>}
    </button>
  )
}

/* ── Toolbar ────────────────────────────────────────────────────── */

const TOOLBAR_GAP_PX = 10   // gap above the selection box in screen pixels

export const MultiSelectionToolbar = memo(function MultiSelectionToolbar({
  selectedNodes,
  onSave,
  onDownload,
  onDuplicate,
  onGroup,
}: MultiSelectionToolbarProps) {
  // Viewport transform: [tx, ty, zoom]
  const [tx, ty, zoom] = useStore(s => s.transform)

  const bbox = useMemo(() => calculateBoundingBox(selectedNodes), [selectedNodes])

  if (!bbox || selectedNodes.length < 2) return null

  // Convert flow → screen coordinates
  const screenCenterX = tx + bbox.centerX * zoom
  const screenTopY    = ty + bbox.minY   * zoom

  return (
    <div
      className="nodrag nopan"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        // Place just above the selection bounding box
        left: screenCenterX,
        top:  screenTopY - TOOLBAR_GAP_PX,
        transform: 'translate(-50%, -100%)',
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        background: '#1c1c1c',
        border: '1px solid #333',
        borderRadius: 28,
        padding: '2px 4px',
        boxShadow: '0 6px 24px rgba(0,0,0,0.65), 0 1px 4px rgba(0,0,0,0.3)',
        pointerEvents: 'auto',
        gap: 0,
      }}
    >
      {/* Left grid icon — indicates multi-select, no label */}
      <TBtn
        icon={<LayoutGrid size={14} />}
        title={`已选择 ${selectedNodes.length} 个节点`}
        onClick={() => {}}
      />

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: '#333', flexShrink: 0 }} />

      <TBtn
        icon={<Bookmark size={13} />}
        label="保存到素材"
        title="保存到素材库"
        onClick={onSave}
      />

      <TBtn
        icon={<Download size={13} />}
        label="批量下载"
        title="批量下载"
        onClick={onDownload}
      />

      <TBtn
        icon={<Copy size={13} />}
        label="创建副本"
        title="创建所选节点的副本"
        onClick={onDuplicate}
      />

      <TBtn
        icon={<Group size={13} />}
        label="打组"
        title="将选中节点打组"
        onClick={onGroup}
      />
    </div>
  )
})

MultiSelectionToolbar.displayName = 'MultiSelectionToolbar'
