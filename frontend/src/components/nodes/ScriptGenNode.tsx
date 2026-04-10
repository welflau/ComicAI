import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  ScrollText, RotateCcw, Square,
  ChevronDown, Languages, Zap, ArrowUp, CheckCircle2,
  Clapperboard, Video, Image as ImageIcon, FileText,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'
import CollapsibleSection from './shared/CollapsibleSection'
import NodeAddMenu from './shared/NodeAddMenu'
import { streamAI } from '@/api'
import { addLog } from '@/stores/logStore'

export interface ScriptGenNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  title?: string
  content?: string
  initialMode?: 'idle' | 'generating' | 'content'
}

type Mode = 'idle' | 'generating' | 'content'

const NODE_W             = 520
const TITLE_H            = 28
const IDLE_PREVIEW_H     = 150
const GEN_CARD_MIN_H     = 300
const CONTENT_CARD_MIN_H = 220

/* ── Quick actions ───────────────────────────────────────────── */

const QUICK_ACTIONS = [
  { id: 'generate',   Icon: Clapperboard, label: '根据剧本生成分镜脚本' },
  { id: 'text2video', Icon: Video,        label: '文生视频分镜' },
  { id: 'img2script', Icon: ImageIcon,    label: '图片转分镜脚本' },
  { id: 'manual',     Icon: FileText,     label: '手动编写分镜脚本' },
]

/* ── Mock script content (fallback) ─────────────────────────── */

const MOCK_SCRIPT = `第一幕：相遇

深夜的咖啡馆，只剩最后一盏灯。

林夏坐在靠窗的位置，手边是一杯已经凉透的拿铁，她的目光落在窗外的雨幕上，出神。

推门声。

一个男人走进来，雨水打湿了他的肩头。他环顾四周，目光最终停在林夏身旁的空椅子上。

"这里有人吗？"

林夏抬起头，看了他一眼，摇了摇头。

男人在她对面坐下，两人相视而笑。

第二幕：开始

雨，越下越大。`

async function mockGenerate(
  onChunk: (c: string) => void,
  onDone: () => void,
  signal: AbortSignal,
) {
  for (let i = 0; i < MOCK_SCRIPT.length; i++) {
    if (signal.aborted) return
    onChunk(MOCK_SCRIPT[i])
    const delay = MOCK_SCRIPT[i] === '\n' ? 60 : Math.random() * 20 + 8
    await new Promise<void>(r => setTimeout(r, delay))
  }
  if (!signal.aborted) onDone()
}

/* ── Shimmer ─────────────────────────────────────────────────── */

const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #252525 25%, #313131 50%, #252525 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 5,
}

function ShimmerLines() {
  return (
    <>
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '20px 20px 0' }}>
        {[100, 80, 90, 55, 75, 85, 68, 92].map((w, i) => (
          <div key={i} style={{ ...shimmerStyle, height: 13, width: `${w}%` }} />
        ))}
      </div>
    </>
  )
}

/* ── Blinking cursor ─────────────────────────────────────────── */

function Cursor() {
  return (
    <>
      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
      <span style={{
        display: 'inline-block', width: 2, height: '1em',
        background: '#a0a0a0', marginLeft: 2, verticalAlign: 'text-bottom',
        animation: 'blink 0.9s step-end infinite',
      }} />
    </>
  )
}

/* ── Lines preview icon ──────────────────────────────────────── */

function LinesIcon() {
  return (
    <svg width={80} height={58} viewBox="0 0 80 58" fill="none">
      <rect y="0"  width="80" height="11" rx="5.5" fill="#363636" />
      <rect y="23" width="80" height="11" rx="5.5" fill="#363636" />
      <rect y="47" width="64" height="11" rx="5.5" fill="#363636" />
    </svg>
  )
}

/* ── GVLM brand icon ─────────────────────────────────────────── */

function GVLMIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="6" stroke="#6b8fff" strokeWidth="1.4" />
      <circle cx="7.5" cy="4.5" r="1.5" fill="#6b8fff" />
      <circle cx="4.5" cy="10" r="1.5" fill="#6b8fff" opacity="0.7" />
      <circle cx="10.5" cy="10" r="1.5" fill="#6b8fff" opacity="0.7" />
      <line x1="7.5" y1="6" x2="5.2" y2="8.8" stroke="#6b8fff" strokeWidth="1" opacity="0.6" />
      <line x1="7.5" y1="6" x2="9.8" y2="8.8" stroke="#6b8fff" strokeWidth="1" opacity="0.6" />
    </svg>
  )
}

/* ── Model list ──────────────────────────────────────────────── */

const ALL_MODELS = [
  { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', service: 'anthropic' },
  { id: 'claude-3-5-haiku',  label: 'Claude 3.5 Haiku',  service: 'anthropic' },
  { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet',  service: 'anthropic' },
]

function useOrderedModels() {
  const testStatuses = useSettingsStore(s => s.testStatuses)
  return [...ALL_MODELS].sort((a, b) => {
    const aOk = testStatuses[a.service as keyof typeof testStatuses] === 'ok'
    const bOk = testStatuses[b.service as keyof typeof testStatuses] === 'ok'
    if (aOk === bOk) return 0
    return aOk ? -1 : 1
  })
}

/* ── Model dropdown ──────────────────────────────────────────── */

function ModelDropdown({ selectedId, onSelect }: { selectedId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const models = useOrderedModels()
  const testStatuses = useSettingsStore(s => s.testStatuses)
  const selected = models.find(m => m.id === selectedId) ?? models[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="nodrag nopan"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '2px 4px', borderRadius: 6, color: '#888',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#252525' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
      >
        <GVLMIcon />
        <span style={{ fontSize: 12, fontWeight: 500 }}>{selected?.label ?? 'Select model'}</span>
        {testStatuses[selected?.service as keyof typeof testStatuses] === 'ok' && (
          <CheckCircle2 size={10} color="#4ade80" />
        )}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
            background: '#1a1a1a', border: '1px solid #2e2e2e',
            borderRadius: 10, minWidth: 200,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            overflow: 'hidden', zIndex: 9999,
          }}
        >
          {models.map((m, i) => {
            const isOk = testStatuses[m.service as keyof typeof testStatuses] === 'ok'
            const isSel = m.id === selectedId
            const prevOk = i > 0 && testStatuses[models[i-1].service as keyof typeof testStatuses] === 'ok'
            const showDivider = !isOk && (i === 0 || prevOk)
            return (
              <div key={m.id}>
                {showDivider && <div style={{ height: 1, background: '#2a2a2a', margin: '2px 0' }} />}
                <button
                  className="nodrag nopan"
                  onClick={() => { onSelect(m.id); setOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: isSel ? '#252525' : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    color: isOk ? '#e0e0e0' : '#666', fontSize: 13,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#252525' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSel ? '#252525' : 'none' }}
                >
                  <GVLMIcon />
                  <span style={{ flex: 1 }}>{m.label}</span>
                  {isOk && <CheckCircle2 size={11} color="#4ade80" />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Prompt panel ────────────────────────────────────────────── */

function PromptPanel({
  value, onChange, onSend, disabled = false,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
}) {
  const active = value.trim().length > 0
  const models = useOrderedModels()
  const [selectedModel, setSelectedModel] = useState(models[0]?.id ?? '')

  useEffect(() => {
    if (!models.find(m => m.id === selectedModel)) setSelectedModel(models[0]?.id ?? '')
  }, [models, selectedModel])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (active && !disabled) onSend()
    }
  }

  return (
    <div
      className="nodrag nopan"
      style={{
        marginTop: 8,
        background: '#1c1c1c',
        border: '1px solid #2e2e2e',
        borderRadius: 14,
        padding: '14px 16px 10px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
    >
      <textarea
        className="nodrag nopan nowheel"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder="描述剧情或添加角色参考、视频参考等，为你生成分镜脚本"
        rows={3}
        style={{
          background: 'transparent', border: 'none', outline: 'none',
          color: '#ccc', fontSize: 14, lineHeight: 1.65,
          resize: 'none', width: '100%', boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />

      {/* Bottom bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        paddingTop: 8, marginTop: 4,
        borderTop: '1px solid #272727',
      }}>
        <ModelDropdown selectedId={selectedModel} onSelect={setSelectedModel} />
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="nodrag nopan"
            style={{
              display: 'flex', alignItems: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 5, color: '#555',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#888' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#555' }}
          >
            <Languages size={14} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#555' }}>
            <Zap size={12} />
            <span style={{ fontSize: 12 }}>6</span>
          </div>
          <button
            className="nodrag nopan"
            onClick={onSend}
            disabled={!active || disabled}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: 'none',
              cursor: active && !disabled ? 'pointer' : 'not-allowed',
              background: active && !disabled ? '#3a6ff7' : '#252525',
              color: active && !disabled ? '#fff' : '#444',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Handle helper ───────────────────────────────────────────── */

function CircleHandle({ type, position, top, visible, onSourceClick, menuOpen, onMenuClose, nodeType, sourceNodeId, sourcePosition, sourceNodeWidth }: {
  type: 'source' | 'target'
  position: Position
  top: number
  visible?: boolean
  onSourceClick?: () => void
  menuOpen?: boolean
  onMenuClose?: () => void
  nodeType?: import('./shared/NodeAddMenu').NodeTypeKey
  sourceNodeId?: string
  sourcePosition?: { x: number; y: number }
  sourceNodeWidth?: number
}) {
  const side = position === Position.Left ? { left: -11 } : { right: -11 }
  const isSource = type === 'source'
  return (
    <div style={{ position: 'absolute', top, ...side, transform: 'translateY(-50%)', width: 22, height: 22 }}>
      <Handle
        type={type}
        position={position}
        style={{
          width: 22, height: 22,
          background: '#1a1a1a', border: '1.5px solid #606060',
          borderRadius: '50%',
          top: 0, left: 0,
          transform: 'none',
          transition: 'opacity 150ms ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          position: 'relative',
        }}
        onClick={isSource ? (e) => { e.stopPropagation(); onSourceClick?.() } : undefined}
      >
        <span style={{
          pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -52%)',
        }}>+</span>
      </Handle>
      {isSource && menuOpen && nodeType && sourceNodeId && sourcePosition && (
        <NodeAddMenu
          nodeType={nodeType}
          sourceNodeId={sourceNodeId}
          sourcePosition={sourcePosition}
          sourceNodeWidth={sourceNodeWidth}
          onClose={onMenuClose!}
        />
      )}
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────── */

function ScriptGenNode({ data, selected }: NodeProps<ScriptGenNodeData>) {
  const [mode, setMode]           = useState<Mode>(data.initialMode ?? 'idle')
  const [text, setText]           = useState(data.content ?? '')
  const [streamText, setStream]   = useState('')
  const [showShimmer, setShimmer] = useState(false)
  const [prompt, setPrompt]       = useState('')
  const [dragging, setDragging]   = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)

  const abortRef  = useRef<AbortController | null>(null)
  const nodeLabel = data.title || data.label || '分镜脚本'

  const addNode = useProjectStore(s => s.addNode)
  const addEdge = useProjectStore(s => s.addEdge)

  // Expanded when selected OR in active mode
  const isExpanded = selected || mode === 'generating'
  // Handles visible when hovered or selected (or active)
  const handlesVisible = isHovered || selected || mode === 'generating'

  // handle Y — collapsed idle shows only preview area
  const QUICK_ACTIONS_H = 44 + QUICK_ACTIONS.length * 36   // label + items
  const PROMPT_PANEL_H  = 118                               // approximate panel height
  const idleHandleY    = TITLE_H + (isExpanded
    ? (IDLE_PREVIEW_H + QUICK_ACTIONS_H + PROMPT_PANEL_H) / 2
    : IDLE_PREVIEW_H / 2)
  const genHandleY     = TITLE_H + GEN_CARD_MIN_H / 2
  const contentHandleY = TITLE_H + CONTENT_CARD_MIN_H / 2

  const startGenerate = useCallback((promptOverride?: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setMode('generating')
    setStream('')
    setShimmer(true)

    const userPrompt = (promptOverride ?? prompt).trim() || '生成分镜脚本'

    addLog({ level: 'info', category: 'ai', message: '开始生成分镜脚本', detail: userPrompt })

    setTimeout(() => {
      if (ctrl.signal.aborted) return
      setShimmer(false)

      let usedMock = false
      const runMock = () => {
        if (usedMock || ctrl.signal.aborted) return
        usedMock = true
        mockGenerate(
          c => setStream(prev => prev + c),
          () => { setStream(prev => { setText(prev); return prev }); setMode('content') },
          ctrl.signal,
        )
      }

      streamAI({
        prompt: userPrompt,
        contextType: 'storyboard',
        signal: ctrl.signal,
        onChunk: c => setStream(prev => prev + c),
        onDone: (stats) => {
          setStream(prev => { setText(prev); return prev })
          setMode('content')
          const detail = stats
            ? `生成 ${stats.chars} 字符，耗时 ${(stats.elapsed / 1000).toFixed(1)}s`
            : undefined
          addLog({ level: 'info', category: 'ai', message: '分镜脚本生成完成', detail })
        },
        onError: (err) => {
          addLog({ level: 'warn', category: 'ai', message: 'AI 不可用，使用模拟内容', detail: err })
          runMock()
        },
      }).catch((err) => {
        if (ctrl.signal.aborted) return
        addLog({ level: 'warn', category: 'ai', message: 'AI 请求失败，使用模拟内容', detail: String(err) })
        runMock()
      })
    }, 400)
  }, [prompt])

  const stopGenerate = useCallback(() => {
    abortRef.current?.abort()
    addLog({ level: 'warn', category: 'ai', message: '用户中止分镜脚本生成' })
    if (streamText) { setText(streamText); setMode('content') }
    else setMode('idle')
  }, [streamText])

  const handleSend = useCallback(() => {
    if (!prompt.trim()) return
    startGenerate(prompt)
  }, [prompt, startGenerate])

  const handleQuickAction = useCallback((id: string) => {
    if (id === 'generate') {
      const newId = `libtv_script_${Date.now()}`
      addNode({
        id: newId,
        type: 'libtv_script' as NodeData['type'],
        label: '剧本',
        category: 'input',
        position: { x: data.position.x - NODE_W - 80, y: data.position.y },
        config: {},
        title: '新剧本',
        hideQuickActions: true,
        initialPrompt: '根据我上传的剧本，生成一个完整的故事脚本',
      } as NodeData)
      addEdge({ id: `e-${newId}-${data.id}`, source: newId, target: data.id })
      return
    }
    if (id === 'manual') { /* TODO: switch to write mode */ return }
    startGenerate()
  }, [startGenerate, addNode, addEdge, data.id, data.position])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: NODE_W,
        fontFamily: 'Inter, system-ui, sans-serif',
        cursor: mode === 'generating' ? 'default' : (selected ? 'default' : dragging ? 'grabbing' : 'grab'),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setDragging(false) }}
      onMouseDown={() => mode !== 'generating' && setDragging(true)}
      onMouseUp={() => setDragging(false)}
    >
      {/* Title */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: TITLE_H, paddingLeft: 2, paddingBottom: 6,
      }}>
        <ScrollText size={13} color="#888" />
        <span style={{ fontSize: 13, color: '#bbb', fontWeight: 500 }}>{nodeLabel}</span>
      </div>

      {/* ══════════ IDLE ══════════ */}
      {mode === 'idle' && (
        <>
          <div style={{
            background: '#1e1e1e',
            border: selected ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2e2e2e',
            borderRadius: 14,
            boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.06)' : '0 2px 12px rgba(0,0,0,0.4)',
            overflow: 'hidden',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}>
            {/* Preview area */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: IDLE_PREVIEW_H, background: '#252525',
            }}>
              <LinesIcon />
            </div>

            {/* Quick actions */}
            <CollapsibleSection expanded={isExpanded}>
              <div style={{ padding: '10px 16px 12px' }}>
                <div style={{ fontSize: 13, color: '#777', marginBottom: 6 }}>尝试:</div>
                {QUICK_ACTIONS.map(({ id, Icon, label }) => (
                  <div
                    key={id}
                    className="nodrag nopan"
                    onClick={() => handleQuickAction(id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                      color: '#aaa', fontSize: 14,
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#2e2e2e'; e.currentTarget.style.color = '#ddd' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa' }}
                  >
                    <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                    {label}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </div>

          {/* Prompt panel */}
          <CollapsibleSection expanded={isExpanded}>
            <PromptPanel
              value={prompt}
              onChange={setPrompt}
              onSend={handleSend}
            />
          </CollapsibleSection>

          <CircleHandle type="target" position={Position.Left}  top={idleHandleY} visible={handlesVisible} />
          <CircleHandle type="source" position={Position.Right} top={idleHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ GENERATING ══════════ */}
      {mode === 'generating' && (
        <>
          <div style={{
            background: '#161616',
            border: '1.5px solid #3a6ff7',
            borderRadius: 14,
            minHeight: GEN_CARD_MIN_H,
            boxShadow: '0 0 0 3px rgba(58,111,247,0.12)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px 8px',
              borderBottom: '1px solid #222',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#3a6ff7', boxShadow: '0 0 6px #3a6ff7',
                  animation: 'blink 1s step-end infinite',
                }} />
                <span style={{ fontSize: 12, color: '#555' }}>AI 生成中…</span>
              </div>
              <button
                className="nodrag nopan"
                onClick={stopGenerate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: '1px solid #3a3a3a',
                  borderRadius: 6, cursor: 'pointer',
                  padding: '3px 8px', color: '#666', fontSize: 11,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#999' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a3a3a'; e.currentTarget.style.color = '#666' }}
              >
                <Square size={9} />
                停止
              </button>
            </div>

            {/* Content area */}
            <div style={{ padding: '16px 20px 20px', minHeight: GEN_CARD_MIN_H - 48 }}>
              {showShimmer ? (
                <ShimmerLines />
              ) : (
                <p style={{
                  margin: 0, color: '#d0d0d0', fontSize: 15,
                  lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {streamText}<Cursor />
                </p>
              )}
            </div>
          </div>

          <CircleHandle type="target" position={Position.Left}  top={genHandleY} visible={handlesVisible} />
          <CircleHandle type="source" position={Position.Right} top={genHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ CONTENT ══════════ */}
      {mode === 'content' && (
        <>
          <div style={{
            background: '#1c1c1c',
            border: selected ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2a2a2a',
            borderRadius: 14,
            minHeight: CONTENT_CARD_MIN_H,
            padding: '16px 18px',
            boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.06)' : '0 2px 12px rgba(0,0,0,0.4)',
            overflowY: 'auto',
            maxHeight: 480,
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}>
            <p style={{
              margin: 0, color: '#e0e0e0', fontSize: 15,
              lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {text}
            </p>
          </div>

          {/* Bottom action bar + prompt — collapsed when not selected */}
          <CollapsibleSection expanded={isExpanded}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              gap: 8, marginTop: 14, paddingTop: 10,
              borderTop: '1px solid #252525',
            }}>
              <button
                className="nodrag nopan"
                onClick={() => setMode('idle')}
                style={{
                  background: 'none', border: '1px solid #333',
                  borderRadius: 7, cursor: 'pointer',
                  padding: '4px 12px', color: '#777', fontSize: 12,
                  transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#bbb' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#777' }}
              >
                编辑
              </button>
              <button
                className="nodrag nopan"
                onClick={startGenerate}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: '1px solid #333',
                  borderRadius: 7, cursor: 'pointer',
                  padding: '4px 12px', color: '#777', fontSize: 12,
                  transition: 'border-color 0.12s, color 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#bbb' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#777' }}
              >
                <RotateCcw size={11} />
                重新生成
              </button>
            </div>
          </CollapsibleSection>

          {/* Prompt panel */}
          <CollapsibleSection expanded={isExpanded}>
            <PromptPanel
              value={prompt}
              onChange={setPrompt}
              onSend={handleSend}
            />
          </CollapsibleSection>

          <CircleHandle type="target" position={Position.Left}  top={contentHandleY} visible={handlesVisible} />
          <CircleHandle type="source" position={Position.Right} top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}
    </div>
  )
}

export default memo(ScriptGenNode)
