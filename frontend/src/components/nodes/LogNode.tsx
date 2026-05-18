import { memo, useState, useCallback } from 'react'
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

function extractOutput(node: any): Record<string, unknown> {
  const out: Record<string, unknown> = { type: node.type, label: node.label, id: node.id }
  if (node.content)       out.content       = (node.content as string).slice(0, 200)
  if (node.imageUrl)      out.imageUrl      = node.imageUrl
  if (node.imagePrompt)   out.imagePrompt   = (node.imagePrompt as string).slice(0, 120)
  if (node.videoUrl)      out.videoUrl      = node.videoUrl
  if (node.videoPrompt)   out.videoPrompt   = (node.videoPrompt as string).slice(0, 120)
  if (node.shots?.length) out.shots         = `${node.shots.length} 个分镜`
  if (node.chapters?.length) out.chapters   = `${node.chapters.length} 章`
  return out
}

/* ── LogNode ────────────────────────────────────────────────────── */

function LogNode({ data, selected, dragging }: NodeProps<LogNodeData>) {
  const allEdges   = useProjectStore(s => s.edges)
  const allNodes   = useProjectStore(s => s.nodes)
  const addLog     = useLogStore(s => s.addLog)

  const [lastOutput, setLastOutput] = useState<string>('')
  const [hovered, setHovered] = useState(false)

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
      const out = extractOutput(node)
      const lines = Object.entries(out)
        .map(([k, v]) => `  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n')
      const summary = `[Log] ↑ ${node.label || node.type}\n${lines}`
      results.push(summary)
      addLog({
        level: 'debug',
        category: 'operation',
        message: `[Log] ${data.label || 'Log'} ← ${node.label || node.type}`,
        detail: lines,
      })
    })

    setLastOutput(results.join('\n\n'))
  }, [allEdges, allNodes, data.id, data.label, addLog])

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
