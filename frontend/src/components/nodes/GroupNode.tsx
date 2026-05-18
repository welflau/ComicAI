import { memo, useState, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Package, FileText, Image, Video, BookOpen, Film } from 'lucide-react'
import NodeAddMenu from './shared/NodeAddMenu'
import { useProjectStore } from '@/stores/projectStore'

/* ── Types ─────────────────────────────────────────────────────── */

export interface GroupNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  groupId?: string
}

/* ── Constants ──────────────────────────────────────────────────── */

const NODE_W = 220
const HANDLE_TOP = 44   // vertically centred on the card

/* ── Type icons & labels ─────────────────────────────────────────── */

const TYPE_ICONS: Record<string, React.ElementType> = {
  libtv_script:        FileText,
  libtv_image:         Image,
  libtv_video:         Video,
  libtv_script_gen:    BookOpen,
  libtv_chapter_split: BookOpen,
  libtv_video_compose: Film,
}

const TYPE_LABELS: Record<string, string> = {
  libtv_script:        '文字',
  libtv_image:         '图片',
  libtv_video:         '视频',
  libtv_script_gen:    '脚本',
  libtv_chapter_split: '章节',
  libtv_video_compose: '合成',
  libtv_group:         '子组',
  libtv_loop:          '循环',
}

/* ── CircleHandle (same pattern as ScriptNode) ───────────────────── */

function CircleHandle({ type, position, visible, onSourceClick, menuOpen, onMenuClose, nodeId, nodePos }: {
  type: 'source' | 'target'
  position: Position
  visible?: boolean
  onSourceClick?: () => void
  menuOpen?: boolean
  onMenuClose?: () => void
  nodeId: string
  nodePos: { x: number; y: number }
}) {
  const side = position === Position.Left ? { left: -11 } : { right: -11 }
  const direction = type === 'source' ? 'right' : 'left'
  return (
    <div style={{ position: 'absolute', top: HANDLE_TOP, ...side, transform: 'translateY(-50%)', width: 22, height: 22 }}>
      <Handle
        type={type}
        position={position}
        style={{
          width: 22, height: 22,
          background: '#1a1a1a', border: '1.5px solid #606060',
          borderRadius: '50%',
          top: 0, left: 0, transform: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          position: 'relative',
          transition: 'opacity 150ms ease',
        }}
        onClick={e => { e.stopPropagation(); onSourceClick?.() }}
      >
        <span style={{
          pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -52%)',
        }}>+</span>
      </Handle>
      {menuOpen && (
        <NodeAddMenu
          nodeType="default"
          sourceNodeId={nodeId}
          sourcePosition={nodePos}
          sourceNodeWidth={NODE_W}
          direction={direction as 'left' | 'right'}
          onClose={onMenuClose!}
        />
      )}
    </div>
  )
}

/* ── GroupNode ──────────────────────────────────────────────────── */

function GroupNode({ data, selected, dragging }: NodeProps<GroupNodeData>) {
  const enterGroup  = useProjectStore(s => s.enterGroup)
  const allNodes    = useProjectStore(s => s.nodes)

  const [menuOpen,       setMenuOpen]       = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)
  const [hovered,        setHovered]        = useState(false)

  const handlesVisible = !dragging && (selected || hovered)

  // Count child nodes by type — exclude internal port nodes
  const PORT_TYPES = new Set(['libtv_group_input', 'libtv_group_output'])
  const children = allNodes.filter(n => n.groupId === data.id && !PORT_TYPES.has(n.type))
  const typeCounts = children.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1
    return acc
  }, {})
  const typeEntries = Object.entries(typeCounts)

  return (
    <div
      onDoubleClick={e => { e.stopPropagation(); enterGroup(data.id) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: NODE_W,
        background: selected ? '#1e1e1e' : '#161616',
        border: `1.5px solid ${selected ? '#7c6af7' : '#2e2e2e'}`,
        borderRadius: 14,
        boxShadow: selected
          ? '0 0 0 2px rgba(124,106,247,0.2), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 12px rgba(0,0,0,0.4)',
        transition: 'border-color 0.15s, background 0.15s',
        overflow: 'visible',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      {/* Title bar */}
      <div style={{
        height: HANDLE_TOP * 2,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px',
        background: '#1a1a1a',
        borderRadius: '13px 13px 0 0',
        borderBottom: '1px solid #252525',
      }}>
        <Package size={13} color="#7c6af7" />
        <span style={{
          fontSize: 13, fontWeight: 600, color: '#ccc',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {data.label}
        </span>
        <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>
          {children.length} 个节点
        </span>
      </div>

      {/* Type tags */}
      <div style={{ padding: '8px 12px 10px' }}>
        {typeEntries.length === 0 ? (
          <div style={{ fontSize: 11, color: '#3a3a3a', textAlign: 'center', padding: '4px 0' }}>
            空组 · 双击进入
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {typeEntries.map(([type, count]) => {
              const Icon = TYPE_ICONS[type]
              const label = TYPE_LABELS[type] ?? type
              return (
                <div key={type} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 6,
                  background: '#252525', border: '1px solid #333',
                  fontSize: 11, color: '#888',
                }}>
                  {Icon && <Icon size={10} />}
                  <span>{label} ×{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Handles */}
      <CircleHandle
        type="target" position={Position.Left} visible={handlesVisible}
        onSourceClick={() => setTargetMenuOpen(v => !v)}
        menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
        nodeId={data.id} nodePos={data.position}
      />
      <CircleHandle
        type="source" position={Position.Right} visible={handlesVisible}
        onSourceClick={() => setMenuOpen(v => !v)}
        menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
        nodeId={data.id} nodePos={data.position}
      />
    </div>
  )
}

export default memo(GroupNode)
