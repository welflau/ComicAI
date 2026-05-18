import { memo, useState, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { ScrollText, Play, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useLogStore } from '@/stores/logStore'

/* ── Types ─────────────────────────────────────────────────────── */

export interface LogNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  groupId?: string
}

const NODE_W = 300

/* ── Read node output fields ──────────────────────────────────── */

/** 提取节点最核心的输出内容（纯文字，用于预览和日志）*/
function extractContent(node: any): string {
  // LoopNode — 显示最近推送的内容
  if (node._lastPushedContent) return node._lastPushedContent as string
  // 文字节点
  if (node.content) return node.content as string
  // 图片节点
  if (node.imagePrompt) return `[图片] ${node.imagePrompt as string}`
  if (node.imageUrl)    return `[图片URL] ${node.imageUrl as string}`
  // 视频节点
  if (node.videoPrompt) return `[视频] ${node.videoPrompt as string}`
  if (node.videoUrl)    return `[视频URL] ${node.videoUrl as string}`
  // 分镜脚本
  if (node.shots?.length) return `[分镜] ${node.shots.length} 个镜头`
  // 章节
  if (node.chapters?.length) return `[章节] ${node.chapters.length} 章`
  return `(${node.type}) ${node.label ?? ''}`
}

/* ── LogNode ────────────────────────────────────────────────────── */

function LogNode({ data, selected, dragging }: NodeProps<LogNodeData>) {
  const allEdges   = useProjectStore(s => s.edges)
  const allNodes   = useProjectStore(s => s.nodes)
  const addLog     = useLogStore(s => s.addLog)

  const [lastOutput, setLastOutput] = useState<string>('')
  const [hovered, setHovered] = useState(false)
  const updateNode = useProjectStore(s => s.updateNode)

  const handlesVisible = !dragging && (selected || hovered)

  const handleRead = useCallback(() => {
    const upstreamIds = allEdges.filter(e => e.target === data.id).map(e => e.source)
    if (upstreamIds.length === 0) {
      addLog({ level: 'warn', category: 'operation', message: `[Log] ${data.label || 'Log 节点'} 没有上游连接` })
      return
    }

    const results: string[] = []
    upstreamIds.forEach(id => {
      const node = allNodes.find(n => n.id === id)
      if (!node) return
      const content = extractContent(node)
      const header = `↑ ${node.label || node.type}`
      results.push(`${header}\n${content}`)
      addLog({
        level: 'debug',
        category: 'operation',
        message: `[Log] ${data.label || 'Log'} ← ${node.label || node.type}`,
        detail: content,
      })
    })

    setLastOutput(results.join('\n\n---\n\n'))
  }, [allEdges, allNodes, data.id, data.label, addLog])

  // Auto-execute + clear triggerRun when LoopNode triggers this node
  useEffect(() => {
    if ((data as any).triggerRun === true) {
      handleRead()
      updateNode(data.id, { triggerRun: false } as any)
    }
  }, [(data as any).triggerRun])   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: NODE_W,
        background: '#161616',
        border: `1.5px solid ${selected ? '#7c6af7' : '#2e2e2e'}`,
        borderRadius: 14,
        boxShadow: selected
          ? '0 0 0 2px rgba(124,106,247,0.2), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 12px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Title bar */}
      <div style={{
        height: 28, display: 'flex', alignItems: 'center', gap: 7,
        padding: '0 12px',
        background: '#1a1a1a', borderBottom: '1px solid #252525',
      }}>
        <ScrollText size={13} color="#7c6af7" />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#bbb', flex: 1 }}>
          {data.label || 'Log'}
        </span>
        <span style={{ fontSize: 10, color: '#444' }}>Debug</span>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        {/* Last output preview */}
        {lastOutput ? (
          <div style={{
            background: '#111', border: '1px solid #252525', borderRadius: 7,
            padding: '6px 8px', marginBottom: 8,
            fontSize: 10, color: '#666', lineHeight: 1.6,
            maxHeight: 100, overflowY: 'auto',
            fontFamily: 'monospace',
            scrollbarWidth: 'thin', scrollbarColor: '#333 transparent',
          }}>
            {lastOutput}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#3a3a3a', marginBottom: 8, textAlign: 'center' }}>
            连接上游节点，点击「读取」输出到 Log
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className="nodrag nopan"
            onClick={handleRead}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '5px 0', borderRadius: 7,
              background: 'transparent',
              border: '1px solid rgba(124,106,247,0.4)',
              color: '#9b8fff', fontSize: 11, fontWeight: 500, cursor: 'pointer',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(124,106,247,0.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <Play size={11} />
            读取输出
          </button>
          {lastOutput && (
            <button
              className="nodrag nopan"
              onClick={() => setLastOutput('')}
              style={{
                width: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7, border: '1px solid #2e2e2e',
                background: 'transparent', color: '#555', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#e05050' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Handles */}
      <Handle
        type="target" position={Position.Left}
        style={{ top: 14, background: '#555', width: 10, height: 10, border: '2px solid #161616', opacity: handlesVisible ? 1 : 0 }}
      />
      <Handle
        type="source" position={Position.Right}
        style={{ top: 14, background: '#555', width: 10, height: 10, border: '2px solid #161616', opacity: handlesVisible ? 1 : 0 }}
      />
    </div>
  )
}

export default memo(LogNode)
