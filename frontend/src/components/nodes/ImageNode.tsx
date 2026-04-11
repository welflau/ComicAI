import { memo, useRef, useState, useEffect, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Image as ImageIcon, Upload, Monitor, Video,
  Languages, SlidersHorizontal, ChevronDown, ArrowUp,
  Box, Maximize2, Zap,
  RefreshCw, Wand2, Download, Fullscreen, Loader2,
} from 'lucide-react'
import CollapsibleSection from './shared/CollapsibleSection'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
import NodeAddMenu from './shared/NodeAddMenu'
import { useProjectStore } from '../../stores/projectStore'
import { saveImage, resolveImageUrl } from '../../stores/imageStore'
import { lightaiGenerateImage } from '../../api'
import { addLog } from '../../stores/logStore'

export interface ImageNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  imageUrl?: string
  nodeIndex?: number
  imageSource?: 'uploaded' | 'generated'
  imagePrompt?: string
}

const NODE_W        = 400
const TITLE_H       = 28    // title row height (px) — card starts just below
const PLACEHOLDER_H = 220   // height of the empty placeholder area
const MAX_IMG_H     = 260   // max rendered image height — caps tall portrait images
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

/* ── Reference image thumbnails ───────────────────────────── */

function RefImageThumbnails({ urls }: { urls: string[] }) {
  if (!urls.length) return null
  const first = urls[0]
  const count = urls.length
  return (
    <div
      className="nodrag nopan"
      style={{ position: 'relative', flexShrink: 0, display: 'inline-flex', cursor: 'pointer' }}
      title={`${count} 张参考图`}
    >
      <img
        src={first}
        alt="参考图"
        style={{
          width: 36, height: 36, objectFit: 'cover',
          borderRadius: 8, border: '1px solid #383838',
          display: 'block',
        }}
      />
      {count > 0 && (
        <span style={{
          position: 'absolute', bottom: -4, right: -4,
          minWidth: 14, height: 14, lineHeight: '14px',
          background: '#3a6ff7', color: '#fff',
          fontSize: 9, fontWeight: 700, textAlign: 'center',
          borderRadius: 7, padding: '0 3px',
          border: '1.5px solid #161616',
          pointerEvents: 'none',
        }}>{count}</span>
      )}
    </div>
  )
}

/* ── Image prompt panel ────────────────────────────────────── */

function ImagePromptPanel({ value, onChange, onSend, generating, refImages = [] }: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  generating: boolean
  hasImage: boolean   // kept in signature for API compat, unused in layout
  refImages?: string[]
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
      {/* ── Row 1: style btn + ref imgs + expand ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {/* Style button */}
        <button
          className="nodrag nopan"
          style={{
            flexShrink: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, width: 52, height: 52,
            background: '#1e1e1e', border: '1px solid #2e2e2e',
            borderRadius: 10, cursor: 'pointer', color: '#666',
            transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#aaa' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#2e2e2e'; e.currentTarget.style.color = '#666' }}
        >
          <Box size={17} />
          <span style={{ fontSize: 10, lineHeight: 1 }}>风格</span>
        </button>

        {/* Reference image thumbnails */}
        {refImages.length > 0 && <RefImageThumbnails urls={refImages} />}

        <div style={{ flex: 1 }} />

        {/* Expand */}
        <button
          className="nodrag nopan"
          style={{
            flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
            color: '#3a3a3a', padding: 3, borderRadius: 4, alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#777' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#3a3a3a' }}
        >
          <Maximize2 size={12} />
        </button>
      </div>

      {/* ── Row 2: prompt textarea ── */}
      <textarea
        className="nodrag nopan nowheel"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.stopPropagation()}
        placeholder="描述你想要生成的画面内容..."
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: '#111', border: '1px solid #2e2e2e', borderRadius: 8,
          outline: 'none', padding: '8px 10px',
          color: value ? '#ccc' : '#555', fontSize: 13, lineHeight: 1.65,
          resize: 'none', fontFamily: 'inherit',
        }}
      />

      {/* Bottom bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        paddingTop: 8, marginTop: 8,
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
        </button>

        <div style={{ flex: 1, minWidth: 0 }} />

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
        <button className="nodrag nopan"
          onClick={onSend}
          disabled={generating || !value.trim()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 8, border: 'none',
            cursor: generating || !value.trim() ? 'not-allowed' : 'pointer',
            background: generating ? '#2a4a9a' : value.trim() ? '#fff' : '#252525',
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

/* ── Main ──────────────────────────────────────────────────── */

function ImageNode({ data, selected, dragging }: NodeProps<ImageNodeData>) {
  const [isHovered,   setIsHovered]   = useState(false)
  const [menuOpen,    setMenuOpen]    = useState(false)
  const [targetMenuOpen, setTargetMenuOpen] = useState(false)
  const [prompt,      setPrompt]      = useState(() => data.imagePrompt ?? '')
  const [generating,  setGenerating]  = useState(false)
  const [genError,    setGenError]    = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Rendered image size (updated on img load)
  const [imgRenderedH,  setImgRenderedH]  = useState<number | null>(null)
  const [imgRenderedW,  setImgRenderedW]  = useState<number | null>(null)
  const [imgBroken,     setImgBroken]     = useState(false)
  // Resolved display URL (blob URL from IndexedDB or plain URL)
  const [displayUrl,    setDisplayUrl]    = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateNode     = useProjectStore(s => s.updateNode)
  const currentProject = useProjectStore(s => s.currentProject)
  const allEdges       = useProjectStore(s => s.edges)
  const allNodes       = useProjectStore(s => s.nodes)

  // Resolved blob URLs for connected reference images
  const [refImages, setRefImages] = useState<string[]>([])

  const hasImage       = !!displayUrl && !imgBroken
  const isUploadedOnly = data.imageSource === 'uploaded'
  const handlesVisible = isHovered || (!!selected && !dragging)
  const nodeLabel      = data.label || '图片'

  // Sync imagePrompt from data (e.g. after node reload) into local state,
  // but only when it actually changes and local state hasn't diverged
  useEffect(() => {
    if (data.imagePrompt !== undefined) {
      setPrompt(data.imagePrompt)
    }
  }, [data.imagePrompt])

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

  // Resolve reference images from connected source nodes
  useEffect(() => {
    const incomingEdges = allEdges.filter(e => e.target === data.id)
    const sourceImageUrls = incomingEdges
      .map(e => allNodes.find(n => n.id === e.source))
      .filter((n): n is NonNullable<typeof n> => !!n && !!n.imageUrl)
      .map(n => n.imageUrl as string)

    if (!sourceImageUrls.length) {
      setRefImages([])
      return
    }

    let cancelled = false
    const revokeList: string[] = []

    Promise.all(sourceImageUrls.map(u => resolveImageUrl(u))).then(urls => {
      if (cancelled) return
      const valid = urls.filter((u): u is string => !!u)
      valid.forEach(u => { if (u.startsWith('blob:')) revokeList.push(u) })
      setRefImages(valid)
    })

    return () => {
      cancelled = true
      revokeList.forEach(u => URL.revokeObjectURL(u))
    }
  }, [allEdges, allNodes, data.id])

  // Handle Y: center of the image area
  const nodeW      = hasImage ? (imgRenderedW ?? NODE_W) : NODE_W
  const imageAreaH = hasImage ? (imgRenderedH ?? PLACEHOLDER_H) : PLACEHOLDER_H
  const handleY    = TITLE_H + imageAreaH / 2

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return
    setGenerating(true)
    setGenError(null)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    const promptPreview = prompt.trim().length > 100 ? prompt.trim().slice(0, 100) + '…' : prompt.trim()
    addLog({
      level: 'info',
      category: 'operation',
      message: `开始生成图片: ${nodeLabel}`,
      detail: `节点ID: ${data.id}\nPrompt: ${promptPreview}`,
    })
    const t0 = Date.now()

    try {
      // Call LightAI and get image URL
      const imageUrl = await lightaiGenerateImage(prompt.trim(), ctrl.signal)

      // Fetch image bytes — try direct first (pre-signed COS URLs are public),
      // fall back to cors-proxy if blocked by CORS
      let resp: Response
      try {
        resp = await fetch(imageUrl, { signal: ctrl.signal })
      } catch {
        // CORS blocked — retry via cors-proxy
        const encoded = encodeURIComponent(imageUrl)
        resp = await fetch(`/api/cors-proxy/${encoded}`, { signal: ctrl.signal })
      }
      if (!resp.ok) throw new Error(`下载图片失败 ${resp.status}`)
      const blob = await resp.blob()
      const ext = blob.type.includes('png') ? 'png' : 'jpg'
      const file = new File([blob], `generated_${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' })

      const projectId = currentProject?.id ?? 'local'
      const ref = await saveImage(projectId, file)
      const usedPrompt = prompt.trim()
      updateNode(data.id, { imageUrl: ref, imageSource: 'generated', imagePrompt: usedPrompt } as Partial<ImageNodeData>)
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      addLog({
        level: 'info',
        category: 'operation',
        message: `图片生成完成: ${nodeLabel} (${elapsed}s)`,
        detail: `节点ID: ${data.id}\nPrompt: ${promptPreview}`,
      })
      // keep prompt visible so user can see what was used
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError' || (err as Error)?.message === '已取消') return
      const msg = (err as Error)?.message || String(err)
      setGenError(msg)
      console.error('[ImageNode] LightAI 生成失败:', msg)
      addLog({
        level: 'error',
        category: 'operation',
        message: `图片生成失败: ${nodeLabel}`,
        detail: `节点ID: ${data.id}\n错误: ${msg}`,
      })
    } finally {
      setGenerating(false)
      abortRef.current = null
    }
  }, [prompt, generating, currentProject, data.id, nodeLabel, updateNode])

  // Clean up pending request on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgRenderedH(null)
    setImgBroken(false)
    e.target.value = ''

    addLog({
      level: 'info',
      category: 'operation',
      message: `上传图片: ${nodeLabel}`,
      detail: `节点ID: ${data.id} | 文件: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
    })
    const projectId = currentProject?.id ?? 'local'
    const ref = await saveImage(projectId, file)
    updateNode(data.id, { imageUrl: ref, imageSource: 'uploaded' } as Partial<ImageNodeData>)
  }

  function handleImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const ratio = img.naturalWidth / img.naturalHeight
    // Cap by both MAX_IMG_H (height) and NODE_W (width), keep aspect ratio
    let w: number, h: number
    if (img.naturalWidth >= img.naturalHeight) {
      // landscape: full node width, cap height
      w = NODE_W
      h = Math.min(NODE_W / ratio, MAX_IMG_H)
      if (h < NODE_W / ratio) w = Math.round(h * ratio)
    } else {
      // portrait: cap height, derive width from ratio
      h = Math.min(NODE_W / ratio, MAX_IMG_H)
      w = Math.round(h * ratio)
      if (w > NODE_W) { w = NODE_W; h = Math.round(w / ratio) }
    }
    setImgRenderedW(Math.round(w))
    setImgRenderedH(Math.round(h))
    setImgBroken(false)
  }

  function handleImgError() {
    // Blob URL expired or broken — treat as no image
    setImgBroken(true)
    setImgRenderedH(null)
    setImgRenderedW(null)
  }

  return (
    <div
      style={{
        position: 'relative',
        width: nodeW,
        fontFamily: 'Inter, system-ui, sans-serif',
        transition: 'width 150ms ease',
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
                style={{
                  display: 'block',
                  width: '100%',
                  height: 'auto',
                }}
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
            {/* Quick actions removed when image is present */}
          </>
        ) : (
          /* ── Empty mode: placeholder + quick actions ── */
          <>
            {/* Placeholder image area */}
            <div style={{
              height: PLACEHOLDER_H, background: '#141414',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              {generating ? (
                <>
                  {/* Shimmer overlay */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    background: 'linear-gradient(90deg, #141414 0%, #1e1e1e 50%, #141414 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 1.5s infinite',
                  }} />
                  <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} } @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <Loader2 size={28} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ color: '#555', fontSize: 12 }}>正在生成图片...</span>
                  </div>
                </>
              ) : (
                <svg width="62" height="52" viewBox="0 0 62 52" fill="none">
                  <path d="M5 47L20 21L30 33.5L40 18L57 47H5Z"
                    fill="#272727" stroke="#363636" strokeWidth="1.5" strokeLinejoin="round"/>
                  <circle cx="18" cy="12" r="5.5"
                    fill="#272727" stroke="#363636" strokeWidth="1.5"/>
                </svg>
              )}
            </div>

            {/* Quick actions — hidden when prompt already filled in */}
            {!prompt.trim() && (
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
            )}
          </>
        )}
      </div>

      {/* Prompt panel — expands below when selected (both with and without image), hidden for upload-only nodes */}
      {!isUploadedOnly && (
        <CollapsibleSection expanded={!!selected && !dragging}>
          <ZoomInvariantPanel naturalWidth={NODE_W}>
            <ImagePromptPanel
              value={prompt}
              onChange={setPrompt}
              onSend={handleGenerate}
              generating={generating}
              hasImage={hasImage}
              refImages={refImages}
            />
          </ZoomInvariantPanel>
          {genError && (
            <div style={{
              marginTop: 6, padding: '6px 10px',
              background: '#2a1515', border: '1px solid #5a2a2a',
              borderRadius: 8, color: '#f87171', fontSize: 11, lineHeight: 1.5,
            }}>
              ⚠️ {genError}
            </div>
          )}
        </CollapsibleSection>
      )}

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
            sourceImageUrl={data.imageUrl}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

export default memo(ImageNode)
