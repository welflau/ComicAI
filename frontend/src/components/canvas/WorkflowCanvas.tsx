import { useCallback, useMemo, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'

import ComicFlowNode from '@/components/nodes/ComicFlowNode'
import ScriptNode from '@/components/nodes/ScriptNode'
import ScriptGenNode from '@/components/nodes/ScriptGenNode'
import StoryboardTableNode from '@/components/nodes/StoryboardTableNode'
import ImageNode from '@/components/nodes/ImageNode'
import VideoNode from '@/components/nodes/VideoNode'
import VideoComposeNode from '@/components/nodes/VideoComposeNode'
import ChapterSplitNode from '@/components/nodes/ChapterSplitNode'
import GroupNode from '@/components/nodes/GroupNode'
import LoopNode from '@/components/nodes/LoopNode'
import GroupPortNode from '@/components/nodes/GroupPortNode'
import LogNode from '@/components/nodes/LogNode'
import AnimatedFlowEdge from '@/components/canvas/AnimatedFlowEdge'
import TemplatePicker from '@/components/canvas/TemplatePicker'
import CanvasContextMenu from '@/components/canvas/CanvasContextMenu'
import NodeContextMenu from '@/components/canvas/NodeContextMenu'
import NodeAddMenu from '@/components/nodes/shared/NodeAddMenu'
import { useProjectStore } from '@/stores/projectStore'
import { MultiSelectionToolbar } from '@/components/canvas/MultiSelectionToolbar'
import { SelectionBoundingBox } from '@/components/canvas/SelectionBoundingBox'
import { registerViewportCenter, registerFocusNode } from '@/stores/viewportCenter'
import type { NodeData, EdgeData } from '@/types'
import { addLog } from '@/stores/logStore'

const nodeTypes = {
  script_input: ComicFlowNode,
  script_parse: ComicFlowNode,
  storyboard_gen: ComicFlowNode,
  character_design: ComicFlowNode,
  scene_design: ComicFlowNode,
  image_gen: ComicFlowNode,
  video_gen: ComicFlowNode,
  tts: ComicFlowNode,
  music_gen: ComicFlowNode,
  auto_edit: ComicFlowNode,
  preview: ComicFlowNode,
  export: ComicFlowNode,
  libtv_script: ScriptNode,
  libtv_script_gen: ScriptGenNode,
  libtv_storyboard: StoryboardTableNode,
  libtv_image: ImageNode,
  libtv_video: VideoNode,
  libtv_video_compose: VideoComposeNode,
  libtv_chapter_split: ChapterSplitNode,
  libtv_group: GroupNode,
  libtv_loop: LoopNode,
  libtv_group_input:  GroupPortNode,
  libtv_group_output: GroupPortNode,
  libtv_log: LogNode,
}

const edgeTypes = {
  animated: AnimatedFlowEdge,
}

function toRFNode(node: NodeData): Node {
  return { id: node.id, type: node.type, position: node.position, data: node }
}

function toRFEdge(edge: EdgeData): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: 'animated',
  }
}

function WorkflowCanvasInner() {
  const allNodes            = useProjectStore(s => s.nodes)
  const allEdges            = useProjectStore(s => s.edges)
  const currentGroupId      = useProjectStore(s => s.currentGroupId)
  const groupNavStack       = useProjectStore(s => s.groupNavStack)
  const enterGroup          = useProjectStore(s => s.enterGroup)
  const exitGroup           = useProjectStore(s => s.exitGroup)
  const groupNodes          = useProjectStore(s => s.groupNodes)
  const pushHistory         = useProjectStore(s => s.pushHistory)
  const undo                = useProjectStore(s => s.undo)
  const redo                = useProjectStore(s => s.redo)
  const updateWorkflow      = useProjectStore(s => s.updateWorkflow)
  const addNode             = useProjectStore(s => s.addNode)
  const selectNodes         = useProjectStore(s => s.selectNodes)
  const pendingSelectNodeId = useProjectStore(s => s.pendingSelectNodeId)
  const selectedNodeIds     = useProjectStore(s => s.selectedNodeIds)

  // Filter to current group level
  const storeNodes = useMemo(
    () => allNodes.filter(n => (n.groupId ?? null) === (currentGroupId ?? null)),
    [allNodes, currentGroupId]
  )
  const storeEdges = useMemo(
    () => allEdges.filter(e => {
      const srcIn = storeNodes.some(n => n.id === e.source)
      const tgtIn = storeNodes.some(n => n.id === e.target)
      return srcIn && tgtIn
    }),
    [allEdges, storeNodes]
  )

  const isEmpty = storeNodes.length === 0

  const [paneMenu, setPaneMenu]   = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const [paneNodeAddOpen, setPaneNodeAddOpen] = useState(false)
  const [nodeMenu, setNodeMenu]   = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [clipboard, setClipboard] = useState<Node | null>(null)
  const [minimapVisible, setMinimapVisible] = useState(true)

  const rfNodes = useMemo(() => storeNodes.map(toRFNode), [storeNodes])
  const rfEdges = useMemo(() => storeEdges.map(toRFEdge), [storeEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  const prevStoreNodes = useRef(storeNodes)
  const prevStoreEdges = useRef(storeEdges)
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)

  const { project, getViewport, zoomIn, zoomOut, fitView, setViewport } = useReactFlow()
  const [zoom, setZoom] = useState(100)
  const [snapToGrid, setSnapToGrid] = useState(false)

  // Double-click any node → zoom to fit that node centred in view
  const onNodeDoubleClick = useCallback((_evt: MouseEvent, node: Node) => {
    if (node.type === 'libtv_group') {
      enterGroup(node.id)
    } else {
      fitView({ nodes: [node], padding: 0.35, duration: 350 })
    }
  }, [fitView, enterGroup])

  // Track zoom level
  const onMoveEnd = useCallback((_: unknown, vp: { zoom: number }) => {
    setZoom(Math.round(vp.zoom * 100))
  }, [])

  // Register viewport-centre helper so LeftSidebar can place new nodes in view
  useEffect(() => {
    registerViewportCenter(() => {
      const vp = getViewport()
      // canvas container size (approximation via window; accurate enough)
      const w = window.innerWidth
      const h = window.innerHeight
      return {
        x: (-vp.x + w / 2) / vp.zoom,
        y: (-vp.y + h / 2) / vp.zoom,
      }
    })
  }, [getViewport])

  // Register focusNode so AI panel can pan to a specific node by id
  useEffect(() => {
    registerFocusNode((nodeId: string) => {
      const target = storeNodes.find(n => n.id === nodeId)
      if (!target) return
      selectNodes([nodeId])
      fitView({
        nodes: [{ id: nodeId }],
        padding: 0.4,
        duration: 400,
      })
    })
  }, [storeNodes, fitView, selectNodes])

  // Sync store → ReactFlow, preserving selection state.
  // When pendingSelectNodeId is set, select that node in the same pass.
  useEffect(() => {
    if (storeNodes !== prevStoreNodes.current) {
      prevStoreNodes.current = storeNodes
      const pending = useProjectStore.getState().pendingSelectNodeId
      setNodes(nds => {
        const selMap = new Map(nds.map(n => [n.id, n.selected]))
        return rfNodes.map(n => ({
          ...n,
          selected: pending ? n.id === pending : (selMap.get(n.id) ?? false),
        }))
      })
    }
  }, [storeNodes, rfNodes])

  useEffect(() => {
    if (storeEdges !== prevStoreEdges.current) {
      prevStoreEdges.current = storeEdges
      setEdges(rfEdges)
    }
  }, [storeEdges, rfEdges])

  // Keyboard undo / redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return   // don't intercept text input
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // When group navigation changes, fit view to show the new level's nodes
  const prevGroupId = useRef(currentGroupId)
  useEffect(() => {
    if (prevGroupId.current !== currentGroupId) {
      prevGroupId.current = currentGroupId
      // Fit view to content nodes only (exclude port nodes which sit at extreme positions)
      setTimeout(() => {
        const contentNodes = useProjectStore.getState().nodes
          .filter(n =>
            (n.groupId ?? null) === (currentGroupId ?? null) &&
            n.type !== 'libtv_group_input' &&
            n.type !== 'libtv_group_output'
          )
        if (contentNodes.length > 0) {
          fitView({ nodes: contentNodes.map(n => ({ id: n.id })), padding: 0.25, duration: 400 })
        } else {
          fitView({ padding: 0.25, duration: 400 })
        }
      }, 80)
    }
  }, [currentGroupId, fitView])

  // Handle requestSelectNode: pan to the node and clear the pending flag
  useEffect(() => {
    if (!pendingSelectNodeId) return
    // Pan to the node (selection already applied in the nodes sync effect above)
    fitView({ nodes: [{ id: pendingSelectNodeId }], padding: 0.35, duration: 350 })
    useProjectStore.setState({ pendingSelectNodeId: null })
  }, [pendingSelectNodeId, fitView])

  const saveWorkflow = useCallback((ns: Node[], es: Edge[]) => {
    // Only replace nodes/edges belonging to the CURRENT group level.
    // Nodes from other levels must be preserved as-is.
    const allStoreNodes = useProjectStore.getState().nodes
    const allStoreEdges = useProjectStore.getState().edges

    const updatedNodes: NodeData[] = ns.map(n => ({ ...n.data, position: n.position }))
    const updatedNodeIds = new Set(updatedNodes.map(n => n.id))

    // Nodes not in current level — keep untouched
    const otherNodes = allStoreNodes.filter(n => (n.groupId ?? null) !== (currentGroupId ?? null))

    // Edges: keep those where neither endpoint is in current level
    const otherEdges = allStoreEdges.filter(
      e => !updatedNodeIds.has(e.source) && !updatedNodeIds.has(e.target)
    )
    const updatedEdges = es.map(e => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }))

    updateWorkflow(
      [...otherNodes, ...updatedNodes],
      [...otherEdges, ...updatedEdges],
    )
  }, [updateWorkflow, currentGroupId])

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        type: 'animated',
      } as Edge
      setEdges(eds => {
        const next = addEdge(newEdge, eds)
        saveWorkflow(nodes, next)
        return next
      })
      addLog({
        level: 'info',
        category: 'operation',
        message: '连接已创建',
        detail: `从 ${newEdge.source} 到 ${newEdge.target}`,
      })
    },
    [setEdges, nodes, saveWorkflow]
  )

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    dragStartPos.current = { x: node.position.x, y: node.position.y }
    pushHistory()   // snapshot before move
  }, [pushHistory])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    const start = dragStartPos.current
    dragStartPos.current = null
    const dx = start ? Math.abs(node.position.x - start.x) : 0
    const dy = start ? Math.abs(node.position.y - start.y) : 0
    if (dx < 1 && dy < 1) {
      // No real movement — just a click/selection, skip log & save
      return
    }
    addLog({
      level: 'info',
      category: 'operation',
      message: `移动节点: ${node.data?.label || node.id}`,
      detail: `位置 → (${Math.round(node.position.x)}, ${Math.round(node.position.y)})`,
    })
    saveWorkflow(nodes, edges)
  }, [nodes, edges, saveWorkflow])

  const onNodesDelete = useCallback((deleted: Node[]) => {
    // Port nodes are fixed and cannot be deleted
    const deletable = deleted.filter(n => n.type !== 'libtv_group_input' && n.type !== 'libtv_group_output')
    if (deletable.length === 0) return
    pushHistory()
    deletable.forEach(n => {
      addLog({
        level: 'info',
        category: 'operation',
        message: `删除节点: ${n.data?.label || n.id}`,
        detail: `类型: ${n.type} | ID: ${n.id}`,
      })
    })
    const ids = new Set(deletable.map(n => n.id))
    saveWorkflow(
      nodes.filter(n => !ids.has(n.id)),
      edges.filter(e => !ids.has(e.source) && !ids.has(e.target))
    )
  }, [nodes, edges, saveWorkflow, pushHistory])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    pushHistory()
    deleted.forEach(e => {
      addLog({
        level: 'info',
        category: 'operation',
        message: `删除连接`,
        detail: `从 ${e.source} 到 ${e.target}`,
      })
    })
    const ids = new Set(deleted.map(e => e.id))
    saveWorkflow(nodes, edges.filter(e => !ids.has(e.id)))
  }, [nodes, edges, saveWorkflow, pushHistory])

  // Pane right-click
  const onPaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setNodeMenu(null)
    const flowPos = project({ x: e.clientX, y: e.clientY })
    setPaneMenu({ x: e.clientX, y: e.clientY, flowX: flowPos.x, flowY: flowPos.y })
  }, [project])

  // Node right-click
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    e.stopPropagation()
    setPaneMenu(null)
    setNodeMenu({ x: e.clientX, y: e.clientY, nodeId: node.id })
  }, [])

  // Open NodeAddMenu at pane position (closes the context menu, shows node picker)
  const handleAddNode = useCallback(() => {
    if (!paneMenu) return
    setPaneNodeAddOpen(true)
  }, [paneMenu])

  // Node menu actions
  const handleCopy = useCallback(() => {
    if (!nodeMenu) return
    const n = nodes.find(n => n.id === nodeMenu.nodeId)
    if (n) setClipboard(n)
  }, [nodeMenu, nodes])

  const handleDuplicate = useCallback(() => {
    if (!nodeMenu) return
    const n = nodes.find(n => n.id === nodeMenu.nodeId)
    if (!n) return
    addNode({
      ...n.data,
      id: `${n.data.id}_copy_${Date.now()}`,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
    } as NodeData)
    addLog({
      level: 'info',
      category: 'operation',
      message: `节点已复制: ${n.data.label || n.id}`,
      detail: `原节点ID: ${n.id} | 类型: ${n.type}`,
    })
  }, [nodeMenu, nodes, addNode])

  const handleDelete = useCallback(() => {
    if (!nodeMenu) return
    const id = nodeMenu.nodeId
    const n = nodes.find(n => n.id === id)
    const newNodes = nodes.filter(n => n.id !== id)
    const newEdges = edges.filter(e => e.source !== id && e.target !== id)
    setNodes(newNodes)
    setEdges(newEdges)
    saveWorkflow(newNodes, newEdges)
    addLog({
      level: 'info',
      category: 'operation',
      message: `删除节点: ${n?.data?.label || id}`,
      detail: `类型: ${n?.type} | ID: ${id}`,
    })
  }, [nodeMenu, nodes, edges, setNodes, setEdges, saveWorkflow])

  const handleCopyToClipboard = useCallback(() => {
    if (!nodeMenu) return
    const n = nodes.find(n => n.id === nodeMenu.nodeId)
    if (n) navigator.clipboard.writeText(JSON.stringify(n.data, null, 2)).catch(() => {})
  }, [nodeMenu, nodes])

  // Multi-selection actions
  const handleMultiDelete = useCallback(() => {
    const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id))
    if (selectedIds.size === 0) return
    const newNodes = nodes.filter(n => !selectedIds.has(n.id))
    const newEdges = edges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target))
    setNodes(newNodes)
    setEdges(newEdges)
    saveWorkflow(newNodes, newEdges)
    addLog({
      level: 'info',
      category: 'operation',
      message: `批量删除: ${selectedIds.size} 个节点`,
      detail: `节点IDs: ${Array.from(selectedIds).join(', ')}`,
    })
  }, [nodes, edges, setNodes, setEdges, saveWorkflow])

  const handleMultiDuplicate = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected)
    if (selectedNodes.length === 0) return
    const timestamp = Date.now()
    const newNodes = selectedNodes.map((n, idx) => ({
      ...n,
      id: `${n.id}_copy_${timestamp}_${idx}`,
      position: { x: n.position.x + 40, y: n.position.y + 40 },
    }))
    setNodes([...nodes, ...newNodes])
    saveWorkflow([...nodes, ...newNodes], edges)
    addLog({
      level: 'info',
      category: 'operation',
      message: `批量复制: ${selectedNodes.length} 个节点`,
      detail: `原节点IDs: ${selectedNodes.map(n => n.id).join(', ')}`,
    })
  }, [nodes, edges, setNodes, saveWorkflow])

  const handleMultiGroup = useCallback(() => {
    const sel = nodes.filter(n => n.selected)
    if (sel.length < 2) return
    const ids = sel.map(n => n.id)
    // Auto-label from node types
    const typeSet = [...new Set(sel.map(n => n.type))]
    const label = typeSet.length === 1
      ? `${sel.length} 个节点组`
      : `节点组（${sel.length}）`
    groupNodes(ids, label)
  }, [nodes, groupNodes])

  const handleMultiCopy = useCallback(() => {
    const selectedNodes = nodes.filter(n => n.selected)
    if (selectedNodes.length > 0) {
      navigator.clipboard.writeText(JSON.stringify(selectedNodes.map(n => n.data), null, 2)).catch(() => {})
      addLog({
        level: 'info',
        category: 'operation',
        message: `已复制到剪贴板: ${selectedNodes.length} 个节点`,
      })
    }
  }, [nodes])

  const selectedNodes = useMemo(() => nodes.filter(n => n.selected), [nodes])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Group breadcrumb navigation */}
      {groupNavStack.length > 0 && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, display: 'flex', alignItems: 'center', gap: 4,
          background: '#1a1a2e', border: '1px solid #3a3060',
          borderRadius: 20, padding: '5px 14px',
          boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          fontSize: 12, color: '#999',
          pointerEvents: 'auto',
        }}>
          <span
            style={{ cursor: 'pointer', color: '#7c6af7' }}
            onClick={() => { for (let i = 0; i < groupNavStack.length; i++) exitGroup() }}
          >画布</span>
          {groupNavStack.map((g, i) => (
            <span key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#444' }}>/</span>
              <span
                style={{ cursor: i < groupNavStack.length - 1 ? 'pointer' : 'default', color: i < groupNavStack.length - 1 ? '#7c6af7' : '#ccc' }}
                onClick={() => { for (let j = groupNavStack.length - 1; j > i; j--) exitGroup() }}
              >{g.label}</span>
            </span>
          ))}
        </div>
      )}

      {isEmpty && <TemplatePicker />}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        defaultEdgeOptions={{ type: 'animated' }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={3}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1]}
        snapToGrid={snapToGrid}
        snapGrid={[16, 16]}
        onMoveEnd={onMoveEnd}
        panOnScroll={false}
        deleteKeyCode="Delete"
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#222" />

        {/* MiniMap — above toolbar when visible */}
        {minimapVisible && (
          <MiniMap
            position="bottom-left"
            className="!bottom-[60px] !left-4 !m-0"
            style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 10 }}
            maskColor="rgba(0,0,0,0.55)"
            nodeColor={(node) => {
              const colors: Record<string, string> = {
                script: '#6366f1', scriptGen: '#8b5cf6',
                storyboardTable: '#3b82f6', image: '#10b981', comicFlow: '#f59e0b',
              }
              return colors[node.type ?? ''] ?? '#555'
            }}
            nodeBorderRadius={4}
            pannable
            zoomable
          />
        )}

        {/* Custom bottom toolbar */}
        <Panel position="bottom-left" className="!m-0 !bottom-4 !left-4">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: '#1a1a1a', border: '1px solid #333',
            borderRadius: 10, padding: '4px 8px', height: 40,
          }}>
            {/* Minimap toggle */}
            <button
              onClick={() => setMinimapVisible(v => !v)}
              title="画布小地图"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 7, border: 'none',
                background: minimapVisible ? '#333' : 'none',
                cursor: 'pointer', color: minimapVisible ? '#fff' : '#666',
                transition: 'all .15s',
              }}
            >
              {/* map pin icon */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </button>

            {/* Snap-to-grid toggle */}
            <button
              onClick={() => setSnapToGrid(v => !v)}
              title="网格吸附"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 7, border: 'none',
                background: snapToGrid ? '#333' : 'none',
                cursor: 'pointer', color: snapToGrid ? '#fff' : '#666',
                transition: 'all .15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20M2 6h20M2 18h20M6 2v20M18 2v20"/>
              </svg>
            </button>

            {/* Divider */}
            <div style={{ width: 1, height: 20, background: '#333', margin: '0 4px' }} />

            {/* Zoom out */}
            <button
              onClick={() => zoomOut({ duration: 200 })}
              title="缩小"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 7, border: 'none',
                background: 'none', cursor: 'pointer', color: '#aaa',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>

            {/* Zoom label — click to reset 100% */}
            <button
              onClick={() => { setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 200 }); setZoom(100) }}
              title="重置缩放"
              style={{
                minWidth: 46, height: 30, borderRadius: 7, border: 'none',
                background: 'none', cursor: 'pointer',
                color: '#ccc', fontSize: 13, fontVariantNumeric: 'tabular-nums',
              }}
            >
              {zoom}%
            </button>

            {/* Zoom in */}
            <button
              onClick={() => zoomIn({ duration: 200 })}
              title="放大"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 7, border: 'none',
                background: 'none', cursor: 'pointer', color: '#aaa',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </Panel>
      </ReactFlow>

      {/* Selection bounding box — dashed rect wrapping all selected nodes */}
      <SelectionBoundingBox selectedNodes={selectedNodes} />

      {selectedNodes.length > 0 && (
        <MultiSelectionToolbar
          selectedNodes={selectedNodes}
          onSave={() => {}}
          onDownload={handleMultiCopy}
          onDuplicate={handleMultiDuplicate}
          onGroup={handleMultiGroup}
        />
      )}

      {paneMenu && (
        <CanvasContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          onClose={() => { setPaneMenu(null); setPaneNodeAddOpen(false) }}
          onAddNode={handleAddNode}
        />
      )}

      {paneMenu && paneNodeAddOpen && (
        <NodeAddMenu
          nodeType="default"
          fixedPosition={{ x: paneMenu.x + 210, y: paneMenu.y }}
          spawnPosition={{ x: paneMenu.flowX, y: paneMenu.flowY }}
          onClose={() => { setPaneNodeAddOpen(false); setPaneMenu(null) }}
        />
      )}

      {nodeMenu && (
        <NodeContextMenu
          x={nodeMenu.x}
          y={nodeMenu.y}
          nodeId={nodeMenu.nodeId}
          onClose={() => setNodeMenu(null)}
          onCopy={handleCopy}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onCopyToClipboard={handleCopyToClipboard}
        />
      )}
    </div>
  )
}

export default function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <div className="w-full h-full">
        <WorkflowCanvasInner />
      </div>
    </ReactFlowProvider>
  )
}
