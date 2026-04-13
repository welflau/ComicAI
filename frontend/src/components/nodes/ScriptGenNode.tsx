import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps, useStore } from 'reactflow'
import {
  ScrollText, RotateCcw, Square,
  ChevronDown, Languages, Zap, ArrowUp, CheckCircle2,
  AlignJustify, PlaySquare, User, Download, Maximize2, Film, TableProperties,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'
import CollapsibleSection from './shared/CollapsibleSection'
import NodeAddMenu from './shared/NodeAddMenu'
import { useIsMultiSelected } from './shared/useIsMultiSelected'
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

export interface ShotRow {
  id: string | number
  sequence: number
  duration: number
  description: string
  character1?: string
  character1Detail?: string
  shotType?: string
  reference?: boolean
}

const NODE_W             = 520
const TITLE_H            = 28
const IDLE_PREVIEW_H     = 150
const GEN_CARD_MIN_H     = 300
const CONTENT_CARD_MIN_H = 220

/* ── Quick actions ───────────────────────────────────────────── */

const QUICK_ACTIONS = [
  { id: 'generate',   Icon: AlignJustify, label: '剧本生成分镜脚本' },
  { id: 'text2video', Icon: PlaySquare,   label: '视频参考生成分镜脚本' },
  { id: 'img2script', Icon: User,         label: '角色生成分镜脚本' },
]

/* ── Mock shot data (fallback) ───────────────────────────────── */

const MOCK_SHOTS: ShotRow[] = [
  {
    id: 1, sequence: 1, duration: 3.5,
    description: '1967年冬，大兴安岭红岸基地在风雪中巍然矗立，巨大的抛物面天线指向苍穹。',
    character1: '', character1Detail: '',
    shotType: '特\nUp',
  },
  {
    id: 2, sequence: 2, duration: 3.5,
    description: '巨型抛物面天线特写，像一只巨轮深渊的眼眸。',
    character1: '', character1Detail: '',
    shotType: '特\nUp',
  },
  {
    id: 3, sequence: 3, duration: 4,
    description: '叶文洁站在观测平台上，呼出白雾，仰望星空。',
    character1: '叶文洁',
    character1Detail: '[叶文洁: 年轻女性，约20岁，身穿厚重的六十年代军绿大衣，面容坚毅]',
    shotType: '中\nSho',
  },
  {
    id: 4, sequence: 4, duration: 4,
    description: '叶文洁的回忆: 父亲叶哲泰在批斗会上被攻击，鼻孔处流血。',
    character1: '叶哲泰',
    character1Detail: '[叶哲泰: 老年男性，满头灰白，一脸沧桑，身上被扯烂，颤抖流血。]',
    shotType: '特\nUp',
  },
  {
    id: 5, sequence: 5, duration: 3.5,
    description: '母亲站在人群中高举拳头，面容轻蔑，喊着口号。',
    character1: '妈妈',
    character1Detail: '[妈妈: 中年女性，穿着笔挺的深灰色军装，手举口号牌，面容冷漠。]',
    shotType: '中\nClo',
  },
  {
    id: 6, sequence: 6, duration: 3.5,
    description: '铜扣皮带在空中挥舞，抽打在叶哲泰身上。',
    character1: '', character1Detail: '',
    shotType: '极\n',
  },
]

const MOCK_SCENE_TITLE = '红岸基地：第一声啼鸣'

/* ── Parse AI JSON response into ShotRow[] ───────────────────── */

function parseShots(raw: string): ShotRow[] | null {
  try {
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) return null
    const arr = JSON.parse(match[0])
    if (!Array.isArray(arr) || arr.length === 0) return null
    return arr.map((item: Record<string, unknown>, i: number) => ({
      id: i + 1,
      sequence: Number(item.sequence ?? i + 1),
      duration: Number(item.duration ?? 3.5),
      description: String(item.description ?? ''),
      character1: String(item.character1 ?? ''),
      character1Detail: String(item.character1Detail ?? ''),
      shotType: String(item.shotType ?? item.shot_type ?? ''),
    }))
  } catch {
    return null
  }
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

/* ── Storyboard Table ────────────────────────────────────────── */

function StoryboardTable({ shots, sceneTitle }: { shots: ShotRow[]; sceneTitle: string }) {
  return (
    <div style={{ overflow: 'hidden' }}>
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '28px 36px 1fr 60px 72px 40px 36px 40px',
        padding: '5px 8px',
        borderBottom: '1px solid #2a2a2a',
        background: '#161616',
      }}>
        {['编号', '时长', '画面描述', '角色1', '角色描述1', '角色图1', '参考', '景别'].map(h => (
          <div key={h} style={{ fontSize: 10, color: '#555', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {shots.length === 0 ? (
        <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: '#444' }}>
          暂无分镜数据
        </div>
      ) : shots.map((shot, idx) => (
        <div
          key={shot.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '28px 36px 1fr 60px 72px 40px 36px 40px',
            padding: '5px 8px',
            borderBottom: '1px solid #222',
            background: idx % 2 === 0 ? '#1a1a1a' : '#181818',
            alignItems: 'start',
          }}
        >
          <div style={{ fontSize: 10, color: '#777' }}>{shot.sequence}</div>
          <div style={{ fontSize: 10, color: '#777' }}>{shot.duration}</div>
          <div style={{ fontSize: 10, color: '#ccc', lineHeight: 1.5, paddingRight: 4 }}>{shot.description}</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>{shot.character1 || ''}</div>
          <div style={{ fontSize: 9, color: '#777', lineHeight: 1.4, maxHeight: 48, overflow: 'hidden' }}>
            {shot.character1Detail || ''}
          </div>
          {/* 角色图1 — placeholder */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2 }}>
            <div style={{
              width: 24, height: 24, border: '1px solid #333', borderRadius: 3,
              background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={10} color="#444" />
            </div>
          </div>
          {/* 参考 — placeholder */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2 }}>
            <div style={{
              width: 20, height: 20, border: '1px solid #333', borderRadius: 2,
              background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Film size={8} color="#444" />
            </div>
          </div>
          <div style={{ fontSize: 9, color: '#555', lineHeight: 1.4, whiteSpace: 'pre-line' }}>
            {shot.shotType || ''}
          </div>
        </div>
      ))}
    </div>
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

/* ── Main component ──────────────────────────────────────────── */

function ScriptGenNode({ data, selected, dragging }: NodeProps<ScriptGenNodeData>) {
  const isMultiSelected = useIsMultiSelected()
  const effectiveSelected = selected && !isMultiSelected
  const [, , zoom] = useStore(s => s.transform)
  const floatScale = 1 / zoom

  // Read content from all upstream (incoming) nodes connected to this node
  const upstreamContent = useStore(s => {
    const incoming = s.edges.filter(e => e.target === data.id)
    const texts: string[] = []
    for (const edge of incoming) {
      const node = s.nodeInternals.get(edge.source)
      if (node?.data?.content) texts.push(node.data.content as string)
    }
    return texts.join('\n\n').trim()
  })

  const [mode, setMode]           = useState<Mode>(data.initialMode ?? 'idle')
  const [text, setText]           = useState(data.content ?? '')
  const [streamText, setStream]   = useState('')
  const [showShimmer, setShimmer] = useState(false)
  const [prompt, setPrompt]       = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)
  const [shots, setShots]         = useState<ShotRow[]>([])
  const [sceneTitle, setSceneTitle] = useState(MOCK_SCENE_TITLE)
  const [warning, setWarning]     = useState<string | null>(null)

  const abortRef   = useRef<AbortController | null>(null)
  const warnTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nodeLabel  = data.title || data.label || '分镜脚本'

  const addNode = useProjectStore(s => s.addNode)
  const addEdge = useProjectStore(s => s.addEdge)

  const showWarning = useCallback((msg: string) => {
    setWarning(msg)
    if (warnTimer.current) clearTimeout(warnTimer.current)
    warnTimer.current = setTimeout(() => setWarning(null), 3000)
  }, [])

  // Expanded when selected (but NOT while dragging) OR in active mode
  const isExpanded = (effectiveSelected && !dragging) || mode === 'generating'
  // Handles visible when hovered or selected (or active)
  const handlesVisible = isHovered || (effectiveSelected && !dragging) || mode === 'generating'

  // handle Y — idle: preview + quick-actions always visible; prompt panel only when expanded
  const QUICK_ACTIONS_H = showQuickActions ? (44 + QUICK_ACTIONS.length * 36) : 0
  const PROMPT_PANEL_H  = 118
  const idleHandleY    = TITLE_H + (IDLE_PREVIEW_H + QUICK_ACTIONS_H + (isExpanded ? PROMPT_PANEL_H : 0)) / 2
  const genHandleY     = TITLE_H + GEN_CARD_MIN_H / 2
  const contentHandleY = TITLE_H + CONTENT_CARD_MIN_H / 2

  const startGenerate = useCallback((promptOverride?: string, triggerLabel?: string) => {
    const userPrompt = (promptOverride ?? prompt).trim()

    // ── Log: user triggered generation ──
    addLog({
      level: 'info', category: 'operation',
      message: `触发分镜脚本生成${triggerLabel ? ` — ${triggerLabel}` : ''}`,
    })

    // ── Log: check inputs ──
    if (!upstreamContent && !userPrompt) {
      addLog({
        level: 'warn', category: 'operation',
        message: '输入检查失败 — 无上游剧本且无用户输入',
        detail: '需要至少一个输入：连接剧本节点，或在输入框中描述剧情',
      })
      showWarning('请先连接剧本节点，或在输入框中描述剧情内容')
      return
    }

    if (upstreamContent) {
      addLog({
        level: 'info', category: 'operation',
        message: `输入检查 — 上游剧本节点已连接 (${upstreamContent.length} 字符)`,
        detail: upstreamContent.slice(0, 400) + (upstreamContent.length > 400 ? `\n…（共 ${upstreamContent.length} 字符）` : ''),
      })
    }
    if (userPrompt) {
      addLog({
        level: 'info', category: 'operation',
        message: `输入检查 — 用户提示词 (${userPrompt.length} 字符)`,
        detail: userPrompt,
      })
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setMode('generating')
    setStream('')
    setShimmer(true)

    // Build the full prompt sent to AI
    const fullPrompt = upstreamContent
      ? `以下是剧本内容：\n\n${upstreamContent}${userPrompt ? `\n\n用户要求：${userPrompt}` : '\n\n请根据以上剧本内容生成详细的分镜脚本，以JSON数组格式返回，每个分镜包含字段：sequence(序号), duration(时长秒), description(画面描述), character1(角色1名), character1Detail(角色1描述), shotType(景别，如"特写"/"中景"/"近景"等)。'}`
      : `${userPrompt}\n\n请生成详细的分镜脚本，以JSON数组格式返回，每个分镜包含字段：sequence(序号), duration(时长秒), description(画面描述), character1(角色1名), character1Detail(角色1描述), shotType(景别)。`

    // ── Log: full AI prompt ──
    addLog({
      level: 'info', category: 'ai', kind: 'prompt',
      message: `发送 AI 请求 — 分镜脚本生成`,
      detail: fullPrompt.length > 600
        ? fullPrompt.slice(0, 600) + `\n…（共 ${fullPrompt.length} 字符）`
        : fullPrompt,
    })

    setTimeout(() => {
      if (ctrl.signal.aborted) return
      setShimmer(false)

      let usedMock = false
      const runMock = (reason: string) => {
        if (usedMock || ctrl.signal.aborted) return
        usedMock = true
        addLog({ level: 'warn', category: 'ai', message: '分镜生成: 使用模拟内容', detail: `原因: ${reason}` })
        setShots(MOCK_SHOTS)
        setSceneTitle(MOCK_SCENE_TITLE)
        setMode('content')
      }

      streamAI({
        prompt: fullPrompt,
        contextType: 'storyboard',
        signal: ctrl.signal,
        onChunk: c => setStream(prev => prev + c),
        onDone: (stats) => {
          setStream(prev => {
            const parsed = parseShots(prev)
            if (parsed && parsed.length > 0) {
              setShots(parsed)
              addLog({
                level: 'info', category: 'ai', kind: 'response',
                message: `分镜脚本生成完成 — ${parsed.length} 个镜头，${stats ? `${stats.chars} 字符，耗时 ${(stats.elapsed / 1000).toFixed(1)}s` : ''}`,
                detail: prev.length > 400 ? prev.slice(0, 400) + `\n…（共 ${prev.length} 字符）` : prev,
              })
            } else {
              addLog({
                level: 'warn', category: 'ai', kind: 'response',
                message: `分镜解析失败，使用模拟数据`,
                detail: `AI 原始输出 (${prev.length} 字符):\n${prev.slice(0, 400)}${prev.length > 400 ? '…' : ''}`,
              })
              setShots(MOCK_SHOTS)
              setSceneTitle(MOCK_SCENE_TITLE)
            }
            setText(prev)
            return prev
          })
          setMode('content')
        },
        onError: (err) => {
          addLog({ level: 'warn', category: 'ai', message: 'AI 不可用，使用模拟内容', detail: err })
          runMock(err)
        },
      }).catch((err) => {
        if (ctrl.signal.aborted) return
        addLog({ level: 'warn', category: 'ai', message: 'AI 请求失败，使用模拟内容', detail: String(err) })
        runMock(String(err))
      })
    }, 400)
  }, [prompt, upstreamContent, showWarning])

  const stopGenerate = useCallback(() => {
    abortRef.current?.abort()
    addLog({ level: 'warn', category: 'operation', message: '用户手动停止生成',
      detail: streamText ? `已生成 ${streamText.length} 字符` : '尚未生成任何内容' })
    addLog({ level: 'warn', category: 'ai', message: '分镜脚本生成已中止' })
    if (shots.length > 0 || streamText) { setMode('content') }
    else setMode('idle')
  }, [streamText, shots])

  const handleSend = useCallback(() => {
    if (!prompt.trim() && !upstreamContent) {
      showWarning('请先连接剧本节点，或在输入框中描述剧情内容')
      return
    }
    startGenerate(prompt, '用户点击发送')
  }, [prompt, upstreamContent, startGenerate, showWarning])

  const handleQuickAction = useCallback((id: string) => {
    const labelMap: Record<string, string> = {
      generate: '剧本生成分镜脚本',
      text2video: '视频参考生成分镜脚本',
      img2script: '角色生成分镜脚本',
    }
    addLog({
      level: 'info', category: 'operation',
      message: `点击快捷操作 — ${labelMap[id] ?? id}`,
    })
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
      setShowQuickActions(false)
      setPrompt('根据我上传的剧本，生成一个完整的故事脚本')
      addLog({ level: 'info', category: 'operation', message: '已创建并连接新剧本节点' })
      return
    }
    if (id === 'manual') { /* TODO: switch to write mode */ return }
    startGenerate(undefined, labelMap[id] ?? id)
  }, [startGenerate, addNode, addEdge, data.id, data.position])

  useEffect(() => () => {
    abortRef.current?.abort()
    if (warnTimer.current) clearTimeout(warnTimer.current)
  }, [])

  return (
    <div
      style={{
        position: 'relative',
        width: NODE_W,
        fontFamily: 'Inter, system-ui, sans-serif',
        cursor: mode === 'generating' ? 'default' : (effectiveSelected && !dragging) ? 'default' : dragging ? 'grabbing' : 'grab',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Title */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: TITLE_H, paddingLeft: 2, paddingBottom: 6,
      }}>
        <ScrollText size={13} color="#888" />
        <span style={{ fontSize: 13, color: '#bbb', fontWeight: 500 }}>{nodeLabel}</span>
        {/* Upstream indicator */}
        {upstreamContent && (
          <span style={{
            marginLeft: 4, fontSize: 10, color: '#4ade80',
            background: 'rgba(74,222,128,0.1)', borderRadius: 4,
            padding: '1px 6px', display: 'inline-flex', alignItems: 'center', gap: 3,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
            已连接剧本
          </span>
        )}
      </div>

      {/* Warning toast — zoom-invariant, appears above the card */}
      {warning && (
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            top: -(36 + 8) * floatScale,
            left: '50%',
            transformOrigin: 'top center',
            transform: `translateX(-50%) scale(${floatScale})`,
            background: '#2a1a1a',
            border: '1px solid #6b2f2f',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 12,
            color: '#f87171',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 7,
            pointerEvents: 'none',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {warning}
        </div>
      )}

      {/* ══════════ IDLE ══════════ */}
      {mode === 'idle' && (
        <>
          <div style={{
            background: '#1e1e1e',
            border: (effectiveSelected && !dragging) ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2e2e2e',
            borderRadius: 14,
            boxShadow: (effectiveSelected && !dragging) ? '0 0 0 2px rgba(255,255,255,0.06)' : '0 2px 12px rgba(0,0,0,0.4)',
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

            {/* Quick actions — always visible in idle */}
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

          {/* Prompt panel */}
          <CollapsibleSection expanded={isExpanded}>
            <PromptPanel
              value={prompt}
              onChange={setPrompt}
              onSend={handleSend}
            />
          </CollapsibleSection>

          <CircleHandle type="target" position={Position.Left}  top={idleHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
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

          <CircleHandle type="target" position={Position.Left}  top={genHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
          <CircleHandle type="source" position={Position.Right} top={genHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ CONTENT ══════════ */}
      {mode === 'content' && (
        <>
          {/* Floating toolbar — zoom-invariant, sits above the card */}
          <div
            className="nodrag nopan"
            style={{
              position: 'absolute',
              top: -(44 + 8) * floatScale,
              left: '50%',
              transformOrigin: 'top center',
              transform: `translateX(-50%) scale(${floatScale})`,
              display: 'flex', alignItems: 'center', gap: 2,
              background: '#1a1a1a', border: '1px solid #333',
              borderRadius: 10, padding: '4px 8px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
              zIndex: 10,
            }}
          >
            {/* 重新生成 */}
            <button
              className="nodrag nopan"
              onClick={() => startGenerate(undefined, '点击重新生成')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 10px', borderRadius: 7, color: '#aaa', fontSize: 12,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#252525'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#aaa' }}
            >
              <RotateCcw size={12} />
              重新生成
            </button>

            <div style={{ width: 1, height: 16, background: '#333' }} />

            {/* 生成分镜 — navigate/create storyboard node */}
            <button
              className="nodrag nopan"
              onClick={() => {
                addLog({ level: 'info', category: 'operation', message: '生成分镜表节点', detail: `场景: ${sceneTitle}` })
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '4px 10px', borderRadius: 7, color: '#aaa', fontSize: 12,
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#252525'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#aaa' }}
            >
              <TableProperties size={12} />
              生成分镜
            </button>

            <div style={{ width: 1, height: 16, background: '#333' }} />

            {/* Download */}
            <button
              className="nodrag nopan"
              onClick={() => {
                const content = shots.map(s =>
                  `${s.sequence}\t${s.duration}\t${s.description}\t${s.character1 || ''}\t${s.character1Detail || ''}\t${s.shotType || ''}`
                ).join('\n')
                const blob = new Blob([`编号\t时长\t画面描述\t角色1\t角色描述1\t景别\n${content}`], { type: 'text/plain' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url
                a.download = `${sceneTitle}.txt`; a.click()
                URL.revokeObjectURL(url)
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 7,
                background: 'none', border: 'none', cursor: 'pointer', color: '#888',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#252525'; e.currentTarget.style.color = '#ccc' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#888' }}
            >
              <Download size={13} />
            </button>
          </div>

          {/* Storyboard card */}
          <div style={{
            background: '#1a1a1a',
            border: (effectiveSelected && !dragging) ? '1.5px solid #707070' : isHovered ? '1.5px solid #3a3a3a' : '1px solid #2e2e2e',
            borderRadius: 8,
            boxShadow: (effectiveSelected && !dragging)
              ? '0 0 0 2px rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.5)'
              : '0 4px 20px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
          }}>
            {/* Card header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px', borderBottom: '1px solid #2a2a2a', background: '#1e1e1e',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#ccc', fontWeight: 500 }}>{sceneTitle}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', background: '#111', borderRadius: 4, padding: 2, gap: 1 }}>
                  <button
                    className="nodrag nopan"
                    style={{
                      padding: '2px 8px', borderRadius: 3, border: 'none',
                      cursor: 'pointer', fontSize: 10,
                      background: '#333', color: '#fff',
                    }}
                  >
                    脚本视图
                  </button>
                </div>
                <Maximize2 size={12} color="#666" style={{ cursor: 'pointer' }} />
              </div>
            </div>

            {/* Table */}
            <StoryboardTable shots={shots} sceneTitle={sceneTitle} />
          </div>

          {/* Prompt panel */}
          <CollapsibleSection expanded={isExpanded}>
            <PromptPanel
              value={prompt}
              onChange={setPrompt}
              onSend={handleSend}
            />
          </CollapsibleSection>

          <CircleHandle type="target" position={Position.Left}  top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
          <CircleHandle type="source" position={Position.Right} top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}
    </div>
  )
}

export default memo(ScriptGenNode)
