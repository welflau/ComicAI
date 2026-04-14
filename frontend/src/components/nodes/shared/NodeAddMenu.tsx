import { useEffect, useRef } from 'react'
import { AlignJustify, Image as ImageIcon, Video, Combine, Music, TableProperties } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { addLog } from '@/stores/logStore'
import type { NodeData } from '@/types'

/* ── Menu item definitions ─────────────────────────────────────── */

export type MenuItemId = 'text' | 'image' | 'video' | 'video_compose' | 'audio' | 'script'

interface MenuItem {
  id: MenuItemId
  label: string
  badge?: string
  icon: React.ReactNode
  targetType: NodeData['type']
  targetLabel: string
  targetCategory: NodeData['category']
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: 'text',
    label: '文本',
    icon: <AlignJustify size={14} />,
    targetType: 'libtv_script',
    targetLabel: '文本',
    targetCategory: 'input',
  },
  {
    id: 'image',
    label: '图片',
    icon: <ImageIcon size={14} />,
    targetType: 'libtv_image',
    targetLabel: '图片',
    targetCategory: 'process',
  },
  {
    id: 'video',
    label: '视频',
    icon: <Video size={14} />,
    targetType: 'video_gen',
    targetLabel: '视频',
    targetCategory: 'output',
  },
  {
    id: 'video_compose',
    label: '视频合成',
    badge: 'Beta',
    icon: <Combine size={14} />,
    targetType: 'auto_edit',
    targetLabel: '视频合成',
    targetCategory: 'output',
  },
  {
    id: 'audio',
    label: '音频',
    icon: <Music size={14} />,
    targetType: 'tts',
    targetLabel: '音频',
    targetCategory: 'output',
  },
  {
    id: 'script',
    label: '脚本',
    badge: 'Beta',
    icon: <TableProperties size={14} />,
    targetType: 'libtv_script_gen',
    targetLabel: '分镜脚本',
    targetCategory: 'process',
  },
]

/* ── Per-node-type enabled items ───────────────────────────────── */

export type NodeTypeKey =
  | 'libtv_script'
  | 'libtv_script_gen'
  | 'libtv_storyboard'
  | 'libtv_image'
  | 'default'

const ENABLED_ITEMS: Record<NodeTypeKey, MenuItemId[]> = {
  libtv_script:     ['text', 'image', 'video', 'script'],
  libtv_script_gen: ['text', 'image', 'video', 'script'],
  libtv_storyboard: ['image', 'video', 'script'],
  libtv_image:      ['text', 'image', 'video', 'script'],
  default:          ['text', 'image', 'video'],
}

/* ── Props ─────────────────────────────────────────────────────── */

interface Props {
  /** The type key used to look up which items are enabled */
  nodeType: NodeTypeKey
  /** Source node id — used to create the edge */
  sourceNodeId: string
  /** Source node position — used to place the new node */
  sourcePosition: { x: number; y: number }
  /** Width of the source node — used for positioning */
  sourceNodeWidth?: number
  /**
   * 'right' (default): create successor node to the right, edge source→new
   * 'left': create predecessor node to the left, edge new→source
   */
  direction?: 'right' | 'left'
  /**
   * When the source node is an image node with an image, pass the image ref here.
   * Used to pre-fill the new script node's prompt with a thumbnail reference.
   */
  sourceImageUrl?: string
  onClose: () => void
}

/* ── Component ─────────────────────────────────────────────────── */

export default function NodeAddMenu({
  nodeType,
  sourceNodeId,
  sourcePosition,
  sourceNodeWidth = 200,
  direction = 'right',
  sourceImageUrl,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const addNode = useProjectStore(s => s.addNode)
  const addEdge = useProjectStore(s => s.addEdge)

  const enabledSet = new Set(ENABLED_ITEMS[nodeType] ?? ENABLED_ITEMS.default)
  const NEW_NODE_W = 260 // estimated width of a newly created node

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use capture so we catch before ReactFlow stops propagation
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSelect = (item: MenuItem) => {
    if (!enabledSet.has(item.id)) return
    const newId = `${item.targetType}_${Date.now()}`
    const newX = direction === 'right'
      ? sourcePosition.x + sourceNodeWidth + 80
      : sourcePosition.x - NEW_NODE_W - 80

    // When creating a text node from an image source, pre-fill image context
    const extraConfig: Record<string, unknown> = {}
    let initialPrompt: string | undefined
    let hideQuickActions: boolean | undefined
    if (item.targetType === 'libtv_script') {
      // Text nodes created from the + menu never show the quick-action list —
      // the prompt panel is always visible instead.
      hideQuickActions = true
      if (sourceImageUrl) {
        extraConfig.sourceImageUrl = sourceImageUrl
        initialPrompt = '根据图片生成提示词'
      }
    }

    addNode({
      id: newId,
      type: item.targetType,
      label: item.targetLabel,
      category: item.targetCategory,
      position: { x: newX, y: sourcePosition.y },
      config: extraConfig,
      ...(initialPrompt ? { initialPrompt } : {}),
      ...(hideQuickActions ? { hideQuickActions } : {}),
    })
    if (direction === 'right') {
      addEdge({ id: `e-${sourceNodeId}-${newId}`, source: sourceNodeId, target: newId })
    } else {
      addEdge({ id: `e-${newId}-${sourceNodeId}`, source: newId, target: sourceNodeId })
    }
    addLog({
      level: 'info',
      category: 'operation',
      message: `添加节点: ${item.targetLabel}`,
      detail: `类型: ${item.targetType} | 从节点 ${sourceNodeId} 出发 (方向: ${direction === 'right' ? '右' : '左'})`,
    })
    onClose()
  }

  return (
    <div
      ref={ref}
      className="nodrag nopan"
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        // Position the menu to the correct side of the handle, centered vertically
        ...(direction === 'right'
          ? { left: '100%', marginLeft: 14 }
          : { right: '100%', marginRight: 14 }),
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 9999,
        background: '#1a1a1a',
        border: '1px solid #2e2e2e',
        borderRadius: 12,
        padding: '6px 0',
        minWidth: 180,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Title */}
      <div style={{
        padding: '4px 14px 8px',
        fontSize: 11,
        color: '#555',
        fontWeight: 500,
        borderBottom: '1px solid #252525',
        marginBottom: 4,
      }}>
        {direction === 'left' ? '添加前置节点' : '引用该节点生成'}
      </div>

      {MENU_ITEMS.map(item => {
        const enabled = enabledSet.has(item.id)
        return (
          <div
            key={item.id}
            onClick={() => handleSelect(item)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 14px',
              cursor: enabled ? 'pointer' : 'default',
              color: enabled ? '#ccc' : '#444',
              fontSize: 13,
              transition: 'background 0.1s',
              userSelect: 'none',
            }}
            onMouseEnter={e => {
              if (enabled) e.currentTarget.style.background = '#252525'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <span style={{ color: enabled ? '#888' : '#333', flexShrink: 0 }}>
              {item.icon}
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.badge && (
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 4,
                background: enabled ? '#2a2a2a' : '#1e1e1e',
                color: enabled ? '#666' : '#3a3a3a',
                letterSpacing: '0.02em',
              }}>
                {item.badge}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
