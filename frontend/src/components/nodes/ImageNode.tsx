import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Image as ImageIcon, Sparkles, Loader2, Layers, Maximize2, Eraser, Wand2 } from 'lucide-react'
import CollapsibleSection from './shared/CollapsibleSection'
import NodeAddMenu from './shared/NodeAddMenu'

export interface ImageNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  imageUrl?: string
  nodeIndex?: number
}

const QUICK_ACTIONS = [
  { icon: <Layers size={11} />,   label: '图生图' },
  { icon: <Maximize2 size={11} />, label: '图片高清' },
  { icon: <Eraser size={11} />,   label: '背景去除' },
  { icon: <Wand2 size={11} />,    label: '风格迁移' },
]

function ImageNode({ data, selected }: NodeProps<ImageNodeData>) {
  const [generating, setGenerating] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const handlesVisible = isHovered || selected || generating

  const handleGenerate = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (generating) return
    setGenerating(true)
    setTimeout(() => setGenerating(false), 2000)
  }

  return (
    <div
      className="relative nodrag"
      style={{
        width: 200,
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Input handle — outside overflow:hidden card */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 18, height: 18,
          background: '#1a1a1a', border: '1.5px solid #606060',
          borderRadius: '50%', left: -9, top: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: handlesVisible ? 1 : 0,
          pointerEvents: handlesVisible ? 'auto' : 'none',
          transition: 'opacity 150ms ease',
        }}
      >
        <span style={{
          pointerEvents: 'none', fontSize: 13, color: '#888', lineHeight: 1,
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -52%)',
        }}>+</span>
      </Handle>

      {/* Inner card */}
      <div
        style={{
          background: '#1a1a1a',
          border: selected ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1px solid #2e2e2e',
          borderRadius: 8,
          boxShadow: selected
            ? '0 0 0 2px rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.5)'
            : '0 2px 8px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          transition: 'border-color 150ms ease, box-shadow 150ms ease',
        }}
      >

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px 6px',
        borderBottom: '1px solid #242424',
      }}>
        <ImageIcon size={11} color="#888" />
        <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>
          {data.label || '图片'}
        </span>
      </div>

      {/* Image area */}
      <div style={{
        height: 120,
        background: '#111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        {data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <svg width="40" height="34" viewBox="0 0 48 40" fill="none">
            <path d="M4 36L16 16L24 26L32 14L44 36H4Z" fill="#2a2a2a" stroke="#333" strokeWidth="1.5" strokeLinejoin="round"/>
            <circle cx="14" cy="10" r="4" fill="#2a2a2a" stroke="#333" strokeWidth="1.5"/>
          </svg>
        )}
      </div>

      {/* Generate button */}
      <div style={{ padding: '8px 10px 8px' }}>
        <button
          className="nodrag nopan"
          onClick={handleGenerate}
          disabled={generating}
          style={{
            width: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '5px 0',
            background: generating ? '#1a1e2a' : '#141a2a',
            border: '1px solid #2a3a5a',
            borderRadius: 5,
            cursor: generating ? 'default' : 'pointer',
            fontSize: 11, color: generating ? '#4a6aaa' : '#6a8acc',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { if (!generating) { e.currentTarget.style.background = '#1a2540'; e.currentTarget.style.borderColor = '#3a5a8a' } }}
          onMouseLeave={e => { e.currentTarget.style.background = generating ? '#1a1e2a' : '#141a2a'; e.currentTarget.style.borderColor = '#2a3a5a' }}
        >
          {generating
            ? <><Loader2 size={11} className="animate-spin" /> 生成中...</>
            : <><Sparkles size={11} /> 生成图片</>
          }
        </button>
      </div>

      {/* Quick actions */}
      <CollapsibleSection expanded={!!selected}>
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
      </CollapsibleSection>

      </div>{/* end inner card */}

      {/* Output handle + menu */}
      <div style={{
        position: 'absolute',
        right: -9,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 18,
        height: 18,
      }}>
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 18, height: 18,
            background: '#1a1a1a', border: '1.5px solid #606060',
            borderRadius: '50%',
            top: 0, left: 0,
            transform: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: handlesVisible ? 1 : 0,
            pointerEvents: handlesVisible ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
            position: 'relative',
          }}
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
        >
          <span style={{
            pointerEvents: 'none', fontSize: 13, color: '#888', lineHeight: 1,
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -52%)',
          }}>+</span>
        </Handle>
        {menuOpen && (
          <NodeAddMenu
            nodeType="libtv_image"
            sourceNodeId={data.id}
            sourcePosition={data.position}
            sourceNodeWidth={200}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

export default memo(ImageNode)
