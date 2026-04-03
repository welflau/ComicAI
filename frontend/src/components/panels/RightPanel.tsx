import { useState, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { Send, Bot, User, Settings, Activity, ChevronDown, ChevronRight, Play, X } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { aiApi } from '@/api'
import type { NodeData, GenerationTask } from '@/types'

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
  const { nodes, updateNode } = useProjectStore()
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return null

  const status = node.status || 'idle'
  const badge = STATUS_BADGE[status] || STATUS_BADGE.idle

  return (
    <div className="p-3 space-y-4">
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

      {/* Config fields */}
      {node.config && Object.keys(node.config).length > 0 && (
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

function EmptyProperties() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-white/20">
      <Settings className="w-8 h-8 mb-2" />
      <p className="text-xs">选择节点查看属性</p>
    </div>
  )
}

// ── AI Assistant Panel ─────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

function AIAssistantPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'assistant',
      content: '你好！我是 ComicFlow AI 助手。我可以帮你优化剧本、设计角色、生成提示词，或回答任何创作问题。',
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
              {msg.content}
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
            placeholder="输入消息..."
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

function RunLogPanel() {
  const { tasks } = useProjectStore()

  return (
    <div className="flex flex-col h-full">
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

type RightTab = 'properties' | 'ai' | 'log'

export default function RightPanel() {
  const [activeTab, setActiveTab] = useState<RightTab>('properties')
  const { selectedNodeIds } = useProjectStore()

  const tabs: { id: RightTab; label: string }[] = [
    { id: 'properties', label: '属性' },
    { id: 'ai', label: 'AI 助手' },
    { id: 'log', label: '运行日志' },
  ]

  return (
    <div className="h-full flex flex-col bg-canvas-surface border-l border-canvas-border">
      {/* Tabs */}
      <div className="flex border-b border-canvas-border flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'text-white border-b-2 border-primary-500'
                : 'text-white/40 hover:text-white/70'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'properties' && (
          selectedNodeIds.length > 0
            ? <PropertiesPanel nodeId={selectedNodeIds[0]} />
            : <EmptyProperties />
        )}
        {activeTab === 'ai' && <AIAssistantPanel />}
        {activeTab === 'log' && <RunLogPanel />}
      </div>
    </div>
  )
}
