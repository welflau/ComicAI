import { memo, useState, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Repeat, ChevronLeft, ChevronRight, Play, ChevronDown, Check } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useLogStore } from '@/stores/logStore'

/* ── Types ─────────────────────────────────────────────────────── */

export interface LoopNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  groupId?: string
  // config
  filterType?: string
  // state (persisted)
  currentIndex?: number
}

const FILTER_OPTIONS = [
  { value: 'libtv_script',        label: '文字节点' },
  { value: 'libtv_image',         label: '图片节点' },
  { value: 'libtv_chapter_split', label: '章节节点' },
]

const NODE_W = 300

/* ── LoopNode ───────────────────────────────────────────────────── */

function LoopNode({ data, selected, dragging }: NodeProps<LoopNodeData>) {
  const allNodes   = useProjectStore(s => s.nodes)
  const allEdges   = useProjectStore(s => s.edges)
  const updateNode = useProjectStore(s => s.updateNode)
  const addLog     = useLogStore(s => s.addLog)

  const [filterType,   setFilterType]   = useState(data.filterType ?? 'libtv_script')
  const [currentIndex, setCurrentIndex] = useState(data.currentIndex ?? 0)
  const [filterDropOpen, setFilterDropOpen] = useState(false)

  const handlesVisible = !dragging

  // Find connected group node (upstream)
  const upstreamGroupId = allEdges
    .filter(e => e.target === data.id)
    .map(e => allNodes.find(n => n.id === e.source && n.type === 'libtv_group'))
    .find(Boolean)?.id ?? null

  // Get items from the group matching filterType
  const items = upstreamGroupId
    ? allNodes.filter(n => n.groupId === upstreamGroupId && n.type === filterType)
    : []

  const total = items.length
  const safeIndex = total > 0 ? Math.min(currentIndex, total - 1) : 0
  const currentItem = items[safeIndex] ?? null

  // Sync index to data
  useEffect(() => {
    if (data.currentIndex !== safeIndex)
      updateNode(data.id, { currentIndex: safeIndex } as any)
  }, [safeIndex])

  const go = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(total - 1, safeIndex + delta))
    setCurrentIndex(next)
    updateNode(data.id, { currentIndex: next } as any)
  }, [safeIndex, total, data.id, updateNode])

  // Push current item's content to downstream nodes
  const pushCurrent = useCallback(() => {
    if (!currentItem) return
    const content = (currentItem as any).content as string | undefined
    if (!content) {
      addLog({ level: 'warn', category: 'operation', message: '[循环] 当前节点无文本内容' })
      return
    }

    // Find downstream nodes connected from this loop node
    const downstreamIds = allEdges
      .filter(e => e.source === data.id)
      .map(e => e.target)

    if (downstreamIds.length === 0) {
      addLog({ level: 'warn', category: 'operation', message: '[循环] 没有连接下游节点' })
      return
    }

    downstreamIds.forEach(id => {
      updateNode(id, { content, initialMode: 'content', title: currentItem.label } as any)
    })

    addLog({
      level: 'info', category: 'operation',
      message: `[循环] 已推送第 ${safeIndex + 1}/${total}：${currentItem.label}`,
      detail: content.slice(0, 80) + (content.length > 80 ? '…' : ''),
    })
  }, [currentItem, safeIndex, total, allEdges, data.id, updateNode, addLog])

  const filterLabel = FILTER_OPTIONS.find(o => o.value === filterType)?.label ?? filterType

  return (
    <div style={{
      width: NODE_W,
      background: selected ? '#1a2a1a' : '#161e16',
      border: `1.5px solid ${selected ? '#4caf50' : '#2a3e2a'}`,
      borderRadius: 14,
      boxShadow: selected
        ? '0 0 0 2px rgba(76,175,80,0.2), 0 4px 20px rgba(0,0,0,0.5)'
        : '0 2px 12px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '9px 12px 8px',
        borderBottom: '1px solid #2a3e2a',
        background: 'rgba(76,175,80,0.08)',
      }}>
        <Repeat size={13} color="#4caf50" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#ccc', flex: 1 }}>
          {data.label || '循环遍历'}
        </span>
        {total > 0 && (
          <span style={{ fontSize: 10, color: '#4caf50', flexShrink: 0 }}>
            {safeIndex + 1} / {total}
          </span>
        )}
      </div>

      {/* Config row */}
      <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: '#666', flexShrink: 0 }}>遍历类型</span>
        <div style={{ position: 'relative', flex: 1 }}>
          <button
            className="nodrag nopan"
            onClick={() => setFilterDropOpen(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 8px', borderRadius: 6,
              background: '#1e2e1e', border: '1px solid #2a3e2a',
              color: '#aaa', fontSize: 11, cursor: 'pointer',
            }}
          >
            <span>{filterLabel}</span>
            <ChevronDown size={9} />
          </button>
          {filterDropOpen && (
            <div style={{
              position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 9999,
              background: '#1a2a1a', border: '1px solid #2a3e2a',
              borderRadius: 8, overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}>
              {FILTER_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className="nodrag nopan"
                  onClick={() => { setFilterType(opt.value); setFilterDropOpen(false); setCurrentIndex(0); updateNode(data.id, { filterType: opt.value, currentIndex: 0 } as any) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 10px', cursor: 'pointer', fontSize: 11,
                    color: opt.value === filterType ? '#4caf50' : '#aaa',
                    background: opt.value === filterType ? 'rgba(76,175,80,0.1)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (opt.value !== filterType) (e.currentTarget as HTMLElement).style.background = '#1e2e1e' }}
                  onMouseLeave={e => { if (opt.value !== filterType) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {opt.value === filterType && <Check size={9} color="#4caf50" />}
                  {opt.value !== filterType && <div style={{ width: 9 }} />}
                  {opt.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Current item display */}
      <div style={{ padding: '6px 12px 8px' }}>
        {total === 0 ? (
          <div style={{ fontSize: 11, color: '#444', textAlign: 'center', padding: '8px 0' }}>
            {upstreamGroupId ? `组内没有${filterLabel}` : '请连接上游组节点'}
          </div>
        ) : (
          <div style={{
            background: '#1e2e1e', border: '1px solid #2a3e2a',
            borderRadius: 8, padding: '7px 10px',
          }}>
            <div style={{ fontSize: 12, color: '#ddd', fontWeight: 500, marginBottom: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentItem?.label ?? '—'}
            </div>
            {currentItem && (currentItem as any).content && (
              <div style={{
                fontSize: 10, color: '#555', lineHeight: 1.5,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {((currentItem as any).content as string).slice(0, 100)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Control bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px 10px',
        borderTop: '1px solid #2a3e2a',
      }}>
        <button
          className="nodrag nopan"
          disabled={safeIndex === 0 || total === 0}
          onClick={() => go(-1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: '1px solid #2a3e2a',
            color: safeIndex === 0 ? '#333' : '#888', cursor: safeIndex === 0 ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (safeIndex > 0) (e.currentTarget as HTMLButtonElement).style.background = '#1e2e1e' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <ChevronLeft size={13} />
        </button>

        <button
          className="nodrag nopan"
          disabled={total === 0}
          onClick={pushCurrent}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 5, height: 28, borderRadius: 6, border: 'none',
            background: total === 0 ? '#2a2a2a' : '#4caf50',
            color: total === 0 ? '#555' : '#fff',
            fontSize: 12, fontWeight: 600,
            cursor: total === 0 ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (total > 0) (e.currentTarget as HTMLButtonElement).style.background = '#66bb6a' }}
          onMouseLeave={e => { if (total > 0) (e.currentTarget as HTMLButtonElement).style.background = '#4caf50' }}
        >
          <Play size={11} />
          推送当前
        </button>

        <button
          className="nodrag nopan"
          disabled={safeIndex >= total - 1 || total === 0}
          onClick={() => go(1)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: '1px solid #2a3e2a',
            color: safeIndex >= total - 1 ? '#333' : '#888',
            cursor: safeIndex >= total - 1 ? 'not-allowed' : 'pointer',
          }}
          onMouseEnter={e => { if (safeIndex < total - 1) (e.currentTarget as HTMLButtonElement).style.background = '#1e2e1e' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Handles */}
      <Handle
        type="target" position={Position.Left}
        style={{ top: 40, background: '#4caf50', width: 10, height: 10, border: '2px solid #161e16', opacity: handlesVisible ? 1 : 0 }}
      />
      <Handle
        type="source" position={Position.Right}
        style={{ top: 40, background: '#4caf50', width: 10, height: 10, border: '2px solid #161e16', opacity: handlesVisible ? 1 : 0 }}
      />
    </div>
  )
}

export default memo(LoopNode)
