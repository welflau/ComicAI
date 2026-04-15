import { memo, useRef, useState, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Play, Upload, ChevronDown, ArrowUp,
  Maximize2, Zap, Tag, Camera, Users, Settings, Languages,
  Layers, Sparkles, Loader2,
} from 'lucide-react'
import CollapsibleSection from './shared/CollapsibleSection'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
import NodeAddMenu from './shared/NodeAddMenu'
import { useIsMultiSelected } from './shared/useIsMultiSelected'

/* ── Types ─────────────────────────────────────────────────────────── */

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
  /** When true, the prompt panel starts expanded (e.g. created from + menu) */
  initialPanelExpanded?: boolean
}

/* ── Constants ─────────────────────────────────────────────────────── */

const NODE_W        = 520
const TITLE_H       = 28    // title row height (px) — card starts just below
const PLACEHOLDER_H = 220   // height of empty placeholder
const HANDLE_Y      = TITLE_H + PLACEHOLDER_H / 2

/* ── Seedance icon ─────────────────────────────────────────────────── */

function SeedanceIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1L12 5.5V8.5L7 13L2 8.5V5.5L7 1Z"
        fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeLinejoin="round"
      />
      <circle cx="7" cy="7" r="2" fill="#a78bfa" />
    </svg>
  )
}

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

function VideoPromptPanel({ value, onChange, onSend, generating }: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  generating: boolean
}) {
  const [activeTab, setActiveTab] = useState<VideoTab>('text2video')

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
                onMouseDown={e => { e.preventDefault(); setActiveTab(tab.id) }}
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

      {/* ── Row 2: icon action buttons ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
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

      {/* ── Bottom toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        paddingTop: 8,
        borderTop: '1px solid #272727',
      }}>
        {/* Model selector */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#777', fontSize: 11, padding: '2px 4px', borderRadius: 5, flexShrink: 0,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <SeedanceIcon />
          <span style={{ fontWeight: 500 }}>Seedance 2.0</span>
          <span style={{ color: '#a78bfa', fontSize: 10, fontWeight: 600, marginLeft: 1 }}>VIP</span>
          <span style={{ color: '#555', fontSize: 11, marginLeft: 1 }}>♥</span>
          <ChevronDown size={9} />
        </button>

        <div style={{ width: 1, height: 10, background: '#2a2a2a', flexShrink: 0 }} />

        {/* Resolution / duration / audio */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#666', fontSize: 11, padding: '2px 4px', borderRadius: 5, flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <span>16:9 · 720P · 5s</span>
          <span style={{ fontSize: 10, marginLeft: 1 }}>🔊</span>
          <ChevronDown size={9} />
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
  const [hadInitialExpand,  setHadInitialExpand]  = useState(() => !!data.initialPanelExpanded)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isMultiSelected = useIsMultiSelected()

  const hasVideo        = !!data.videoUrl
  const handlesVisible  = isHovered || (!!selected && !dragging)
  const nodeLabel       = data.label || '视频'
  // Show selected-state styling only when a single node is selected
  const showSelected    = !!selected && !dragging && !isMultiSelected

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

  function handleSend() {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    // TODO: call video generation API
    setTimeout(() => setGenerating(false), 2000)
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
              controls={false}
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
                  <span style={{ color: '#555', fontSize: 12 }}>正在生成视频...</span>
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

            {/* Quick actions */}
            {!data.initialPanelExpanded && !generating && (
              <div style={{ padding: '14px 16px 16px' }}>
                <span style={{ fontSize: 12, color: '#555', marginBottom: 10, display: 'block' }}>尝试：</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {[
                    { Icon: Layers,   label: '首尾帧生成视频' },
                    { Icon: Sparkles, label: '首帧生成视频' },
                  ].map(({ Icon, label }) => (
                    <button
                      key={label}
                      className="nodrag nopan"
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

      {/* Prompt panel — expands below when selected */}
      <CollapsibleSection expanded={(!!selected && !dragging) || hadInitialExpand}>
        <ZoomInvariantPanel naturalWidth={NODE_W} nodeWidth={NODE_W}>
          <VideoPromptPanel
            value={prompt}
            onChange={setPrompt}
            onSend={handleSend}
            generating={generating}
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
