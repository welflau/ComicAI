import { useCallback, useMemo, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  SelectionMode,
} from 'reactflow'
import 'reactflow/dist/style.css'

import ComicFlowNode from '@/components/nodes/ComicFlowNode'
import ScriptNode from '@/components/nodes/ScriptNode'
import StoryboardTableNode from '@/components/nodes/StoryboardTableNode'
import ImageNode from '@/components/nodes/ImageNode'
import TemplatePicker from '@/components/canvas/TemplatePicker'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'

// Register all node types
const nodeTypes = {
  // Legacy node types
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
  // New LibTV-style node types
  libtv_script: ScriptNode,
  libtv_storyboard: StoryboardTableNode,
  libtv_image: ImageNode,
}

function toRFNode(node: NodeData): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node,
  }
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
  const { nodes: storeNodes, edges: storeEdges, updateWorkflow, selectNodes } = useProjectStore()

  const isEmpty = storeNodes.length === 0

  const rfNodes = useMemo(() => storeNodes.map(toRFNode), [storeNodes])
  const rfEdges = useMemo(() => storeEdges.map(toRFEdge), [storeEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  // Sync ReactFlow local state whenever the store nodes/edges change
  // (handles project switching, template selection, etc.)
  useEffect(() => { setNodes(rfNodes) }, [rfNodes])
  useEffect(() => { setEdges(rfEdges) }, [rfEdges])

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        type: 'default',
        style: { stroke: '#444', strokeWidth: 1.5 },
      } as Edge
      setEdges(eds => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      selectNodes(selected.map(n => n.id))
    },
    [selectNodes]
  )

  const onNodeDragStop = useCallback(() => {
    const updatedNodes: NodeData[] = nodes.map(n => ({
      ...n.data,
      position: n.position,
    }))
    const updatedEdges: EdgeData[] = edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    }))
    updateWorkflow(updatedNodes, updatedEdges)
  }, [nodes, edges, updateWorkflow])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isEmpty && <TemplatePicker />}
      <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onSelectionChange={onSelectionChange}
      onNodeDragStop={onNodeDragStop}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      defaultEdgeOptions={{
        type: 'default',
        style: { stroke: '#444', strokeWidth: 1.5 },
      }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.1}
      maxZoom={3}
      // Left-click drag → rubber-band selection
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      // Middle mouse button → pan canvas
      panOnDrag={[1]}
      // Disable scroll-to-pan (use pinch/wheel for zoom only)
      panOnScroll={false}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={28}
        size={1}
        color="#222"
      />
      <Controls
        className="!bottom-4 !left-4"
        showInteractive={false}
        style={{
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: 8,
          gap: 0,
        }}
      />
    </ReactFlow>
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
