import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  FileText, Video, Image as ImageIcon, Volume2,
  ChevronDown, Languages, Zap, ArrowUp,
  CheckCircle2, Download, PenLine,
  Bold, Italic, List, ListOrdered, Minus, Copy, Maximize2,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'
import CollapsibleSection from './shared/CollapsibleSection'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
import NodeAddMenu from './shared/NodeAddMenu'
import { streamAI } from '@/api'
import { addLog } from '@/stores/logStore'
import { resolveImageUrl, resolveImageToDataUrl, DEFAULT_IMAGE_URL } from '@/stores/imageStore'

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
const GEN_CARD_H       = 360

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
        {[100, 80, 90, 55, 75, 85, 95, 70, 88, 60, 78, 92, 65, 82].map((w, i) => (
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
  value, onChange, onSend, disabled = false, sourceThumbnailUrl, loading = false,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  /** Resolved blob/http URL for the source image thumbnail */
  sourceThumbnailUrl?: string | null
  /** Show loading spinner on send button instead of arrow */
  loading?: boolean
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
      {/* Source image thumbnail row */}
      {sourceThumbnailUrl && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <img
              src={sourceThumbnailUrl}
              alt=""
              style={{
                width: 44, height: 44, objectFit: 'cover',
                borderRadius: 8, display: 'block',
                border: '1px solid #333',
              }}
            />
            {/* Badge */}
            <span style={{
              position: 'absolute', top: -5, right: -5,
              width: 16, height: 16,
              background: '#3a6ff7', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: '#fff', fontWeight: 700, lineHeight: 1,
            }}>1</span>
          </div>
        </div>
      )}

      <textarea
        className="nodrag nopan nowheel"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKey}
        placeholder={sourceThumbnailUrl ? '描述你想从图片中提取什么，例如：反推镜头语言、色调、角色描述…' : '写下你想讲的故事、场景或角色设定。例如：一个来自未来的机器人，在城市屋顶看星星。'}
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
            disabled={!active || disabled || loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 8, border: 'none',
              cursor: (active && !disabled && !loading) ? 'pointer' : 'not-allowed',
              background: loading ? '#252525' : (active && !disabled ? '#3a6ff7' : '#252525'),
              color: loading ? '#3a6ff7' : (active && !disabled ? '#fff' : '#444'),
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {loading ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                  strokeDasharray="22" strokeDashoffset="8" />
              </svg>
            ) : (
              <ArrowUp size={14} />
            )}
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

/* ── Toolbar helpers ─────────────────────────────────────────── */

const toolbarBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6,
  background: 'transparent', border: 'none', cursor: 'pointer',
  flexShrink: 0, transition: 'background 0.1s',
}

function ToolbarDivider() {
  return <div style={{ width: 1, height: 18, background: '#2e2e2e', margin: '0 3px', flexShrink: 0 }} />
}

/** Wrap selected text with `marker` on both sides (e.g. ** for bold). */
function wrapSelection(
  ta: HTMLTextAreaElement | null,
  marker: string,
  setText: (v: string) => void,
) {
  if (!ta) return
  const { selectionStart, selectionEnd, value } = ta
  const selected = value.slice(selectionStart, selectionEnd)
  const newVal = value.slice(0, selectionStart) + marker + selected + marker + value.slice(selectionEnd)
  setText(newVal)
  requestAnimationFrame(() => {
    ta.setSelectionRange(selectionStart + marker.length, selectionEnd + marker.length)
    ta.focus()
  })
}

/** Prefix the current line with `prefix`. */
function prefixLine(
  ta: HTMLTextAreaElement | null,
  prefix: string,
  setText: (v: string) => void,
) {
  if (!ta) return
  const { selectionStart, selectionEnd, value } = ta
  const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
  const newVal = value.slice(0, lineStart) + prefix + value.slice(lineStart)
  setText(newVal)
  requestAnimationFrame(() => {
    ta.setSelectionRange(selectionStart + prefix.length, selectionEnd + prefix.length)
    ta.focus()
  })
}

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
  const [genProgress, setGenProgress] = useState(0)
  const [prompt, setPrompt]       = useState(data.initialPrompt ?? '')
  const [focused, setFocused]     = useState(false)
  const [editing, setEditing]     = useState(false)   // content mode: double-click enters edit
  const [isHovered, setIsHovered] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(!data.hideQuickActions)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)

  const taRef    = useRef<HTMLTextAreaElement>(null)
  const editTaRef = useRef<HTMLTextAreaElement>(null)   // textarea for content edit mode
  const abortRef = useRef<AbortController | null>(null)

  const addNode = useProjectStore(s => s.addNode)
  const addEdge = useProjectStore(s => s.addEdge)
  const updateNode = useProjectStore(s => s.updateNode)
  const allEdges = useProjectStore(s => s.edges)
  const allNodes = useProjectStore(s => s.nodes)

  const nodeLabel = data.title || data.label || '文本'

  // Dynamically resolve source image from connected upstream ImageNodes
  // Falls back to data.config.sourceImageUrl (set via NodeAddMenu at creation time)
  const [sourceImageRef, setSourceImageRef] = useState<string | undefined>(
    data.config?.sourceImageUrl as string | undefined
  )

  useEffect(() => {
    const incomingEdges = allEdges.filter(e => e.target === data.id)
    const upstreamImageUrl = incomingEdges
      .map(e => allNodes.find(n => n.id === e.source))
      .filter((n): n is NonNullable<typeof n> => !!n && n.type === 'libtv_image' && !!n.imageUrl)
      .map(n => n.imageUrl as string)
      .find(u => u && u !== 'placeholder')  // skip default placeholder

    if (upstreamImageUrl) {
      setSourceImageRef(upstreamImageUrl)
    } else {
      // Fall back to static config value if no live upstream image
      const configRef = data.config?.sourceImageUrl as string | undefined
      setSourceImageRef(configRef)
    }
  }, [allEdges, allNodes, data.id, data.config?.sourceImageUrl])

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!sourceImageRef) { setThumbnailUrl(null); return }
    let revoke: string | null = null
    let cancelled = false
    resolveImageUrl(sourceImageRef).then(url => {
      if (cancelled) return
      setThumbnailUrl(url)
      if (url?.startsWith('blob:')) revoke = url
    })
    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [sourceImageRef])

  // Expanded when selected (but NOT while dragging) OR in an "active" mode
  const isExpanded = (selected && !dragging) || mode === 'write' || mode === 'generating'

  // Handles visible when hovered or selected (or in active modes)
  const handlesVisible = isHovered || (selected && !dragging) || mode === 'generating'

  // handle Y positions — adapt to collapsed/expanded card height
  const idleCardH      = IDLE_CARD_H
  const idleHandleY    = TITLE_H + idleCardH / 2
  const writeHandleY   = TITLE_H + WRITE_CARD_MIN_H / 2
  const genHandleY     = TITLE_H + GEN_CARD_H / 2
  const contentHandleY = TITLE_H + CONTENT_CARD_MIN_H / 2

  // Deselecting while in write mode exits editing (blur the textarea)
  useEffect(() => {
    if (mode === 'write' && !selected && focused) {
      taRef.current?.blur()
      setFocused(false)
    }
  }, [selected, mode, focused])

  // Exit content editing when node gets deselected
  useEffect(() => {
    if (!selected && editing) {
      setEditing(false)
    }
  }, [selected, editing])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const startGenerate = useCallback((promptOverride?: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setMode('generating')
    setStream('')
    setShimmer(true)
    setGenProgress(0)

    const userPrompt = (promptOverride ?? prompt).trim() || '根据当前内容生成脚本'

    addLog({ level: 'info', category: 'ai', message: `开始生成脚本`, detail: userPrompt })
    addLog({ level: 'info', category: 'operation', message: `脚本生成: 开始`, detail: `节点ID: ${data.id}` })

    // Simulate progress ticking up to ~85% during shimmer/stream, then jump to 100 on done
    let progressVal = 0
    const progressInterval = setInterval(() => {
      if (ctrl.signal.aborted) { clearInterval(progressInterval); return }
      progressVal = Math.min(progressVal + Math.random() * 4 + 1, 88)
      setGenProgress(Math.round(progressVal))
    }, 300)

    // Give shimmer a moment to appear, then start streaming
    // Also resolve the source image to a data URL (for AI vision) during this delay
    const imageRefSnapshot = sourceImageRef
    setTimeout(async () => {
      if (ctrl.signal.aborted) return
      setShimmer(false)

      // Resolve idb:// reference → base64 data URL for AI vision (or null if no image)
      let imageDataUrl: string | null = null
      if (imageRefSnapshot) {
        imageDataUrl = await resolveImageToDataUrl(imageRefSnapshot)
        if (imageDataUrl) {
          addLog({ level: 'info', category: 'ai', message: '已附加上游图片', detail: imageRefSnapshot })
        }
      }

      let usedMock = false
      const runMock = () => {
        if (usedMock || ctrl.signal.aborted) return
        usedMock = true
        mockGenerate(
          c => setStream(prev => prev + c),
          () => {
            clearInterval(progressInterval)
            setGenProgress(100)
            setStream(prev => {
              setText(prev)
              updateNode(data.id, { content: prev, initialMode: 'content', initialPrompt: userPrompt })
              return prev
            })
            setMode('content')
          },
          ctrl.signal,
        )
      }

      streamAI({
        prompt: userPrompt,
        imageDataUrl,
        contextType: 'script',
        signal: ctrl.signal,
        onChunk: c => setStream(prev => prev + c),
        onDone: (stats) => {
          clearInterval(progressInterval)
          setGenProgress(100)
          setStream(prev => {
            setText(prev)
            updateNode(data.id, { content: prev, initialMode: 'content', initialPrompt: userPrompt })
            return prev
          })
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
  }, [prompt, data.id, sourceImageRef, updateNode])

  const stopGenerate = useCallback(() => {
    abortRef.current?.abort()
    addLog({ level: 'warn', category: 'ai', message: '用户中止脚本生成' })
    if (streamText) {
      setText(streamText)
      updateNode(data.id, { content: streamText, initialMode: 'content' })
      setMode('content')
    } else setMode('idle')
  }, [streamText, data.id, updateNode])

  const handleSend = useCallback(() => {
    if (!prompt.trim()) return
    // In content mode, pass existing text as context so AI can modify/extend it
    const fullPrompt = mode === 'content' && text.trim()
      ? `现有内容：\n${text}\n\n新指令：${prompt}`
      : prompt
    startGenerate(fullPrompt)
  }, [prompt, text, mode, startGenerate])

  const handleQuickAction = useCallback((id: string) => {
    if (id === 'write') {
      setMode('write')
      addLog({ level: 'info', category: 'operation', message: `剧本节点: 进入编写模式`, detail: `节点ID: ${data.id}` })
      return
    }
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
      addLog({ level: 'info', category: 'operation', message: `添加分镜脚本节点`, detail: `源节点ID: ${data.id}` })
      return
    }
    if (id === 'img2prompt') {
      // Create an ImageNode upstream (to the left), connected to this ScriptNode
      const imgNodeId = `libtv_image_${Date.now()}`
      addNode({
        id: imgNodeId,
        type: 'libtv_image' as NodeData['type'],
        label: '图片',
        category: 'output',
        position: { x: data.position.x - 480, y: data.position.y },
        config: {},
        imageSource: 'uploaded',
        imageUrl: DEFAULT_IMAGE_URL,
      } as NodeData)
      addEdge({ id: `e-${imgNodeId}-${data.id}`, source: imgNodeId, target: data.id })
      setPrompt('根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。')
      addLog({ level: 'info', category: 'operation', message: `添加图片节点（图片反推提示词）`, detail: `目标节点ID: ${data.id}` })
      return
    }
    startGenerate()
  }, [startGenerate, addNode, addEdge, setPrompt, data.id, data.position])

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
            {/* Preview area — fills full card height when quick actions are hidden */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: (showQuickActions && !prompt.trim() && !sourceImageRef) ? 150 : IDLE_CARD_H,
              background: '#252525',
            }}>
              <LinesIcon />
            </div>

            {/* Quick actions — always visible */}
            {/* Quick actions — hidden when a prompt or source image is already set */}
            {showQuickActions && !prompt.trim() && !sourceImageRef && (
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
            <ZoomInvariantPanel naturalWidth={NODE_W}>
              <PromptPanel value={prompt} onChange={setPrompt} onSend={handleSend} sourceThumbnailUrl={thumbnailUrl} />
            </ZoomInvariantPanel>
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
          {/* Download button — floats above when selected AND has text */}
          {selected && !dragging && text.trim().length > 0 && (
            <div style={{
              position: 'absolute', top: -52, left: '50%',
              transform: 'translateX(-50%)', zIndex: 10,
            }}>
              <button
                className="nodrag nopan"
                onClick={() => {
                  const blob = new Blob([text], { type: 'text/plain' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${nodeLabel}.txt`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44,
                  background: '#2a2a2a', border: 'none',
                  borderRadius: 12, cursor: 'pointer', color: '#ccc',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = '#ccc' }}
              >
                <Download size={18} />
              </button>
            </div>
          )}

          <div
            onDoubleClick={() => { setFocused(true); setTimeout(() => taRef.current?.focus(), 0) }}
            style={{
              background: '#161616',
              border: focused
                ? '1.5px solid #555'
                : (selected && !dragging) ? '1.5px solid #484848'
                : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2a2a2a',
              borderRadius: 14,
              minHeight: WRITE_CARD_MIN_H,
              position: 'relative',
              cursor: focused ? 'text' : 'grab',
              overflow: 'hidden',
              transition: 'border-color 150ms ease',
            }}
          >
            {/* Placeholder (empty + not editing) */}
            {!text && !focused && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: '18px 20px', gap: 18,
                pointerEvents: 'none',
              }}>
                <span style={{ fontSize: 14, color: '#555', lineHeight: 1.6, alignSelf: 'flex-start' }}>
                  请编写内容，开始你的创作。
                </span>
                <LinesIcon scale={0.75} />
              </div>
            )}

            <textarea
              ref={taRef}
              className="nodrag nopan nowheel"
              placeholder=""
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={{
                position: 'relative', zIndex: 1,
                width: '100%', minHeight: WRITE_CARD_MIN_H,
                // Only pointer-interactive when focused
                pointerEvents: focused ? 'auto' : 'none',
                boxSizing: 'border-box',
                background: 'transparent', border: 'none', outline: 'none',
                color: '#e0e0e0', fontSize: 15, lineHeight: 1.7,
                padding: '18px 20px',
                resize: 'none', fontFamily: 'inherit',
              }}
            />

            {/* Pencil hint — bottom right when hovered and not focused */}
            {isHovered && !focused && (
              <div style={{
                position: 'absolute', bottom: 10, right: 12,
                pointerEvents: 'none',
              }}>
                <PenLine size={13} color="#444" />
              </div>
            )}
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
            border: '1.5px solid #2e2e2e',
            borderRadius: 14,
            height: GEN_CARD_H,
            overflow: 'hidden',
            position: 'relative',
          }}>
            {showShimmer ? (
              <ShimmerLines />
            ) : (
              <div style={{ padding: '20px 20px 0', height: GEN_CARD_H - 20, overflow: 'hidden' }}>
                <p style={{
                  margin: 0, color: '#d0d0d0', fontSize: 15,
                  lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {streamText}<Cursor />
                </p>
              </div>
            )}

            {/* Progress pill — centered at bottom of card */}
            <div style={{
              position: 'absolute', bottom: 14, left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(20,20,20,0.88)',
              border: '1px solid #2a2a2a',
              borderRadius: 20,
              padding: '5px 12px',
              backdropFilter: 'blur(4px)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}>
              {/* Spinning dot */}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
                style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
                <circle cx="5" cy="5" r="3.5" stroke="#3a6ff7" strokeWidth="1.5"
                  strokeLinecap="round" strokeDasharray="14" strokeDashoffset="5" />
              </svg>
              <span style={{ fontSize: 12, color: '#888', fontWeight: 500 }}>
                生成中 {genProgress}%...
              </span>
            </div>
          </div>

          {/* PromptPanel always visible during generation, send button shows spinner */}
          <ZoomInvariantPanel naturalWidth={NODE_W}>
            <PromptPanel
              value={prompt}
              onChange={setPrompt}
              onSend={handleSend}
              loading={true}
              sourceThumbnailUrl={thumbnailUrl}
            />
          </ZoomInvariantPanel>

          <CircleHandle type="target" position={Position.Left}  top={genHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
          <CircleHandle type="source" position={Position.Right} top={genHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ CONTENT ══════════ */}
      {mode === 'content' && (
        <>
          {/* Toolbar — floats above node when in editing state (zoom-invariant) */}
          {editing && (
            <ZoomInvariantPanel naturalWidth={NODE_W}>
              <div
                className="nodrag nopan"
                style={{
                  marginBottom: 8,
                  display: 'flex', alignItems: 'center', gap: 2,
                  background: '#1e1e1e',
                  border: '1px solid #333',
                  borderRadius: 10,
                  padding: '6px 10px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  flexWrap: 'wrap',
                }}
              >
                {/* Heading group */}
                {(['H1','H2','H3','¶'] as const).map((t, i) => (
                  <button
                    key={t}
                    className="nodrag nopan"
                    title={t === '¶' ? '正文' : `标题 ${t.slice(1)}`}
                    onMouseDown={e => {
                      e.preventDefault()
                      const ta = editTaRef.current
                      if (!ta) return
                      const { selectionStart, selectionEnd, value } = ta
                      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1
                      const prefix = t === '¶' ? '' : `${'#'.repeat(Number(t.slice(1)))} `
                      // Strip existing heading markers
                      const lineText = value.slice(lineStart)
                      const stripped = lineText.replace(/^#{1,3}\s/, '')
                      const newVal = value.slice(0, lineStart) + prefix + stripped
                      setText(newVal)
                      requestAnimationFrame(() => {
                        const offset = newVal.length - value.length
                        ta.setSelectionRange(selectionStart + offset, selectionEnd + offset)
                        ta.focus()
                      })
                    }}
                    style={toolbarBtnStyle}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#ccc', letterSpacing: t === '¶' ? 0 : -0.3 }}>{t}</span>
                  </button>
                ))}

                <ToolbarDivider />

                {/* Bold / Italic */}
                <button className="nodrag nopan" title="加粗" onMouseDown={e => { e.preventDefault(); wrapSelection(editTaRef.current, '**', setText) }}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><Bold size={13} color="#ccc" /></button>
                <button className="nodrag nopan" title="斜体" onMouseDown={e => { e.preventDefault(); wrapSelection(editTaRef.current, '*', setText) }}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><Italic size={13} color="#ccc" /></button>

                <ToolbarDivider />

                {/* Lists */}
                <button className="nodrag nopan" title="无序列表" onMouseDown={e => { e.preventDefault(); prefixLine(editTaRef.current, '- ', setText) }}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><List size={13} color="#ccc" /></button>
                <button className="nodrag nopan" title="有序列表" onMouseDown={e => { e.preventDefault(); prefixLine(editTaRef.current, '1. ', setText) }}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><ListOrdered size={13} color="#ccc" /></button>

                <ToolbarDivider />

                {/* Divider insert */}
                <button className="nodrag nopan" title="插入分隔线" onMouseDown={e => {
                  e.preventDefault()
                  const ta = editTaRef.current
                  if (!ta) return
                  const { selectionStart, value } = ta
                  const ins = '\n---\n'
                  const newVal = value.slice(0, selectionStart) + ins + value.slice(selectionStart)
                  setText(newVal)
                  requestAnimationFrame(() => { ta.setSelectionRange(selectionStart + ins.length, selectionStart + ins.length); ta.focus() })
                }}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><Minus size={13} color="#ccc" /></button>

                <ToolbarDivider />

                {/* Copy */}
                <button className="nodrag nopan" title="复制全文" onMouseDown={e => { e.preventDefault(); navigator.clipboard.writeText(text) }}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><Copy size={13} color="#ccc" /></button>
                {/* Maximize placeholder */}
                <button className="nodrag nopan" title="全屏（暂未实现）" onMouseDown={e => e.preventDefault()}
                  style={toolbarBtnStyle}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e2e2e' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                ><Maximize2 size={13} color="#ccc" /></button>
              </div>
            </ZoomInvariantPanel>
          )}

          {/* Download button — floats above when selected AND has text AND not editing */}
          {!editing && selected && !dragging && text.trim().length > 0 && (
            <div style={{
              position: 'absolute', top: -52, left: '50%',
              transform: 'translateX(-50%)', zIndex: 10,
            }}>
              <button
                className="nodrag nopan"
                onClick={() => {
                  const blob = new Blob([text], { type: 'text/plain' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${nodeLabel}.txt`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 44, height: 44,
                  background: '#2a2a2a', border: 'none',
                  borderRadius: 12, cursor: 'pointer', color: '#ccc',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'; (e.currentTarget as HTMLButtonElement).style.color = '#ccc' }}
              >
                <Download size={18} />
              </button>
            </div>
          )}

          <div
            onDoubleClick={() => {
              setEditing(true)
              requestAnimationFrame(() => { editTaRef.current?.focus() })
            }}
            style={{
              background: '#1a1a1a',
              border: editing
                ? '1.5px solid #555'
                : (selected && !dragging) ? '1.5px solid #707070'
                : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #333',
              borderRadius: 14,
              minHeight: CONTENT_CARD_MIN_H,
              maxHeight: 400,
              position: 'relative',
              overflow: 'hidden',
              transition: 'border-color 150ms ease',
              cursor: editing ? 'text' : 'grab',
            }}
          >
            {editing ? (
              /* ── Edit textarea ── */
              <textarea
                ref={editTaRef}
                className="nodrag nopan nowheel"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation()
                  if (e.key === 'Escape') { setEditing(false) }
                }}
                onBlur={() => {
                  setEditing(false)
                  updateNode(data.id, { content: text })
                }}
                style={{
                  display: 'block',
                  width: '100%', minHeight: CONTENT_CARD_MIN_H, maxHeight: 400,
                  boxSizing: 'border-box',
                  background: 'transparent', border: 'none', outline: 'none',
                  color: '#e0e0e0', fontSize: 15, lineHeight: 1.75,
                  padding: '18px 20px',
                  resize: 'none', fontFamily: 'inherit',
                  overflowY: 'auto',
                  scrollbarWidth: 'thin', scrollbarColor: '#333 transparent',
                }}
              />
            ) : (
              /* ── Read-only rendered view ── */
              <div
                className="nowheel"
                style={{
                  padding: '20px 22px',
                  maxHeight: 400,
                  overflowY: 'auto',
                  boxSizing: 'border-box',
                  scrollbarWidth: 'thin',
                  scrollbarColor: '#333 transparent',
                }}
              >
                {(() => {
                  const lines = text.split('\n')
                  const firstLine = lines[0]?.trim()
                  const rest = lines.slice(1).join('\n').trim()
                  return (
                    <>
                      {firstLine && (
                        <p style={{
                          margin: '0 0 14px 0',
                          color: '#e8e8e8', fontSize: 15,
                          fontWeight: 700, lineHeight: 1.6,
                        }}>
                          {firstLine}
                        </p>
                      )}
                      {rest && (
                        <p style={{
                          margin: 0,
                          color: '#c0c0c0', fontSize: 14,
                          lineHeight: 1.8, whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}>
                          {rest}
                        </p>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>

          <CollapsibleSection expanded={isExpanded}>
            <ZoomInvariantPanel naturalWidth={NODE_W}>
              <PromptPanel value={prompt} onChange={setPrompt} onSend={handleSend} sourceThumbnailUrl={thumbnailUrl} />
            </ZoomInvariantPanel>
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
