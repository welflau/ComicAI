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
  const scale   = 1 / zoom   // counter-scale to keep visual size constant

  const isInput = data.type === 'libtv_group_input'
  const Icon    = isInput ? LogIn : LogOut
  const color   = isInput ? '#4a9eff' : '#ff8c42'
  const bg      = isInput ? 'rgba(74,158,255,0.15)' : 'rgba(255,140,66,0.15)'
  const border  = isInput ? 'rgba(74,158,255,0.55)' : 'rgba(255,140,66,0.55)'

  // Handle size at screen pixels — we inverse-scale them so they appear constant too
  const hSize = 10

  return (
    // Outer div: occupies W×H in flow-space
    <div style={{ width: W, height: H, overflow: 'visible', position: 'relative' }}>

      {/* Inner div: counter-scaled so visual content stays at W×H screen pixels */}
      <div style={{
        position: 'absolute', top: 0, left: 0,
        width: W, height: H,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
        overflow: 'visible',
      }}>
        {/* Visual card */}
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

        {/*
          Handles inside the counter-scaled div so they appear at the visual edges.
          ReactFlow reads their DOM position (getBoundingClientRect) to place connection lines —
          placing them here means lines start/end at the correct visual position.
        */}

        {/* Input node: right = source (connects to internal nodes) */}
        {isInput && (
          <Handle
            type="source" position={Position.Right}
            style={{
              width: hSize, height: hSize,
              background: color, border: '2px solid #161616',
              right: -(hSize / 2), top: H / 2 - hSize / 2,
              transform: 'none',
            }}
          />
        )}
        {/* Input node: left = target (receives from external / group boundary) */}
        {isInput && (
          <Handle
            type="target" position={Position.Left}
            style={{
              width: hSize, height: hSize,
              background: color, border: '2px solid #161616',
              left: -(hSize / 2), top: H / 2 - hSize / 2,
              opacity: 0.45, transform: 'none',
            }}
          />
        )}

        {/* Output node: left = target (receives from internal nodes) */}
        {!isInput && (
          <Handle
            type="target" position={Position.Left}
            style={{
              width: hSize, height: hSize,
              background: color, border: '2px solid #161616',
              left: -(hSize / 2), top: H / 2 - hSize / 2,
              transform: 'none',
            }}
          />
        )}
        {/* Output node: right = source (connects to external / group boundary) */}
        {!isInput && (
          <Handle
            type="source" position={Position.Right}
            style={{
              width: hSize, height: hSize,
              background: color, border: '2px solid #161616',
              right: -(hSize / 2), top: H / 2 - hSize / 2,
              opacity: 0.45, transform: 'none',
            }}
          />
        )}
      </div>
    </div>
  )
}

export default memo(GroupPortNode)
