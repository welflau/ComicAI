import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Image as ImageIcon, Film } from 'lucide-react'

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

function ImageNode({ data, selected }: NodeProps<ImageNodeData>) {
  return (
    <div
      style={{
        width: 340,
        background: '#1a1a1a',
        border: selected ? '1.5px solid #4f6ef7' : '1px solid #2e2e2e',
        borderRadius: 8,
        boxShadow: selected
          ? '0 0 0 3px rgba(79,110,247,0.18), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 4px 20px rgba(0,0,0,0.5)',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8, height: 8,
          background: '#333', border: '1.5px solid #666',
          left: -5,
          top: 20,
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 10px',
          borderBottom: '1px solid #252525',
        }}
      >
        <ImageIcon size={12} color="#888" />
        <span style={{ fontSize: 11, color: '#aaa', fontWeight: 500 }}>
          {data.label || '图片节点 2'}
        </span>
      </div>

      {/* Image area */}
      <div
        style={{
          height: 190,
          background: '#111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {/* Mountain/image placeholder icon */}
            <svg width="48" height="40" viewBox="0 0 48 40" fill="none">
              <path d="M4 36L16 16L24 26L32 14L44 36H4Z" fill="#2a2a2a" stroke="#333" strokeWidth="1.5" strokeLinejoin="round"/>
              <circle cx="14" cy="10" r="4" fill="#2a2a2a" stroke="#333" strokeWidth="1.5"/>
            </svg>
          </div>
        )}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8, height: 8,
          background: '#333', border: '1.5px solid #666',
          right: -5,
          top: 20,
        }}
      />
    </div>
  )
}

export default memo(ImageNode)
