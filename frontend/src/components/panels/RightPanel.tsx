import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { Send, Bot, User, Settings, Activity, Save, FileText } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { aiApi, projectsApi } from '@/api'
import type { NodeData, GenerationTask } from '@/types'
import toast from 'react-hot-toast'

// ── Properties Panel ──────────────────────────────────────────────────────────

const NODE_TYPE_LABELS: Record<string, string> = {
  script_input: '剧本输入',
  script_parse: 'AI 剧本解析',
  storyboard_gen: '分镜生成',
  character_design: '角色设计',
  scene_design: '场景设计',
  image_gen: '图像生成',
  video_gen: '视频生成',
  tts: '配音合成',
  music_gen: '背景音乐',
  auto_edit: '智能剪辑',
  preview: '预览',
  export: '导出',
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  idle: { label: '待机', cls: 'badge-default' },
  running: { label: '运行中', cls: 'badge-warning' },
  completed: { label: '已完成', cls: 'badge-success' },
  error: { label: '失败', cls: 'badge-error' },
}

function PropertiesPanel({ nodeId }: { nodeId: string }) {
  const { nodes, updateNode, currentProject, scripts } = useProjectStore()
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return null

  const status = node.status || 'idle'
  const badge = STATUS_BADGE[status] || STATUS_BADGE.idle

  return (
    <div className="p-3 space-y-4 h-full overflow-y-auto">
      {/* Node header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold">{NODE_TYPE_LABELS[node.type] || node.label}</h3>
          <span className={clsx('badge text-[10px]', badge.cls)}>{badge.label}</span>
        </div>
        <p className="text-[11px] text-white/40 font-mono">{node.id}</p>
      </div>

      {/* Progress */}
      {node.status === 'running' && node.progress !== undefined && (
        <div>
          <div className="flex justify-between text-xs text-white/50 mb-1">
            <span>进度</span>
            <span>{node.progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/10 rounded-full">
            <div
              className="h-1.5 rounded-full bg-yellow-400 transition-all duration-300"
              style={{ width: `${node.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Script input node: show script editor */}
      {node.type === 'script_input' && currentProject && (
        <ScriptEditor projectId={currentProject.id} existingScript={scripts[0] || null} />
      )}

      {/* Other nodes: config fields */}
      {node.type !== 'script_input' && node.config && Object.keys(node.config).length > 0 && (
        <div>
          <p className="text-[11px] text-white/40 uppercase tracking-wider mb-2">配置参数</p>
          <div className="space-y-2">
            {Object.entries(node.config).map(([key, value]) => (
              <div key={key}>
                <label className="text-[11px] text-white/50 block mb-1">{key}</label>
                <input
                  type="text"
                  defaultValue={String(value)}
                  onBlur={e => updateNode(nodeId, {
                    config: { ...node.config, [key]: e.target.value }
                  })}
                  className="input-base w-full text-xs py-1.5"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Script Editor (inside Properties Panel) ────────────────────────────────────

function ScriptEditor({ projectId, existingScript }: {
  projectId: string
  existingScript: { id: string; title?: string; content?: string } | null
}) {
  const [title, setTitle] = useState(existingScript?.title || '未命名剧本')
  const [content, setContent] = useState(existingScript?.content || '')
  const [saving, setSaving] = useState(false)
  const { loadProject } = useProjectStore()

  // Sync if existingScript changes (e.g. after load)
  useEffect(() => {
    if (existingScript) {
      setTitle(existingScript.title || '未命名剧本')
      setContent(existingScript.content || '')
    }
  }, [existingScript?.id])

  const handleSave = async () => {
    if (!content.trim()) { toast.error('请先输入剧本内容'); return }
    setSaving(true)
    try {
      if (existingScript) {
        await projectsApi.updateScript(projectId, existingScript.id, { title, content })
      } else {
        await projectsApi.createScript(projectId, { title, content })
      }
      await loadProject(projectId)
      toast.success('剧本已保存')
    } catch {
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-[11px] text-white/40 uppercase tracking-wider">
        <FileText className="w-3 h-3" />
        <span>剧本内容</span>
      </div>
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="剧本标题"
        className="input-base w-full text-xs py-1.5"
      />
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={"在此输入剧本内容...\n\n例如：\n第一幕：主角出场\n主角走在街上，突然发现一只小猫..."}
        rows={14}
        className="input-base w-full text-xs py-2 resize-none leading-relaxed"
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="btn-primary w-full py-1.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        <Save className="w-3 h-3" />
        {saving ? '保存中...' : existingScript ? '更新剧本' : '创建剧本'}
      </button>
      {existingScript && (
        <p className="text-[10px] text-white/20 text-center">
          已有剧本 · 点击节点"解析剧本"开始处理
        </p>
      )}
    </div>
  )
}

function EmptyProperties() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-white/20">
      <Settings className="w-8 h-8 mb-2" />
      <p className="text-xs">选择节点查看属性</p>
    </div>
  )
}

// ── AI Canvas Intent Recognition ──────────────────────────────────────────────

const NODE_KEYWORDS: Record<string, string> = {
  '图片': 'libtv_image',
  '图像': 'libtv_image',
  '视频': 'libtv_video',
  '文本': 'libtv_script',
  '文字': 'libtv_script',
  '剧本': 'libtv_script',
  '脚本': 'libtv_script_gen',
}

const NODE_TYPE_DISPLAY: Record<string, string> = {
  'libtv_image': '图片节点',
  'libtv_video': '视频节点',
  'libtv_script': '文本节点',
  'libtv_script_gen': '脚本节点',
}

interface IntentContext {
  nodes: NodeData[]
  selectedNodeIds: string[]
}

interface IntentResult {
  intent: 'ADD_NODE' | 'DELETE_SELECTED' | 'CLEAR_CANVAS' | 'LIST_NODES'
  nodeType?: string
  nodeLabel?: string
  confirmText: string
}

function matchIntent(text: string, context: IntentContext): IntentResult | null {
  const t = text.trim()

  // ADD_NODE: 创建/添加/新建 + 节点类型关键词
  const addPattern = /(?:创建|添加|新建|加一个|加个|生成).*?([图片图像视频文本文字剧本脚本])/
  const addMatch = t.match(addPattern)
  if (addMatch) {
    const keyword = addMatch[1]
    // Find matching node type
    for (const [kw, nodeType] of Object.entries(NODE_KEYWORDS)) {
      if (keyword === kw || t.includes(kw)) {
        const label = NODE_TYPE_DISPLAY[nodeType] || nodeType
        return {
          intent: 'ADD_NODE',
          nodeType,
          nodeLabel: label,
          confirmText: `已为你在画布中添加了「${label}」`,
        }
      }
    }
  }

  // Also match: 帮我 + 创建/添加 + 节点类型
  for (const [kw, nodeType] of Object.entries(NODE_KEYWORDS)) {
    if ((t.includes('创建') || t.includes('添加') || t.includes('新建') || t.includes('加一个') || t.includes('加个')) && t.includes(kw)) {
      const label = NODE_TYPE_DISPLAY[nodeType] || nodeType
      return {
        intent: 'ADD_NODE',
        nodeType,
        nodeLabel: label,
        confirmText: `已为你在画布中添加了「${label}」`,
      }
    }
  }

  // DELETE_SELECTED: 删除/移除 + 选中/这个/当前
  if (/删除|移除/.test(t) && /选中|这个|当前|刚才/.test(t)) {
    if (context.selectedNodeIds.length === 0) {
      return {
        intent: 'DELETE_SELECTED',
        confirmText: '当前没有选中的节点，请先在画布中点击选择一个节点。',
      }
    }
    return {
      intent: 'DELETE_SELECTED',
      confirmText: `已删除选中的节点（共 ${context.selectedNodeIds.length} 个）`,
    }
  }

  // CLEAR_CANVAS: 清空画布 / 全部删除
  if (/清空画布|清除画布|删除所有|删除全部|全部删除/.test(t)) {
    return {
      intent: 'CLEAR_CANVAS',
      confirmText: `已清空画布（删除了 ${context.nodes.length} 个节点）`,
    }
  }

  // LIST_NODES: 列出/查看节点
  if (/有哪些节点|列出节点|查看节点|节点列表|现在.*节点/.test(t)) {
    if (context.nodes.length === 0) {
      return {
        intent: 'LIST_NODES',
        confirmText: '画布当前没有任何节点。',
      }
    }
    const nodeList = context.nodes.map(n => `• ${n.label || n.type}`).join('\n')
    return {
      intent: 'LIST_NODES',
      confirmText: `画布中共有 ${context.nodes.length} 个节点：\n${nodeList}`,
    }
  }

  return null
}

// ── AI Assistant Panel ─────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isAction?: boolean  // true = executed a canvas action
}

function AIAssistantPanel() {
  const { nodes, selectedNodeIds, addNode, deleteNode } = useProjectStore()

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content: '你好！我是 ComicFlow AI 助手。我可以帮你优化剧本、设计角色、生成提示词，或直接操作画布（例如：「创建一个图片节点」）。',
      timestamp: new Date(),
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    // ── Intent matching (Phase 1: local canvas control) ──
    const intentResult = matchIntent(text, { nodes, selectedNodeIds })
    if (intentResult) {
      let actionConfirmText = intentResult.confirmText

      if (intentResult.intent === 'ADD_NODE' && intentResult.nodeType) {
        const newNode: NodeData = {
          id: `${intentResult.nodeType}_${Date.now()}`,
          type: intentResult.nodeType as NodeData['type'],
          label: intentResult.nodeLabel || intentResult.nodeType,
          category: 'process',
          position: {
            x: 100 + (nodes.length % 5) * 220,
            y: 100 + Math.floor(nodes.length / 5) * 160,
          },
          status: 'idle',
          config: {},
        }
        addNode(newNode)
      } else if (intentResult.intent === 'DELETE_SELECTED' && selectedNodeIds.length > 0) {
        selectedNodeIds.forEach(id => deleteNode(id))
      } else if (intentResult.intent === 'CLEAR_CANVAS') {
        nodes.forEach(n => deleteNode(n.id))
      }
      // LIST_NODES: no action needed, confirmText already contains list

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: actionConfirmText,
        timestamp: new Date(),
        isAction: intentResult.intent !== 'LIST_NODES',
      }])
      return
    }

    // ── Normal AI chat ──
    setIsLoading(true)
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const res = await aiApi.chat({
        message: text,
        context_type: 'general',
        history,
      })
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: res.reply,
        timestamp: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，请求失败，请稍后重试。',
        timestamp: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={clsx('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              msg.role === 'user' ? 'bg-primary-500' : 'bg-canvas-border'
            )}>
              {msg.role === 'user'
                ? <User className="w-3 h-3 text-white" />
                : <Bot className="w-3 h-3 text-white/70" />
              }
            </div>
            <div className={clsx(
              'max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed',
              msg.role === 'user'
                ? 'bg-primary-500/20 text-white'
                : 'bg-canvas-border/50 text-white/80'
            )}>
              <div style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
              {msg.isAction && (
                <div style={{
                  marginTop: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: '#4ade80',
                  background: 'rgba(74,222,128,0.1)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}>
                  <span>✦</span>
                  <span>操作已执行</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-canvas-border flex items-center justify-center flex-shrink-0">
              <Bot className="w-3 h-3 text-white/70" />
            </div>
            <div className="bg-canvas-border/50 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-canvas-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="输入消息或指令（如：创建图片节点）"
            className="input-base flex-1 text-xs py-2"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="btn-primary p-2 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Run Log Panel ──────────────────────────────────────────────────────────────

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'text-white/40',
  running: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-white/30',
}

const TASK_TYPE_LABELS: Record<string, string> = {
  script_parse: '剧本解析',
  storyboard_gen: '分镜生成',
  image_gen: '图像生成',
  tts: '配音合成',
  auto_edit: '智能剪辑',
}

function RunLogPanel({ onOpenLog }: { onOpenLog?: () => void }) {
  const { tasks } = useProjectStore()

  return (
    <div className="flex flex-col h-full">
      {/* Header row with "详细日志" button */}
      <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
        <span className="text-[11px] text-white/30 uppercase tracking-wider">任务记录</span>
        {onOpenLog && (
          <button
            onClick={onOpenLog}
            className="text-[11px] text-white/40 hover:text-white/80 transition-colors flex items-center gap-1"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
            详细日志
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-white/20">
            <Activity className="w-8 h-8 mb-2" />
            <p className="text-xs">暂无运行记录</p>
          </div>
        ) : (
          [...tasks].reverse().map(task => (
            <div
              key={task.id}
              className="p-2 rounded-lg bg-canvas-bg border border-canvas-border"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">
                  {TASK_TYPE_LABELS[task.task_type] || task.task_type}
                </span>
                <span className={clsx('text-[10px]', TASK_STATUS_COLORS[task.status] || 'text-white/40')}>
                  {task.status}
                </span>
              </div>
              {task.status === 'running' && task.progress !== undefined && (
                <div className="w-full h-1 bg-white/10 rounded-full mt-1">
                  <div
                    className="h-1 rounded-full bg-yellow-400 transition-all"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
              )}
              {task.error_message && (
                <p className="text-[10px] text-red-400 mt-1 truncate">{task.error_message}</p>
              )}
              <p className="text-[10px] text-white/20 mt-1 font-mono">
                {new Date(task.created_at).toLocaleTimeString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Right Panel (main export) ──────────────────────────────────────────────────

export default function RightPanel() {
  return (
    <div className="h-full flex flex-col bg-canvas-surface border-l border-canvas-border">
      {/* Header */}
      <div className="flex items-center px-3 py-2.5 border-b border-canvas-border flex-shrink-0">
        <span className="text-xs font-medium text-white/80">AI 助手</span>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <AIAssistantPanel />
      </div>
    </div>
  )
}
