import { memo, useRef, useState, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Image as ImageIcon, Upload, Monitor, Video,
  Languages, SlidersHorizontal, ChevronDown, ArrowUp,
  Box, Bookmark, Crosshair, Maximize2, Zap,
  RefreshCw, Wand2, Download, Fullscreen,
} from 'lucide-react'
import CollapsibleSection from './shared/CollapsibleSection'
import NodeAddMenu from './shared/NodeAddMenu'
import { useProjectStore } from '../../stores/projectStore'
import { saveImage, resolveImageUrl } from '../../stores/imageStore'

export interface ImageNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  imageUrl?: string
  nodeIndex?: number
}

const NODE_W      = 400
const TITLE_H     = 28    // title row height (px) — card starts just below
const PLACEHOLDER_H = 220 // height of the empty placeholder area
const DEFAULT_HANDLE_Y = TITLE_H + PLACEHOLDER_H / 2

type QuickActionItem =
  | { label: string; icon: React.ElementType }
  | { label: string; hdBadge: true }

const QUICK_ACTIONS: QuickActionItem[] = [
  { icon: Upload, label: '图生图' },
  { label: '图片高清', hdBadge: true },
]

/* ── Image editing toolbar (floats above node when selected + has image) ─── */

const TOOLBAR_GROUPS: Array<{
  items: Array<{ label: string; chevron: boolean; accent?: boolean }>
}> = [
  {
    items: [
      { label: '多角度', chevron: false },
    ],
  },
  {
    items: [
      { label: '打光', chevron: false },
    ],
  },
  {
    items: [
      { label: '九宫格', chevron: true },
    ],
  },
  {
    items: [
      { label: 'HD 高清', chevron: true, accent: true },
    ],
  },
  {
    items: [
      { label: '宫格切分', chevron: true },
    ],
  },
]

function ImageEditToolbar({ visible }: { visible: boolean }) {
  return (
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute',
        top: -50,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: '#1c1c1c',
        border: '1px solid #333',
        borderRadius: 24,
        padding: '6px 14px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        whiteSpace: 'nowrap',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 150ms ease',
      }}
    >
      {/* Left groups */}
      {TOOLBAR_GROUPS.map((group, gi) => (
        <span key={gi} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {gi > 0 && (
            <span style={{ width: 1, height: 14, background: '#2e2e2e', margin: '0 10px' }} />
          )}
          {group.items.map(item => (
            <button
              key={item.label}
              className="nodrag nopan"
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', cursor: 'pointer',
                color: item.accent ? '#fff' : '#bbb',
                fontSize: 13, padding: '2px 4px', borderRadius: 6,
                transition: 'color 0.12s',
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = item.accent ? '#fff' : '#bbb' }}
            >
              {item.accent && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, color: '#aaa',
                  border: '1px solid #555', borderRadius: 3,
                  padding: '1px 3px', lineHeight: 1, marginRight: 2,
                }}>HD</span>
              )}
              {!item.accent && item.label}
              {item.accent && item.label.replace('HD ', '')}
              {item.chevron && <ChevronDown size={11} style={{ opacity: 0.5 }} />}
            </button>
          ))}
        </span>
      ))}

      {/* Separator */}
      <span style={{ width: 1, height: 14, background: '#2e2e2e', margin: '0 8px' }} />

      {/* Right icon buttons */}
      {[
        { Icon: Wand2,    title: '一键优化' },
        { Icon: RefreshCw, title: '重新生成' },
        { Icon: Download,  title: '下载' },
        { Icon: Fullscreen, title: '全屏预览' },
      ].map(({ Icon, title }) => (
        <button
          key={title}
          className="nodrag nopan"
          title={title}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, background: 'none', border: 'none',
            cursor: 'pointer', color: '#777', borderRadius: 7,
            transition: 'color 0.12s, background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ddd'; (e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#777'; (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

/* ── Lib Nano Pro icon ─────────────────────────────────────── */

function LibNanoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 1.5L9 5.5H13L10 8.5L11.5 12.5L7 10L2.5 12.5L4 8.5L1 5.5H5L7 1.5Z"
        fill="none" stroke="#6b8fff" strokeWidth="1.2" strokeLinejoin="round"
      />
    </svg>
  )
}

/* ── Image prompt panel ────────────────────────────────────── */

function ImagePromptPanel({ value, onChange }: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div
      className="nodrag nopan"
      style={{
        marginTop: 8,
        background: '#161616',
        border: '1px solid #2a2a2a',
        borderRadius: 14,
        padding: '12px 14px 10px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}
    >
      {/* Top pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        {([
          { Icon: Box,       label: '风格' },
          { Icon: Bookmark,  label: '标记' },
          { Icon: Crosshair, label: '聚焦' },
        ] as const).map(({ Icon, label }) => (
          <button
            key={label}
            className="nodrag nopan"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: '#1e1e1e', border: '1px solid #2e2e2e',
              borderRadius: 8, padding: '4px 10px',
              color: '#666', fontSize: 12, cursor: 'pointer',
              transition: 'border-color 0.12s, color 0.12s',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#aaa' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e2e'; e.currentTarget.style.color = '#666' }}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          className="nodrag nopan"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#444', padding: 4, borderRadius: 4 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        className="nodrag nopan nowheel"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.stopPropagation()}
        placeholder="描述你想要生成的画面内容，按/呼出指令，@引用素材"
        rows={3}
        style={{
          background: 'transparent', border: 'none', outline: 'none',
          color: '#ccc', fontSize: 13, lineHeight: 1.6,
          resize: 'none', width: '100%', boxSizing: 'border-box',
          fontFamily: 'inherit',
        }}
      />

      {/* Bottom bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingTop: 8, marginTop: 4,
        borderTop: '1px solid #272727',
      }}>
        {/* Model */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#777', fontSize: 11, padding: '2px 4px', borderRadius: 5, flexShrink: 0,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <LibNanoIcon />
          <span style={{ fontWeight: 500 }}>Lib Nano Pro</span>
          <ChevronDown size={9} />
        </button>

        <div style={{ width: 1, height: 10, background: '#2a2a2a', flexShrink: 0 }} />

        {/* Ratio */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#666', fontSize: 11, padding: '2px 4px', borderRadius: 5, flexShrink: 0,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Monitor size={11} />
          <span>16:9 · 2K</span>
          <ChevronDown size={9} />
        </button>

        <div style={{ width: 1, height: 10, background: '#2a2a2a', flexShrink: 0 }} />

        {/* Camera */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#666', fontSize: 11, padding: '2px 4px', borderRadius: 5, flexShrink: 0,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Video size={11} />
          <span>摄像机控制</span>
        </button>

        <div style={{ flex: 1 }} />

        {/* Lang */}
        <button className="nodrag nopan" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#555', padding: 3, borderRadius: 4,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
        >
          <Languages size={13} />
        </button>

        {/* Sliders */}
        <button className="nodrag nopan" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#555', padding: 3, borderRadius: 4,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
        >
          <SlidersHorizontal size={13} />
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
          <span>1张</span>
          <ChevronDown size={9} />
        </button>

        {/* Credits */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#555', fontSize: 11 }}>
          <Zap size={11} />
          <span>14</span>
        </div>

        {/* Send */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 8, border: 'none',
          cursor: 'pointer', background: '#252525', color: '#666',
          transition: 'background 0.15s, color 0.15s', flexShrink: 0,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3a6ff7'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525'; (e.currentTarget as HTMLButtonElement).style.color = '#666' }}
        >
          <ArrowUp size={13} />
        </button>
      </div>
    </div>
  )
}

/* ── Main ──────────────────────────────────────────────────── */

function ImageNode({ data, selected, dragging }: NodeProps<ImageNodeData>) {
  const [isHovered,   setIsHovered]   = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)
  const [prompt,      setPrompt]      = useState('')
  // Rendered image height in pixels (updated on img load)
  const [imgRenderedH,  setImgRenderedH]  = useState<number | null>(null)
  const [imgBroken,     setImgBroken]     = useState(false)
  // Resolved display URL (blob URL from IndexedDB or plain URL)
  const [displayUrl,    setDisplayUrl]    = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateNode   = useProjectStore(s => s.updateNode)
  const currentProject = useProjectStore(s => s.currentProject)

  const hasImage       = !!displayUrl && !imgBroken
  const handlesVisible = isHovered || (!!selected && !dragging)
  const nodeLabel      = data.label || '图片'

  // Resolve idb:// reference → blob URL for display
  useEffect(() => {
    let revoke: string | null = null
    let cancelled = false

    resolveImageUrl(data.imageUrl).then(url => {
      if (cancelled) return
      setDisplayUrl(url)
      setImgBroken(false)
      setImgRenderedH(null)
      // Track blob URLs so we can revoke them when imageUrl changes
      if (url && url.startsWith('blob:')) revoke = url
    })

    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [data.imageUrl])

  // Handle Y: center of the image area
  const imageAreaH = hasImage ? (imgRenderedH ?? PLACEHOLDER_H) : PLACEHOLDER_H
  const handleY    = TITLE_H + imageAreaH / 2

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgRenderedH(null)
    setImgBroken(false)
    e.target.value = ''

    const projectId = currentProject?.id ?? 'local'
    const ref = await saveImage(projectId, file)
    updateNode(data.id, { imageUrl: ref } as Partial<ImageNodeData>)
  }

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const naturalRatio = img.naturalHeight / img.naturalWidth
    setImgRenderedH(Math.round(NODE_W * naturalRatio))
    setImgBroken(false)
  }

  function handleImgError() {
    // Blob URL expired or broken — treat as no image
    setImgBroken(true)
    setImgRenderedH(null)
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
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Upload button — floats above node when selected AND no image */}
      {selected && !dragging && !hasImage && (
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
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#555'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#3a3a3a'; (e.currentTarget as HTMLButtonElement).style.color = '#bbb' }}
          >
            <Upload size={12} />
            上传
          </button>
        </div>
      )}

      {/* Edit toolbar — floats above node when selected AND has image */}
      {hasImage && (
        <ImageEditToolbar visible={!!selected && !dragging} />
      )}

      {/* Title */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: TITLE_H, paddingLeft: 2, paddingBottom: 6,
      }}>
        <ImageIcon size={13} color="#888" />
        <span style={{ fontSize: 13, color: '#bbb', fontWeight: 500 }}>{nodeLabel}</span>
      </div>

      {/* Card */}
      <div style={{
        background: '#1a1a1a',
        border: (selected && !dragging)
          ? '1.5px solid #707070'
          : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2a2a2a',
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        boxShadow: (selected && !dragging)
          ? '0 0 0 2px rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        {hasImage ? (
          /* ── Image mode: natural aspect ratio + replace button + collapsible actions ── */
          <>
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <img
                src={displayUrl!} alt=""
                onLoad={handleImgLoad}
                onError={handleImgError}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
              {/* Replace button — always visible top-right */}
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
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.85)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.5)'; (e.currentTarget as HTMLButtonElement).style.color = '#ccc' }}
                title="替换图片"
              >
                <Upload size={13} />
              </button>
            </div>
            {/* Quick actions — shown when selected */}
            <CollapsibleSection expanded={!!selected && !dragging}>
              <div style={{ padding: '10px 16px 12px', borderTop: '1px solid #222' }}>
                {QUICK_ACTIONS.map(a => (
                  <div
                    key={a.label}
                    className="nodrag nopan"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
                      color: '#aaa', fontSize: 13,
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ddd' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa' }}
                  >
                    {'hdBadge' in a ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 14,
                        fontSize: 8, fontWeight: 700, color: '#888',
                        border: '1px solid #555', borderRadius: 3,
                        lineHeight: 1, flexShrink: 0,
                      }}>HD</span>
                    ) : (
                      <span style={{ flexShrink: 0, opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                        <a.icon size={14} />
                      </span>
                    )}
                    {a.label}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          </>
        ) : (
          /* ── Empty mode: placeholder + quick actions ── */
          <>
            {/* Placeholder image area */}
            <div style={{
              height: PLACEHOLDER_H, background: '#141414',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="62" height="52" viewBox="0 0 62 52" fill="none">
                <path d="M5 47L20 21L30 33.5L40 18L57 47H5Z"
                  fill="#272727" stroke="#363636" strokeWidth="1.5" strokeLinejoin="round"/>
                <circle cx="18" cy="12" r="5.5"
                  fill="#272727" stroke="#363636" strokeWidth="1.5"/>
              </svg>
            </div>

            {/* Quick actions */}
            <div style={{ padding: '12px 16px 14px' }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>尝试:</div>
              {QUICK_ACTIONS.map(a => (
                <div
                  key={a.label}
                  className="nodrag nopan"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
                    color: '#aaa', fontSize: 14,
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ddd' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#aaa' }}
                >
                  {'hdBadge' in a ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 20, height: 14,
                      fontSize: 8, fontWeight: 700, color: '#888',
                      border: '1px solid #555', borderRadius: 3,
                      lineHeight: 1, flexShrink: 0,
                    }}>HD</span>
                  ) : (
                    <span style={{ flexShrink: 0, opacity: 0.7, display: 'flex', alignItems: 'center' }}>
                      <a.icon size={14} />
                    </span>
                  )}
                  {a.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Prompt panel — expands below when selected */}
      <CollapsibleSection expanded={!!selected && !dragging}>
        <ImagePromptPanel value={prompt} onChange={setPrompt} />
      </CollapsibleSection>

      {/* Target handle (left) + menu */}
      <div style={{
        position: 'absolute', left: -11, top: handleY,
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
          onClick={(e) => { e.stopPropagation(); setTargetMenuOpen(v => !v) }}
        >
          <span style={{
            pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -52%)',
          }}>+</span>
        </Handle>
        {targetMenuOpen && (
          <NodeAddMenu
            nodeType="libtv_image"
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
        position: 'absolute', right: -11, top: handleY,
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
          onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v) }}
        >
          <span style={{
            pointerEvents: 'none', fontSize: 16, color: '#888', lineHeight: 1,
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -52%)',
          }}>+</span>
        </Handle>
        {menuOpen && (
          <NodeAddMenu
            nodeType="libtv_image"
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

export default memo(ImageNode)
