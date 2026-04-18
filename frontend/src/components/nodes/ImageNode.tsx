import { memo, useRef, useState, useEffect, useCallback } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Image as ImageIcon, Upload, Monitor,
  ChevronDown, ArrowUp,
  Maximize2, Zap,
  RefreshCw, Wand2, Download, Fullscreen, Loader2,
  Camera, ArrowUpDown, Box, Tag, Crosshair, Languages,
} from 'lucide-react'
import CollapsibleSection from './shared/CollapsibleSection'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
import NodeAddMenu from './shared/NodeAddMenu'
import { useProjectStore } from '../../stores/projectStore'
import { saveImage, resolveImageUrl, DEFAULT_IMAGE_URL } from '../../stores/imageStore'
import { lightaiGenerateImage, streamAI, imageToolbarApi } from '../../api'
import { addLog } from '../../stores/logStore'
import type { NodeData } from '../../types'

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
  /** Persisted rendered size so the node restores at the correct dimensions on reload */
  renderedW?: number
  renderedH?: number
  /** When true, the prompt panel starts expanded (e.g. created from + menu) */
  initialPanelExpanded?: boolean
}

const NODE_W        = 400
const TITLE_H       = 28    // title row height (px) — card starts just below
const PLACEHOLDER_H = 220   // height of the empty placeholder area
const MAX_IMG_H     = 260   // max rendered image height — caps tall portrait images
const DEFAULT_HANDLE_Y = TITLE_H + PLACEHOLDER_H / 2

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

interface ImageEditToolbarProps {
  visible: boolean
  imageUrl?: string
  onMultiAngles?: () => void
  onLighting?: () => void
  onCropGrid9?: () => void
  onUpscaleHD?: () => void
  onSplitGrid?: () => void
  onOptimize?: () => void
  onRegenerate?: () => void
  onFullscreenPreview?: () => void
}

function ImageEditToolbar({ visible, imageUrl, onMultiAngles, onLighting, onCropGrid9, onUpscaleHD, onSplitGrid, onOptimize, onRegenerate, onFullscreenPreview }: ImageEditToolbarProps) {
  async function handleDownload() {
    if (!imageUrl) return
    const { resolveImageUrl } = await import('@/stores/imageStore')
    const resolved = await resolveImageUrl(imageUrl)
    if (!resolved) return
    const a = document.createElement('a')
    a.href = resolved
    a.download = `image_${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

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
              onClick={() => {
                const handlerMap: Record<string, (() => void) | undefined> = {
                  '多角度':  onMultiAngles,
                  '打光':    onLighting,
                  '九宫格':  onCropGrid9,
                  'HD 高清': onUpscaleHD,
                  '宫格切分': onSplitGrid,
                }
                const handler = handlerMap[item.label]
                if (handler) handler()
              }}
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
        { Icon: Wand2,      title: '一键优化',  onClick: onOptimize },
        { Icon: RefreshCw,  title: '重新生成',  onClick: onRegenerate },
        { Icon: Download,   title: '下载',      onClick: handleDownload },
        { Icon: Fullscreen, title: '全屏预览',  onClick: onFullscreenPreview },
      ].map(({ Icon, title, onClick }) => (
        <button
          key={title}
          className="nodrag nopan"
          title={title}
          onClick={onClick}
          disabled={title === '下载' && !imageUrl}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, background: 'none', border: 'none',
            cursor: (title === '下载' && !imageUrl) ? 'not-allowed' : 'pointer',
            color: (title === '下载' && !imageUrl) ? '#444' : '#777',
            borderRadius: 7,
            transition: 'color 0.12s, background 0.12s',
          }}
          onMouseEnter={e => {
            if (title === '下载' && !imageUrl) return
            ;(e.currentTarget as HTMLButtonElement).style.color = '#ddd'
            ;(e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.color = (title === '下载' && !imageUrl) ? '#444' : '#777'
            ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
          }}
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

type PromptTab = 'style' | 'mark' | 'focus'

function ImagePromptPanel({ value, onChange, onSend, generating, refImages = [] }: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  generating: boolean
  hasImage: boolean   // kept in signature for API compat, unused in layout
  refImages?: string[]
}) {
  const [activeTab, setActiveTab] = useState<PromptTab>('style')

  const TABS: Array<{ id: PromptTab; label: string; Icon: React.ElementType }> = [
    { id: 'style', label: '风格', Icon: Box },
    { id: 'mark',  label: '标记', Icon: Tag },
    { id: 'focus', label: '聚焦', Icon: Crosshair },
  ]

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
      {/* ── Row 1: tab buttons + ref imgs + expand ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {/* 3 tab buttons */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                className="nodrag nopan"
                onMouseDown={e => { e.preventDefault(); setActiveTab(tab.id) }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 3,
                  width: 54, height: 50,
                  background: active ? '#2a2a2a' : 'none',
                  border: active ? '1px solid #3a3a3a' : '1px solid transparent',
                  borderRadius: 8,
                  color: active ? '#ddd' : '#555',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
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
                <tab.Icon size={14} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

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
        placeholder="描述你想要生成的画面内容，按/呼出指令，@引用素材"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'transparent', border: 'none',
          outline: 'none', padding: '2px 2px 8px',
          color: value ? '#ccc' : '#444', fontSize: 13, lineHeight: 1.65,
          resize: 'none', fontFamily: 'inherit',
        }}
      />

      {/* Bottom bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        paddingTop: 8,
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

        {/* Camera control */}
        <button className="nodrag nopan" style={{
          display: 'flex', alignItems: 'center', gap: 3,
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#666', fontSize: 11, padding: '2px 5px', borderRadius: 5, flexShrink: 0,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#252525' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
        >
          <Camera size={11} />
          <span>摄像机控制</span>
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

        {/* Swap/reorder */}
        <button className="nodrag nopan" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#555', padding: 3, borderRadius: 4,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#888' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
          title="切换顺序"
        >
          <ArrowUpDown size={12} />
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
  // When initialPanelExpanded is set, the panel starts expanded until user explicitly
  // deselects; after that it follows the normal selected-only rule.
  const [hadInitialExpand, setHadInitialExpand] = useState(() => !!data.initialPanelExpanded)
  const abortRef = useRef<AbortController | null>(null)
  // Rendered image size (updated on img load)
  const [imgRenderedH,  setImgRenderedH]  = useState<number | null>(data.renderedH ?? null)
  const [imgRenderedW,  setImgRenderedW]  = useState<number | null>(data.renderedW ?? null)
  const [imgBroken,     setImgBroken]     = useState(false)
  // widthReady: suppresses the width transition until the node has settled at its
  // correct size at least once. True immediately if we have persisted dimensions
  // for a real image (not the DEFAULT_IMAGE_URL placeholder).
  const [widthReady,    setWidthReady]    = useState(
    !!(data.imageUrl && data.renderedW)
  )
  // Resolved display URL (blob URL from IndexedDB or plain URL)
  const [displayUrl,    setDisplayUrl]    = useState<string | null>(null)
  const prevImageUrlRef = useRef<string | undefined>(data.imageUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateNode     = useProjectStore(s => s.updateNode)
  const currentProject = useProjectStore(s => s.currentProject)
  const allEdges       = useProjectStore(s => s.edges)
  const allNodes       = useProjectStore(s => s.nodes)

  // Resolved blob URLs for connected reference images
  const [refImages, setRefImages] = useState<string[]>([])

  const hasImage       = !!displayUrl && !imgBroken
  // True as soon as we know a *real* image exists (not the default placeholder).
  // Used to switch layout immediately on mount without waiting for async URL resolve,
  // so the node doesn't jump from placeholder to image mode.
  // DEFAULT_IMAGE_URL is a placeholder stand-in — treat it the same as "no image".
  const hasImageData   = !!data.imageUrl && data.imageUrl !== DEFAULT_IMAGE_URL && !imgBroken
  const isUploadedOnly = data.imageSource === 'uploaded'
  const hasAnyEdge = allEdges.some(e => e.target === data.id || e.source === data.id)
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
      // If imageUrl changed (user replaced image), reset size so onLoad recalculates
      if (data.imageUrl !== prevImageUrlRef.current) {
        setImgRenderedW(null)
        setImgRenderedH(null)
        prevImageUrlRef.current = data.imageUrl
      }
      setDisplayUrl(url)
      setImgBroken(false)
      if (url && url.startsWith('blob:')) revoke = url
    })

    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [data.imageUrl])

  // Upstream text content from connected ScriptNodes
  const [sourceTextContent, setSourceTextContent] = useState<string | undefined>(undefined)
  useEffect(() => {
    const incomingEdges = allEdges.filter(e => e.target === data.id)
    const upstreamTexts = incomingEdges
      .map(e => allNodes.find(n => n.id === e.source))
      .filter((n): n is NonNullable<typeof n> => !!n && n.type === 'libtv_script' && !!(n as NodeData).content)
      .map(n => (n as NodeData).content as string)
      .filter(Boolean)
    setSourceTextContent(upstreamTexts.length > 0 ? upstreamTexts.join('\n\n') : undefined)
  }, [allEdges, allNodes, data.id])

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
  // Use persisted renderedW whenever an imageUrl is set, so the node starts at
  // the correct width before the async displayUrl resolves (prevents size jump).
  const nodeW      = imgRenderedW ?? NODE_W
  const imageAreaH = imgRenderedH ?? PLACEHOLDER_H
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

    const userPrompt = prompt.trim()
    const t0 = Date.now()

    addLog({
      level: 'info',
      category: 'operation',
      message: `开始生成图片: ${nodeLabel}`,
      detail: `节点ID: ${data.id}\nPrompt: ${userPrompt.slice(0, 100)}`,
    })

    // Determine the actual image generation prompt
    let imageGenPrompt: string
    if (sourceTextContent) {
      // Step 1: Use text AI to convert script content → image generation prompt
      addLog({
        level: 'info',
        category: 'operation',
        message: '正在将剧本内容转换为绘图提示词…',
        detail: sourceTextContent.slice(0, 120) + (sourceTextContent.length > 120 ? '…' : ''),
      })
      try {
        let aiPrompt = ''
        await streamAI({
          prompt: `剧本内容：\n${sourceTextContent}\n\n用户指令：${userPrompt}`,
          contextType: 'general',
          systemOverride: '你是专业的AI绘图提示词工程师。根据提供的剧本内容和用户指令，生成一段简洁、适合AI图像生成的英文提示词（prompt）。只输出prompt本身，不要有任何解释、标题或前缀。prompt要包含画面构图、人物外貌、场景氛围、光线风格等视觉元素。',
          signal: ctrl.signal,
          onChunk: (chunk) => { aiPrompt += chunk },
          onDone: () => {},
          onError: (err) => { throw new Error(err) },
        })
        imageGenPrompt = aiPrompt.trim() || userPrompt
        addLog({
          level: 'info',
          category: 'operation',
          message: '绘图提示词生成完成',
          detail: imageGenPrompt.slice(0, 200) + (imageGenPrompt.length > 200 ? '…' : ''),
        })
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError' || (err as Error)?.message === '已取消') {
          setGenerating(false)
          abortRef.current = null
          return
        }
        // If AI conversion fails, fall back to user prompt directly
        imageGenPrompt = userPrompt
        addLog({
          level: 'warn',
          category: 'operation',
          message: '提示词转换失败，使用原始提示词',
          detail: (err as Error)?.message || String(err),
        })
      }
    } else {
      imageGenPrompt = userPrompt
    }

    const promptPreview = imageGenPrompt.length > 100 ? imageGenPrompt.slice(0, 100) + '…' : imageGenPrompt

    try {
      // Call LightAI with the resolved image generation prompt
      const imageUrl = await lightaiGenerateImage(imageGenPrompt, ctrl.signal)

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
      updateNode(data.id, { imageUrl: ref, imageSource: 'generated', imagePrompt: usedPrompt })
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
  }, [prompt, generating, sourceTextContent, currentProject, data.id, nodeLabel, updateNode])

  // Image Toolbar Handlers
  const handleMultiAngles = useCallback(async () => {
    if (!displayUrl) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.generateMultiAngles({ image_url: displayUrl, prompt: prompt || '', angles: ['front', 'left', 'right', 'top', 'bottom'], style: 'manga' })
      if (result.images?.length > 0) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.images[0])
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `multi-angles_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated' })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.images[0], imageSource: 'generated' })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, prompt, data.id, currentProject, updateNode])

  const handleLighting = useCallback(async () => {
    if (!displayUrl) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.applyLighting({ image_url: displayUrl, lighting_type: 'studio', intensity: 1.0 })
      if (result.image_url) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.image_url)
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `lighting_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated' })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.image_url, imageSource: 'generated' })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, data.id, currentProject, updateNode])

  const handleCropGrid9 = useCallback(async () => {
    if (!displayUrl) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.cropGrid9({ image_url: displayUrl, auto_detect: true })
      if (result.images?.length > 0) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.images[0])
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `crop-grid9_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated' })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.images[0], imageSource: 'generated' })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, data.id, currentProject, updateNode])

  const handleUpscaleHD = useCallback(async () => {
    if (!displayUrl) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.upscaleHD({ image_url: displayUrl, scale: 2, model: 'realesrgan' })
      if (result.image_url) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.image_url)
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `upscale_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated' })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.image_url, imageSource: 'generated' })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, data.id, currentProject, updateNode])

  const handleSplitGrid = useCallback(async () => {
    if (!displayUrl) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.splitGrid({ image_url: displayUrl, grid_size: 3 })
      if (result.images?.length > 0) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.images[0])
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `split-grid_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated' })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.images[0], imageSource: 'generated' })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, data.id, currentProject, updateNode])

  const handleOptimize = useCallback(async () => {
    if (!displayUrl) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.optimizeImage({ image_url: displayUrl, enhance_type: 'auto', intensity: 1.0 })
      if (result.image_url) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.image_url)
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `optimized_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated' })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.image_url, imageSource: 'generated' })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, data.id, currentProject, updateNode])

  const handleRegenerate = useCallback(async () => {
    if (!displayUrl || !prompt.trim()) return
    setGenerating(true)
    try {
      const result = await imageToolbarApi.regenerate({ image_url: displayUrl, prompt: prompt.trim(), negative_prompt: 'low quality, blurry', style: 'manga' })
      if (result.image_url) {
        const projectId = currentProject?.id ?? 'local'
        try {
          const resp = await fetch(result.image_url)
          if (resp.ok) {
            const blob = await resp.blob()
            const file = new File([blob], `regenerated_${Date.now()}.png`, { type: blob.type })
            const ref = await saveImage(projectId, file)
            updateNode(data.id, { imageUrl: ref, imageSource: 'generated', imagePrompt: prompt.trim() })
          }
        } catch (e) {
          updateNode(data.id, { imageUrl: result.image_url, imageSource: 'generated', imagePrompt: prompt.trim() })
        }
      }
    } catch (err) {}
    finally { setGenerating(false) }
  }, [displayUrl, prompt, data.id, currentProject, updateNode])

  const handleFullscreenPreview = useCallback(async () => {
    if (!displayUrl) return
    try {
      const result = await imageToolbarApi.getFullscreenPreview(displayUrl)
      window.open(result.image_url, '_blank', 'width=1200,height=800,scrollbars=yes')
    } catch (err) {}
  }, [displayUrl])

  // Clean up pending request on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // Once the node loses selection, clear the initialPanelExpanded flag so the panel
  // follows normal selected-only behavior from that point on.
  useEffect(() => {
    if (!selected && hadInitialExpand) {
      setHadInitialExpand(false)
    }
  }, [selected, hadInitialExpand])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImgRenderedH(null)
    setImgRenderedW(null)
    setWidthReady(false)
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
    updateNode(data.id, { imageUrl: ref, imageSource: 'uploaded' })
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
    setWidthReady(true)
    // Persist so the node restores at the correct size on page reload
    updateNode(data.id, { renderedW: Math.round(w), renderedH: Math.round(h) })
  }

  function handleImgError() {
    // If displayUrl hasn't resolved yet, src is undefined/empty — ignore the spurious error.
    if (!displayUrl) return
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
        transition: widthReady ? 'width 150ms ease' : 'none',
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
      {selected && !dragging && !hasImageData && (
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
        <ImageEditToolbar
          visible={!!selected && !dragging}
          imageUrl={data.imageUrl}
          onMultiAngles={handleMultiAngles}
          onLighting={handleLighting}
          onCropGrid9={handleCropGrid9}
          onUpscaleHD={handleUpscaleHD}
          onSplitGrid={handleSplitGrid}
          onOptimize={handleOptimize}
          onRegenerate={handleRegenerate}
          onFullscreenPreview={handleFullscreenPreview}
        />
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
        {(data.imageUrl && !imgBroken) ? (
          /* ── Image mode: render img immediately (opacity 0 until url resolves) ── */
          <>
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <img
                src={displayUrl ?? undefined}
                alt=""
                draggable={false}
                onLoad={handleImgLoad}
                onError={handleImgError}
                style={{
                  display: 'block',
                  width: '100%',
                  height: imgRenderedH ? imgRenderedH : 'auto',
                  opacity: displayUrl ? 1 : 0,
                  transition: 'opacity 150ms ease',
                  // Reserve space while url is resolving using persisted height
                  minHeight: imgRenderedH ?? undefined,
                  background: imgRenderedH ? '#141414' : undefined,
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
          /* ── Empty mode: mountain icon + quick actions ── */
          <>
            <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} } @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

            {generating ? (
              /* Generating state: shimmer + spinner */
              <div style={{
                height: PLACEHOLDER_H, background: '#141414',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(90deg, #141414 0%, #1e1e1e 50%, #141414 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite',
                }} />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <Loader2 size={28} color="#555" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ color: '#555', fontSize: 12 }}>正在生成图片...</span>
                </div>
              </div>
            ) : (
              <>
                {/* Mountain placeholder icon — taller when quick-actions are hidden to keep node size consistent */}
                <div
                  style={{
                    height: data.initialPanelExpanded ? PLACEHOLDER_H + 122 : PLACEHOLDER_H,
                    background: '#1a1a1a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg
                    width="64" height="52" viewBox="0 0 64 52" fill="none"
                  >
                    <circle cx="46" cy="14" r="7" fill="#404040" />
                    <path d="M0 52 L22 20 L38 38 L46 28 L64 52 Z" fill="#383838" />
                  </svg>
                </div>

                {/* Quick actions — only when no edges connected and no image content */}
                {!hasImage && !hasAnyEdge && (
                  <div style={{ padding: '14px 16px 16px' }}>
                    <span style={{ fontSize: 12, color: '#555', marginBottom: 10, display: 'block' }}>尝试：</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {[
                        { Icon: Upload, label: '图生图', onClick: handleUploadClick },
                        { Icon: null,   label: '图片高清', hd: true, onClick: () => {} },
                      ].map(({ Icon, label, hd, onClick }) => (
                        <button
                          key={label}
                          className="nodrag nopan"
                          onClick={onClick}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#888', fontSize: 13, padding: '7px 8px',
                            borderRadius: 8, textAlign: 'left', width: '100%',
                            transition: 'background 150ms, color 150ms',
                            fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#252525'; e.currentTarget.style.color = '#ccc' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#888' }}
                        >
                          {hd ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 22, border: '1.5px solid #555', borderRadius: 5,
                              fontSize: 10, fontWeight: 700, color: '#888', flexShrink: 0,
                            }}>HD</span>
                          ) : Icon ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 22, height: 22, flexShrink: 0,
                            }}>
                              <Icon size={14} />
                            </span>
                          ) : null}
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Prompt panel — expands below when selected (both with and without image), hidden for upload-only nodes */}
      {!isUploadedOnly && (
        <CollapsibleSection expanded={(!!selected && !dragging) || hadInitialExpand}>
          <ZoomInvariantPanel naturalWidth={NODE_W} nodeWidth={nodeW}>
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

      {/* Target handle (left) + menu — hidden for upload-only nodes */}
      {!isUploadedOnly && (
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
      )}

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
