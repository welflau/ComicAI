import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { useStore } from 'reactflow'
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
  const zoom    = useStore(s => s.transform[2])
  const scale   = 1 / zoom

  const isInput = data.type === 'libtv_group_input'
  const Icon    = isInput ? LogIn : LogOut
  const color   = isInput ? '#4a9eff' : '#ff8c42'
  const bg      = isInput ? 'rgba(74,158,255,0.15)' : 'rgba(255,140,66,0.15)'
  const border  = isInput ? 'rgba(74,158,255,0.55)' : 'rgba(255,140,66,0.55)'

  return (
    // Outer div: reserves flow-space (W×H); keep overflow visible for handles
    <div style={{ width: W, height: H, overflow: 'visible', position: 'relative' }}>
      {/* Inner div: counter-scaled so visual size stays constant */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        width: W, height: H,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
      }}>
        <div style={{
          width: W, height: H,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          background: bg,
          border: `1.5px solid ${border}`,
          borderRadius: 10,
          color, fontSize: 12, fontWeight: 600,
          userSelect: 'none',
          position: 'relative',
          boxShadow: `0 0 10px ${isInput ? 'rgba(74,158,255,0.2)' : 'rgba(255,140,66,0.2)'}`,
        }}>
          <Icon size={13} />
          <span>{isInput ? '输入' : '输出'}</span>
        </div>
      </div>

      {/* Handles — placed on the outer (flow-space) div so ReactFlow can snap connections */}
      {isInput && (
        <Handle
          type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', right: -5, top: H / 2 }}
        />
      )}
      {isInput && (
        <Handle
          type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', left: -5, top: H / 2, opacity: 0.4 }}
        />
      )}
      {!isInput && (
        <Handle
          type="target" position={Position.Left}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', left: -5, top: H / 2 }}
        />
      )}
      {!isInput && (
        <Handle
          type="source" position={Position.Right}
          style={{ width: 10, height: 10, background: color, border: '2px solid #161616', right: -5, top: H / 2, opacity: 0.4 }}
        />
      )}
    </div>
  )
}

export default memo(GroupPortNode)
