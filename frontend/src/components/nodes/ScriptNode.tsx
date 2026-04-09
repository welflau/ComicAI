import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { FileText, Sparkles, Loader2, PenLine, Video, Image, Music } from 'lucide-react'

export interface ScriptNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  title?: string
  content?: string
}

const QUICK_ACTIONS = [
  { icon: <PenLine size={11} />, label: '自己编写内容' },
  { icon: <Video size={11} />,   label: '文生视频' },
  { icon: <Image size={11} />,   label: '图片反推提示词' },
  { icon: <Music size={11} />,   label: '文字生音乐' },
]

function ScriptNode({ data, selected }: NodeProps<ScriptNodeData>) {
  const content = (data.content as string) || ''
  const [generating, setGenerating] = useState(false)

  const handleGenerate = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (generating) return
    setGenerating(true)
    setTimeout(() => setGenerating(false), 2000)
  }

  return (
    <div
      className="relative"
      style={{
        width: 200,
        background: '#1a1a1a',
        border: selected ? '1.5px solid #4f6ef7' : '1px solid #2e2e2e',
        borderRadius: 8,
        boxShadow: selected
          ? '0 0 0 3px rgba(79,110,247,0.18), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 8px rgba(0,0,0,0.4)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px 6px',
        borderBottom: '1px solid #242424',
      }}>
        <FileText size={11} color="#888" />
        <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>
          {data.label || '文本'}
        </span>
      </div>

      {/* Title */}
      {data.title && (
        <div style={{ padding: '7px 10px 3px' }}>
          <div style={{ fontSize: 12, color: '#e0e0e0', fontWeight: 600, lineHeight: 1.4 }}>
            {data.title}
          </div>
        </div>
      )}

      {/* Content preview */}
      <div style={{
        padding: data.title ? '3px 10px 8px' : '7px 10px 8px',
        fontSize: 11, color: '#666', lineHeight: 1.6,
        maxHeight: 80, overflow: 'hidden',
      }}>
        {content
          ? content.slice(0, 200) + (content.length > 200 ? '...' : '')
          : <span style={{ color: '#555' }}>暂无内容，点击下方按钮生成剧本</span>
        }
      </div>

      {/* Generate button */}
      <div style={{ padding: '0 10px 8px' }}>
        <button
          className="nodrag nopan"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 0',
            background: generating ? '#1e2a1e' : '#1a2a1a',
            border: '1px solid #2a4a2a',
            borderRadius: 5,
            cursor: generating ? 'default' : 'pointer',
            fontSize: 11, color: generating ? '#4a7a4a' : '#6aaa6a',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { if (!generating) { e.currentTarget.style.background = '#1f341f'; e.currentTarget.style.borderColor = '#3a6a3a' } }}
          onMouseLeave={e => { e.currentTarget.style.background = generating ? '#1e2a1e' : '#1a2a1a'; e.currentTarget.style.borderColor = '#2a4a2a' }}
        >
          {generating
            ? <><Loader2 size={11} className="animate-spin" /> 生成中...</>
            : <><Sparkles size={11} /> 生成剧本</>
          }
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ borderTop: '1px solid #222', padding: '6px 10px 8px' }}>
        <div style={{ fontSize: 10, color: '#444', marginBottom: 4 }}>尝试:</div>
        {QUICK_ACTIONS.map(a => (
          <div
            key={a.label}
            className="nodrag nopan"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 4px', borderRadius: 4, cursor: 'pointer',
              color: '#666', fontSize: 11,
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#252525'; e.currentTarget.style.color = '#aaa' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#666' }}
          >
            <span style={{ color: '#555', flexShrink: 0 }}>{a.icon}</span>
            {a.label}
          </div>
        ))}
      </div>

      {/* Output handle */}
      <Handle type="source" position={Position.Right} style={{
        width: 8, height: 8, background: '#333', border: '1.5px solid #666', right: -5,
      }} />
    </div>
  )
}

export default memo(ScriptNode)
