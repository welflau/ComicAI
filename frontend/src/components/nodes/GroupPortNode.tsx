import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { LogIn, LogOut } from 'lucide-react'

export interface GroupPortNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  groupId?: string
}

const W = 90
const H = 40

function GroupPortNode({ data }: NodeProps<GroupPortNodeData>) {
  const isInput = data.type === 'libtv_group_input'
  const Icon = isInput ? LogIn : LogOut

  return (
    <div style={{
      width: W, height: H,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      background: '#1a1a1a',
      border: '1.5px dashed #3a3a3a',
      borderRadius: 10,
      color: '#666', fontSize: 12, fontWeight: 500,
      userSelect: 'none',
      position: 'relative',
    }}>
      <Icon size={13} color="#555" />
      <span>{isInput ? '输入' : '输出'}</span>

      {/* Input port: source handle on the RIGHT (data flows out into the group) */}
      {isInput && (
        <Handle
          type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: '#555', border: '2px solid #1a1a1a', right: -5 }}
        />
      )}

      {/* Output port: target handle on the LEFT (data flows in from internal nodes) */}
      {isInput && (
        <Handle
          type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: '#444', border: '2px solid #1a1a1a', left: -5, opacity: 0.3 }}
        />
      )}

      {!isInput && (
        <Handle
          type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: '#555', border: '2px solid #1a1a1a', left: -5 }}
        />
      )}
      {!isInput && (
        <Handle
          type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: '#444', border: '2px solid #1a1a1a', right: -5, opacity: 0.3 }}
        />
      )}
    </div>
  )
}

export default memo(GroupPortNode)
