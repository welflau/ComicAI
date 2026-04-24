import { memo, useState, useEffect, useCallback, useRef } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import {
  Combine, Play, GripVertical, Loader2, ChevronDown,
  TriangleAlert, CheckCircle2, X,
} from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useIsMultiSelected } from './shared/useIsMultiSelected'
import { addLog } from '@/stores/logStore'
import { apiClient } from '@/api'

/* ── Types ─────────────────────────────────────────────────────────── */

export interface VideoComposeNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  /** Output merged video URL */
  outputUrl?: string
  /** Persisted ordered list of source video node IDs */
  sourceOrder?: string[]
}

type ComposeMode = 'idle' | 'composing' | 'done' | 'error'
type TransitionType = 'none' | 'fade' | 'dissolve'

interface SourceClip {
  nodeId: string
  label: string
  videoUrl: string
}

/* ── Constants ──────────────────────────────────────────────────────── */

const NODE_W   = 300
const TITLE_H  = 28
// Target/source handle vertical offset: aimed at the center of the card
// when showing a couple of clip rows. Tweak if the card height changes.
const HANDLE_Y = TITLE_H + 72

const TRANSITIONS: Array<{ id: TransitionType; label: string }> = [
  { id: 'none',     label: '直切' },
  { id: 'fade',     label: '淡入淡出' },
  { id: 'dissolve', label: '叠化' },
]

/* ── Draggable clip row ─────────────────────────────────────────────── */

interface ClipRowProps {
  clip: SourceClip
  index: number
  isDragging: boolean
  isOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}

function ClipRow({ clip, index, isDragging, isOver, onDragStart, onDragOver, onDrop, onDragEnd }: ClipRowProps) {
  return (
    <div
      className="nodrag nopan"
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(e) }}
      onDrop={e => { e.stopPropagation(); onDrop() }}
      onDragEnd={onDragEnd}
      onMouseDown={e => e.stopPropagation()}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '5px 6px',
        background: isOver ? '#252525' : 'transparent',
        borderRadius: 7,
        border: isOver ? '1px dashed #3a3a3a' : '1px solid transparent',
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
        transition: 'background 0.1s, opacity 0.12s',
      }}
    >
      <GripVertical size={13} color="#3a3a3a" style={{ flexShrink: 0 }} />

      {/* Number badge */}
      <div style={{
        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
        background: '#252525', border: '1px solid #333',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: '#666', fontWeight: 600,
      }}>
        {index + 1}
      </div>

      {/* Mini thumbnail */}
      <div style={{
        width: 38, height: 25, borderRadius: 4, overflow: 'hidden', flexShrink: 0,
        background: '#111', border: '1px solid #2a2a2a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {clip.videoUrl ? (
          <video
            src={clip.videoUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            muted playsInline preload="metadata"
          />
        ) : (
          <Play size={10} color="#333" />
        )}
      </div>

      <span style={{
        flex: 1, fontSize: 12, color: '#999',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {clip.label || '视频片段'}
      </span>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────────────────── */

function VideoComposeNode({ data, selected, dragging }: NodeProps<VideoComposeNodeData>) {
  const [isHovered,  setIsHovered]  = useState(false)
  const [mode,       setMode]       = useState<ComposeMode>((data as any).outputUrl ? 'done' : 'idle')
  const [statusMsg,  setStatusMsg]  = useState('')
  const [transition, setTransition] = useState<TransitionType>('none')
  const [transOpen,  setTransOpen]  = useState(false)
  const [orderedIds, setOrderedIds] = useState<string[]>((data as any).sourceOrder ?? [])
  const [dragIdx,    setDragIdx]    = useState<number | null>(null)
  const [overIdx,    setOverIdx]    = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const transRef = useRef<HTMLDivElement>(null)

  const allEdges        = useProjectStore(s => s.edges)
  const allNodes        = useProjectStore(s => s.nodes)
  const updateNode      = useProjectStore(s => s.updateNode)
  const isMultiSelected = useIsMultiSelected()

  const showSelected   = !!selected && !dragging && !isMultiSelected
  const handlesVisible = isHovered || (!!selected && !dragging)

  /* ── Collect upstream video nodes ─────────────────────────────── */
  const upstreamVideoNodes = allEdges
    .filter(e => e.target === data.id)
    .map(e => allNodes.find(n => n.id === e.source))
    .filter(n => n?.type === 'libtv_video' && !!(n as any).videoUrl)

  const clips: SourceClip[] = (() => {
    const byId = new Map(upstreamVideoNodes.map(n => [n!.id, n!]))
    const ordered: SourceClip[] = []
    for (const id of orderedIds) {
      const n = byId.get(id)
      if (n) ordered.push({ nodeId: n.id, label: n.label || '视频', videoUrl: (n as any).videoUrl })
    }
    for (const n of upstreamVideoNodes) {
      if (!orderedIds.includes(n!.id))
        ordered.push({ nodeId: n!.id, label: n!.label || '视频', videoUrl: (n as any).videoUrl })
    }
    return ordered
  })()

  // Sync orderedIds when upstream connections change
  useEffect(() => {
    const currentIds = clips.map(c => c.nodeId)
    if (JSON.stringify(currentIds) !== JSON.stringify(orderedIds))
      setOrderedIds(currentIds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upstreamVideoNodes.map(n => n?.id).join(',')])

  // Close transition dropdown on outside click
  useEffect(() => {
    if (!transOpen) return
    const handler = (e: MouseEvent) => {
      if (transRef.current && !transRef.current.contains(e.target as Node))
        setTransOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [transOpen])

  /* ── Drag helpers ──────────────────────────────────────────────── */
  function moveClip(from: number, to: number) {
    if (from === to) return
    const next = [...orderedIds]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setOrderedIds(next)
    updateNode(data.id, { sourceOrder: next } as any)
  }

  /* ── Compose ───────────────────────────────────────────────────── */
  const handleCompose = useCallback(async () => {
    if (clips.length < 2) { setStatusMsg('请连接至少 2 个视频节点'); return }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setMode('composing')
    setStatusMsg('合并中...')
    try {
      // Step 1: auto-persist any CDN-hosted clips to local storage first.
      // Older video nodes generated before the persist feature may still hold
      // http(s) CDN URLs — fetch them into backend/uploads/videos/ so FFmpeg
      // can read them reliably (and so they survive CDN expiration).
      const { persistRemoteVideo } = await import('@/api')
      const videoUrls: string[] = []
      let persistedCount = 0
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i]
        if (c.videoUrl && /^https?:\/\//i.test(c.videoUrl)) {
          setStatusMsg(`保存片段到本地 ${i + 1}/${clips.length}...`)
          const localUrl = await persistRemoteVideo(c.videoUrl)
          videoUrls.push(localUrl)
          if (localUrl !== c.videoUrl) {
            persistedCount++
            addLog({
              level: 'info', category: 'ai',
              message: `[VideoCompose] 片段 ${i + 1} 已保存到本地`,
              detail: `远程: ${c.videoUrl.slice(0, 80)}...\n本地: ${localUrl}`,
            })
          }
        } else {
          videoUrls.push(c.videoUrl)
        }
      }
      if (persistedCount > 0) {
        addLog({
          level: 'info', category: 'ai',
          message: `[VideoCompose] 已保存 ${persistedCount}/${clips.length} 个远程片段到本地`,
        })
      }

      setStatusMsg('合并中...')
      addLog({ level: 'info', category: 'ai', message: '[VideoCompose] 开始合并', detail: videoUrls.join('\n') })
      const res = await apiClient.post('/video/compose', { video_urls: videoUrls, transition }, { signal: ctrl.signal })
      const outputUrl: string = res.data.output_url
      updateNode(data.id, { outputUrl, sourceOrder: orderedIds } as any)
      setMode('done')
      setStatusMsg('')
      addLog({
        level: 'info', category: 'ai',
        message: '[VideoCompose] 合并完成',
        detail: `输出: ${outputUrl}\n磁盘路径: backend${outputUrl.replace(/\//g, '\\')}`,
      })
    } catch (err: unknown) {
      if ((err as Error)?.name === 'CanceledError' || (err as Error)?.message === 'canceled') {
        setStatusMsg(''); setMode('idle'); return
      }
      // Pull the backend's detail message out of axios error, if present.
      const anyErr = err as any
      const detail = anyErr?.response?.data?.detail
      const status = anyErr?.response?.status
      const msg = detail
        ? `${status ?? ''} ${detail}`.trim()
        : String(err)
      setStatusMsg(`合并失败: ${msg.slice(0, 140)}`)
      setMode('error')
      addLog({ level: 'error', category: 'ai', message: '[VideoCompose] 合并失败', detail: msg })
    }
  }, [clips, transition, orderedIds, data.id, updateNode])

  function handleReset() {
    abortRef.current?.abort()
    updateNode(data.id, { outputUrl: undefined } as any)
    setMode('idle')
    setStatusMsg('')
  }

  const outputUrl = (data as any).outputUrl as string | undefined

  return (
    <div
      style={{
        position: 'relative', width: NODE_W,
        fontFamily: 'Inter, system-ui, sans-serif',
        cursor: selected ? 'default' : dragging ? 'grabbing' : 'grab',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* ── Title ──────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        height: TITLE_H, paddingLeft: 2, paddingBottom: 6,
      }}>
        <Combine size={13} color="#888" />
        <span style={{ fontSize: 13, color: '#bbb', fontWeight: 500 }}>
          {data.label || '视频合成'}
        </span>
      </div>

      {/* ── Card ───────────────────────────────────────────────── */}
      <div style={{
        background: '#1a1a1a',
        border: showSelected
          ? '1.5px solid #707070'
          : isHovered ? '1.5px solid #3a3a3a' : '1.5px solid #2a2a2a',
        borderRadius: 14, overflow: 'hidden',
        transition: 'border-color 150ms ease',
        boxShadow: showSelected
          ? '0 0 0 2px rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 2px 12px rgba(0,0,0,0.4)',
      }}>

        {/* ── Output video (done mode) ── */}
        {outputUrl && mode === 'done' && (
          <div style={{ position: 'relative', height: 180 }}>
            <video
              src={outputUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              controls autoPlay loop muted playsInline
            />
            <button
              className="nodrag nopan"
              onClick={handleReset}
              title="重新合成"
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 26, height: 26, borderRadius: 6,
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.12)',
                cursor: 'pointer', color: '#ccc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(4px)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.85)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.55)' }}
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── Clip list / empty state ─────────────────────────── */}
        <div style={{ padding: clips.length > 0 ? '14px 8px 4px' : '20px 16px' }}>
          {clips.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '16px 0',
            }}>
              <Combine size={26} color="#2a2a2a" />
              <span style={{ fontSize: 12, color: '#444', textAlign: 'center', lineHeight: 1.6 }}>
                连接多个视频节点<br />自动识别待合并片段
              </span>
            </div>
          ) : (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingLeft: 6, paddingRight: 6, marginBottom: 4,
              }}>
                <span style={{ fontSize: 11, color: '#555', fontWeight: 500 }}>拖拽调整顺序</span>
                <span style={{ fontSize: 11, color: '#444' }}>{clips.length} 个片段</span>
              </div>
              {clips.map((clip, i) => (
                <ClipRow
                  key={clip.nodeId}
                  clip={clip}
                  index={i}
                  isDragging={dragIdx === i}
                  isOver={overIdx === i && dragIdx !== null && dragIdx !== i}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={() => setOverIdx(i)}
                  onDrop={() => {
                    if (dragIdx !== null) moveClip(dragIdx, i)
                    setDragIdx(null); setOverIdx(null)
                  }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
                />
              ))}
            </>
          )}

          {/* Status / error message */}
          {statusMsg && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', margin: '6px 4px 0',
              borderRadius: 7,
              background: mode === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
              color: mode === 'error' ? '#f87171' : '#888',
              fontSize: 11,
            }}>
              {mode === 'error'     && <TriangleAlert size={12} style={{ flexShrink: 0 }} />}
              {mode === 'composing' && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
              {mode === 'done'      && <CheckCircle2 size={12} color="#4ade80" style={{ flexShrink: 0 }} />}
              <span style={{ flex: 1 }}>{statusMsg}</span>
            </div>
          )}
        </div>

        {/* ── Bottom action bar ───────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px 10px',
          borderTop: '1px solid #212121',
        }}>
          {/* Transition selector */}
          <div ref={transRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className="nodrag nopan"
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTransOpen(v => !v) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 8px',
                background: transOpen ? '#252525' : 'none',
                border: `1px solid ${transOpen ? '#3a3a3a' : '#2a2a2a'}`,
                borderRadius: 7, cursor: 'pointer', color: '#777', fontSize: 11,
                fontFamily: 'inherit', transition: 'background 0.1s, border-color 0.1s',
              }}
            >
              <span>{TRANSITIONS.find(t => t.id === transition)?.label ?? '直切'}</span>
              <ChevronDown size={9} style={{ transform: transOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </button>

            {transOpen && (
              <div
                className="nodrag nopan"
                onMouseDown={e => e.stopPropagation()}
                style={{
                  position: 'absolute', bottom: 'calc(100% + 6px)', left: 0,
                  background: '#1c1c1c', border: '1px solid #333',
                  borderRadius: 9, padding: 4,
                  boxShadow: '0 8px 28px rgba(0,0,0,0.7)',
                  zIndex: 9999, minWidth: 106,
                }}
              >
                {TRANSITIONS.map(t => (
                  <button
                    key={t.id}
                    className="nodrag nopan"
                    onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setTransition(t.id); setTransOpen(false) }}
                    style={{
                      display: 'block', width: '100%', padding: '6px 10px',
                      background: transition === t.id ? '#2a2a2a' : 'none',
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                      color: transition === t.id ? '#ddd' : '#888',
                      fontSize: 12, textAlign: 'left', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (transition !== t.id) (e.currentTarget as HTMLButtonElement).style.background = '#222' }}
                    onMouseLeave={e => { if (transition !== t.id) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          {/* Compose button */}
          <button
            className="nodrag nopan"
            onClick={mode === 'composing'
              ? () => { abortRef.current?.abort(); setMode('idle'); setStatusMsg('') }
              : handleCompose}
            disabled={clips.length < 2 && mode !== 'composing'}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 14px',
              background: mode === 'composing' ? '#3d2a6a' : clips.length >= 2 ? '#fff' : '#252525',
              border: 'none', borderRadius: 8,
              cursor: clips.length < 2 && mode !== 'composing' ? 'not-allowed' : 'pointer',
              color: mode === 'composing' ? '#c9b6ff' : clips.length >= 2 ? '#111' : '#555',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              opacity: clips.length < 2 && mode !== 'composing' ? 0.5 : 1,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (clips.length >= 2 && mode !== 'composing') (e.currentTarget as HTMLButtonElement).style.background = '#e8e8e8' }}
            onMouseLeave={e => { if (mode !== 'composing') (e.currentTarget as HTMLButtonElement).style.background = clips.length >= 2 ? '#fff' : '#252525' }}
          >
            {mode === 'composing' ? (
              <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />取消</>
            ) : (
              <><Combine size={12} />合成</>
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>

      {/* ── Target handle (left) ─────────────────────────────── */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 22, height: 22,
          background: '#1a1a1a', border: '1.5px solid #606060',
          borderRadius: '50%',
          top: HANDLE_Y, left: -11, transform: 'translateY(-50%)',
          opacity: handlesVisible ? 1 : 0,
          pointerEvents: handlesVisible ? 'auto' : 'none',
          transition: 'opacity 150ms ease',
        }}
      />

      {/* ── Source handle (right) ────────────────────────────── */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 22, height: 22,
          background: '#1a1a1a', border: '1.5px solid #606060',
          borderRadius: '50%',
          top: HANDLE_Y, right: -11, left: 'auto', transform: 'translateY(-50%)',
          opacity: handlesVisible ? 1 : 0,
          pointerEvents: handlesVisible ? 'auto' : 'none',
          transition: 'opacity 150ms ease',
        }}
      />
    </div>
  )
}

export default memo(VideoComposeNode)
