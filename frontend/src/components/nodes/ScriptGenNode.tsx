import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, NodeProps, useStore } from 'reactflow'
import {
  ScrollText, RotateCcw, Square,
  ChevronDown, Languages, Zap, ArrowUp, CheckCircle2,
  AlignJustify, PlaySquare, User, Download, Maximize2, Film, TableProperties,
  Image as ImageIcon, Check, LayoutGrid, List, X, FileDown,
} from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'
import CollapsibleSection from './shared/CollapsibleSection'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
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
const CONTENT_CARD_MIN_H = 384

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

/* ── Map raw object to ShotRow ───────────────────────────────────── */

function toShotRow(item: Record<string, unknown>, i: number): ShotRow {
  return {
    id: i + 1,
    sequence: Number(item.sequence ?? i + 1),
    duration: Number(item.duration ?? 3.5),
    description: String(item.description ?? ''),
    character1: String(item.character1 ?? ''),
    character1Detail: String(
      item.character1Detail ?? item.characterDetail1 ?? item.characterlDetail ?? ''
    ),
    shotType: String(item.shotType ?? item.shot_type ?? ''),
  }
}

/* ── Lenient field extractor (last-resort, no JSON.parse needed) ─── */

/**
 * Walk forward from `start` collecting characters until the first
 * unescaped double-quote, return the collected string + the position
 * of the closing quote.
 */
function readStringValue(text: string, start: number): { value: string; end: number } {
  let value = ''
  let i = start
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\\' && i + 1 < text.length) {
      const next = text[i + 1]
      // Keep common escape sequences; strip the backslash for others
      if (next === '"') { value += '"'; i += 2; continue }
      if (next === '\\') { value += '\\'; i += 2; continue }
      if (next === 'n') { value += '\n'; i += 2; continue }
      if (next === 't') { value += '\t'; i += 2; continue }
      value += next; i += 2; continue
    }
    if (ch === '"') return { value, end: i }
    value += ch
    i++
  }
  return { value, end: i }
}

function extractStr(chunk: string, ...fields: string[]): string {
  for (const field of fields) {
    // Match: "field"\s*:\s*"<value>"
    const re = new RegExp(`"${field}"\\s*:\\s*"`)
    const m = re.exec(chunk)
    if (m) {
      const { value } = readStringValue(chunk, m.index + m[0].length)
      if (value) return value
    }
  }
  return ''
}

function extractNum(chunk: string, field: string, fallback: number): number {
  const m = new RegExp(`"${field}"\\s*:\\s*([\\d.]+)`).exec(chunk)
  return m ? parseFloat(m[1]) : fallback
}

/**
 * Last-resort parser: find each shot by locating "sequence": N markers,
 * then extract fields individually — works even if the overall JSON
 * structure is broken (unescaped quotes, trailing commas, etc.)
 */
function parseShotsLenient(text: string): ShotRow[] | null {
  const seqRe = /"sequence"\s*:\s*(\d+)/g
  const markers: Array<{ index: number; seq: number }> = []
  let sm: RegExpExecArray | null
  while ((sm = seqRe.exec(text)) !== null) {
    markers.push({ index: sm.index, seq: parseInt(sm[1]) })
  }
  if (markers.length === 0) return null

  const shots: ShotRow[] = markers.map(({ index, seq }, i) => {
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length
    const chunk = text.slice(index, end)
    return {
      id: i + 1,
      sequence: seq,
      duration: extractNum(chunk, 'duration', 3.5),
      description: extractStr(chunk, 'description'),
      character1: extractStr(chunk, 'character1'),
      character1Detail: extractStr(chunk, 'character1Detail', 'characterDetail1'),
      shotType: extractStr(chunk, 'shotType', 'shot_type'),
    }
  })
  return shots.length > 0 ? shots : null
}

/* ── Parse AI JSON response into ShotRow[] ───────────────────── */

function parseShots(raw: string): { shots: ShotRow[] | null; error: string } {
  const errors: string[] = []

  // 1. Strip ``` code fences
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  // Find the first balanced [...] block
  const arrayStart = stripped.indexOf('[')
  let jsonStr = stripped
  if (arrayStart !== -1) {
    let depth = 0, arrayEnd = -1
    for (let i = arrayStart; i < stripped.length; i++) {
      if (stripped[i] === '[') depth++
      else if (stripped[i] === ']') { depth--; if (depth === 0) { arrayEnd = i; break } }
    }
    if (arrayEnd !== -1) jsonStr = stripped.slice(arrayStart, arrayEnd + 1)
  }

  // 2. Try direct JSON.parse
  try {
    const v = JSON.parse(jsonStr)
    if (Array.isArray(v) && v.length > 0)
      return { shots: v.map((item, i) => toShotRow(item as Record<string, unknown>, i)), error: '' }
    errors.push(`JSON.parse 成功但结果不是非空数组 (type=${typeof v})`)
  } catch (e) {
    errors.push(`JSON.parse 失败: ${String(e)}`)
  }

  // 3. Try removing trailing commas, then parse
  try {
    const fixed = jsonStr.replace(/,\s*([\]}])/g, '$1')
    const v = JSON.parse(fixed)
    if (Array.isArray(v) && v.length > 0)
      return { shots: v.map((item, i) => toShotRow(item as Record<string, unknown>, i)), error: '' }
  } catch (e) {
    errors.push(`去除尾随逗号后仍失败: ${String(e)}`)
  }

  // 4. Lenient field-by-field extraction (immune to JSON syntax errors)
  const lenient = parseShotsLenient(stripped)
  if (lenient && lenient.length > 0)
    return { shots: lenient, error: '' }
  errors.push('逐字段提取也未能找到镜头数据')

  return { shots: null, error: errors.join('\n') }
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

/* ── Lib Nano Pro icon (matches ImageNode) ───────────────────── */

function LibNanoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1.5L9 5.5H13L10 8.5L11.5 12.5L7 10L2.5 12.5L4 8.5L1 5.5H5L7 1.5Z"
        fill="none" stroke="#6b8fff" strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Storyboard Table ────────────────────────────────────────── */

function StoryboardTable({
  shots, sceneTitle, selectable, selectedIds, onToggle, onToggleAll,
}: {
  shots: ShotRow[]
  sceneTitle: string
  selectable?: boolean
  selectedIds?: Set<string | number>
  onToggle?: (id: string | number) => void
  onToggleAll?: () => void
}) {
  const allSelected   = selectable && shots.length > 0 && selectedIds?.size === shots.length
  const someSelected  = selectable && (selectedIds?.size ?? 0) > 0 && !allSelected

  const cols = selectable
    ? '24px 28px 36px 1fr 60px 72px 40px 36px 40px'
    : '28px 36px 1fr 60px 72px 40px 36px 40px'

  return (
    <div style={{ overflow: 'hidden' }}>
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: cols,
        padding: '5px 8px',
        borderBottom: '1px solid #2a2a2a',
        background: '#161616',
        alignItems: 'center',
      }}>
        {/* Select-all checkbox */}
        {selectable && (
          <div
            onClick={onToggleAll}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            <div style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: (allSelected || someSelected) ? '1.5px solid #7c6af7' : '1.5px solid #444',
              background: allSelected ? '#7c6af7' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {allSelected && <Check size={9} color="#fff" />}
              {someSelected && (
                /* indeterminate dash */
                <div style={{ width: 7, height: 1.5, background: '#7c6af7', borderRadius: 1 }} />
              )}
            </div>
          </div>
        )}
        {['编号', '时长', '画面描述', '角色1', '角色描述1', '角色图1', '参考', '景别'].map((h, i) => (
          <div key={i} style={{ fontSize: 10, color: '#555', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {shots.length === 0 ? (
        <div style={{ padding: '16px 8px', textAlign: 'center', fontSize: 11, color: '#444' }}>
          暂无分镜数据
        </div>
      ) : shots.map((shot, idx) => {
        const checked = selectable && selectedIds?.has(shot.id)
        return (
          <div
            key={shot.id}
            onClick={selectable ? () => onToggle?.(shot.id) : undefined}
            style={{
              display: 'grid',
              gridTemplateColumns: cols,
              padding: '5px 8px',
              borderBottom: '1px solid #222',
              background: selectable && checked
                ? 'rgba(124,106,247,0.08)'
                : idx % 2 === 0 ? '#1a1a1a' : '#181818',
              alignItems: 'start',
              cursor: selectable ? 'pointer' : 'default',
              transition: 'background 0.1s',
            }}
          >
            {selectable && (
              <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 1 }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 3,
                  border: checked ? '1.5px solid #7c6af7' : '1.5px solid #444',
                  background: checked ? '#7c6af7' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {checked && <Check size={9} color="#fff" />}
                </div>
              </div>
            )}
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
        )
      })}
    </div>
  )
}

/* ── Fullscreen storyboard modal ─────────────────────────────── */

type FullscreenView = 'creative' | 'script'
type ScriptSubTab   = 'basic' | 'supplement'

function StoryboardFullscreenModal({
  shots, sceneTitle, onClose,
}: {
  shots: ShotRow[]
  sceneTitle: string
  onClose: () => void
}) {
  const [view, setView]         = useState<FullscreenView>('creative')
  const [subTab, setSubTab]     = useState<ScriptSubTab>('basic')
  const [viewDropOpen, setViewDropOpen] = useState(false)
  const viewDropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Close view dropdown on outside click
  useEffect(() => {
    if (!viewDropOpen) return
    const handler = (e: MouseEvent) => {
      if (viewDropRef.current && !viewDropRef.current.contains(e.target as Node)) setViewDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [viewDropOpen])

  const handleDownload = () => {
    const rows = shots.map(s =>
      [s.sequence, s.duration, s.description, s.character1 || '', s.character1Detail || '', s.shotType || ''].join('\t')
    )
    const content = ['序号\t时长\t画面描述\t角色1\t角色描述1\t景别', ...rows].join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sceneTitle || '分镜脚本'}.tsv`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = () => {
    const header = ['序号', '时长(s)', '画面描述', '角色', '角色描述', '景别'].join(',')
    const rows = shots.map(s =>
      [s.sequence, s.duration,
        `"${(s.description || '').replace(/"/g, '""')}"`,
        `"${(s.character1 || '').replace(/"/g, '""')}"`,
        `"${(s.character1Detail || '').replace(/"/g, '""')}"`,
        `"${(s.shotType || '').replace(/\n/g, ' ').replace(/"/g, '""')}"`,
      ].join(',')
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${sceneTitle || '分镜脚本'}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  /* ── Script view table columns ───────────────────────────── */
  const basicCols = [
    { label: '序号',    width: 54  },
    { label: '画面描述', width: 300 },
    { label: '角色',    width: 90  },
    { label: '角色描述', width: 190 },
    { label: '场景地点', width: 110 },
    { label: '时间',    width: 70  },
    { label: '光线',    width: 70  },
    { label: '景别',    width: 90  },
    { label: '运镜',    width: 80  },
    { label: '时长(s)', width: 66  },
    { label: '分镜图',  width: 72  },
  ]
  const suppCols = [
    { label: '序号',      width: 54  },
    { label: '画面描述',   width: 300 },
    { label: '提示词生成', width: 360 },
    { label: '导演备注',   width: 280 },
  ]
  const activeCols = subTab === 'basic' ? basicCols : suppCols

  /* ── Shared cell style ───────────────────────────────────── */
  const tdBase: React.CSSProperties = {
    padding: '10px 12px', borderBottom: '1px solid #1e1e1e', verticalAlign: 'top',
  }

  /* ── Sub-tab button ──────────────────────────────────────── */
  const subTabBtn = (id: ScriptSubTab, label: string) => (
    <button
      key={id}
      onClick={() => setSubTab(id)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 16px', height: '100%', fontSize: 12, fontWeight: 500,
        color: subTab === id ? '#e0e0e0' : '#555',
        borderBottom: subTab === id ? '2px solid #3a6ff7' : '2px solid transparent',
        transition: 'color 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => { if (subTab !== id) e.currentTarget.style.color = '#888' }}
      onMouseLeave={e => { if (subTab !== id) e.currentTarget.style.color = '#555' }}
    >{label}</button>
  )

  /* ── View label map ──────────────────────────────────────── */
  const VIEW_LABELS: Record<FullscreenView, string> = {
    creative: '创意视图',
    script:   '脚本视图',
  }
  const VIEW_ICONS: Record<FullscreenView, React.ReactNode> = {
    creative: <LayoutGrid size={12} />,
    script:   <List size={12} />,
  }

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex', alignItems: 'stretch',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#141414',
        margin: 24,
        borderRadius: 14,
        border: '1px solid #2a2a2a',
        boxShadow: '0 32px 96px rgba(0,0,0,0.85)',
        overflow: 'hidden',
      }}>

        {/* ── Top bar ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '0 16px 0 20px',
          borderBottom: '1px solid #222',
          background: '#181818',
          flexShrink: 0,
          height: 50,
          gap: 10,
        }}>
          {/* Title */}
          <ScrollText size={14} color="#555" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>
            {sceneTitle || '分镜脚本'}
          </span>

          <div style={{ flex: 1 }} />

          {/* Toolbar */}
          <button
            onClick={handleDownload}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#1e1e1e', border: '1px solid #2e2e2e',
              borderRadius: 7, cursor: 'pointer', padding: '5px 12px',
              color: '#888', fontSize: 12,
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#272727'; e.currentTarget.style.color = '#ccc' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.color = '#888' }}
          >
            <Download size={12} />
            下载
          </button>
          <button
            onClick={handleExport}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#1e1e1e', border: '1px solid #2e2e2e',
              borderRadius: 7, cursor: 'pointer', padding: '5px 12px',
              color: '#888', fontSize: 12,
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#272727'; e.currentTarget.style.color = '#ccc' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.color = '#888' }}
          >
            <FileDown size={12} />
            导出 CSV
          </button>

          <div style={{ width: 1, height: 18, background: '#2e2e2e' }} />

          {/* View dropdown */}
          <div ref={viewDropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setViewDropOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: viewDropOpen ? '#252525' : '#1e1e1e',
                border: '1px solid #2e2e2e',
                borderRadius: 7, cursor: 'pointer', padding: '5px 12px',
                color: '#ccc', fontSize: 12,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#252525' }}
              onMouseLeave={e => { e.currentTarget.style.background = viewDropOpen ? '#252525' : '#1e1e1e' }}
            >
              {VIEW_ICONS[view]}
              <span>{VIEW_LABELS[view]}</span>
              <ChevronDown size={11} style={{ transform: viewDropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>
            {viewDropOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                background: '#1a1a1a', border: '1px solid #2e2e2e',
                borderRadius: 9, minWidth: 130,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                overflow: 'hidden', zIndex: 10, padding: '4px 0',
              }}>
                {(['script', 'creative'] as FullscreenView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => { setView(v); setViewDropOpen(false) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', background: view === v ? '#252525' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: view === v ? '#e0e0e0' : '#888', fontSize: 12,
                      textAlign: 'left', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#252525' }}
                    onMouseLeave={e => { e.currentTarget.style.background = view === v ? '#252525' : 'none' }}
                  >
                    {view === v ? <Check size={11} color="#4ade80" /> : <span style={{ width: 11 }} />}
                    {VIEW_ICONS[v]}
                    <span>{VIEW_LABELS[v]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 7,
              background: 'none', border: 'none', cursor: 'pointer', color: '#555',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#2a1a1a'; e.currentTarget.style.color = '#f87171' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#555' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Script sub-tab bar (only in script view) ──────── */}
        {view === 'script' && (
          <div style={{
            display: 'flex', alignItems: 'stretch',
            height: 36, background: '#161616',
            borderBottom: '1px solid #222',
            padding: '0 20px', flexShrink: 0,
          }}>
            {subTabBtn('basic',      '分镜基础')}
            {subTabBtn('supplement', '分镜补充')}
          </div>
        )}

        {/* ── Content area ──────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: view === 'script' ? 'auto' : 'hidden', minHeight: 0 }}>

          {/* ━━ Creative grid ━━ */}
          {view === 'creative' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 12,
              padding: '20px 24px',
            }}>
              {shots.map(shot => (
                <div
                  key={shot.id}
                  style={{
                    background: '#191919',
                    border: '1px solid #242424',
                    borderRadius: 10,
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    cursor: 'default',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.borderColor = '#363636'
                    el.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLDivElement
                    el.style.borderColor = '#242424'
                    el.style.boxShadow = 'none'
                  }}
                >
                  {/* Header: seq + duration */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 10px 5px',
                  }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: 5,
                      background: '#282828', color: '#bbb',
                      fontSize: 10, fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{shot.sequence}</span>
                    <span style={{ fontSize: 10, color: '#555' }}>{shot.duration}s</span>
                  </div>

                  {/* Image placeholder */}
                  <div style={{
                    height: 108, background: '#1d1d1d',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 5, borderTop: '1px solid #212121', borderBottom: '1px solid #212121',
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#222' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#1d1d1d' }}
                  >
                    <ImageIcon size={20} color="#2e2e2e" />
                    <span style={{ fontSize: 9, color: '#333' }}>暂无图片</span>
                  </div>

                  {/* Description */}
                  <div style={{ padding: '7px 10px 5px', fontSize: 11, color: '#aaa', lineHeight: 1.55, flex: 1 }}>
                    {shot.description}
                  </div>

                  {/* Tags row */}
                  <div style={{ padding: '4px 10px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {shot.shotType && (
                      <span style={{
                        fontSize: 9, background: '#202020', border: '1px solid #2c2c2c',
                        borderRadius: 4, padding: '2px 6px', color: '#666',
                        whiteSpace: 'pre', lineHeight: 1.3,
                      }}>
                        {shot.shotType.replace(/\n/g, ' ')}
                      </span>
                    )}
                    {shot.character1 && (
                      <span style={{
                        fontSize: 9, background: '#1e1e2a', border: '1px solid #2a2a3a',
                        borderRadius: 4, padding: '2px 6px', color: '#6680aa',
                      }}>
                        {shot.character1}
                      </span>
                    )}
                  </div>

                  {/* Scene footer */}
                  <div style={{
                    padding: '4px 10px 7px',
                    fontSize: 9, color: '#3a3a3a',
                    borderTop: '1px solid #1e1e1e',
                  }}>
                    场景 {shot.sequence}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ━━ Script table ━━ */}
          {view === 'script' && (
            <table style={{
              borderCollapse: 'collapse',
              minWidth: activeCols.reduce((s, c) => s + c.width, 0),
              width: '100%',
              tableLayout: 'fixed',
            }}>
              <colgroup>
                {activeCols.map((c, i) => <col key={i} style={{ width: c.width }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: '#1a1a1a', position: 'sticky', top: 0, zIndex: 1 }}>
                  {activeCols.map(c => (
                    <th key={c.label} style={{
                      padding: '10px 12px', textAlign: 'left',
                      fontSize: 11, color: '#555', fontWeight: 600,
                      borderBottom: '1px solid #252525',
                      whiteSpace: 'nowrap', letterSpacing: '0.02em',
                    }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shots.length === 0 ? (
                  <tr>
                    <td colSpan={activeCols.length} style={{
                      textAlign: 'center', padding: '60px 0',
                      fontSize: 13, color: '#444',
                    }}>暂无分镜数据</td>
                  </tr>
                ) : shots.map((shot, idx) => {
                  const rowBg = idx % 2 === 0 ? '#161616' : '#181818'
                  return (
                    <tr
                      key={shot.id}
                      style={{ background: rowBg }}
                      onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#1c1e2c' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = rowBg }}
                    >
                      {/* 序号 */}
                      <td style={{ ...tdBase, fontSize: 12, color: '#888' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, borderRadius: 6,
                          background: '#222', color: '#aaa', fontSize: 11, fontWeight: 700,
                        }}>{shot.sequence}</span>
                      </td>

                      {subTab === 'basic' ? <>
                        {/* 画面描述 */}
                        <td style={{ ...tdBase, fontSize: 12, color: '#ccc', lineHeight: 1.65, wordBreak: 'break-all' }}>
                          {shot.description}
                        </td>
                        {/* 角色 */}
                        <td style={{ ...tdBase, fontSize: 12, color: '#aaa' }}>
                          {shot.character1 || <span style={{ color: '#333' }}>—</span>}
                        </td>
                        {/* 角色描述 */}
                        <td style={{ ...tdBase, fontSize: 11, color: '#666', lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {shot.character1Detail || <span style={{ color: '#333' }}>—</span>}
                        </td>
                        {/* 场景地点 */}
                        <td style={{ ...tdBase, fontSize: 11, color: '#444' }}><span style={{ color: '#333' }}>—</span></td>
                        {/* 时间 */}
                        <td style={{ ...tdBase, fontSize: 11, color: '#444' }}><span style={{ color: '#333' }}>—</span></td>
                        {/* 光线 */}
                        <td style={{ ...tdBase, fontSize: 11, color: '#444' }}><span style={{ color: '#333' }}>—</span></td>
                        {/* 景别 */}
                        <td style={{ ...tdBase, fontSize: 11, color: '#888', whiteSpace: 'pre-line' }}>
                          {shot.shotType || <span style={{ color: '#333' }}>—</span>}
                        </td>
                        {/* 运镜 */}
                        <td style={{ ...tdBase, fontSize: 11, color: '#444' }}><span style={{ color: '#333' }}>—</span></td>
                        {/* 时长 */}
                        <td style={{ ...tdBase, fontSize: 12, color: '#777' }}>{shot.duration}s</td>
                        {/* 分镜图 */}
                        <td style={tdBase}>
                          <div style={{
                            width: 44, height: 30, background: '#1c1c1c',
                            border: '1px solid #272727', borderRadius: 4,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}>
                            <ImageIcon size={13} color="#2e2e2e" />
                          </div>
                        </td>
                      </> : <>
                        {/* 画面描述 */}
                        <td style={{ ...tdBase, fontSize: 12, color: '#ccc', lineHeight: 1.65, wordBreak: 'break-all' }}>
                          {shot.description}
                        </td>
                        {/* 提示词生成 */}
                        <td style={tdBase}>
                          <div style={{
                            minHeight: 34, background: '#191919',
                            border: '1px dashed #2a2a2a', borderRadius: 6,
                            padding: '7px 10px', fontSize: 11, color: '#444', lineHeight: 1.5,
                            cursor: 'pointer', transition: 'border-color 0.12s, background 0.12s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3a6ff7'; e.currentTarget.style.background = '#1a1e2a' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2a2a2a'; e.currentTarget.style.background = '#191919' }}
                          >
                            点击生成 Midjourney / SD 提示词…
                          </div>
                        </td>
                        {/* 导演备注 */}
                        <td style={tdBase}>
                          <div style={{
                            minHeight: 34, background: '#191919',
                            border: '1px dashed #282828', borderRadius: 6,
                            padding: '7px 10px', fontSize: 11, color: '#444', lineHeight: 1.5,
                            cursor: 'text',
                          }}>
                            <span style={{ color: '#333' }}>添加备注…</span>
                          </div>
                        </td>
                      </>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div style={{
          borderTop: '1px solid #1e1e1e',
          padding: '7px 20px',
          display: 'flex', alignItems: 'center',
          background: '#181818', flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: '#3a3a3a' }}>
            共 <span style={{ color: '#555' }}>{shots.length}</span> 个镜头
          </span>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

/* ── View mode type ──────────────────────────────────────────── */

type ViewMode = 'creative' | 'script'

/* ── View dropdown ───────────────────────────────────────────── */

function ViewDropdown({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const options: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'script',   label: '脚本视图', icon: <List size={11} /> },
    { id: 'creative', label: '创意视图', icon: <LayoutGrid size={11} /> },
  ]
  const current = options.find(o => o.id === value)!

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="nodrag nopan"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: open ? '#2a2a2a' : 'none', border: '1px solid #333',
          borderRadius: 6, cursor: 'pointer', padding: '3px 8px',
          color: '#aaa', fontSize: 11,
          transition: 'background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#252525' }}
        onMouseLeave={e => { e.currentTarget.style.background = open ? '#2a2a2a' : 'none' }}
      >
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', right: 0,
            background: '#1a1a1a', border: '1px solid #2e2e2e',
            borderRadius: 8, minWidth: 120,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            overflow: 'hidden', zIndex: 9999,
            padding: '4px 0',
          }}
        >
          {options.map(opt => (
            <button
              key={opt.id}
              className="nodrag nopan"
              onClick={() => { onChange(opt.id); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', background: 'none', border: 'none',
                cursor: 'pointer', color: value === opt.id ? '#e0e0e0' : '#888',
                fontSize: 12, textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#252525' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              {value === opt.id
                ? <Check size={11} color="#4ade80" />
                : <span style={{ width: 11 }} />
              }
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Creative grid (card-per-shot view) ──────────────────────── */

function CreativeGrid({ shots }: { shots: ShotRow[] }) {
  const CARD_W = 156

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${CARD_W}px)`,
      gap: 10,
      padding: '12px 14px',
    }}>
      {shots.map(shot => (
        <div
          key={shot.id}
          style={{
            background: '#161616',
            border: '1px solid #2a2a2a',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Number + duration row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 8px',
          }}>
            <span style={{
              width: 18, height: 18, borderRadius: 4,
              background: '#252525', color: '#aaa',
              fontSize: 10, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>{shot.sequence}</span>
            <span style={{ fontSize: 10, color: '#555' }}>{shot.duration}s</span>
          </div>

          {/* Image placeholder */}
          <div style={{
            height: 90, background: '#1a1a1a',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 4, borderTop: '1px solid #222', borderBottom: '1px solid #222',
            cursor: 'pointer',
          }}>
            <ImageIcon size={18} color="#333" />
            <span style={{ fontSize: 9, color: '#3a3a3a' }}>暂无图片</span>
          </div>

          {/* Description */}
          <div style={{ padding: '6px 8px 4px', fontSize: 10, color: '#aaa', lineHeight: 1.5, flex: 1 }}>
            {shot.description}
          </div>

          {/* Shot type + character */}
          {(shot.shotType || shot.character1) && (
            <div style={{
              padding: '3px 8px 6px',
              fontSize: 9, color: '#555',
              display: 'flex', gap: 4, flexWrap: 'wrap',
            }}>
              {shot.shotType && (
                <span style={{
                  background: '#1e1e1e', border: '1px solid #2a2a2a',
                  borderRadius: 3, padding: '1px 5px',
                  whiteSpace: 'pre', lineHeight: 1.3,
                }}>
                  {shot.shotType.replace(/\n/g, ' ')}
                </span>
              )}
              {shot.character1 && (
                <span style={{ color: '#666' }}>{shot.character1}</span>
              )}
            </div>
          )}

          {/* Scene label */}
          <div style={{
            padding: '3px 8px 6px',
            fontSize: 9, color: '#444',
            borderTop: '1px solid #1e1e1e',
          }}>
            场景 {shot.sequence}
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

  // Restore persisted state from node config (survives page refresh)
  const persistedShots      = (data.config?.shots      ?? []) as ShotRow[]
  const persistedSceneTitle = (data.config?.sceneTitle ?? '') as string
  const persistedMode       = (data.config?.mode       ?? data.initialMode ?? 'idle') as Mode

  const [mode, setMode]           = useState<Mode>(persistedMode)
  const [text, setText]           = useState(data.content ?? '')
  const [streamText, setStream]   = useState('')
  const [showShimmer, setShimmer] = useState(false)
  const [prompt, setPrompt]       = useState('')
  const [isHovered, setIsHovered] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [menuOpen, setMenuOpen]         = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)
  const [shots, setShots]         = useState<ShotRow[]>(persistedShots)
  const [sceneTitle, setSceneTitle] = useState(persistedSceneTitle)
  const [warning, setWarning]     = useState<string | null>(null)
  const [viewMode, setViewMode]   = useState<ViewMode>('creative')
  const [showFullscreen, setShowFullscreen] = useState(false)

  // Shot-generation selection mode
  const [shotGenMode, setShotGenMode]       = useState(false)
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string | number>>(new Set())
  const [imgModel, setImgModel]             = useState('Lib Nano Pro')
  const [imgRatio, setImgRatio]             = useState('16:9·2K')
  const [modelDropOpen, setModelDropOpen]   = useState(false)
  const [ratioDropOpen, setRatioDropOpen]   = useState(false)
  const modelDropRef = useRef<HTMLDivElement>(null)
  const ratioDropRef = useRef<HTMLDivElement>(null)

  const IMG_MODELS = ['Lib Nano Pro']
  const IMG_RATIOS = ['16:9·2K', '9:16·2K', '1:1·2K', '4:3·2K', '21:9·2K']

  // Close image-gen dropdowns on outside click
  useEffect(() => {
    if (!modelDropOpen && !ratioDropOpen) return
    const handler = (e: MouseEvent) => {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) setModelDropOpen(false)
      if (ratioDropRef.current && !ratioDropRef.current.contains(e.target as Node)) setRatioDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelDropOpen, ratioDropOpen])

  const abortRef   = useRef<AbortController | null>(null)
  const warnTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const streamRef  = useRef<string>('')   // authoritative accumulator — immune to StrictMode double-invoke
  const nodeLabel  = data.title || data.label || '分镜脚本'

  const addNode           = useProjectStore(s => s.addNode)
  const addEdge           = useProjectStore(s => s.addEdge)
  const updateNode        = useProjectStore(s => s.updateNode)
  const requestSelectNode = useProjectStore(s => s.requestSelectNode)

  // Helper: persist shots + mode into node config so refresh restores them
  const persistResult = useCallback((savedShots: ShotRow[], savedTitle: string) => {
    updateNode(data.id, {
      config: {
        ...data.config,
        shots: savedShots,
        sceneTitle: savedTitle,
        mode: 'content',
      },
    })
  }, [data.id, data.config, updateNode])

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
    streamRef.current = ''   // reset accumulator
    setMode('generating')
    setStream('')
    setShimmer(true)

    // Build the full prompt sent to AI
    const JSON_INSTRUCTION = '只输出一个合法的 JSON 数组，不要 markdown 代码块，不要任何解释文字。每个元素包含：sequence(整数), duration(浮点秒), description(画面描述), character1(角色名，无则空), character1Detail(角色描述，无则空), shotType(景别如"远景"/"中景"/"近景"/"特写")。'
    const fullPrompt = upstreamContent
      ? `以下是剧本内容：\n\n${upstreamContent}\n\n${userPrompt ? `用户要求：${userPrompt}\n\n` : ''}请根据以上剧本内容生成详细的分镜脚本。${JSON_INSTRUCTION}`
      : `${userPrompt}\n\n请生成详细的分镜脚本。${JSON_INSTRUCTION}`

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
        persistResult(MOCK_SHOTS, MOCK_SCENE_TITLE)
        setMode('content')
      }

      streamAI({
        prompt: fullPrompt,
        contextType: 'storyboard',
        signal: ctrl.signal,
        onChunk: c => {
          streamRef.current += c
          setStream(prev => prev + c)
        },
        onDone: (stats) => {
          // Read from ref (not state) — avoids React StrictMode double-invoke of state updaters
          const raw = streamRef.current
          const { shots: parsed, error: parseError } = parseShots(raw)
          updateNode(data.id, { triggerRun: false } as any)   // signal loop: done
          if (parsed && parsed.length > 0) {
            setShots(parsed)
            setText(raw)
            // Use nodeLabel as scene title (no mock title)
            setSceneTitle(nodeLabel)
            persistResult(parsed, nodeLabel)
            addLog({
              level: 'info', category: 'ai', kind: 'response',
              message: `分镜脚本生成完成 — ${parsed.length} 个镜头，${stats ? `${stats.chars} 字符，耗时 ${(stats.elapsed / 1000).toFixed(1)}s` : ''}`,
              detail: raw.length > 400 ? raw.slice(0, 400) + `\n…（共 ${raw.length} 字符）` : raw,
            })
          } else {
            addLog({
              level: 'warn', category: 'ai', kind: 'response',
              message: `分镜解析失败，使用模拟数据`,
              detail: `解析错误:\n${parseError}\n\nAI 原始输出 (${raw.length} 字符):\n${raw.slice(0, 600)}${raw.length > 600 ? '…' : ''}`,
            })
            setShots(MOCK_SHOTS)
            setSceneTitle(MOCK_SCENE_TITLE)
            persistResult(MOCK_SHOTS, MOCK_SCENE_TITLE)
          }
          setMode('content')
        },
        onError: (err) => {
          updateNode(data.id, { triggerRun: false } as any)
          addLog({ level: 'warn', category: 'ai', message: 'AI 不可用，使用模拟内容', detail: err })
          runMock(err)
        },
      }).catch((err) => {
        if (ctrl.signal.aborted) return
        addLog({ level: 'warn', category: 'ai', message: 'AI 请求失败，使用模拟内容', detail: String(err) })
        runMock(String(err))
      })
    }, 400)
  }, [prompt, upstreamContent, showWarning, persistResult, nodeLabel])

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

  // Auto-trigger generation when LoopNode pushes triggerRun=true
  useEffect(() => {
    if ((data as any).triggerRun === true) {
      handleSend()
    }
  }, [(data as any).triggerRun])   // eslint-disable-line react-hooks/exhaustive-deps

  // Exit shot-gen selection mode when node is deselected
  useEffect(() => {
    if (!effectiveSelected && shotGenMode) {
      setShotGenMode(false)
      setSelectedShotIds(new Set())
    }
  }, [effectiveSelected, shotGenMode])

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
          {!shotGenMode && (
            <CollapsibleSection expanded={isExpanded}>
              <ZoomInvariantPanel naturalWidth={NODE_W}>
                <PromptPanel
                  value={prompt}
                  onChange={setPrompt}
                  onSend={handleSend}
                />
              </ZoomInvariantPanel>
            </CollapsibleSection>
          )}

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
          {/* Floating toolbar — zoom-invariant, sits above the card; only when selected */}
          {effectiveSelected && <div
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

            {/* 生成分镜 — enter selection mode to create image nodes */}
            <button
              className="nodrag nopan"
              onClick={() => {
                setShotGenMode(true)
                setSelectedShotIds(new Set(shots.map(s => s.id)))
                setViewMode('script')
                requestSelectNode(data.id)
                addLog({ level: 'info', category: 'operation', message: '进入分镜生成选择模式', detail: `场景: ${sceneTitle}，共 ${shots.length} 个镜头` })
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
          </div>}

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
                <ViewDropdown value={viewMode} onChange={setViewMode} />
                <span
                  className="nodrag nopan"
                  onClick={() => setShowFullscreen(true)}
                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 2, borderRadius: 4 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#252525' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <Maximize2 size={12} color="#666" />
                </span>
              </div>
            </div>

            {/* Table / grid — fixed height scrollable area */}
            <div
              className="nodrag nopan nowheel"
              style={{ height: 340, overflowY: 'auto', overflowX: 'hidden' }}
            >
              {viewMode === 'script'
                ? <StoryboardTable
                    shots={shots}
                    sceneTitle={sceneTitle}
                    selectable={shotGenMode}
                    selectedIds={selectedShotIds}
                    onToggle={id => setSelectedShotIds(prev => {
                      const next = new Set(prev)
                      next.has(id) ? next.delete(id) : next.add(id)
                      return next
                    })}
                    onToggleAll={() => setSelectedShotIds(prev =>
                      prev.size === shots.length
                        ? new Set()
                        : new Set(shots.map(s => s.id))
                    )}
                  />
                : <CreativeGrid shots={shots} />
              }
            </div>
          </div>

          {/* Shot-gen selection bar — floats below the card */}
          {shotGenMode && effectiveSelected && (
            <ZoomInvariantPanel naturalWidth={NODE_W}>
              <div
                className="nodrag nopan"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  marginTop: 8, padding: '6px 10px',
                  background: '#1a1a1a', border: '1px solid #333',
                  borderRadius: 10, boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                }}
              >
                {/* Model dropdown */}
                <div ref={modelDropRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setModelDropOpen(v => !v); setRatioDropOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: '#252525', border: '1px solid #383838',
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      color: '#ccc', fontSize: 11, whiteSpace: 'nowrap',
                    }}
                  >
                    <LibNanoIcon />
                    {imgModel}
                    <ChevronDown size={9} />
                  </button>
                  {modelDropOpen && (
                    <div style={{
                      position: 'absolute', bottom: '110%', left: 0,
                      background: '#1e1e1e', border: '1px solid #333',
                      borderRadius: 8, overflow: 'hidden', zIndex: 9999,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      minWidth: 140,
                    }}>
                      {IMG_MODELS.map(m => (
                        <div
                          key={m}
                          onClick={() => { setImgModel(m); setModelDropOpen(false) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                            color: m === imgModel ? '#7c6af7' : '#ccc',
                            background: m === imgModel ? 'rgba(124,106,247,0.1)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (m !== imgModel) (e.currentTarget as HTMLElement).style.background = '#252525' }}
                          onMouseLeave={e => { if (m !== imgModel) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          {m === imgModel && <Check size={10} color="#7c6af7" />}
                          {m !== imgModel && <div style={{ width: 10 }} />}
                          {m}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Aspect ratio dropdown */}
                <div ref={ratioDropRef} style={{ position: 'relative' }}>
                  <button
                    onClick={() => { setRatioDropOpen(v => !v); setModelDropOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: '#252525', border: '1px solid #383838',
                      borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                      color: '#ccc', fontSize: 11, whiteSpace: 'nowrap',
                    }}
                  >
                    {imgRatio}
                    <ChevronDown size={9} />
                  </button>
                  {ratioDropOpen && (
                    <div style={{
                      position: 'absolute', bottom: '110%', left: 0,
                      background: '#1e1e1e', border: '1px solid #333',
                      borderRadius: 8, overflow: 'hidden', zIndex: 9999,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                      minWidth: 120,
                    }}>
                      {IMG_RATIOS.map(r => (
                        <div
                          key={r}
                          onClick={() => { setImgRatio(r); setRatioDropOpen(false) }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 12px', cursor: 'pointer', fontSize: 12,
                            color: r === imgRatio ? '#7c6af7' : '#ccc',
                            background: r === imgRatio ? 'rgba(124,106,247,0.1)' : 'transparent',
                          }}
                          onMouseEnter={e => { if (r !== imgRatio) (e.currentTarget as HTMLElement).style.background = '#252525' }}
                          onMouseLeave={e => { if (r !== imgRatio) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          {r === imgRatio && <Check size={10} color="#7c6af7" />}
                          {r !== imgRatio && <div style={{ width: 10 }} />}
                          {r}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected count badge */}
                <div style={{
                  fontSize: 11, color: '#aaa', padding: '2px 6px',
                  background: '#252525', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  已选 {selectedShotIds.size}/{shots.length}
                </div>

                <div style={{ flex: 1 }} />

                {/* Style placeholder button */}
                <button
                  onClick={() => {/* TODO: style picker */}}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: '#252525', border: '1px solid #383838',
                    borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
                    color: '#aaa', fontSize: 11,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#333' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#252525' }}
                >
                  <AlignJustify size={10} />
                  风格
                </button>

                {/* Generate button */}
                <button
                  disabled={selectedShotIds.size === 0}
                  onClick={() => {
                    const selectedShots = shots.filter(s => selectedShotIds.has(s.id))
                    const SPACING_Y = 280
                    const startX = data.position.x + NODE_W + 80
                    const startY = data.position.y - ((selectedShots.length - 1) * SPACING_Y) / 2

                    selectedShots.forEach((shot, idx) => {
                      const newId = `libtv_image_${Date.now()}_${idx}`
                      addNode({
                        id: newId,
                        type: 'libtv_image' as NodeData['type'],
                        label: `分镜 #${shot.sequence}`,
                        category: 'output',
                        position: {
                          x: startX,
                          y: startY + idx * SPACING_Y,
                        },
                        config: {},
                        title: '分镜图·脚本生成器',
                        imagePrompt: shot.description,
                      } as NodeData)
                      addEdge({
                        id: `e-${data.id}-${newId}`,
                        source: data.id,
                        target: newId,
                      })
                    })

                    addLog({
                      level: 'info', category: 'operation',
                      message: `已创建 ${selectedShots.length} 个分镜图节点`,
                      detail: `场景: ${sceneTitle} | 模型: ${imgModel} | 比例: ${imgRatio}`,
                    })
                    setShotGenMode(false)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: selectedShotIds.size === 0 ? '#252525' : '#7c6af7',
                    border: 'none', borderRadius: 6,
                    padding: '4px 10px', cursor: selectedShotIds.size === 0 ? 'not-allowed' : 'pointer',
                    color: selectedShotIds.size === 0 ? '#555' : '#fff', fontSize: 12, fontWeight: 500,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (selectedShotIds.size > 0) e.currentTarget.style.background = '#6a5be0' }}
                  onMouseLeave={e => { if (selectedShotIds.size > 0) e.currentTarget.style.background = '#7c6af7' }}
                >
                  <Zap size={11} />
                  {selectedShotIds.size}
                </button>

                {/* Close selection mode */}
                <button
                  onClick={() => setShotGenMode(false)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: 6,
                    background: 'none', border: 'none', cursor: 'pointer', color: '#666',
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ff4444' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#666' }}
                >
                  <X size={13} />
                </button>
              </div>
            </ZoomInvariantPanel>
          )}

          {/* Prompt panel */}
          {!shotGenMode && (
            <CollapsibleSection expanded={isExpanded}>
              <ZoomInvariantPanel naturalWidth={NODE_W}>
                <PromptPanel
                  value={prompt}
                  onChange={setPrompt}
                  onSend={handleSend}
                />
              </ZoomInvariantPanel>
            </CollapsibleSection>
          )}

          <CircleHandle type="target" position={Position.Left}  top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setTargetMenuOpen(v => !v)} menuOpen={targetMenuOpen} onMenuClose={() => setTargetMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
          <CircleHandle type="source" position={Position.Right} top={contentHandleY} visible={handlesVisible}
            onSourceClick={() => setMenuOpen(v => !v)} menuOpen={menuOpen} onMenuClose={() => setMenuOpen(false)}
            nodeType="libtv_script_gen" sourceNodeId={data.id} sourcePosition={data.position} sourceNodeWidth={NODE_W} />
        </>
      )}

      {/* ══════════ FULLSCREEN MODAL ══════════ */}
      {showFullscreen && (
        <StoryboardFullscreenModal
          shots={shots}
          sceneTitle={sceneTitle}
          onClose={() => setShowFullscreen(false)}
        />
      )}
    </div>
  )
}

export default memo(ScriptGenNode)
