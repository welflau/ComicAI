import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  FileText, Video, Image as ImageIcon, Volume2,
  ChevronDown, Languages, Zap, ArrowUp, Square, CheckCircle2,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'
import CollapsibleSection from './shared/CollapsibleSection'
import NodeAddMenu from './shared/NodeAddMenu'
import { streamAI } from '@/api'
import { addLog } from '@/stores/logStore'

export interface ScriptNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  title?: string
  content?: string
  initialMode?: 'idle' | 'write' | 'generating' | 'content'
  initialPrompt?: string
  hideQuickActions?: boolean
}

type Mode = 'idle' | 'write' | 'generating' | 'content'

const NODE_W           = 520
const TITLE_H          = 28
const IDLE_CARD_H      = 292
const WRITE_CARD_MIN_H = 240
const CONTENT_CARD_MIN_H = 180

/* ── Mock generation (fallback) ──────────────────────────────── */

const MOCK_TEXT = `高级广告镜头 黑色背景中一款高端腕表悬浮出现，镜头从极近距离微距开始，缓慢拉远，金属表面光泽细腻，细节清晰，柔光打亮轮廓，商业广告级质感，干净构图，慢速旋转展示。`

async function mockGenerate(
  onChunk: (c: string) => void,
  onDone: () => void,
  signal: AbortSignal,
) {
  for (let i = 0; i < MOCK_TEXT.length; i++) {
    if (signal.aborted) return
    onChunk(MOCK_TEXT[i])
    const delay = MOCK_TEXT[i] === '\n' ? 60 : Math.random() * 22 + 8
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
        {[100, 80, 90, 55, 75, 85].map((w, i) => (
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

const ALL_MODELS: { id: string; label: string; service: string }[] = [
  { id: 'claude-3-5-sonnet',       label: 'Claude 3.5 Sonnet',  service: 'anthropic' },
  { id: 'claude-3-5-haiku',        label: 'Claude 3.5 Haiku',   service: 'anthropic' },
  { id: 'claude-3-7-sonnet',       label: 'Claude 3.7 Sonnet',  service: 'anthropic' },
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

function ModelDropdown({
  selectedId, onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
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
            const isFirst = i === 0
            const prevOk = i > 0 && testStatuses[models[i-1].service as keyof typeof testStatuses] === 'ok'
            const showDivider = !isOk && (isFirst || prevOk)
            return (
              <div key={m.id}>
                {showDivider && (
                  <div style={{ height: 1, background: '#2a2a2a', margin: '2px 0' }} />
                )}
                <button
                  className="nodrag nopan"
                  onClick={() => { onSelect(m.id); setOpen(false) }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', background: isSel ? '#252525' : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    color: isOk ? '#e0e0e0' : '#666',
                    fontSize: 13,
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

  // Keep selection pointing to a valid model if list order changes
  useEffect(() => {
    if (!models.find(m => m.id === selectedModel)) {
      setSelectedModel(models[0]?.id ?? '')
    }
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
        placeholder="写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。"
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
        {/* Model selector dropdown */}
        <ModelDropdown selectedId={selectedModel} onSelect={setSelectedModel} />

        <div style={{ flex: 1 }} />

        {/* Right controls */}
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

/* ── Lines preview icon ──────────────────────────────────────── */

function LinesIcon({ scale = 1 }: { scale?: number }) {
  const w = 72 * scale, h = 52 * scale
  return (
    <svg width={w} height={h} viewBox="0 0 72 52" fill="none">
      <rect y="0"  width="72" height="10" rx="5" fill="#404040" />
      <rect y="18" width="72" height="10" rx="5" fill="#404040" />
      <rect y="36" width="58" height="10" rx="5" fill="#404040" />
    </svg>
  )
}

/* ── Quick actions ───────────────────────────────────────────── */

const QUICK_ACTIONS = [
  { id: 'write',      Icon: FileText,  label: '自己编写内容' },
  { id: 'text2video', Icon: Video,     label: '文生视频' },
  { id: 'img2prompt', Icon: ImageIcon, label: '图片反推提示词' },
  { id: 'text2music', Icon: Volume2,   label: '文字生音乐' },
]

/* ── Handle ──────────────────────────────────────────────────── */

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
  const isTarget = type === 'target'
  const direction = isSource ? 'right' : 'left'
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
        onClick={(isSource || isTarget) ? (e) => { e.stopPropagation(); onSourceClick?.() } : undefined}
      >
        <span style={{
          pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -52%)',
        }}>+</span>
      </Handle>
      {menuOpen && nodeType && sourceNodeId && sourcePosition && (
        <NodeAddMenu
          nodeType={nodeType}
          sourceNodeId={sourceNodeId}
          sourcePosition={sourcePosition}
          sourceNodeWidth={sourceNodeWidth}
          direction={direction as 'left' | 'right'}
          onClose={onMenuClose!}
        />
      )}
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────── */

function ScriptNode({ data, selected, dragging }: NodeProps<ScriptNodeData>) {
  const [mode, setMode]           = useState<Mode>(data.initialMode ?? 'idle')
  const [text, setText]           = useState(data.content ?? '')
  const [streamText, setStream]   = useState('')
  const [showShimmer, setShimmer] = useState(false)
  const [prompt, setPrompt]       = useState(data.initialPrompt ?? '')
  const [focused, setFocused]     = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(!data.hideQuickActions)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)

  const taRef    = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const addNode = useProjectStore(s => s.addNode)
  const addEdge = useProjectStore(s => s.addEdge)

  const nodeLabel = data.title || data.label || '文本'

  // Expanded when selected (but NOT while dragging) OR in an "active" mode
  const isExpanded = (selected && !dragging) || mode === 'write' || mode === 'generating'

  // Handles visible when hovered or selected (or in active modes)
  const handlesVisible = isHovered || (selected && !dragging) || mode === 'write' || mode === 'generating'

  // handle Y positions — adapt to collapsed/expanded card height
  const idleCardH      = IDLE_CARD_H
  const idleHandleY    = TITLE_H + idleCardH / 2
  const writeHandleY   = TITLE_H + WRITE_CARD_MIN_H / 2
  const genHandleY     = TITLE_H + WRITE_CARD_MIN_H / 2
  const contentHandleY = TITLE_H + CONTENT_CARD_MIN_H / 2

  useEffect(() => {
    if (mode === 'write') setTimeout(() => taRef.current?.focus(), 0)
  }, [mode])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const startGenerate = useCallback((promptOverride?: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setMode('generating')
    setStream('')
    setShimmer(true)

    const userPrompt = (promptOverride ?? prompt).trim() || '根据当前内容生成脚本'

    addLog({ level: 'info', category: 'ai', message: `开始生成脚本`, detail: userPrompt })

    // Give shimmer a moment to appear, then start streaming
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
        contextType: 'script',
        signal: ctrl.signal,
        onChunk: c => setStream(prev => prev + c),
        onDone: (stats) => {
          setStream(prev => { setText(prev); return prev })
          setMode('content')
          const detail = stats
            ? `生成 ${stats.chars} 字符，耗时 ${(stats.elapsed / 1000).toFixed(1)}s`
            : undefined
          addLog({ level: 'info', category: 'ai', message: '脚本生成完成', detail })
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
    addLog({ level: 'warn', category: 'ai', message: '用户中止脚本生成' })
    if (streamText) { setText(streamText); setMode('content') }
    else setMode('idle')
  }, [streamText])

  const handleSend = useCallback(() => {
    if (!prompt.trim()) return
    // In content mode, pass existing text as context so AI can modify/extend it
    const fullPrompt = mode === 'content' && text.trim()
      ? `现有内容：\n${text}\n\n新指令：${prompt}`
      : prompt
    startGenerate(fullPrompt)
  }, [prompt, text, mode, startGenerate])

  const handleQuickAction = useCallback((id: string) => {
    if (id === 'write') { setMode('write'); return }
    if (id === 'storyboard') {
      const newId = `libtv_script_gen_${Date.now()}`
      addNode({
        id: newId,
        type: 'libtv_script_gen' as NodeData['type'],
        label: '分镜脚本',
        category: 'process',
        position: { x: data.position.x + NODE_W + 80, y: data.position.y },
        config: {},
      })
      addEdge({ id: `e-${data.id}-${newId}`, source: data.id, target: newId })
      return
    }
    startGenerate()
  }, [startGenerate, addNode, addEdge, data.id, data.position])

  return (
    <div
      style={{
        position: 'relative',
        width: NODE_W,
        fontFamily: 'Inter, system-ui, sans-serif',
        cursor: mode === 'write' ? 'text'
          : mode === 'generating' ? 'default'
          : selected ? 'default'
          : dragging ? 'grabbing' : 'grab',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Title */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: TITLE_H, paddingLeft: 2, paddingBottom: 6,
      }}>
        <FileText size={13} color="#888" />
        <span style={{ fontSize: 13, color: '#bbb', fontWeight: 500 }}>{nodeLabel}</span>
      </div>

      {/* ══════════ IDLE ══════════ */}
      {mode === 'idle' && (
        <>
          <div style={{
            background: '#1e1e1e',
            border: (selected && !dragging) ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2e2e2e',
            borderRadius: 14,
            boxShadow: (selected && !dragging) ? '0 0 0 2px rgba(255,255,255,0.06)' : '0 2px 12px rgba(0,0,0,0.4)',
            overflow: 'hidden',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}>
            {/* Preview area */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: 150, background: '#252525',
            }}>
              <LinesIcon />
            </div>

            {/* Quick actions — always visible */}
            {showQuickActions && (
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
            )}
          </div>

          <CollapsibleSection expanded={isExpanded}>
            <PromptPanel value={prompt} onChange={setPrompt} onSend={handleSend} />
          </CollapsibleSection>

          <CircleHandle type="target" position={Position.Left}  top={idleHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
          <CircleHandle type="source" position={Position.Right} top={idleHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ WRITE ══════════ */}
      {mode === 'write' && (
        <>
          <div
            onClick={() => taRef.current?.focus()}
            style={{
              background: '#161616',
              border: '1.5px solid #484848',
              borderRadius: 14,
              minHeight: WRITE_CARD_MIN_H,
              position: 'relative',
              cursor: 'text',
              overflow: 'hidden',
            }}
          >
            {/* Placeholder */}
            {!text && !focused && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                padding: '18px 20px', gap: 18,
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
                  请编写内容，开始你的创作。
                </span>
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                  <LinesIcon scale={0.75} />
                </div>
              </div>
            )}

            <textarea
              ref={taRef}
              className="nodrag nopan nowheel"
              autoFocus={data.initialMode === 'write'}
              placeholder=""
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false)
                if (text.length > 0) setMode('content')
              }}
              style={{
                position: 'relative', zIndex: 1,
                width: '100%', minHeight: WRITE_CARD_MIN_H,
                pointerEvents: focused ? 'auto' : 'none',
                boxSizing: 'border-box',
                background: 'transparent', border: 'none', outline: 'none',
                color: '#e0e0e0', fontSize: 15, lineHeight: 1.7,
                padding: '18px 20px',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          <CircleHandle type="source" position={Position.Right} top={writeHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ GENERATING ══════════ */}
      {mode === 'generating' && (
        <>
          <div style={{
            background: '#161616',
            border: '1.5px solid #3a6ff7',
            borderRadius: 14,
            minHeight: WRITE_CARD_MIN_H,
            boxShadow: '0 0 0 3px rgba(58,111,247,0.1)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px 8px', borderBottom: '1px solid #222',
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

            <div style={{ padding: '16px 20px 20px', minHeight: WRITE_CARD_MIN_H - 48 }}>
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

          <CircleHandle type="source" position={Position.Right} top={genHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ CONTENT ══════════ */}
      {mode === 'content' && (
        <>
          <div style={{
            background: '#1a1a1a',
            border: (selected && !dragging) ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #333',
            borderRadius: 14,
            minHeight: CONTENT_CARD_MIN_H,
            position: 'relative',
            cursor: 'text',
            overflow: 'hidden',
            transition: 'border-color 150ms ease',
          }}
            onClick={() => taRef.current?.focus()}
          >
            <textarea
              ref={taRef}
              className="nodrag nopan nowheel"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                display: 'block',
                width: '100%', minHeight: CONTENT_CARD_MIN_H,
                boxSizing: 'border-box',
                background: 'transparent', border: 'none', outline: 'none',
                color: '#e0e0e0', fontSize: 15, lineHeight: 1.75,
                padding: '18px 20px',
                resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>

          <CollapsibleSection expanded={isExpanded}>
            <PromptPanel value={prompt} onChange={setPrompt} onSend={handleSend} />
          </CollapsibleSection>

          <CircleHandle type="target" position={Position.Left}  top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
          <CircleHandle type="source" position={Position.Right} top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}
    </div>
  )
}

export default memo(ScriptNode)
