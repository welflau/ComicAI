import { memo, useRef, useState, useEffect, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Play, Upload, ChevronDown, ArrowUp,
  Maximize2, Zap, Tag, Camera, Users, Settings, Languages,
  Layers, Sparkles, Loader2, FolderOpen,
} from 'lucide-react'
import CollapsibleSection from './shared/CollapsibleSection'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
import NodeAddMenu from './shared/NodeAddMenu'
import { useIsMultiSelected } from './shared/useIsMultiSelected'
import { useProjectStore } from '@/stores/projectStore'
import defaultFirstFrame from '@/assets/keyframe-default-first.png'
import defaultLastFrame  from '@/assets/keyframe-default-last.png'

/* ── Types ─────────────────────────────────────────────────────────── */

export type VideoModel = 'kling' | 'jimeng'

export interface VideoParams {
  aspectRatio: '16:9' | '9:16' | '1:1'
  resolution:  '480p' | '720p' | '1080p'
  duration:    5 | 10
  generateAudio: boolean
  audioSync:   boolean
}

export interface VideoNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  videoUrl?: string
  nodeIndex?: number
  videoSource?: 'uploaded' | 'generated'
  videoPrompt?: string
  videoModel?: VideoModel
  /** When true, the prompt panel starts expanded (e.g. created from + menu) */
  initialPanelExpanded?: boolean
}

/* ── Constants ─────────────────────────────────────────────────────── */

const NODE_W        = 520
const TITLE_H       = 28    // title row height (px) — card starts just below
const PLACEHOLDER_H = 220   // height of empty placeholder
const HANDLE_Y      = TITLE_H + PLACEHOLDER_H / 2

const DEFAULT_PARAMS: VideoParams = {
  aspectRatio: '16:9',
  resolution:  '720p',
  duration:    5,
  generateAudio: false,
  audioSync:   true,
}

/* ── Aspect ratio definitions ───────────────────────────────────────── */

type AspectRatioDef = { value: '16:9' | '9:16' | '1:1'; label: string; w: number; h: number }

const KLING_RATIOS: AspectRatioDef[] = [
  { value: '16:9', label: '16:9', w: 32, h: 18 },
  { value: '9:16', label: '9:16', w: 18, h: 32 },
  { value: '1:1',  label: '1:1',  w: 24, h: 24 },
]

/* ── Model icons ────────────────────────────────────────────────────── */

function KlingIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M2 3L7 7L2 11V3Z" fill="#4ade80" />
      <path d="M8 3L13 7L8 11V3Z" fill="#4ade80" opacity="0.6" />
    </svg>
  )
}

function JimengIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5" stroke="#60a5fa" strokeWidth="1.3" fill="none" />
      <path d="M4 7h6M7 4v6" stroke="#60a5fa" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

interface ModelOption {
  id: VideoModel
  label: string
  subLabel?: string
  Icon: React.ElementType
  color: string
  description?: string
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'jimeng',
    label: 'Seedance 1.5',
    subLabel: '即梦',
    Icon: JimengIcon,
    color: '#60a5fa',
    description: '高质量长视频，自适应画面比例',
  },
  {
    id: 'kling',
    label: 'Kling 3.0',
    subLabel: '可灵',
    Icon: KlingIcon,
    color: '#4ade80',
    description: '专业级视频生成，支持多种比例',
  },
]

/* ── Video prompt panel ─────────────────────────────────────────────── */

type VideoTab = 'text2video' | 'universal' | 'img2video' | 'keyframes' | 'imgref'

const VIDEO_TABS: Array<{ id: VideoTab; label: string }> = [
  { id: 'text2video', label: '文生视频' },
  { id: 'universal',  label: '全能参考' },
  { id: 'img2video',  label: '图生视频' },
  { id: 'keyframes',  label: '首尾帧' },
  { id: 'imgref',     label: '图片参考' },
]

const ICON_BTNS: Array<{ Icon: React.ElementType; label: string }> = [
  { Icon: Tag,    label: '标记' },
  { Icon: Camera, label: '运镜' },
  { Icon: Users,  label: '角色库' },
]

function VideoPromptPanel({ value, onChange, onSend, generating, activeTab, onTabChange, keyframeUrls, refImageUrls, selectedModel, onModelChange, statusMsg, videoParams, onParamsChange }: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  generating: boolean
  activeTab: VideoTab
  onTabChange: (tab: VideoTab) => void
  keyframeUrls: string[]
  refImageUrls: string[]
  selectedModel: VideoModel
  onModelChange: (m: VideoModel) => void
  statusMsg: string
  videoParams: VideoParams
  onParamsChange: (p: VideoParams) => void
}) {
  const [paramsOpen,  setParamsOpen]  = useState(false)
  const [modelOpen,   setModelOpen]   = useState(false)
  const paramsButtonRef  = useRef<HTMLButtonElement>(null)
  const paramsPopoverRef = useRef<HTMLDivElement>(null)
  const modelButtonRef   = useRef<HTMLButtonElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  // Close params popover when clicking outside
  useEffect(() => {
    if (!paramsOpen) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        paramsPopoverRef.current && !paramsPopoverRef.current.contains(target) &&
        paramsButtonRef.current && !paramsButtonRef.current.contains(target)
      ) {
        setParamsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [paramsOpen])

  // Close model dropdown when clicking outside
  useEffect(() => {
    if (!modelOpen) return
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        modelDropdownRef.current && !modelDropdownRef.current.contains(target) &&
        modelButtonRef.current  && !modelButtonRef.current.contains(target)
      ) {
        setModelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [modelOpen])

  const ratios = KLING_RATIOS  // kling has 3 ratios; jimeng is fixed to Auto

  // Derived display label
  const ratioLabel = selectedModel === 'jimeng' ? 'Auto' : videoParams.aspectRatio
  const resLabel   = selectedModel === 'kling'  ? '720P' : videoParams.resolution.toUpperCase()
  const audioIcon  = videoParams.generateAudio ? '🔊' : '🔇'

  return (
    <div
      className="nodrag nopan"
      style={{
        marginTop: 8,
        background: '#161616',
        border: '1px solid #2a2a2a',
        borderRadius: 14,
        padding: '10px 12px 10px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
    >
      {/* ── Row 1: horizontal tabs + expand ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {VIDEO_TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                className="nodrag nopan"
                onMouseDown={e => { e.preventDefault(); onTabChange(tab.id) }}
                style={{
                  padding: '4px 10px',
                  background: active ? '#2a2a2a' : 'none',
                  border: active ? '1px solid #3a3a3a' : '1px solid transparent',
                  borderRadius: 7,
                  color: active ? '#ddd' : '#555',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#999'
                }}
                onMouseLeave={e => {
                  if (activeTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#555'
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Expand button */}
        <button
          className="nodrag nopan"
          style={{
            flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
            color: '#3a3a3a', padding: 3, borderRadius: 4, marginLeft: 4,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#777' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3a3a3a' }}
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* ── Row 2: icon action buttons OR keyframe slots ── */}
      {activeTab === 'keyframes' ? (
        /* Keyframe slots: 首帧 + 尾帧 thumbnail chips */
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {[
            { label: '首帧', index: 1, imgUrl: keyframeUrls[0] },
            { label: '尾帧', index: 2, imgUrl: keyframeUrls[1] },
          ].map(({ label, index, imgUrl }) => (
            <div
              key={label}
              className="nodrag nopan"
              style={{
                position: 'relative',
                width: 48, height: 48,
                borderRadius: 8,
                background: imgUrl ? 'transparent' : '#1e1e1e',
                border: `1px solid ${imgUrl ? 'transparent' : '#2e2e2e'}`,
                overflow: 'hidden',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              {imgUrl ? (
                <img src={imgUrl} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#444', fontSize: 11,
                }}>
                  <Upload size={13} />
                </div>
              )}
              {/* index badge */}
              <div style={{
                position: 'absolute', top: 3, left: 3,
                width: 14, height: 14, borderRadius: 4,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: '#aaa', fontWeight: 600,
              }}>{index}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
          {/* Icon action buttons */}
          <div style={{ display: 'flex', gap: 4 }}>
          {ICON_BTNS.map(({ Icon, label }) => (
            <button
              key={label}
              className="nodrag nopan"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 9px',
                background: 'none',
                border: '1px solid #282828',
                borderRadius: 7,
                color: '#666',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = '#1e1e1e'
                el.style.color = '#999'
                el.style.borderColor = '#383838'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'none'
                el.style.color = '#666'
                el.style.borderColor = '#282828'
              }}
            >
              <Icon size={12} />
              <span>{label}</span>
            </button>
          ))}
          </div>
          {/* Connected reference image thumbnails */}
          {refImageUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {refImageUrls.map((url, i) => (
                <div key={i} style={{
                  width: 40, height: 40, borderRadius: 6, overflow: 'hidden',
                  border: '1px solid #333', flexShrink: 0,
                  position: 'relative',
                }}>
                  <img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Row 3: prompt textarea ── */}
      <textarea
        className="nodrag nopan nowheel"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.stopPropagation()}
        placeholder="描述你想要生成的画面内容，@引用素材"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 'none',
          outline: 'none', padding: '2px 2px 8px',
          color: value ? '#ccc' : '#444', fontSize: 13, lineHeight: 1.65,
          resize: 'none', fontFamily: 'inherit',
        }}
      />

      {/* Status message */}
      {statusMsg && (
        <div style={{
          fontSize: 11, color: statusMsg.startsWith('生成失败') ? '#f87171' : '#888',
          padding: '2px 2px 6px', lineHeight: 1.4,
        }}>
          {statusMsg}
        </div>
      )}

      {/* ── Bottom toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        paddingTop: 8,
        borderTop: '1px solid #272727',
        position: 'relative',
      }}>
        {/* Model selector dropdown trigger */}
        {(() => {
          const activeOpt = MODEL_OPTIONS.find(o => o.id === selectedModel) ?? MODEL_OPTIONS[0]
          return (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                ref={modelButtonRef}
                className="nodrag nopan"
                onMouseDown={e => { e.preventDefault(); setModelOpen(v => !v); setParamsOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: modelOpen ? '#252525' : 'none',
                  border: modelOpen ? '1px solid #3a3a3a' : '1px solid transparent',
                  cursor: 'pointer',
                  color: activeOpt.color,
                  fontSize: 11,
                  padding: '3px 6px 3px 5px',
                  borderRadius: 6,
                  transition: 'background 0.12s, border-color 0.12s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (!modelOpen) {
                    (e.currentTarget as HTMLButtonElement).style.background = '#202020'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = '#333'
                  }
                }}
                onMouseLeave={e => {
                  if (!modelOpen) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'none'
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'
                  }
                }}
              >
                <activeOpt.Icon />
                <span style={{ fontWeight: 600 }}>{activeOpt.label}</span>
                <ChevronDown size={9} style={{ transform: modelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', opacity: 0.6 }} />
              </button>

              {/* Dropdown menu */}
              {modelOpen && (
                <div
                  ref={modelDropdownRef}
                  className="nodrag nopan nowheel"
                  onMouseDown={e => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: 0,
                    minWidth: 260,
                    background: '#1c1c1c',
                    border: '1px solid #333',
                    borderRadius: 10,
                    padding: '5px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                    zIndex: 10000,
                  }}
                >
                  {MODEL_OPTIONS.map(opt => {
                    const isActive = opt.id === selectedModel
                    return (
                      <button
                        key={opt.id}
                        className="nodrag nopan"
                        onMouseDown={e => {
                          e.preventDefault()
                          onModelChange(opt.id)
                          setModelOpen(false)
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          width: '100%', padding: '8px 10px',
                          background: isActive ? '#252525' : 'none',
                          border: 'none', borderRadius: 7,
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = '#222'
                        }}
                        onMouseLeave={e => {
                          if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'none'
                        }}
                      >
                        {/* Icon */}
                        <div style={{
                          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                          background: '#252525',
                          border: `1px solid ${isActive ? opt.color + '55' : '#333'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <opt.Icon />
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, color: isActive ? '#eee' : '#ccc', fontWeight: 600 }}>
                              {opt.label}
                            </span>
                            {opt.subLabel && (
                              <span style={{ fontSize: 10, color: '#555' }}>{opt.subLabel}</span>
                            )}
                          </div>
                          {opt.description && (
                            <div style={{ fontSize: 10, color: '#555', marginTop: 1, lineHeight: 1.3 }}>
                              {opt.description}
                            </div>
                          )}
                        </div>

                        {/* Active checkmark */}
                        {isActive && (
                          <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: opt.color, flexShrink: 0,
                          }} />
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()}

        <div style={{ width: 1, height: 10, background: '#2a2a2a', flexShrink: 0 }} />

        {/* Params button — shows real selected values */}
        <button
          ref={paramsButtonRef}
          className="nodrag nopan"
          onMouseDown={e => { e.preventDefault(); setParamsOpen(v => !v) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            background: paramsOpen ? '#252525' : 'none',
            border: paramsOpen ? '1px solid #3a3a3a' : '1px solid transparent',
            cursor: 'pointer',
            color: '#666', fontSize: 11, padding: '2px 4px', borderRadius: 5, flexShrink: 0,
            whiteSpace: 'nowrap',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { if (!paramsOpen) (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { if (!paramsOpen) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <span>{ratioLabel} · {resLabel} · {videoParams.duration}s</span>
          <span style={{ fontSize: 10, marginLeft: 1 }}>{audioIcon}</span>
          <ChevronDown size={9} style={{ transform: paramsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        <div style={{ flex: 1, minWidth: 0 }} />

        {/* Text/lang toggle */}
        <button className="nodrag nopan" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#555', padding: 3, borderRadius: 4,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
          title="中英文切换"
        >
          <Languages size={13} />
        </button>

        {/* Settings */}
        <button className="nodrag nopan" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#555', padding: 3, borderRadius: 4,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
          title="更多设置"
        >
          <Settings size={13} />
        </button>

        {/* Count */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#666', fontSize: 11, padding: '2px 4px', borderRadius: 5, whiteSpace: 'nowrap',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <span>1个</span>
          <ChevronDown size={9} />
        </button>

        {/* Credits */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#555', fontSize: 11 }}>
          <Zap size={11} />
          <span>135</span>
        </div>

        {/* Send */}
        <button
          className="nodrag nopan"
          onClick={onSend}
          disabled={generating || !value.trim()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8, border: 'none',
            cursor: generating || !value.trim() ? 'not-allowed' : 'pointer',
            background: generating ? '#3d2a6a' : value.trim() ? '#fff' : '#252525',
            color: generating ? '#fff' : value.trim() ? '#111' : '#666',
            opacity: !value.trim() && !generating ? 0.45 : 1,
            transition: 'background 0.15s, color 0.15s', flexShrink: 0,
          }}
          onMouseEnter={e => {
            if (!generating && value.trim()) {
              (e.currentTarget as HTMLButtonElement).style.background = '#e0e0e0'
            }
          }}
          onMouseLeave={e => {
            if (!generating) {
              (e.currentTarget as HTMLButtonElement).style.background = value.trim() ? '#fff' : '#252525'
            }
          }}
        >
          {generating
            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
            : <ArrowUp size={13} />}
        </button>

        {/* ── Params Popover ── */}
        {paramsOpen && (
          <div
            ref={paramsPopoverRef}
            className="nodrag nopan nowheel"
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              left: 0,
              width: 280,
              background: '#1c1c1c',
              border: '1px solid #333',
              borderRadius: 12,
              padding: '14px 14px 12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              zIndex: 9999,
            }}
          >
            {/* ── 比例 ── */}
            {selectedModel === 'kling' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8, fontWeight: 500, letterSpacing: '0.02em' }}>比例</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ratios.map(r => {
                    const active = videoParams.aspectRatio === r.value
                    return (
                      <button
                        key={r.value}
                        className="nodrag nopan"
                        onMouseDown={e => {
                          e.preventDefault()
                          onParamsChange({ ...videoParams, aspectRatio: r.value })
                        }}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 6,
                          width: 72, height: 68,
                          background: active ? '#2a2a2a' : '#161616',
                          border: active ? '1.5px solid #aaa' : '1px solid #333',
                          borderRadius: 8,
                          cursor: 'pointer',
                          transition: 'border-color 0.12s, background 0.12s',
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.borderColor = '#555'
                        }}
                        onMouseLeave={e => {
                          if (videoParams.aspectRatio !== r.value) (e.currentTarget as HTMLButtonElement).style.borderColor = '#333'
                        }}
                      >
                        {/* Ratio shape icon */}
                        <div style={{
                          width: r.w * 0.85, height: r.h * 0.85,
                          border: `1.5px solid ${active ? '#ccc' : '#555'}`,
                          borderRadius: 3,
                          flexShrink: 0,
                          transition: 'border-color 0.12s',
                        }} />
                        <span style={{ fontSize: 10, color: active ? '#ddd' : '#666', fontWeight: active ? 600 : 400 }}>
                          {r.label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 即梦：比例固定 Auto，不可选 */}
            {selectedModel === 'jimeng' && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 8, fontWeight: 500, letterSpacing: '0.02em' }}>比例</div>
                <div style={{
                  display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 6,
                  width: 72, height: 68,
                  background: '#2a2a2a',
                  border: '1.5px solid #aaa',
                  borderRadius: 8,
                  cursor: 'not-allowed',
                  opacity: 0.75,
                }}>
                  <div style={{
                    width: 22, height: 18,
                    border: '1.5px solid #ccc',
                    borderRadius: 3,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, color: '#ddd', fontWeight: 600 }}>Auto</span>
                </div>
                <div style={{ fontSize: 10, color: '#444', marginTop: 6 }}>即梦比例固定为自适应</div>
              </div>
            )}

            {/* ── 清晰度 ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8, fontWeight: 500, letterSpacing: '0.02em' }}>清晰度</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['480p', '720p', '1080p'] as const).map(res => {
                  const disabled = selectedModel === 'kling'
                  const active   = selectedModel === 'kling' ? res === '720p' : videoParams.resolution === res
                  return (
                    <button
                      key={res}
                      className="nodrag nopan"
                      disabled={disabled}
                      onMouseDown={e => {
                        e.preventDefault()
                        if (!disabled) onParamsChange({ ...videoParams, resolution: res })
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        background: active ? '#2a2a2a' : '#161616',
                        border: active ? '1.5px solid #aaa' : '1px solid #333',
                        borderRadius: 7,
                        color: active ? '#ddd' : disabled ? '#3a3a3a' : '#777',
                        fontSize: 11,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: active ? 600 : 400,
                        transition: 'border-color 0.12s, background 0.12s, color 0.12s',
                        opacity: disabled && !active ? 0.4 : 1,
                      }}
                      onMouseEnter={e => {
                        if (!disabled && !active) {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.borderColor = '#555'
                          el.style.color = '#aaa'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!disabled && videoParams.resolution !== res) {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.borderColor = '#333'
                          el.style.color = '#777'
                        }
                      }}
                    >
                      {res.toUpperCase()}
                    </button>
                  )
                })}
              </div>
              {selectedModel === 'kling' && (
                <div style={{ fontSize: 10, color: '#444', marginTop: 5 }}>可灵不支持自定义清晰度</div>
              )}
            </div>

            {/* ── 视频时长 ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 11, color: '#666', fontWeight: 500, letterSpacing: '0.02em' }}>视频时长</span>
                <span style={{ fontSize: 12, color: '#bbb', fontWeight: 600 }}>{videoParams.duration}s</span>
              </div>
              <input
                type="range"
                min={5}
                max={10}
                step={5}
                value={videoParams.duration}
                className="nodrag nopan nowheel"
                onChange={e => onParamsChange({ ...videoParams, duration: Number(e.target.value) as 5 | 10 })}
                style={{
                  width: '100%',
                  appearance: 'none', WebkitAppearance: 'none',
                  height: 4,
                  borderRadius: 2,
                  outline: 'none',
                  cursor: 'pointer',
                  background: `linear-gradient(to right, #aaa ${(videoParams.duration - 5) / 5 * 100}%, #333 ${(videoParams.duration - 5) / 5 * 100}%)`,
                }}
              />
              <style>{`
                input[type=range]::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  width: 14px; height: 14px;
                  border-radius: 50%;
                  background: #fff;
                  border: none;
                  cursor: pointer;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.5);
                }
                input[type=range]::-moz-range-thumb {
                  width: 14px; height: 14px;
                  border-radius: 50%;
                  background: #fff;
                  border: none;
                  cursor: pointer;
                  box-shadow: 0 1px 4px rgba(0,0,0,0.5);
                }
              `}</style>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: '#444' }}>5s</span>
                <span style={{ fontSize: 10, color: '#444' }}>10s</span>
              </div>
            </div>

            {/* ── 生成音频 ── */}
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8, fontWeight: 500, letterSpacing: '0.02em' }}>生成音频</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[
                  { label: '🔊 开启', value: true  },
                  { label: '🔇 关闭', value: false },
                ].map(opt => {
                  const active = videoParams.generateAudio === opt.value
                  return (
                    <button
                      key={String(opt.value)}
                      className="nodrag nopan"
                      onMouseDown={e => {
                        e.preventDefault()
                        onParamsChange({ ...videoParams, generateAudio: opt.value })
                      }}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        background: active ? '#2a2a2a' : '#161616',
                        border: active ? '1.5px solid #aaa' : '1px solid #333',
                        borderRadius: 7,
                        color: active ? '#ddd' : '#777',
                        fontSize: 11,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: active ? 600 : 400,
                        transition: 'border-color 0.12s, background 0.12s, color 0.12s',
                      }}
                      onMouseEnter={e => {
                        if (!active) {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.borderColor = '#555'
                          el.style.color = '#aaa'
                        }
                      }}
                      onMouseLeave={e => {
                        if (videoParams.generateAudio !== opt.value) {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.borderColor = '#333'
                          el.style.color = '#777'
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── 音画同步（仅开启音频时有效）── */}
            <div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8, fontWeight: 500, letterSpacing: '0.02em' }}>音画同步</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[
                  { label: '🎵 开启', value: true  },
                  { label: '✕ 关闭',  value: false },
                ].map(opt => {
                  const active = videoParams.audioSync === opt.value
                  const disabled = !videoParams.generateAudio
                  return (
                    <button
                      key={String(opt.value)}
                      className="nodrag nopan"
                      onMouseDown={e => {
                        e.preventDefault()
                        if (!disabled) onParamsChange({ ...videoParams, audioSync: opt.value })
                      }}
                      title={disabled ? '请先开启生成音频' : undefined}
                      style={{
                        flex: 1,
                        padding: '5px 0',
                        background: active && !disabled ? '#2a2a2a' : '#161616',
                        border: active && !disabled ? '1.5px solid #aaa' : '1px solid #333',
                        borderRadius: 7,
                        color: disabled ? '#444' : active ? '#ddd' : '#777',
                        fontSize: 11,
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        fontWeight: active && !disabled ? 600 : 400,
                        opacity: disabled ? 0.45 : 1,
                        transition: 'border-color 0.12s, background 0.12s, color 0.12s',
                      }}
                      onMouseEnter={e => {
                        if (!disabled && !active) {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.borderColor = '#555'
                          el.style.color = '#aaa'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!disabled && videoParams.audioSync !== opt.value) {
                          const el = e.currentTarget as HTMLButtonElement
                          el.style.borderColor = '#333'
                          el.style.color = '#777'
                        }
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────────────── */

function VideoNode({ data, selected, dragging }: NodeProps<VideoNodeData>) {
  const [isHovered,         setIsHovered]         = useState(false)
  const [menuOpen,          setMenuOpen]          = useState(false)
  const [targetMenuOpen,    setTargetMenuOpen]    = useState(false)
  const [prompt,            setPrompt]            = useState(() => data.videoPrompt ?? '')
  const [generating,        setGenerating]        = useState(false)
  const [statusMsg,         setStatusMsg]         = useState('')
  const [selectedModel,     setSelectedModel]     = useState<VideoModel>(() => data.videoModel ?? 'kling')
  const [hadInitialExpand,  setHadInitialExpand]  = useState(() => !!data.initialPanelExpanded)
  const [activeTab,         setActiveTab]         = useState<VideoTab>('text2video')
  const [videoParams,       setVideoParams]       = useState<VideoParams>(DEFAULT_PARAMS)
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMultiSelected = useIsMultiSelected()
  const allEdges  = useProjectStore(s => s.edges)
  const allNodes  = useProjectStore(s => s.nodes)
  const addNode   = useProjectStore(s => s.addNode)
  const addEdge   = useProjectStore(s => s.addEdge)
  const updateNode = useProjectStore(s => s.updateNode)

  const hasVideo       = !!data.videoUrl
  const hasAnyEdge     = allEdges.some(e => e.target === data.id || e.source === data.id)
  const handlesVisible = isHovered || (!!selected && !dragging)
  const nodeLabel      = data.label || '视频'
  const showSelected   = !!selected && !dragging && !isMultiSelected

  // Collect incoming image nodes (for keyframe slots)
  const incomingImageUrls: string[] = allEdges
    .filter(e => e.target === data.id)
    .map(e => allNodes.find(n => n.id === e.source))
    .filter(n => n?.type === 'libtv_image')
    .map(n => n?.imageUrl)
    .filter(Boolean) as string[]

  // Resolve idb:// URLs to displayable URLs for ref image thumbnails
  const [resolvedRefUrls, setResolvedRefUrls] = useState<string[]>([])
  useEffect(() => {
    if (!incomingImageUrls.length) { setResolvedRefUrls([]); return }
    let cancelled = false
    import('@/stores/imageStore').then(({ resolveImageUrl }) => {
      Promise.all(incomingImageUrls.map(u => resolveImageUrl(u))).then(urls => {
        if (!cancelled) setResolvedRefUrls(urls.filter(Boolean) as string[])
      })
    })
    return () => { cancelled = true }
  }, [incomingImageUrls.join(',')])

  // Sync prompt from data
  useEffect(() => {
    if (data.videoPrompt !== undefined) setPrompt(data.videoPrompt)
  }, [data.videoPrompt])

  // Clear initial-expand flag once node loses selection
  useEffect(() => {
    if (!selected && hadInitialExpand) setHadInitialExpand(false)
  }, [selected, hadInitialExpand])

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    // TODO: upload to backend via assetsApi when video upload is wired up
    console.info('[VideoNode] Upload:', file.name)
  }

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || generating) return

    // If already generating, abort
    if (generating && abortRef.current) {
      abortRef.current.abort()
      return
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setGenerating(true)
    setStatusMsg('准备中...')

    try {
      const { klingGenerateVideo, jimengGenerateVideo, persistRemoteVideo } = await import('@/api')
      const { resolveImageToDataUrl } = await import('@/stores/imageStore')
      const { addLog } = await import('@/stores/logStore')

      // Resolve upstream image URLs to base64 for API call
      const resolveRef = async (ref: string | undefined) => {
        if (!ref) return undefined
        const dataUrl = await resolveImageToDataUrl(ref)
        return dataUrl ?? undefined
      }

      // Collect keyframe images (first / last) from connected upstream nodes
      const upstreamImages = incomingImageUrls
      const firstFrameRef = upstreamImages[0]
      const lastFrameRef  = upstreamImages[1]

      let imageDataUrl: string | undefined
      let tailImageDataUrl: string | undefined

      if (activeTab === 'img2video' || activeTab === 'keyframes') {
        imageDataUrl = await resolveRef(firstFrameRef)
        if (activeTab === 'keyframes') {
          tailImageDataUrl = await resolveRef(lastFrameRef)
        }
      }

      const opts = {
        prompt: prompt.trim(),
        imageDataUrl,
        tailImageDataUrl,
        duration:      videoParams.duration,
        aspectRatio:   videoParams.aspectRatio,
        resolution:    videoParams.resolution,
        generateAudio: videoParams.generateAudio,
        sound:         (videoParams.generateAudio ? 'on' : 'off') as 'on' | 'off',
        audioSync:     videoParams.audioSync,
        signal: ctrl.signal,
        onProgress: (msg: string) => setStatusMsg(msg),
      }

      let videoUrl: string
      if (selectedModel === 'kling') {
        videoUrl = await klingGenerateVideo(opts)
      } else {
        videoUrl = await jimengGenerateVideo(opts)
      }

      // 将远程 CDN 视频持久化到后端 backend/uploads/videos/，
      // 得到一个稳定本地 URL，避免 CDN 过期后节点失效。
      setStatusMsg('保存视频到本地...')
      addLog({
        level: 'info', category: 'ai',
        message: '[持久化] 开始下载 CDN 视频到本地',
        detail: `源: ${videoUrl.slice(0, 100)}`,
      })
      const localUrl = await persistRemoteVideo(videoUrl)

      // Save to node data
      updateNode(data.id, {
        videoUrl: localUrl,
        videoSource: 'generated',
        videoPrompt: prompt.trim(),
        videoModel: selectedModel,
      } as any)

      addLog({
        level: 'info', category: 'ai',
        message: `[VideoNode] 视频生成成功 (${selectedModel})`,
        detail: localUrl === videoUrl
          ? `CDN: ${videoUrl.slice(0, 100)}`
          : `CDN: ${videoUrl.slice(0, 80)}...\n已保存到本地: ${localUrl}\n磁盘路径: backend${localUrl.replace(/\//g, '\\')}`,
      })
      setStatusMsg('')
    } catch (err) {
      if ((err as Error).message === '已取消') {
        setStatusMsg('')
      } else {
        const msg = String(err)
        setStatusMsg(`生成失败: ${msg.slice(0, 60)}`)
        const { addLog } = await import('@/stores/logStore')
        addLog({ level: 'error', category: 'ai', message: `[VideoNode] 视频生成失败`, detail: msg })
      }
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }, [prompt, generating, selectedModel, activeTab, incomingImageUrls, data.id, updateNode, videoParams])

  /** 点击「首尾帧生成视频」快捷项：在左侧创建首帧+尾帧图片节点并连线 */
  function handleKeyframesQuickAction() {
    const GAP = 80
    const IMG_W = 380
    const x = data.position.x - IMG_W - GAP
    const firstId = `libtv_image_${Date.now()}_first`
    const lastId  = `libtv_image_${Date.now() + 1}_last`

    addNode({
      id: firstId,
      type: 'libtv_image',
      label: '首帧',
      category: 'process',
      position: { x, y: data.position.y - 220 },
      config: {},
      imageUrl: defaultFirstFrame,
      imageSource: 'uploaded',
    } as any)
    addNode({
      id: lastId,
      type: 'libtv_image',
      label: '尾帧',
      category: 'process',
      position: { x, y: data.position.y + 60 },
      config: {},
      imageUrl: defaultLastFrame,
      imageSource: 'uploaded',
    } as any)
    addEdge({ id: `e-${firstId}-${data.id}`, source: firstId, target: data.id })
    addEdge({ id: `e-${lastId}-${data.id}`,  source: lastId,  target: data.id })
    setActiveTab('keyframes')
  }

  /** 点击「首帧生成视频」快捷项：在左侧创建一个首帧图片节点并连线 */
  function handleFirstFrameQuickAction() {
    const GAP = 80
    const IMG_W = 380
    const firstId = `libtv_image_${Date.now()}_first`

    addNode({
      id: firstId,
      type: 'libtv_image',
      label: '首帧',
      category: 'process',
      position: { x: data.position.x - IMG_W - GAP, y: data.position.y },
      config: {},
      imageUrl: defaultFirstFrame,
      imageSource: 'uploaded',
    } as any)
    addEdge({ id: `e-${firstId}-${data.id}`, source: firstId, target: data.id })
    setActiveTab('img2video')
  }

  return (
    <div
      style={{
        position: 'relative',
        width: NODE_W,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Upload button — floats above node when selected AND no video */}
      {showSelected && !hasVideo && (
        <div style={{
          position: 'absolute', top: -38, left: '50%',
          transform: 'translateX(-50%)', zIndex: 10,
        }}>
          <button
            className="nodrag nopan"
            onClick={handleUploadClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#1e1e1e', border: '1px solid #3a3a3a',
              borderRadius: 20, padding: '5px 16px',
              color: '#bbb', fontSize: 12, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = '#555'; el.style.color = '#fff'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = '#3a3a3a'; el.style.color = '#bbb'
            }}
          >
            <Upload size={12} />
            上传
          </button>
        </div>
      )}

      {/* Reveal-in-folder button — floats above node when selected AND the
          video is saved to local /uploads/ (won't help for raw CDN URLs). */}
      {showSelected && hasVideo && data.videoUrl?.startsWith('/uploads/') && (
        <div style={{
          position: 'absolute', top: -38, left: '50%',
          transform: 'translateX(-50%)', zIndex: 10,
        }}>
          <button
            className="nodrag nopan"
            onClick={async (e) => {
              e.stopPropagation()
              try {
                const { revealVideoInFolder } = await import('@/api')
                await revealVideoInFolder(data.videoUrl!)
                addLog({
                  level: 'info', category: 'operation',
                  message: '[VideoNode] 已打开文件所在位置',
                  detail: data.videoUrl,
                })
              } catch (err) {
                const detail = (err as any)?.response?.data?.detail || String(err)
                addLog({
                  level: 'error', category: 'operation',
                  message: '[VideoNode] 打开文件位置失败',
                  detail,
                })
              }
            }}
            title="在文件夹中显示"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: '#1e1e1e', border: '1px solid #3a3a3a',
              borderRadius: 20, padding: '5px 14px',
              color: '#bbb', fontSize: 12, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
              whiteSpace: 'nowrap',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = '#555'; el.style.color = '#fff'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = '#3a3a3a'; el.style.color = '#bbb'
            }}
          >
            <FolderOpen size={12} />
            打开文件夹
          </button>
        </div>
      )}

      {/* Title */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: TITLE_H, paddingLeft: 2, paddingBottom: 6,
      }}>
        <Play size={13} color="#888" />
        <span style={{ fontSize: 13, color: '#bbb', fontWeight: 500 }}>{nodeLabel}</span>
      </div>

      {/* Card */}
      <div style={{
        background: '#1a1a1a',
        border: showSelected
          ? '1.5px solid #707070'
          : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2a2a2a',
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        boxShadow: showSelected
          ? '0 0 0 2px rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        {hasVideo ? (
          /* ── Video mode ── */
          <div style={{ position: 'relative', height: PLACEHOLDER_H, background: '#111' }}>
            <video
              src={data.videoUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              controls
              autoPlay
              loop
              muted
              playsInline
            />
            {/* Replace button */}
            <button
              className="nodrag nopan"
              onClick={handleUploadClick}
              style={{
                position: 'absolute', top: 10, right: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30,
                background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, cursor: 'pointer', color: '#ccc',
                transition: 'background 150ms ease, color 150ms ease',
                backdropFilter: 'blur(4px)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'rgba(0,0,0,0.85)'; el.style.color = '#fff'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'rgba(0,0,0,0.5)'; el.style.color = '#ccc'
              }}
              title="替换视频"
            >
              <Upload size={13} />
            </button>
          </div>
        ) : (
          /* ── Empty / placeholder mode ── */
          <>
            <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

            {/* Placeholder area */}
            <div style={{
              height: PLACEHOLDER_H,
              background: '#1a1a1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {generating ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <Loader2 size={28} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>{statusMsg || '正在生成视频...'}</span>
                </div>
              ) : (
                /* Play circle icon */
                <div style={{
                  width: 52, height: 52,
                  border: '1.5px solid #333',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#141414',
                }}>
                  <Play size={20} color="#404040" style={{ marginLeft: 2 }} />
                </div>
              )}
            </div>

            {/* Quick actions — only when no edges connected and no video content */}
            {!hasVideo && !hasAnyEdge && !generating && (
              <div style={{ padding: '14px 16px 16px' }}>
                <span style={{ fontSize: 12, color: '#555', marginBottom: 10, display: 'block' }}>尝试：</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    { Icon: Layers,   label: '首尾帧生成视频', action: handleKeyframesQuickAction },
                    { Icon: Sparkles, label: '首帧生成视频',   action: handleFirstFrameQuickAction },
                  ].map(({ Icon, label, action }) => (
                    <button
                      key={label}
                      className="nodrag nopan"
                      onClick={action}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#888', fontSize: 13, padding: '7px 8px',
                        borderRadius: 8, textAlign: 'left', width: '100%',
                        transition: 'background 150ms, color 150ms',
                        fontFamily: 'inherit',
                      }}
                      onMouseEnter={e => {
                        const el = e.currentTarget as HTMLButtonElement
                        el.style.background = '#252525'; el.style.color = '#ccc'
                      }}
                      onMouseLeave={e => {
                        const el = e.currentTarget as HTMLButtonElement
                        el.style.background = 'none'; el.style.color = '#888'
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 22, height: 22, flexShrink: 0,
                      }}>
                        <Icon size={14} />
                      </span>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Prompt panel — expands below when selected (hidden during multi-select) */}
      <CollapsibleSection expanded={((!!selected && !dragging) || hadInitialExpand) && !isMultiSelected}>
        <ZoomInvariantPanel naturalWidth={NODE_W} nodeWidth={NODE_W}>
          <VideoPromptPanel
            value={prompt}
            onChange={setPrompt}
            onSend={handleSend}
            generating={generating}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            keyframeUrls={incomingImageUrls}
            refImageUrls={resolvedRefUrls}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            statusMsg={statusMsg}
            videoParams={videoParams}
            onParamsChange={setVideoParams}
          />
        </ZoomInvariantPanel>
      </CollapsibleSection>

      {/* Target handle (left) + menu */}
      <div style={{
        position: 'absolute', left: -11, top: HANDLE_Y,
        transform: 'translateY(-50%)', width: 22, height: 22,
      }}>
        <Handle
          type="target"
          position={Position.Left}
          style={{
            width: 22, height: 22,
            background: '#1a1a1a', border: '1.5px solid #606060',
            borderRadius: '50%',
            top: 0, left: 0, transform: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: handlesVisible ? 1 : 0,
            pointerEvents: handlesVisible ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
            position: 'relative',
          }}
          onClick={e => { e.stopPropagation(); setTargetMenuOpen(v => !v) }}
        >
          <span style={{
            pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -52%)',
          }}>+</span>
        </Handle>
        {targetMenuOpen && (
          <NodeAddMenu
            nodeType="libtv_video"
            sourceNodeId={data.id}
            sourcePosition={data.position}
            sourceNodeWidth={NODE_W}
            direction="left"
            onClose={() => setTargetMenuOpen(false)}
          />
        )}
      </div>

      {/* Source handle + menu (right) */}
      <div style={{
        position: 'absolute', right: -11, top: HANDLE_Y,
        transform: 'translateY(-50%)', width: 22, height: 22,
      }}>
        <Handle
          type="source"
          position={Position.Right}
          style={{
            width: 22, height: 22,
            background: '#1a1a1a', border: '1.5px solid #606060',
            borderRadius: '50%',
            top: 0, left: 0, transform: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: handlesVisible ? 1 : 0,
            pointerEvents: handlesVisible ? 'auto' : 'none',
            transition: 'opacity 150ms ease',
            position: 'relative',
          }}
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v) }}
        >
          <span style={{
            pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -52%)',
          }}>+</span>
        </Handle>
        {menuOpen && (
          <NodeAddMenu
            nodeType="libtv_video"
            sourceNodeId={data.id}
            sourcePosition={data.position}
            sourceNodeWidth={NODE_W}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

export default memo(VideoNode)
