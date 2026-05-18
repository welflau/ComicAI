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

const W = 88
const H = 36

function GroupPortNode({ data }: NodeProps<GroupPortNodeData>) {
  const isInput = data.type === 'libtv_group_input'
  const Icon    = isInput ? LogIn : LogOut
  // Input = 蓝色，Output = 橙色
  const color   = isInput ? '#4a9eff' : '#ff8c42'
  const bg      = isInput ? 'rgba(74,158,255,0.12)' : 'rgba(255,140,66,0.12)'
  const border  = isInput ? 'rgba(74,158,255,0.45)' : 'rgba(255,140,66,0.45)'

  return (
    <div style={{
      width: W, height: H,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      background: bg,
      border: `1.5px solid ${border}`,
      borderRadius: 10,
      color, fontSize: 12, fontWeight: 600,
      userSelect: 'none',
      position: 'relative',
      boxShadow: `0 0 8px ${isInput ? 'rgba(74,158,255,0.15)' : 'rgba(255,140,66,0.15)'}`,
    }}>
      <Icon size={13} />
      <span>{isInput ? '输入' : '输出'}</span>

      {/* Input: 右侧 source（向组内输出） */}
      {isInput && (
        <Handle
          type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', right: -5 }}
        />
      )}

      {/* Output: 左侧 target（接收组内结果） */}
      {!isInput && (
        <Handle
          type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', left: -5 }}
        />
      )}

      {/* 另一侧连接外部（半透明，标示对外接口） */}
      {isInput && (
        <Handle
          type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', left: -5, opacity: 0.35 }}
        />
      )}
      {!isInput && (
        <Handle
          type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', right: -5, opacity: 0.35 }}
        />
      )}
    </div>
  )
}

export default memo(GroupPortNode)
