import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { Send, Bot, User, Settings, Activity, Save, FileText, Trash2, ChevronRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useProjectStore } from '@/stores/projectStore'
import { aiApi, projectsApi } from '@/api'
import type { CanvasAction } from '@/api'
import { addLog, useLogStore } from '@/stores/logStore'
import type { LogLevel, LogCategory, LogEntry } from '@/stores/logStore'
import type { NodeData, EdgeData, GenerationTask } from '@/types'
import toast from 'react-hot-toast'
import { focusCanvasNode } from '@/stores/viewportCenter'

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
  intent: 'ADD_NODE' | 'ADD_WORKFLOW' | 'DELETE_SELECTED' | 'CLEAR_CANVAS' | 'LIST_NODES'
  nodeType?: string
  nodeLabel?: string
  // ADD_WORKFLOW: multiple nodes + edges to create
  workflowNodes?: Array<{ type: string; label: string }>
  workflowEdges?: Array<{ fromIdx: number; toIdx: number }>  // index into workflowNodes
  confirmText: string
}

function matchIntent(text: string, context: IntentContext): IntentResult | null {
  const t = text.trim()

  // ── ADD_WORKFLOW: 组合工作流（多节点+连线）──────────────────────────────────

  // 图片反推提示词 / img2prompt 组合：图片节点 → 文本节点
  if (/图片.*提示词|img2prompt|反推提示词|图生提示词|图片.*生成.*提示词|由图片.*提示/.test(t)) {
    return {
      intent: 'ADD_WORKFLOW',
      workflowNodes: [
        { type: 'libtv_image', label: '图片' },
        { type: 'libtv_script', label: '文本' },
      ],
      workflowEdges: [{ fromIdx: 0, toIdx: 1 }],
      confirmText: '添加「图片 → 文本」组合（图片反推提示词）',
    }
  }

  // 图文转视频 组合：文本 → 图片 → 视频
  if (/图文.*视频|文.*图.*视频|剧本.*视频|文字.*生成.*视频/.test(t)) {
    return {
      intent: 'ADD_WORKFLOW',
      workflowNodes: [
        { type: 'libtv_script', label: '文本' },
        { type: 'libtv_image', label: '图片' },
        { type: 'libtv_video', label: '视频' },
      ],
      workflowEdges: [{ fromIdx: 0, toIdx: 1 }, { fromIdx: 1, toIdx: 2 }],
      confirmText: '添加「文本 → 图片 → 视频」工作流',
    }
  }

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

  // LIST_NODES: 列出画布上当前的节点（排除"类型/功能/系统"等平台知识类问题）
  if (/有哪些节点|列出节点|查看节点|节点列表|现在.*节点/.test(t) && !/类型|功能|介绍|说明|支持|系统|平台|可以用|可用/.test(t)) {
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

interface PendingAction {
  intent: IntentResult['intent']
  nodeType?: string
  nodeLabel?: string
  workflowNodes?: Array<{ type: string; label: string }>
  workflowEdges?: Array<{ fromIdx: number; toIdx: number }>
  // snapshot at match time (for display only)
  previewText: string       // e.g. "添加「图片节点」"
  snapshotNodeCount: number // canvas size at match time
  snapshotSelectedIds: string[]
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isAction?: boolean
  // Confirmation flow
  pendingAction?: PendingAction
  actionStatus?: 'pending' | 'confirmed' | 'cancelled'
}

// ── Action preview lines per intent ──────────────────────────────────────────

function getActionLines(action: PendingAction): { icon: string; text: string }[] {
  switch (action.intent) {
    case 'ADD_NODE':
      return [{ icon: '+', text: `添加「${action.nodeLabel || action.nodeType}」` }]
    case 'ADD_WORKFLOW': {
      if (!action.workflowNodes) return [{ icon: '+', text: action.previewText }]
      const lines: { icon: string; text: string }[] = action.workflowNodes.map(n => ({
        icon: '+', text: `添加「${n.label}」节点`,
      }))
      action.workflowEdges?.forEach(({ fromIdx, toIdx }) => {
        const from = action.workflowNodes![fromIdx].label
        const to = action.workflowNodes![toIdx].label
        lines.push({ icon: '→', text: `连接「${from}」→「${to}」` })
      })
      return lines
    }
    case 'DELETE_SELECTED':
      return action.snapshotSelectedIds.length > 0
        ? [{ icon: '−', text: `删除选中节点（共 ${action.snapshotSelectedIds.length} 个）` }]
        : [{ icon: '!', text: '当前没有选中节点' }]
    case 'CLEAR_CANVAS':
      return [{ icon: '⚠', text: `清空画布（删除全部 ${action.snapshotNodeCount} 个节点）` }]
    default:
      return [{ icon: '›', text: action.previewText }]
  }
}

// ── Confirmation card component ───────────────────────────────────────────────

function ConfirmCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: PendingAction
  onConfirm: () => void
  onCancel: () => void
}) {
  const lines = getActionLines(action)
  const isDestructive = action.intent === 'CLEAR_CANVAS' || action.intent === 'DELETE_SELECTED'
  const noOp = action.intent === 'DELETE_SELECTED' && action.snapshotSelectedIds.length === 0

  return (
    <div style={{
      marginTop: 8,
      border: isDestructive ? '1px solid rgba(248,113,113,0.25)' : '1px solid rgba(99,102,241,0.25)',
      borderRadius: 8,
      overflow: 'hidden',
      fontSize: 11,
    }}>
      {/* Header */}
      <div style={{
        padding: '6px 10px',
        background: isDestructive ? 'rgba(248,113,113,0.08)' : 'rgba(99,102,241,0.08)',
        borderBottom: isDestructive ? '1px solid rgba(248,113,113,0.15)' : '1px solid rgba(99,102,241,0.15)',
        color: isDestructive ? '#fca5a5' : '#a5b4fc',
        fontWeight: 600,
        letterSpacing: 0.3,
      }}>
        确认执行以下操作
      </div>

      {/* Action lines */}
      <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)' }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            marginBottom: i < lines.length - 1 ? 4 : 0,
            color: '#c8c8c8',
          }}>
            <span style={{
              width: 16,
              height: 16,
              borderRadius: 4,
              background: isDestructive ? 'rgba(248,113,113,0.15)' : 'rgba(99,102,241,0.15)',
              color: isDestructive ? '#f87171' : '#818cf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {line.icon}
            </span>
            <span>{line.text}</span>
          </div>
        ))}
      </div>

      {/* Buttons */}
      {!noOp && (
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '7px 10px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <button
            onClick={onConfirm}
            style={{
              flex: 3,
              padding: '6px 0',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              background: isDestructive ? 'rgba(248,113,113,0.2)' : 'rgba(99,102,241,0.25)',
              color: isDestructive ? '#fca5a5' : '#a5b4fc',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = isDestructive ? 'rgba(248,113,113,0.35)' : 'rgba(99,102,241,0.4)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isDestructive ? 'rgba(248,113,113,0.2)' : 'rgba(99,102,241,0.25)'
            }}
          >
            ✓ 确认执行
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 2,
              padding: '6px 0',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              background: 'rgba(255,255,255,0.05)',
              color: '#666',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#999' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#666' }}
          >
            ✕ 取消
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

function AIAssistantPanel() {
  const { nodes, selectedNodeIds, addNode, deleteNode, addEdge, currentProject } = useProjectStore()

  const STORAGE_KEY = `ai_chat_messages_${currentProject?.id ?? 'default'}`

  const WELCOME_MSG: ChatMessage = {
    id: '0',
    role: 'assistant',
    content: '你好！我是 ComicFlow AI 助手。我可以帮你优化剧本、设计角色、生成提示词，或直接操作画布（例如：「创建一个图片节点」）。',
    timestamp: new Date(),
  }

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as ChatMessage[]
        return parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
      }
    } catch {}
    return [WELCOME_MSG]
  })
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Keep a ref to current nodes/selectedNodeIds for use inside callbacks
  const nodesRef = useRef(nodes)
  const selectedRef = useRef(selectedNodeIds)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { selectedRef.current = selectedNodeIds }, [selectedNodeIds])

  // Persist messages to localStorage
  useEffect(() => {
    try {
      // Only save last 50 messages, strip pendingAction to keep it lightweight
      const toSave = messages.slice(-50).map(m => ({
        ...m,
        pendingAction: undefined,
        actionStatus: m.actionStatus === 'pending' ? 'cancelled' : m.actionStatus,
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch {}
  }, [messages, STORAGE_KEY])

  const clearMessages = () => {
    localStorage.removeItem(STORAGE_KEY)
    setMessages([WELCOME_MSG])
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Execute a confirmed action ──────────────────────────────────────────────
  const executeAction = (msgId: string, action: PendingAction) => {
    const currentNodes = nodesRef.current
    const currentSelected = selectedRef.current

    if (action.intent === 'ADD_NODE' && action.nodeType) {
      const newNode: NodeData = {
        id: `${action.nodeType}_${Date.now()}`,
        type: action.nodeType as NodeData['type'],
        label: action.nodeLabel || action.nodeType,
        category: 'process',
        position: {
          x: 100 + (currentNodes.length % 5) * 220,
          y: 100 + Math.floor(currentNodes.length / 5) * 160,
        },
        status: 'idle',
        config: {},
      }
      addNode(newNode)
      addLog({ level: 'info', category: 'operation', message: `AI指令：添加节点「${action.nodeLabel || action.nodeType}」` })
    } else if (action.intent === 'ADD_WORKFLOW' && action.workflowNodes) {
      // Create multiple nodes with horizontal layout, then connect them
      const baseX = 80 + (currentNodes.length % 3) * 100
      const baseY = 100 + Math.floor(currentNodes.length / 3) * 180
      const spacing = 260
      const createdIds: string[] = []

      action.workflowNodes.forEach((n, i) => {
        const id = `${n.type}_${Date.now() + i}`
        createdIds.push(id)
        const newNode: NodeData = {
          id,
          type: n.type as NodeData['type'],
          label: n.label,
          category: 'process',
          position: { x: baseX + i * spacing, y: baseY },
          status: 'idle',
          config: {},
        }
        addNode(newNode)
      })

      // Connect edges after all nodes are added
      setTimeout(() => {
        action.workflowEdges?.forEach(({ fromIdx, toIdx }) => {
          const edge: EdgeData = {
            id: `e_${createdIds[fromIdx]}_${createdIds[toIdx]}`,
            source: createdIds[fromIdx],
            target: createdIds[toIdx],
          }
          addEdge(edge)
        })
      }, 50)

      const labels = action.workflowNodes.map(n => `「${n.label}」`).join(' → ')
      addLog({ level: 'info', category: 'operation', message: `AI指令：添加工作流组合 ${labels}` })
    } else if (action.intent === 'DELETE_SELECTED') {
      currentSelected.forEach(id => deleteNode(id))
      addLog({ level: 'info', category: 'operation', message: `AI指令：删除选中节点（共 ${currentSelected.length} 个）` })
    } else if (action.intent === 'CLEAR_CANVAS') {
      currentNodes.forEach(n => deleteNode(n.id))
      addLog({ level: 'warn', category: 'operation', message: `AI指令：清空画布（删除 ${currentNodes.length} 个节点）` })
    }

    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, actionStatus: 'confirmed', pendingAction: undefined, isAction: true,
            content: action.intent === 'ADD_NODE'
              ? `已为你添加了「${action.nodeLabel}」`
              : action.intent === 'ADD_WORKFLOW'
              ? `已添加 ${action.workflowNodes?.map(n => `「${n.label}」`).join(' → ')} 并连线`
              : action.intent === 'DELETE_SELECTED'
              ? `已删除选中节点（共 ${currentSelected.length} 个）`
              : `已清空画布` }
        : m
    ))
  }

  const cancelAction = (msgId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId
        ? { ...m, actionStatus: 'cancelled', pendingAction: undefined, content: '已取消操作。' }
        : m
    ))
  }

  // ── Execute AI-returned actions (from structured output) ────────────────────
  // Converts CanvasAction[] → PendingAction (same ConfirmCard flow as hardcoded intents)
  const buildPendingActionFromAI = (action: CanvasAction): PendingAction | null => {
    switch (action.type) {
      case 'ADD_NODE':
        if (!action.nodeType) return null
        return {
          intent: 'ADD_NODE',
          nodeType: action.nodeType,
          nodeLabel: action.nodeLabel || action.nodeType,
          previewText: `添加「${action.nodeLabel || action.nodeType}」`,
          snapshotNodeCount: nodesRef.current.length,
          snapshotSelectedIds: [...selectedRef.current],
        }
      case 'ADD_WORKFLOW':
        if (!action.nodes || action.nodes.length === 0) return null
        return {
          intent: 'ADD_WORKFLOW',
          workflowNodes: action.nodes.map(n => ({ type: n.nodeType, label: n.nodeLabel || n.nodeType })),
          workflowEdges: action.edges?.map(e => ({ fromIdx: e.fromIdx, toIdx: e.toIdx })),
          previewText: action.nodes.map(n => `「${n.nodeLabel || n.nodeType}」`).join(' → '),
          snapshotNodeCount: nodesRef.current.length,
          snapshotSelectedIds: [...selectedRef.current],
        }
      case 'DELETE_SELECTED':
        return {
          intent: 'DELETE_SELECTED',
          previewText: `删除选中节点（共 ${selectedRef.current.length} 个）`,
          snapshotNodeCount: nodesRef.current.length,
          snapshotSelectedIds: [...selectedRef.current],
        }
      case 'CLEAR_CANVAS':
        return {
          intent: 'CLEAR_CANVAS',
          previewText: `清空画布（删除全部 ${nodesRef.current.length} 个节点）`,
          snapshotNodeCount: nodesRef.current.length,
          snapshotSelectedIds: [...selectedRef.current],
        }
      default:
        return null
    }
  }

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

    // ── Intent matching ──
    const intentResult = matchIntent(text, { nodes, selectedNodeIds })
    if (intentResult) {
      const msgId = (Date.now() + 1).toString()

      // LIST_NODES: no confirmation needed, just show
      if (intentResult.intent === 'LIST_NODES') {
        setMessages(prev => [...prev, {
          id: msgId,
          role: 'assistant',
          content: intentResult.confirmText,
          timestamp: new Date(),
        }])
        return
      }

      // DELETE_SELECTED with nothing selected: just show info
      if (intentResult.intent === 'DELETE_SELECTED' && selectedNodeIds.length === 0) {
        setMessages(prev => [...prev, {
          id: msgId,
          role: 'assistant',
          content: intentResult.confirmText,
          timestamp: new Date(),
        }])
        return
      }

      // All other intents: show confirmation card
      const pendingAction: PendingAction = {
        intent: intentResult.intent,
        nodeType: intentResult.nodeType,
        nodeLabel: intentResult.nodeLabel,
        workflowNodes: intentResult.workflowNodes,
        workflowEdges: intentResult.workflowEdges,
        previewText: intentResult.confirmText,
        snapshotNodeCount: nodes.length,
        snapshotSelectedIds: [...selectedNodeIds],
      }

      setMessages(prev => [...prev, {
        id: msgId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        pendingAction,
        actionStatus: 'pending',
      }])
      return
    }

    // ── Normal AI chat ──
    setIsLoading(true)
    addLog({ level: 'info', category: 'ai', kind: 'prompt', message: '[AI助手] 发送消息', detail: text })
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const canvasContext = {
        nodeCount: nodesRef.current.length,
        selectedCount: selectedRef.current.length,
        nodes: nodesRef.current.map(n => ({
          id: n.id,
          type: n.type,
          label: n.label,
          isEmpty: !n.config || Object.keys(n.config).length === 0,
          content: n.config ? Object.entries(n.config)
            .filter(([, v]) => v !== null && v !== undefined && v !== '')
            .reduce((acc, [k, v]) => ({ ...acc, [k]: typeof v === 'string' && v.length > 100 ? v.slice(0, 100) + '…' : v }), {})
            : {},
        })),
      }
      const res = await aiApi.chat({
        message: text,
        context_type: 'general',
        context_data: canvasContext,
        history,
      })
      addLog({ level: 'info', category: 'ai', kind: 'response', message: '[AI助手] 收到回复', detail: res.reply })

      // Check if AI returned canvas actions
      const aiActions = res.actions || []
      const pendingAction = aiActions.length > 0 ? buildPendingActionFromAI(aiActions[0]) : null

      if (pendingAction) {
        // AI wants to do a canvas operation — show ConfirmCard
        const msgId = (Date.now() + 1).toString()
        setMessages(prev => [...prev, {
          id: msgId,
          role: 'assistant',
          content: res.reply,
          timestamp: new Date(),
          pendingAction,
          actionStatus: 'pending',
        }])
      } else {
        // Pure reply, no canvas action
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: res.reply,
          timestamp: new Date(),
        }])
      }
    } catch {
      addLog({ level: 'error', category: 'ai', message: '[AI助手] 请求失败' })
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
      {/* Chat toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '4px 8px', borderBottom: '1px solid #1a1a1a', flexShrink: 0,
      }}>
        <button
          onClick={clearMessages}
          title="清空对话记录"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 5, border: 'none',
            background: 'none', cursor: 'pointer',
            color: '#555', fontSize: 11,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#aaa' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#555' }}
        >
          <Trash2 size={11} />
          <span>清空</span>
        </button>
      </div>
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
              'max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed',
              msg.role === 'user'
                ? 'bg-primary-500/20 text-white'
                : 'bg-canvas-border/50 text-white/80'
            )}>
              {/* Main text */}
              {msg.content && (
                msg.role === 'assistant' ? (
                  <div className="markdown-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code({ children, ...props }) {
                          const text = String(children).trim()
                          const isNodeId = nodesRef.current.some(n => n.id === text)
                          if (isNodeId) {
                            return (
                              <code
                                {...props}
                                style={{ cursor: 'pointer', textDecoration: 'underline dotted', color: '#60a5fa' }}
                                title="点击定位到该节点"
                                onClick={() => focusCanvasNode(text)}
                              >{children}</code>
                            )
                          }
                          return <code {...props}>{children}</code>
                        }
                      }}
                    >{(() => {
                      // Pre-process: wrap bare node IDs (not already in backticks) with backticks
                      const nodeIds = nodesRef.current.map(n => n.id)
                      if (nodeIds.length === 0) return msg.content
                      const escaped = nodeIds.map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
                      const pattern = new RegExp(`(?<![\`\\w])(${escaped.join('|')})(?![\`\\w])`, 'g')
                      return msg.content.replace(pattern, '`$1`')
                    })()}</ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-line' }}>{msg.content}</div>
                )
              )}

              {/* Confirmation card */}
              {msg.pendingAction && msg.actionStatus === 'pending' && (
                <ConfirmCard
                  action={msg.pendingAction}
                  onConfirm={() => executeAction(msg.id, msg.pendingAction!)}
                  onCancel={() => cancelAction(msg.id)}
                />
              )}

              {/* Post-action badge */}
              {msg.isAction && msg.actionStatus === 'confirmed' && (
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

              {/* Cancelled badge */}
              {msg.actionStatus === 'cancelled' && (
                <div style={{
                  marginTop: 6,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: '#9ca3af',
                  background: 'rgba(156,163,175,0.1)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}>
                  <span>✕</span>
                  <span>已取消</span>
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

// ── Inline Log Panel (embedded in RightPanel tab) ─────────────────────────────

const LOG_CATEGORY_TABS: { id: LogCategory | 'all'; label: string }[] = [
  { id: 'all',       label: '全部' },
  { id: 'operation', label: '操作' },
  { id: 'ai',        label: 'AI'   },
  { id: 'system',    label: '系统' },
  { id: 'network',   label: '网络' },
]

const LOG_LEVEL_FILTERS: { id: LogLevel | 'all'; label: string }[] = [
  { id: 'all',   label: '全部'  },
  { id: 'info',  label: 'Info'  },
  { id: 'warn',  label: 'Warn'  },
  { id: 'error', label: 'Error' },
  { id: 'debug', label: 'Debug' },
]

function logLevelColor(level: LogLevel): string {
  switch (level) {
    case 'info':  return '#60a5fa'
    case 'warn':  return '#fbbf24'
    case 'error': return '#f87171'
    case 'debug': return '#a3a3a3'
  }
}

function logLevelBg(level: LogLevel): string {
  switch (level) {
    case 'info':  return 'rgba(96,165,250,0.1)'
    case 'warn':  return 'rgba(251,191,36,0.1)'
    case 'error': return 'rgba(248,113,113,0.1)'
    case 'debug': return 'rgba(163,163,163,0.08)'
  }
}

function InlineLogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        borderBottom: '1px solid #1a1a1a',
        padding: '6px 10px',
        cursor: entry.detail ? 'pointer' : 'default',
        background: expanded ? logLevelBg(entry.level) : 'transparent',
        transition: 'background 0.1s',
      }}
      onClick={() => entry.detail && setExpanded(v => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        {/* Expand arrow */}
        <div style={{ width: 12, flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: 2 }}>
          {entry.detail && (
            <ChevronRight
              size={11}
              color="#555"
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            />
          )}
        </div>

        {/* Level badge */}
        <span style={{
          flexShrink: 0,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: 'monospace',
          color: logLevelColor(entry.level),
          background: logLevelBg(entry.level),
          border: `1px solid ${logLevelColor(entry.level)}33`,
          borderRadius: 3,
          padding: '1px 4px',
          minWidth: 34,
          textAlign: 'center',
          letterSpacing: 0.4,
          marginTop: 1,
        }}>
          {entry.level.toUpperCase()}
        </span>

        {/* Message */}
        <span style={{
          flex: 1,
          fontSize: 11,
          color: entry.level === 'error' ? '#f87171' : entry.level === 'warn' ? '#fbbf24' : '#c8c8c8',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          display: 'flex',
          alignItems: 'baseline',
          gap: 5,
          flexWrap: 'wrap',
        }}>
          {entry.message}
          {entry.category === 'ai' && entry.detail && (
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: entry.kind === 'response' ? '#34d399' : '#a78bfa',
              background: entry.kind === 'response' ? 'rgba(52,211,153,0.1)' : 'rgba(167,139,250,0.1)',
              border: entry.kind === 'response' ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(167,139,250,0.3)',
              borderRadius: 3,
              padding: '1px 4px',
              letterSpacing: 0.4,
              flexShrink: 0,
            }}>
              {entry.kind === 'response' ? 'RESPONSE' : 'PROMPT'}
            </span>
          )}
        </span>

        {/* Timestamp */}
        <span style={{ flexShrink: 0, fontSize: 9, color: '#444', fontFamily: 'monospace', marginTop: 2 }}>
          {entry.timestamp.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Detail */}
      {expanded && entry.detail && (
        <div style={{
          marginTop: 5,
          marginLeft: 18,
          background: '#0e0e0e',
          border: entry.category === 'ai' ? '1px solid rgba(167,139,250,0.2)' : '1px solid #1e1e1e',
          borderRadius: 5,
          overflow: 'hidden',
        }}>
          {entry.category === 'ai' && (
            <div style={{
              padding: '2px 8px',
              borderBottom: entry.kind === 'response' ? '1px solid rgba(52,211,153,0.15)' : '1px solid rgba(167,139,250,0.15)',
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: entry.kind === 'response' ? '#34d399' : '#a78bfa',
              letterSpacing: 0.8,
              background: entry.kind === 'response' ? 'rgba(52,211,153,0.06)' : 'rgba(167,139,250,0.06)',
            }}>
              {entry.kind === 'response' ? 'RESPONSE' : 'PROMPT'}
            </div>
          )}
          <div style={{
            padding: '5px 8px',
            fontSize: 10,
            color: '#888',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}>
            {entry.detail}
          </div>
        </div>
      )}
    </div>
  )
}

function InlineLogPanel() {
  const entries   = useLogStore(s => s.entries)
  const clearLogs = useLogStore(s => s.clearLogs)

  const [category, setCategory] = useState<LogCategory | 'all'>('all')
  const [level,    setLevel]    = useState<LogLevel | 'all'>('all')

  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  const filtered = entries.filter(e => {
    const catOk = category === 'all' || e.category === category
    const lvlOk = level    === 'all' || e.level    === level
    return catOk && lvlOk
  })

  const errorCount = entries.filter(e => e.level === 'error').length
  const warnCount  = entries.filter(e => e.level === 'warn').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111' }}>

      {/* Badges + clear button */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
      }}>
        {errorCount > 0 && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 10,
            background: 'rgba(248,113,113,0.15)',
            border: '1px solid rgba(248,113,113,0.3)',
            color: '#f87171', fontWeight: 600,
          }}>{errorCount} 错误</span>
        )}
        {warnCount > 0 && (
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 10,
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.25)',
            color: '#fbbf24', fontWeight: 600,
          }}>{warnCount} 警告</span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={clearLogs}
          title="清空日志"
          style={{
            width: 24, height: 24, background: 'none', border: 'none',
            cursor: 'pointer', borderRadius: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#555',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#aaa' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#555' }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex', gap: 0,
        padding: '0 6px',
        borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        {LOG_CATEGORY_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setCategory(tab.id)}
            style={{
              padding: '5px 8px 7px',
              background: 'none', border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: category === tab.id ? 600 : 400,
              color: category === tab.id ? '#d0d0d0' : '#555',
              borderBottom: category === tab.id ? '2px solid #60a5fa' : '2px solid transparent',
              transition: 'color 0.12s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (category !== tab.id) e.currentTarget.style.color = '#999' }}
            onMouseLeave={e => { if (category !== tab.id) e.currentTarget.style.color = '#555' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Level filter chips */}
      <div style={{
        display: 'flex', gap: 3,
        padding: '5px 8px',
        borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        {LOG_LEVEL_FILTERS.map(lf => (
          <button
            key={lf.id}
            onClick={() => setLevel(lf.id)}
            style={{
              padding: '2px 8px',
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              fontSize: 10,
              fontWeight: 500,
              background: level === lf.id ? '#2a2a2a' : 'transparent',
              color: level === lf.id
                ? (lf.id === 'all' ? '#d0d0d0' : logLevelColor(lf.id as LogLevel))
                : '#555',
              transition: 'background 0.12s, color 0.12s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { if (level !== lf.id) e.currentTarget.style.background = '#1e1e1e' }}
            onMouseLeave={e => { if (level !== lf.id) e.currentTarget.style.background = 'transparent' }}
          >
            {lf.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: '#333', alignSelf: 'center' }}>{filtered.length} 条</span>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#333', fontSize: 12,
          }}>
            暂无日志
          </div>
        ) : (
          filtered.map(entry => (
            <InlineLogRow key={entry.id} entry={entry} />
          ))
        )}
        <div ref={bottomRef} />
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
