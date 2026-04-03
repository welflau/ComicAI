import { useCallback, useMemo, useRef } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  Panel,
} from 'reactflow'
import 'reactflow/dist/style.css'

import ComicFlowNode from '@/components/nodes/ComicFlowNode'
import { useProjectStore } from '@/stores/projectStore'
import type { NodeData, EdgeData } from '@/types'

// Register custom node types
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
}

// Convert our NodeData to ReactFlow Node format
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
    animated: true,
    style: { stroke: '#4F6EF7', strokeWidth: 2 },
  }
}

function WorkflowCanvasInner() {
  const { nodes: storeNodes, edges: storeEdges, updateWorkflow, selectNodes } = useProjectStore()

  const rfNodes = useMemo(() => storeNodes.map(toRFNode), [storeNodes])
  const rfEdges = useMemo(() => storeEdges.map(toRFEdge), [storeEdges])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `e-${params.source}-${params.target}`,
        animated: true,
        style: { stroke: '#4F6EF7', strokeWidth: 2 },
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
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    }))
    updateWorkflow(updatedNodes, updatedEdges)
  }, [nodes, edges, updateWorkflow])

  return (
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
      fitViewOptions={{ padding: 0.2 }}
      defaultEdgeOptions={{
        animated: true,
        style: { stroke: '#4F6EF7', strokeWidth: 2 }
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1}
        color="#2D3347"
      />
      <Controls className="!bottom-4 !left-4" />
      <MiniMap
        className="!bottom-4 !right-4"
        nodeColor={(node) => {
          const cat = node.data?.category
          const colors: Record<string, string> = {
            input: '#3B82F6', process: '#10B981',
            output: '#EF4444', control: '#8B5CF6'
          }
          return colors[cat] || '#4F6EF7'
        }}
      />

      {/* Toolbar overlay */}
      <Panel position="top-center">
        <div className="flex items-center gap-1 bg-canvas-surface border border-canvas-border rounded-xl px-3 py-2 shadow-xl">
          <span className="text-xs text-white/40">节点工作流</span>
        </div>
      </Panel>
    </ReactFlow>
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
