import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Package, ChevronRight, FileText, Image, Video, BookOpen, Film } from 'lucide-react'
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

const NODE_W = 240

/* ── Type icons ─────────────────────────────────────────────────── */

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

/* ── GroupNode ──────────────────────────────────────────────────── */

function GroupNode({ data, selected, dragging }: NodeProps<GroupNodeData>) {
  const enterGroup  = useProjectStore(s => s.enterGroup)
  const allNodes    = useProjectStore(s => s.nodes)

  // Count child nodes by type
  const children = allNodes.filter(n => n.groupId === data.id)
  const typeCounts = children.reduce<Record<string, number>>((acc, n) => {
    acc[n.type] = (acc[n.type] ?? 0) + 1
    return acc
  }, {})
  const typeEntries = Object.entries(typeCounts)

  const handlesVisible = !dragging

  return (
    <div
      style={{
        width: NODE_W,
        background: selected ? '#1e1b38' : '#181828',
        border: `1.5px solid ${selected ? '#7c6af7' : '#3a3060'}`,
        borderRadius: 14,
        boxShadow: selected
          ? '0 0 0 2px rgba(124,106,247,0.25), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 12px rgba(0,0,0,0.4)',
        transition: 'border-color 0.15s, background 0.15s',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px 8px',
        borderBottom: '1px solid #2a2050',
        background: 'rgba(124,106,247,0.08)',
      }}>
        <Package size={13} color="#7c6af7" />
        <span style={{
          fontSize: 13, fontWeight: 600, color: '#ccc',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {data.label}
        </span>
        <span style={{ fontSize: 10, color: '#7c6af7', flexShrink: 0 }}>
          {children.length} 个节点
        </span>
      </div>

      {/* Type summary */}
      <div style={{ padding: '10px 12px 6px' }}>
        {typeEntries.length === 0 ? (
          <div style={{ fontSize: 11, color: '#444', textAlign: 'center', padding: '4px 0' }}>
            空组
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
                  background: 'rgba(124,106,247,0.1)',
                  border: '1px solid rgba(124,106,247,0.2)',
                  fontSize: 11, color: '#9b8fff',
                }}>
                  {Icon && <Icon size={10} />}
                  <span>{label} ×{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Enter button */}
      <div style={{ padding: '6px 12px 10px' }}>
        <button
          className="nodrag nopan"
          onClick={() => enterGroup(data.id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 6, padding: '6px 0', borderRadius: 8,
            background: 'transparent',
            border: '1px solid #3a3060',
            color: '#7c6af7', fontSize: 12, fontWeight: 500,
            cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,106,247,0.15)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#7c6af7'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3060'
          }}
        >
          进入组
          <ChevronRight size={12} />
        </button>
      </div>

      {/* Handles */}
      <Handle
        type="target" position={Position.Left}
        style={{ top: 40, background: '#7c6af7', width: 10, height: 10, border: '2px solid #181828', opacity: handlesVisible ? 1 : 0 }}
      />
      <Handle
        type="source" position={Position.Right}
        style={{ top: 40, background: '#7c6af7', width: 10, height: 10, border: '2px solid #181828', opacity: handlesVisible ? 1 : 0 }}
      />
    </div>
  )
}

export default memo(GroupNode)
