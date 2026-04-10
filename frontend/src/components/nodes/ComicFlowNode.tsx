import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { clsx } from 'clsx'
import type { NodeData, NodeCategory } from '@/types'
import {
  FileText, Cpu, Image, Video, Mic, Scissors, Eye, Download,
  Users, Music, ChevronRight, CheckCircle2, AlertCircle, Loader2
} from 'lucide-react'

const NODE_ICONS: Record<string, React.ElementType> = {
  script_input: FileText,
  script_parse: Cpu,
  storyboard_gen: ChevronRight,
  character_design: Users,
  scene_design: Image,
  image_gen: Image,
  video_gen: Video,
  tts: Mic,
  music_gen: Music,
  auto_edit: Scissors,
  preview: Eye,
  export: Download,
}

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  input: 'border-node-input bg-node-input/10',
  process: 'border-node-process bg-node-process/10',
  output: 'border-node-output bg-node-output/10',
  control: 'border-node-control bg-node-control/10',
}

const CATEGORY_HEADER_COLORS: Record<NodeCategory, string> = {
  input: 'bg-node-input/20 text-node-input',
  process: 'bg-node-process/20 text-node-process',
  output: 'bg-node-output/20 text-node-output',
  control: 'bg-node-control/20 text-node-control',
}

const CATEGORY_HANDLE_COLORS: Record<NodeCategory, string> = {
  input: '!border-node-input',
  process: '!border-node-process',
  output: '!border-node-output',
  control: '!border-node-control',
}

interface ComicNodeProps extends NodeProps {
  data: NodeData & { onRun?: (id: string) => void }
}

function ComicFlowNode({ data, selected }: ComicNodeProps) {
  const [isHovered, setIsHovered] = useState(false)
  const Icon = NODE_ICONS[data.type] || Cpu
  const isInput = data.category === 'input'
  const isOutput = data.category === 'output'
  const handlesVisible = isHovered || selected

  return (
    <div
      className={clsx(
        'node-card min-w-[160px] max-w-[200px] border-2',
        CATEGORY_COLORS[data.category],
        selected ? 'ring-2 ring-white/30 scale-105' : 'scale-100',
      )}
      style={{ transition: 'box-shadow 150ms ease' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Input handle */}
      {!isInput && (
        <Handle
          type="target"
          position={Position.Left}
          className={clsx('!w-3 !h-3', CATEGORY_HANDLE_COLORS[data.category])}
          style={{
            opacity: handlesVisible ? 1 : 0,
            pointerEvents: handlesVisible ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
          }}
        />
      )}

      {/* Header */}
      <div className={clsx('px-3 py-2 rounded-t-xl flex items-center gap-2', CATEGORY_HEADER_COLORS[data.category])}>
        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs font-semibold truncate">{data.label}</span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        {/* Status indicator */}
        {data.status && data.status !== 'idle' && (
          <div className="flex items-center gap-1.5 mb-2">
            {data.status === 'running' && (
              <>
                <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                <span className="text-xs text-yellow-400">运行中 {data.progress}%</span>
              </>
            )}
            {data.status === 'completed' && (
              <>
                <CheckCircle2 className="w-3 h-3 text-green-400" />
                <span className="text-xs text-green-400">完成</span>
              </>
            )}
            {data.status === 'error' && (
              <>
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className="text-xs text-red-400">失败</span>
              </>
            )}
          </div>
        )}

        {/* Progress bar */}
        {data.status === 'running' && data.progress !== undefined && (
          <div className="w-full bg-white/10 rounded-full h-1 mb-2">
            <div
              className="h-1 rounded-full bg-yellow-400 transition-all"
              style={{ width: `${data.progress}%` }}
            />
          </div>
        )}

        {/* Type badge */}
        <span className="text-[10px] text-white/30">{data.type}</span>
      </div>

      {/* Output handle */}
      {!isOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className={clsx('!w-3 !h-3', CATEGORY_HANDLE_COLORS[data.category])}
          style={{
            opacity: handlesVisible ? 1 : 0,
            pointerEvents: handlesVisible ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
          }}
        />
      )}
    </div>
  )
}

export default memo(ComicFlowNode)
