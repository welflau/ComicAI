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
import TemplatePicker from '@/components/canvas/TemplatePicker'
import CanvasContextMenu from '@/components/canvas/CanvasContextMenu'
import NodeContextMenu from '@/components/canvas/NodeContextMenu'
import { useProjectStore } from '@/stores/projectStore'
import { registerViewportCenter } from '@/stores/viewportCenter'
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
    type: 'default',
    style: { stroke: '#444', strokeWidth: 1.5 },
  }
}

function WorkflowCanvasInner() {
  const storeNodes     = useProjectStore(s => s.nodes)
  const storeEdges     = useProjectStore(s => s.edges)
  const updateWorkflow = useProjectStore(s => s.updateWorkflow)
  const addNode        = useProjectStore(s => s.addNode)

  const isEmpty = storeNodes.length === 0

  const [paneMenu, setPaneMenu]   = useState<{ x: number; y: number; flowX: number; flowY: number } | null>(null)
  const [nodeMenu, setNodeMenu]   = useState<{ x: number; y: number; nodeId: string } | null>(null)
  const [clipboard, setClipboard] = useState<Node | null>(null)
  const [minimapVisible, setMinimapVisible] = useState(true)

  const rfNodes = useMemo(() => storeNodes.map(toRFNode), [storeNodes])
  const rfEdges = useMemo(() => storeEdges.map(toRFEdge), [storeEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  const prevStoreNodes = useRef(storeNodes)
  const prevStoreEdges = useRef(storeEdges)

  const { project, getViewport, zoomIn, zoomOut, fitView, setViewport } = useReactFlow()
  const [zoom, setZoom] = useState(100)
  const [snapToGrid, setSnapToGrid] = useState(false)

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

  // Sync store → ReactFlow, preserving selection state
  useEffect(() => {
    if (storeNodes !== prevStoreNodes.current) {
      prevStoreNodes.current = storeNodes
      setNodes(nds => {
        const selMap = new Map(nds.map(n => [n.id, n.selected]))
        return rfNodes.map(n => ({ ...n, selected: selMap.get(n.id) ?? false }))
      })
    }
  }, [storeNodes, rfNodes])

  useEffect(() => {
    if (storeEdges !== prevStoreEdges.current) {
      prevStoreEdges.current = storeEdges
      setEdges(rfEdges)
    }
  }, [storeEdges, rfEdges])

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        type: 'default',
        style: { stroke: '#444', strokeWidth: 1.5 },
      } as Edge
      setEdges(eds => addEdge(newEdge, eds))
      addLog({
        level: 'info',
        category: 'operation',
        message: '连接已创建',
        detail: `从 ${newEdge.source} 到 ${newEdge.target}`,
      })
    },
    [setEdges]
  )

  const saveWorkflow = useCallback((ns: Node[], es: Edge[]) => {
    updateWorkflow(
      ns.map(n => ({ ...n.data, position: n.position })),
      es.map(e => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
      }))
    )
  }, [updateWorkflow])

  const onNodeDragStop = useCallback(() => {
    saveWorkflow(nodes, edges)
  }, [nodes, edges, saveWorkflow])

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map(n => n.id))
    saveWorkflow(
      nodes.filter(n => !ids.has(n.id)),
      edges.filter(e => !ids.has(e.source) && !ids.has(e.target))
    )
  }, [nodes, edges, saveWorkflow])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const ids = new Set(deleted.map(e => e.id))
    saveWorkflow(nodes, edges.filter(e => !ids.has(e.id)))
  }, [nodes, edges, saveWorkflow])

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

  // Add node at pane position
  const handleAddNode = useCallback(() => {
    if (!paneMenu) return
    addNode({
      id: `libtv_script_${Date.now()}`,
      type: 'libtv_script' as NodeData['type'],
      label: '剧本',
      category: 'input',
      position: { x: paneMenu.flowX, y: paneMenu.flowY },
      config: {},
      title: '',
      content: '',
    } as NodeData)
  }, [paneMenu, addNode])

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
  }, [nodeMenu, nodes, addNode])

  const handleDelete = useCallback(() => {
    if (!nodeMenu) return
    const id = nodeMenu.nodeId
    const newNodes = nodes.filter(n => n.id !== id)
    const newEdges = edges.filter(e => e.source !== id && e.target !== id)
    setNodes(newNodes)
    setEdges(newEdges)
    saveWorkflow(newNodes, newEdges)
    addLog({
      level: 'info',
      category: 'operation',
      message: '节点已删除',
      detail: `节点ID: ${id}`,
    })
  }, [nodeMenu, nodes, edges, setNodes, setEdges, saveWorkflow])

  const handleCopyToClipboard = useCallback(() => {
    if (!nodeMenu) return
    const n = nodes.find(n => n.id === nodeMenu.nodeId)
    if (n) navigator.clipboard.writeText(JSON.stringify(n.data, null, 2)).catch(() => {})
  }, [nodeMenu, nodes])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isEmpty && <TemplatePicker />}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        defaultEdgeOptions={{ type: 'default', style: { stroke: '#444', strokeWidth: 1.5 } }}
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

      {paneMenu && (
        <CanvasContextMenu
          x={paneMenu.x}
          y={paneMenu.y}
          onClose={() => setPaneMenu(null)}
          onAddNode={handleAddNode}
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
