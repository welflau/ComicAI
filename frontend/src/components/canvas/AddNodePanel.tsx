import { useState } from 'react'
import {
  FileText, Image, Video, Scissors, Music, ScrollText,
  Upload, LayoutGrid,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { getViewportCenter } from '@/stores/viewportCenter'
import type { NodeData } from '@/types'

/* ── Data ──────────────────────────────────────────────────────── */

export const ADD_NODE_ITEMS = [
  { id: 'libtv_script',     icon: <FileText size={20} />,  label: '文本',    badge: null,   desc: '剧本、广告词、品牌文案' },
  { id: 'libtv_image',      icon: <Image size={20} />,     label: '图片',    badge: null,   desc: '海报、分镜、角色设计' },
  { id: 'libtv_video',      icon: <Video size={20} />,     label: '视频',    badge: null,   desc: '创意广告、动画、电影' },
  { id: 'video_compose',    icon: <Scissors size={20} />,  label: '视频合成', badge: 'Beta', desc: '多个视频片段合为一个' },
  { id: 'audio',            icon: <Music size={20} />,     label: '音频',    badge: null,   desc: '音效、配音、音乐' },
  { id: 'libtv_script_gen', icon: <ScrollText size={20} />, label: '脚本',   badge: 'Beta', desc: '创意脚本、AI 生成故事板' },
]

export const ADD_RESOURCE_ITEMS = [
  { id: 'upload',  icon: <Upload size={20} />,     label: '上传',     badge: null, desc: '可上传图片、视频、音频文件' },
  { id: 'library', icon: <LayoutGrid size={20} />, label: '从图库选择', badge: null, desc: '从历史生成中选择素材' },
]

const LABELS: Record<string, string> = {
  libtv_script: '文本', libtv_script_gen: '脚本',
  libtv_image: '图片',  libtv_storyboard: '分镜', libtv_video: '视频',
}
const CATEGORIES: Record<string, string> = {
  libtv_script: 'input', libtv_script_gen: 'input',
  libtv_storyboard: 'process', libtv_image: 'process', libtv_video: 'output',
}

/* ── Props ─────────────────────────────────────────────────────── */

interface Props {
  /**
   * Where to place newly created nodes.
   * - undefined → use viewport center (LeftSidebar mode)
   * - {x, y}    → use given canvas coordinates (right-click mode)
   */
  spawnPosition?: { x: number; y: number }
  onClose: () => void
}

/* ── Component ─────────────────────────────────────────────────── */

export default function AddNodePanel({ spawnPosition, onClose }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const addNode = useProjectStore(s => s.addNode)

  const handleAddNode = (typeId: string) => {
    if (!['libtv_script', 'libtv_script_gen', 'libtv_storyboard', 'libtv_image', 'libtv_video'].includes(typeId)) return
    const id = `${typeId}_${Date.now()}`
    const centre = spawnPosition ?? getViewportCenter()
    const jitter = () => (Math.random() - 0.5) * 60
    addNode({
      id,
      type: typeId as NodeData['type'],
      label: LABELS[typeId] ?? typeId,
      category: (CATEGORIES[typeId] ?? 'output') as NodeData['category'],
      position: spawnPosition
        ? centre
        : { x: centre.x + jitter(), y: centre.y + jitter() },
      config: {},
      ...(typeId === 'libtv_video' ? { initialPanelExpanded: true } : {}),
      ...(typeId === 'libtv_image' ? { initialPanelExpanded: true } : {}),
    })
    onClose()
  }

  const itemRow = (
    item: { id: string; icon: React.ReactNode; label: string; badge: string | null; desc: string },
    onClick: () => void,
  ) => (
    <button
      key={item.id}
      onClick={onClick}
      onMouseEnter={() => setHoveredId(item.id)}
      onMouseLeave={() => setHoveredId(null)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center',
        gap: 12, padding: '8px 14px',
        background: hoveredId === item.id ? '#252525' : 'none',
        border: 'none', cursor: 'pointer',
        color: '#ccc', textAlign: 'left',
        transition: 'background 0.12s',
        borderRadius: 8,
      }}
    >
      <span style={{
        width: 36, height: 36, background: '#252525', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: '#aaa',
      }}>
        {item.icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>{item.label}</span>
          {item.badge && (
            <span style={{
              fontSize: 10, padding: '1px 5px',
              background: '#2a2a2a', border: '1px solid #3a3a3a',
              borderRadius: 4, color: '#666',
            }}>{item.badge}</span>
          )}
        </span>
        {hoveredId === item.id && item.desc && (
          <span style={{ display: 'block', fontSize: 11, color: '#666', marginTop: 2, lineHeight: 1.4 }}>
            {item.desc}
          </span>
        )}
      </span>
    </button>
  )

  return (
    <>
      {/* Section: 添加节点 */}
      <div style={{ padding: '6px 14px 4px', fontSize: 11, color: '#555', fontWeight: 500 }}>添加节点</div>
      {ADD_NODE_ITEMS.map(item => itemRow(item, () => handleAddNode(item.id)))}

      {/* Divider */}
      <div style={{ height: 1, background: '#222', margin: '6px 14px' }} />

      {/* Section: 添加资源 */}
      <div style={{ padding: '6px 14px 4px', fontSize: 11, color: '#555', fontWeight: 500 }}>添加资源</div>
      {ADD_RESOURCE_ITEMS.map(item => itemRow(item, () => onClose()))}
    </>
  )
}
