import { useState } from 'react'
import { clsx } from 'clsx'
import { Search, ChevronDown, ChevronRight, Image, Film, Music, FileText, Layers } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { addLog } from '@/stores/logStore'
import type { NodeType, NodeCategory } from '@/types'

interface NodeTemplate {
  type: NodeType
  label: string
  description: string
  category: NodeCategory
}

const NODE_LIBRARY: { group: string; category: NodeCategory; nodes: NodeTemplate[] }[] = [
  {
    group: '输入节点',
    category: 'input',
    nodes: [
      { type: 'script_input', label: '剧本输入', description: '导入或粘贴剧本文本', category: 'input' },
    ],
  },
  {
    group: '处理节点',
    category: 'process',
    nodes: [
      { type: 'script_parse', label: 'AI 剧本解析', description: '智能解析剧本结构', category: 'process' },
      { type: 'storyboard_gen', label: '分镜生成', description: '自动生成分镜脚本', category: 'process' },
      { type: 'character_design', label: '角色设计', description: '设计一致性角色形象', category: 'process' },
      { type: 'scene_design', label: '场景设计', description: '生成场景背景图', category: 'process' },
      { type: 'image_gen', label: '图像生成', description: 'AI 绘图生成分镜图', category: 'process' },
      { type: 'video_gen', label: '视频生成', description: '图片转视频动态效果', category: 'process' },
      { type: 'tts', label: '配音合成', description: 'AI 语音合成配音', category: 'process' },
      { type: 'music_gen', label: '背景音乐', description: 'AI 生成背景音乐', category: 'process' },
      { type: 'auto_edit', label: '智能剪辑', description: '自动剪辑合成视频', category: 'process' },
    ],
  },
  {
    group: '输出节点',
    category: 'output',
    nodes: [
      { type: 'preview', label: '预览', description: '实时预览生成效果', category: 'output' },
      { type: 'export', label: '导出', description: '导出最终视频文件', category: 'output' },
    ],
  },
]

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  input: 'text-node-input border-node-input/50 bg-node-input/10',
  process: 'text-node-process border-node-process/50 bg-node-process/10',
  output: 'text-node-output border-node-output/50 bg-node-output/10',
  control: 'text-node-control border-node-control/50 bg-node-control/10',
}

const CATEGORY_DOT: Record<NodeCategory, string> = {
  input: 'bg-node-input',
  process: 'bg-node-process',
  output: 'bg-node-output',
  control: 'bg-node-control',
}

function NodeItem({ node }: { node: NodeTemplate }) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/comicflow-node', JSON.stringify({
      type: node.type,
      label: node.label,
      category: node.category,
    }))
    e.dataTransfer.effectAllowed = 'copy'
    addLog({
      level: 'info',
      category: 'operation',
      message: `拖拽节点: ${node.label}`,
      detail: `类型: ${node.type} | 分类: ${node.category}`,
    })
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={clsx(
        'flex items-start gap-2 p-2 rounded-lg border cursor-grab active:cursor-grabbing',
        'hover:bg-white/5 transition-colors select-none',
        CATEGORY_COLORS[node.category]
      )}
    >
      <div className={clsx('w-2 h-2 rounded-full mt-1 flex-shrink-0', CATEGORY_DOT[node.category])} />
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{node.label}</p>
        <p className="text-[10px] text-white/30 truncate mt-0.5">{node.description}</p>
      </div>
    </div>
  )
}

function NodeLibraryTab() {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const toggleGroup = (group: string) => {
    setCollapsed(c => ({ ...c, [group]: !c[group] }))
  }

  const filtered = NODE_LIBRARY.map(group => ({
    ...group,
    nodes: group.nodes.filter(n =>
      !search || n.label.includes(search) || n.description.includes(search)
    ),
  })).filter(group => group.nodes.length > 0)

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            placeholder="搜索节点..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-base w-full pl-8 text-xs py-1.5"
          />
        </div>
      </div>

      {/* Node groups */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filtered.map(group => (
          <div key={group.group}>
            <button
              onClick={() => toggleGroup(group.group)}
              className="flex items-center gap-1 w-full text-left py-1"
            >
              {collapsed[group.group]
                ? <ChevronRight className="w-3 h-3 text-white/30" />
                : <ChevronDown className="w-3 h-3 text-white/30" />
              }
              <span className="text-[11px] text-white/40 font-medium uppercase tracking-wider">
                {group.group}
              </span>
              <span className="ml-auto text-[10px] text-white/20">{group.nodes.length}</span>
            </button>

            {!collapsed[group.group] && (
              <div className="space-y-1 mt-1">
                {group.nodes.map(node => (
                  <NodeItem key={node.type} node={node} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AssetLibraryTab() {
  const { assets } = useProjectStore()
  const [activeType, setActiveType] = useState<string>('all')

  const types = [
    { id: 'all', label: '全部' },
    { id: 'image', label: '图片', icon: Image },
    { id: 'video', label: '视频', icon: Film },
    { id: 'audio', label: '音频', icon: Music },
    { id: 'script', label: '剧本', icon: FileText },
  ]

  const filtered = activeType === 'all' ? assets : assets.filter(a => a.asset_type === activeType)

  return (
    <div className="flex flex-col h-full">
      {/* Type filter */}
      <div className="px-3 py-2 flex gap-1 flex-wrap">
        {types.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={clsx(
              'text-[10px] px-2 py-1 rounded-md transition-colors',
              activeType === t.id
                ? 'bg-primary-500 text-white'
                : 'bg-white/5 text-white/40 hover:text-white/70'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Assets */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/20">
            <Layers className="w-8 h-8 mb-2" />
            <p className="text-xs">暂无素材</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {filtered.map(asset => (
              <div
                key={asset.id}
                className="group relative rounded-lg overflow-hidden border border-canvas-border hover:border-white/30 cursor-pointer"
              >
                {asset.asset_type === 'image' ? (
                  <img
                    src={asset.thumbnail_url || asset.url}
                    alt={asset.name}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-canvas-surface flex items-center justify-center">
                    <Film className="w-6 h-6 text-white/20" />
                  </div>
                )}
                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-1">
                  <p className="text-[10px] text-white/70 truncate">{asset.name}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function LeftPanel() {
  const [activeTab, setActiveTab] = useState<'nodes' | 'assets'>('nodes')

  return (
    <div className="h-full flex flex-col bg-canvas-surface border-r border-canvas-border">
      {/* Tabs */}
      <div className="flex border-b border-canvas-border flex-shrink-0">
        <button
          onClick={() => setActiveTab('nodes')}
          className={clsx(
            'flex-1 py-2.5 text-xs font-medium transition-colors',
            activeTab === 'nodes'
              ? 'text-white border-b-2 border-primary-500'
              : 'text-white/40 hover:text-white/70'
          )}
        >
          节点库
        </button>
        <button
          onClick={() => setActiveTab('assets')}
          className={clsx(
            'flex-1 py-2.5 text-xs font-medium transition-colors',
            activeTab === 'assets'
              ? 'text-white border-b-2 border-primary-500'
              : 'text-white/40 hover:text-white/70'
          )}
        >
          素材库
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'nodes' ? <NodeLibraryTab /> : <AssetLibraryTab />}
      </div>
    </div>
  )
}
