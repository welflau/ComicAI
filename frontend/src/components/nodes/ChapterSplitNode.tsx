import { memo, useState, useRef, useCallback, useEffect } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { BookOpen, Check, Loader2, ChevronRight } from 'lucide-react'
import ZoomInvariantPanel from './shared/ZoomInvariantPanel'
import { useProjectStore } from '@/stores/projectStore'
import { useLogStore } from '@/stores/logStore'
import { streamAI } from '@/api'

/* ── Types ─────────────────────────────────────────────────────── */

interface Chapter { id: string; title: string; content: string; charCount: number }

export interface ChapterSplitNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  // persisted
  chapters?: Chapter[]
  splitStatus?: 'idle' | 'splitting' | 'done' | 'error'
}

/* ── Constants ──────────────────────────────────────────────────── */

const NODE_W   = 460
const TITLE_H  = 28
const HANDLE_Y = TITLE_H + 80

/* ── Regex-based chapter splitter ──────────────────────────────── */

function splitByHeadings(text: string): Chapter[] | null {
  // Match: # 第X章 ..., ## Chapter X ..., 第X章 标题, 第X回 标题
  const RE = /^(#{1,3}\s+.+|第[零一二三四五六七八九十百千\d]+[章节回部篇]\s*.*)$/gm
  const matches = [...text.matchAll(RE)]
  if (matches.length < 2) return null

  const chapters: Chapter[] = []
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const start = (m.index ?? 0) + m[0].length
    const end   = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    const content = text.slice(start, end).trim()
    const title   = m[0].replace(/^#{1,3}\s+/, '').trim()
    chapters.push({ id: `ch_${i}`, title, content, charCount: content.length })
  }
  return chapters.length >= 2 ? chapters : null
}

/* ── ChapterSplitNode ──────────────────────────────────────────── */

function ChapterSplitNode({ data, selected, dragging }: NodeProps<ChapterSplitNodeData>) {
  const [chapters,       setChapters]       = useState<Chapter[]>(data.chapters ?? [])
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [splitStatus,    setSplitStatus]    = useState<'idle' | 'splitting' | 'done' | 'error'>(data.splitStatus ?? 'idle')
  const [errorMsg,       setErrorMsg]       = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const addNode    = useProjectStore(s => s.addNode)
  const addEdge    = useProjectStore(s => s.addEdge)
  const updateNode = useProjectStore(s => s.updateNode)
  const groupNodes = useProjectStore(s => s.groupNodes)
  const allEdges   = useProjectStore(s => s.edges)
  const allNodes   = useProjectStore(s => s.nodes)
  const addLog     = useLogStore(s => s.addLog)

  const [hovered, setHovered] = useState(false)
  const handlesVisible = !dragging && (selected || hovered)

  // Restore persisted state
  useEffect(() => {
    if (data.chapters && data.chapters.length > 0) {
      setChapters(data.chapters)
      setSplitStatus(data.splitStatus ?? 'done')
      setSelectedIds(new Set(data.chapters.map(c => c.id)))
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  // Get upstream ScriptNode text
  const getUpstreamText = useCallback((): string => {
    const upstreamIds = allEdges
      .filter(e => e.target === data.id)
      .map(e => e.source)
    for (const id of upstreamIds) {
      const node = allNodes.find(n => n.id === id)
      if (node && (node.type === 'libtv_script') && (node as any).content) {
        return (node as any).content as string
      }
    }
    return ''
  }, [allEdges, allNodes, data.id])

  const handleSplit = useCallback(() => {
    const text = getUpstreamText()
    if (!text.trim()) {
      setErrorMsg('请先在上游剧本节点中输入小说内容')
      return
    }

    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setSplitStatus('splitting')
    setChapters([])
    setSelectedIds(new Set())
    setErrorMsg('')

    addLog({ level: 'info', category: 'operation', message: '开始章节分解', detail: `文本长度：${text.length} 字符` })

    // Step 1: try regex split
    const regexResult = splitByHeadings(text)
    if (regexResult) {
      const result = regexResult
      setChapters(result)
      setSelectedIds(new Set(result.map(c => c.id)))
      setSplitStatus('done')
      updateNode(data.id, { chapters: result, splitStatus: 'done' } as any)
      addLog({ level: 'info', category: 'operation', message: `章节分解完成（标题识别）`, detail: `共 ${result.length} 章` })
      return
    }

    // Step 2: AI split — only send first 8000 chars to avoid token overflow
    const preview = text.length > 8000
      ? text.slice(0, 8000) + '\n...(内容已截取，仅供章节识别用)'
      : text

    let raw = ''
    streamAI({
      prompt: preview,
      systemOverride: `你是小说章节分析助手。请从用户提供的小说文本中，识别所有章节的标题和起始位置。
严格输出 JSON 数组，格式如下，不要输出任何其他内容：
[
  { "title": "第一章 章节标题", "startSnippet": "章节开头的前20个字" },
  ...
]
如果无法识别章节，返回空数组 []。`,
      contextType: 'general',
      onChunk: c => { raw += c },
      onDone: () => {
        if (ctrl.signal.aborted) return
        try {
          const start = raw.indexOf('[')
          const end   = raw.lastIndexOf(']')
          if (start === -1 || end === -1) throw new Error('no array')
          const parsed = JSON.parse(raw.slice(start, end + 1)) as { title: string; startSnippet: string }[]

          if (parsed.length === 0) {
            // fallback: treat whole text as single chapter
            const fallback: Chapter[] = [{ id: 'ch_0', title: data.label || '全文', content: text, charCount: text.length }]
            setChapters(fallback)
            setSelectedIds(new Set(fallback.map(c => c.id)))
            setSplitStatus('done')
            updateNode(data.id, { chapters: fallback, splitStatus: 'done' } as any)
            addLog({ level: 'warn', category: 'ai', message: 'AI 未识别到章节，作为整体处理' })
            return
          }

          // Locate each chapter's content by finding startSnippet in original text
          const result: Chapter[] = []
          for (let i = 0; i < parsed.length; i++) {
            const { title, startSnippet } = parsed[i]
            const idx = text.indexOf(startSnippet.slice(0, 15))
            const contentStart = idx >= 0 ? idx : 0
            const nextSnippet  = parsed[i + 1]?.startSnippet
            const contentEnd   = nextSnippet
              ? (text.indexOf(nextSnippet.slice(0, 15), contentStart + 1) || text.length)
              : text.length
            const content = text.slice(contentStart, contentEnd).trim()
            result.push({ id: `ch_${i}`, title, content, charCount: content.length })
          }

          setChapters(result)
          setSelectedIds(new Set(result.map(c => c.id)))
          setSplitStatus('done')
          updateNode(data.id, { chapters: result, splitStatus: 'done' } as any)
          addLog({ level: 'info', category: 'operation', message: `章节分解完成（AI识别）`, detail: `共 ${result.length} 章` })
        } catch {
          setSplitStatus('error')
          setErrorMsg('章节解析失败，请重试')
          addLog({ level: 'warn', category: 'ai', message: '章节 JSON 解析失败', detail: raw.slice(0, 200) })
        }
      },
      onError: (err) => {
        if (ctrl.signal.aborted) return
        setSplitStatus('error')
        setErrorMsg('AI 分析失败：' + err)
      },
      signal: ctrl.signal,
    })
  }, [getUpstreamText, data.id, data.label, updateNode, addLog])

  const handleGenerate = useCallback(() => {
    const selected = chapters.filter(c => selectedIds.has(c.id))
    if (selected.length === 0) return

    const SPACING_Y = 320
    const startX = data.position.x + NODE_W + 80
    const startY = data.position.y - ((selected.length - 1) * SPACING_Y) / 2
    const shouldGroup = selected.length > 3

    // 预先生成组节点 ID，章节节点创建时直接携带 groupId，避免两步同步问题
    const groupId = shouldGroup ? `libtv_group_${Date.now()}` : null
    const groupLabel = data.label ? `${data.label} 章节组` : '章节组'

    if (groupId) {
      // 先建组节点（放在章节节点列的左边，垂直居中）
      addNode({
        id: groupId,
        type: 'libtv_group' as any,
        label: groupLabel,
        category: 'process',
        position: { x: startX, y: data.position.y - 40 },
        config: {},
      } as any)
      addEdge({ id: `e-${data.id}-${groupId}`, source: data.id, target: groupId })
    }

    selected.forEach((chapter, idx) => {
      const newId = `libtv_script_${Date.now()}_${idx}`
      addNode({
        id: newId,
        type: 'libtv_script' as any,
        label: chapter.title,
        category: 'input',
        // 打组时节点位置在组右侧，不打组时直接在分解节点右侧
        position: {
          x: startX + (groupId ? 320 : 0),
          y: startY + idx * SPACING_Y,
        },
        config: {},
        title: chapter.title,
        content: chapter.content,
        initialMode: 'content',
        groupId: groupId ?? undefined,  // 直接携带 groupId
      } as any)

      if (!groupId) {
        addEdge({ id: `e-${data.id}-${newId}`, source: data.id, target: newId })
      }
    })

    addLog({
      level: 'info', category: 'operation',
      message: `生成 ${selected.length} 个章节节点${shouldGroup ? '（已自动打组）' : ''}`,
      detail: selected.map(c => c.title).join('、'),
    })
  }, [chapters, selectedIds, data.id, data.label, data.position, addNode, addEdge, addLog])

  const toggleAll = () => {
    setSelectedIds(prev =>
      prev.size === chapters.length ? new Set() : new Set(chapters.map(c => c.id))
    )
  }

  const allSelected  = selectedIds.size === chapters.length && chapters.length > 0
  const someSelected = selectedIds.size > 0 && !allSelected

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', width: NODE_W }}>
      {/* Title bar */}
      <div style={{
        height: TITLE_H, display: 'flex', alignItems: 'center', gap: 7,
        padding: '0 12px',
        background: '#1a1a1a', borderRadius: '12px 12px 0 0',
        border: '1px solid #2e2e2e', borderBottom: 'none',
      }}>
        <BookOpen size={13} color="#7c6af7" />
        <span style={{ fontSize: 12, color: '#bbb', fontWeight: 600, flex: 1 }}>
          {data.label || '章节分解'}
        </span>
        {splitStatus === 'splitting' && <Loader2 size={12} color="#666" style={{ animation: 'spin 1s linear infinite' }} />}
        {splitStatus === 'done' && <span style={{ fontSize: 10, color: '#555' }}>{chapters.length} 章</span>}
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* Body */}
      <div style={{
        background: '#161616',
        border: '1px solid #2e2e2e', borderTop: 'none',
        borderRadius: splitStatus === 'done' && chapters.length > 0 ? '0' : '0 0 12px 12px',
        minHeight: 80,
      }}>
        {/* Idle / error state */}
        {(splitStatus === 'idle' || splitStatus === 'error') && (
          <div style={{ padding: '18px 16px', textAlign: 'center' }}>
            {errorMsg && (
              <div style={{ fontSize: 11, color: '#e05050', marginBottom: 10 }}>{errorMsg}</div>
            )}
            <button
              className="nodrag nopan"
              onClick={handleSplit}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 18px', borderRadius: 8,
                background: '#7c6af7', border: 'none', cursor: 'pointer',
                color: '#fff', fontSize: 12, fontWeight: 600,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#9077ff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#7c6af7' }}
            >
              <BookOpen size={12} />
              {splitStatus === 'error' ? '重新分解' : '开始章节分解'}
            </button>
            <div style={{ fontSize: 11, color: '#444', marginTop: 8 }}>
              需连接上游剧本节点
            </div>
          </div>
        )}

        {/* Splitting */}
        {splitStatus === 'splitting' && (
          <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: 12 }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8, color: '#7c6af7' }} />
            <div>正在识别章节结构…</div>
          </div>
        )}

        {/* Chapter list */}
        {splitStatus === 'done' && chapters.length > 0 && (
          <>
            {/* Select-all row */}
            <div
              className="nodrag nopan"
              onClick={toggleAll}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', cursor: 'pointer',
                borderBottom: '1px solid #222', fontSize: 11, color: '#666',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1e1e1e' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                border: (allSelected || someSelected) ? '1.5px solid #7c6af7' : '1.5px solid #444',
                background: allSelected ? '#7c6af7' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {allSelected && <Check size={9} color="#fff" />}
                {someSelected && <div style={{ width: 7, height: 1.5, background: '#7c6af7', borderRadius: 1 }} />}
              </div>
              全选（{chapters.length} 章）
              <button
                className="nodrag nopan"
                onClick={e => { e.stopPropagation(); setSplitStatus('idle'); setChapters([]); setSelectedIds(new Set()); updateNode(data.id, { chapters: [], splitStatus: 'idle' } as any) }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#444', fontSize: 10, padding: '1px 4px', borderRadius: 3 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#e05050' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#444' }}
              >重新分解</button>
            </div>

            {/* Chapter rows */}
            <div style={{ maxHeight: 280, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
              {chapters.map(ch => {
                const checked = selectedIds.has(ch.id)
                return (
                  <div
                    key={ch.id}
                    className="nodrag nopan"
                    onClick={() => setSelectedIds(prev => {
                      const next = new Set(prev)
                      checked ? next.delete(ch.id) : next.add(ch.id)
                      return next
                    })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', cursor: 'pointer',
                      background: checked ? 'rgba(124,106,247,0.06)' : 'transparent',
                      borderBottom: '1px solid #1e1e1e',
                    }}
                    onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = '#1e1e1e' }}
                    onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                      border: checked ? '1.5px solid #7c6af7' : '1.5px solid #444',
                      background: checked ? '#7c6af7' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <Check size={9} color="#fff" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: '#ddd', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ch.title}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>
                      {ch.charCount.toLocaleString()} 字
                    </span>
                    <ChevronRight size={10} color="#333" />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Bottom action bar */}
      {splitStatus === 'done' && chapters.length > 0 && (
        <ZoomInvariantPanel naturalWidth={NODE_W}>
          <div
            className="nodrag nopan"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px',
              background: '#1a1a1a', border: '1px solid #2e2e2e', borderTop: 'none',
              borderRadius: '0 0 12px 12px',
            }}
          >
            <span style={{ fontSize: 11, color: '#555' }}>已选 {selectedIds.size}/{chapters.length} 章</span>
            <button
              className="nodrag nopan"
              disabled={selectedIds.size === 0}
              onClick={handleGenerate}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 14px', borderRadius: 7, border: 'none',
                background: selectedIds.size === 0 ? '#2a2a2a' : '#7c6af7',
                color: selectedIds.size === 0 ? '#555' : '#fff',
                cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 600,
              }}
              onMouseEnter={e => { if (selectedIds.size > 0) (e.currentTarget as HTMLButtonElement).style.background = '#9077ff' }}
              onMouseLeave={e => { if (selectedIds.size > 0) (e.currentTarget as HTMLButtonElement).style.background = '#7c6af7' }}
            >
              ⚡ 生成 {selectedIds.size} 个章节节点
            </button>
          </div>
        </ZoomInvariantPanel>
      )}

      <Handle
        type="target" position={Position.Left}
        style={{ top: HANDLE_Y, background: '#7c6af7', width: 10, height: 10, border: '2px solid #1a1a1a', opacity: handlesVisible ? 1 : 0 }}
      />
      <Handle
        type="source" position={Position.Right}
        style={{ top: HANDLE_Y, background: '#7c6af7', width: 10, height: 10, border: '2px solid #1a1a1a', opacity: handlesVisible ? 1 : 0 }}
      />
    </div>
  )
}

export default memo(ChapterSplitNode)
