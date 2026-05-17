import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  Project, Script, Storyboard, Character, GenerationTask, Asset,
  NodeData, EdgeData, CollabUser
} from '@/types'
import { projectsApi } from '@/api'
import { addLog } from "@/stores/logStore"

// Debounce timer for auto-saving node updates
let _saveTimer: ReturnType<typeof setTimeout> | undefined

interface ProjectState {
  // Current project
  currentProject: Project | null
  projects: Project[]

  // Resources
  scripts: Script[]
  storyboards: Storyboard[]
  characters: Character[]
  tasks: GenerationTask[]
  assets: Asset[]

  // Workflow canvas
  nodes: NodeData[]
  edges: EdgeData[]
  selectedNodeIds: string[]
  /** When set, WorkflowCanvas will select+focus this node on next render and clear this field */
  pendingSelectNodeId: string | null
  activeView: 'workflow' | 'storyboard' | 'timeline' | 'preview'

  // Group navigation
  currentGroupId: string | null
  groupNavStack: Array<{ id: string; label: string }>

  // Collaboration
  collabUsers: CollabUser[]
  wsConnected: boolean

  // UI state
  isLoading: boolean

  // Actions
  loadProject: (projectId: string) => Promise<void>
  setCurrentProject: (project: Project) => void
  updateWorkflow: (nodes: NodeData[], edges: EdgeData[]) => Promise<void>
  setActiveView: (view: 'workflow' | 'storyboard' | 'timeline' | 'preview') => void
  selectNodes: (ids: string[]) => void
  /** Request WorkflowCanvas to select + pan to a specific node */
  requestSelectNode: (id: string) => void
  addNode: (node: NodeData) => void
  addEdge: (edge: EdgeData) => void
  updateNode: (id: string, updates: Partial<NodeData>) => void
  deleteNode: (id: string) => void

  // Group navigation actions
  enterGroup: (groupId: string) => void
  exitGroup: () => void
  /** 将选中的节点打包进一个新组节点 */
  groupNodes: (nodeIds: string[], label: string) => void

  // Task actions
  addTask: (task: GenerationTask) => void

  // Task polling
  startTaskPolling: (projectId: string, taskId: string) => void
  stopTaskPolling: (taskId: string) => void

  // Collaboration
  setCollabUsers: (users: CollabUser[]) => void
  updateCollabCursor: (userId: string, cursor: { x: number; y: number }) => void
}

export const useProjectStore = create<ProjectState>()(
  subscribeWithSelector((set, get) => ({
    currentProject: null,
    projects: [],
    scripts: [],
    storyboards: [],
    characters: [],
    tasks: [],
    assets: [],
    nodes: [],
    edges: [],
    selectedNodeIds: [],
    pendingSelectNodeId: null,
    activeView: 'workflow',
    currentGroupId: null,
    groupNavStack: [],
    collabUsers: [],
    wsConnected: false,
    isLoading: false,

    loadProject: async (projectId) => {
      // local_ 前缀项目：从 IndexedDB 读取（迁移前的遗留项目）
      if (projectId.startsWith('local_')) {
        const { useLocalProjectsStore } = await import('@/stores/localProjectsStore')
        const localStore = useLocalProjectsStore.getState()
        await localStore.init()
        const localProject = localStore.projects.find(p => p.id === projectId)
        const wf = await localStore.getWorkflow(projectId)
        set({
          currentProject: localProject ?? {
            id: projectId, name: '本地项目', user_id: 'local',
            status: 'draft', workflow_config: {}, tags: [],
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          },
          scripts: [], storyboards: [], characters: [], assets: [],
          nodes: wf?.nodes ?? [],
          edges: wf?.edges ?? [],
          isLoading: false,
        })
        return
      }

      // demo 项目：使用默认节点，不查后端
      if (projectId === 'demo') {
        set({
          currentProject: {
            id: 'demo',
            name: '三体·红岸基地',
            user_id: 'local',
            status: 'draft',
            workflow_config: {},
            tags: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          scripts: [],
          storyboards: [],
          characters: [],
          assets: [],
          nodes: getDefaultNodes(),
          edges: getDefaultEdges(),
          isLoading: false,
        })
        return
      }

      set({ isLoading: true })
      try {
        const [project, scripts, storyboards, characters, assets] = await Promise.all([
          projectsApi.get(projectId),
          projectsApi.getScripts(projectId),
          projectsApi.getStoryboards(projectId),
          projectsApi.getCharacters(projectId),
          projectsApi.getAssets(projectId),
        ])

        const workflowConfig = project.workflow_config || {}
        set({
          currentProject: project,
          scripts,
          storyboards,
          characters,
          assets,
          nodes: workflowConfig.nodes ?? [],
          edges: workflowConfig.edges ?? [],
          isLoading: false
        })
        addLog({
          level: 'info',
          category: 'operation',
          message: '项目已加载',
          detail: `加载项目: ${project.name}`,
        })
      } catch (e) {
        set({ isLoading: false })
        addLog({
          level: 'error',
          category: 'operation',
          message: '项目加载失败',
          detail: `项目ID: ${projectId}`,
        })
        throw e
      }
    },

    setCurrentProject: (project) => set({ currentProject: project }),

    updateWorkflow: async (nodes, edges) => {
      const { currentProject } = get()
      if (!currentProject) return

      set({ nodes, edges })

      // Debounced save (in production use debounce hook)
      try {
        await projectsApi.update(currentProject.id, {
          workflow_config: {
            ...currentProject.workflow_config,
            nodes,
            edges
          }
        })
      } catch (e) {
        console.error('Failed to save workflow:', e)
        addLog({
          level: 'error',
          category: 'operation',
          message: '工作流保存失败',
          detail: String(e),
        })
      }
    },

    setActiveView: (view) => set({ activeView: view }),
    selectNodes: (ids) => set({ selectedNodeIds: ids }),
    requestSelectNode: (id) => set({ pendingSelectNodeId: id, selectedNodeIds: [id] }),

    addNode: (node) => {
      set((state) => ({ nodes: [...state.nodes, node] }))
      addLog({
        level: 'info',
        category: 'operation',
        message: '节点已添加',
        detail: `类型: ${node.type}, 标签: ${node.label}`,
      })
      // Save immediately on structural changes
      clearTimeout(_saveTimer)
      _saveTimer = setTimeout(() => {
        const { currentProject, nodes, edges } = get()
        if (!currentProject) return
        projectsApi.update(currentProject.id, {
          workflow_config: { ...currentProject.workflow_config, nodes, edges }
        }).catch(e => console.error('Failed to save after addNode:', e))
      }, 300)
    },

    addEdge: (edge) => {
      set((state) => ({ edges: [...state.edges, edge] }))
      addLog({
        level: 'info',
        category: 'operation',
        message: '连接已创建',
        detail: `从 ${edge.source} 到 ${edge.target}`,
      })
      clearTimeout(_saveTimer)
      _saveTimer = setTimeout(() => {
        const { currentProject, nodes, edges } = get()
        if (!currentProject) return
        projectsApi.update(currentProject.id, {
          workflow_config: { ...currentProject.workflow_config, nodes, edges }
        }).catch(e => console.error('Failed to save after addEdge:', e))
      }, 300)
    },

    updateNode: (id, updates) => {
      set((state) => ({
        nodes: state.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
      }))
      // Persist to backend — debounced via a module-level timer
      clearTimeout(_saveTimer)
      _saveTimer = setTimeout(() => {
        const { currentProject, nodes, edges } = get()
        if (!currentProject) return
        projectsApi.update(currentProject.id, {
          workflow_config: {
            ...currentProject.workflow_config,
            nodes,
            edges,
          }
        }).catch(e => console.error('Failed to save node update:', e))
      }, 800)
    },

    deleteNode: (id) => {
      set((state) => ({
        nodes: state.nodes.filter(n => n.id !== id),
        edges: state.edges.filter(e => e.source !== id && e.target !== id)
      }))
      addLog({
        level: 'info',
        category: 'operation',
        message: '节点已删除',
        detail: `节点ID: ${id}`,
      })
      clearTimeout(_saveTimer)
      _saveTimer = setTimeout(() => {
        const { currentProject, nodes, edges } = get()
        if (!currentProject) return
        projectsApi.update(currentProject.id, {
          workflow_config: { ...currentProject.workflow_config, nodes, edges }
        }).catch(e => console.error('Failed to save after deleteNode:', e))
      }, 300)
    },

    // ── Group navigation ──────────────────────────────────────────
    enterGroup: (groupId) => {
      const group = get().nodes.find(n => n.id === groupId)
      if (!group) return
      set(state => ({
        currentGroupId: groupId,
        groupNavStack: [...state.groupNavStack, { id: groupId, label: group.label }],
        selectedNodeIds: [],
      }))
    },

    exitGroup: () => {
      set(state => {
        const newStack = state.groupNavStack.slice(0, -1)
        return {
          currentGroupId: newStack.length > 0 ? newStack[newStack.length - 1].id : null,
          groupNavStack: newStack,
          selectedNodeIds: [],
        }
      })
    },

    groupNodes: (nodeIds, label) => {
      const state = get()
      const toGroup = state.nodes.filter(n => nodeIds.includes(n.id))
      if (toGroup.length === 0) return

      // Compute center of selected nodes for group node position
      const xs = toGroup.map(n => n.position.x)
      const ys = toGroup.map(n => n.position.y)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2

      const groupId = `libtv_group_${Date.now()}`

      // Count node types for summary
      const typeSummary = toGroup.reduce<Record<string, number>>((acc, n) => {
        const key = n.type
        acc[key] = (acc[key] ?? 0) + 1
        return acc
      }, {})

      // Create group node
      const groupNode: NodeData = {
        id: groupId,
        type: 'libtv_group',
        label,
        category: 'process',
        position: { x: cx - 140, y: cy - 40 },
        config: { typeSummary },
        groupId: state.currentGroupId ?? undefined,
      }

      // Move selected nodes into group (set their groupId)
      const updatedNodes = state.nodes.map(n =>
        nodeIds.includes(n.id) ? { ...n, groupId } : n
      )

      // Move edges: if both endpoints are in group, set groupId on edge
      const updatedEdges = state.edges.map(e => {
        const srcInGroup = nodeIds.includes(e.source)
        const tgtInGroup = nodeIds.includes(e.target)
        return (srcInGroup && tgtInGroup) ? { ...e, groupId } : e
      })

      set({ nodes: [...updatedNodes, groupNode], edges: updatedEdges, selectedNodeIds: [] })

      addLog({ level: 'info', category: 'operation', message: `已打组：${label}`, detail: `${toGroup.length} 个节点` })

      // Trigger save via existing updateWorkflow action
      clearTimeout(_saveTimer)
      _saveTimer = setTimeout(() => {
        const s = get()
        s.updateWorkflow(s.nodes, s.edges).catch(() => {})
      }, 300)
    },

    addTask: (task) => {
      set((state) => ({ tasks: [task, ...state.tasks] }))
      addLog({
        level: 'info',
        category: 'operation',
        message: '任务已创建',
        detail: `任务类型: ${task.type}`,
      })
    },

    startTaskPolling: (projectId, taskId) => {
      const interval = setInterval(async () => {
        try {
          const task = await projectsApi.getTask(projectId, taskId)
          set((state) => ({
            tasks: state.tasks.map(t => t.id === taskId ? task : t)
          }))
          if (['completed', 'failed', 'cancelled'].includes(task.status)) {
            clearInterval(interval)
            pollingIntervals.delete(taskId)
          }
        } catch {
          clearInterval(interval)
        }
      }, 2000)
      pollingIntervals.set(taskId, interval)
    },

    stopTaskPolling: (taskId) => {
      const interval = pollingIntervals.get(taskId)
      if (interval) {
        clearInterval(interval)
        pollingIntervals.delete(taskId)
      }
    },

    setCollabUsers: (users) => set({ collabUsers: users }),

    updateCollabCursor: (userId, cursor) => set((state) => ({
      collabUsers: state.collabUsers.map(u =>
        u.user_id === userId ? { ...u, cursor } : u
      )
    })),
  }))
)

const pollingIntervals = new Map<string, ReturnType<typeof setInterval>>()

// ─── Template presets ────────────────────────────────────────────────────────

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  color: string        // gradient or solid for card bg
  nodes: NodeData[]
  edges: EdgeData[]
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'script_to_video',
    name: '故事脚本生成',
    description: '剧本 → 分镜表格',
    color: 'linear-gradient(135deg, #1a2a1a 0%, #0d1a0d 100%)',
    nodes: [
      {
        id: 'stv_script_1',
        type: 'libtv_script' as NodeData['type'],
        label: '剧本',
        category: 'input',
        position: { x: 60, y: 120 },
        config: {},
        title: '新剧本',
        initialMode: 'content',
        content: `第一幕：相遇\n\n深夜的咖啡馆，只剩最后一盏灯。\n\n林夏坐在靠窗的位置，手边是一杯已经凉透的拿铁，她的目光落在窗外的雨幕上，出神。\n\n推门声。\n\n一个男人走进来，雨水打湿了他的肩头。他环顾四周，目光最终停在林夏身旁的空椅子上。\n\n"这里有人吗？"\n\n林夏抬起头，看了他一眼，摇了摇头。`,
      } as NodeData,
      {
        id: 'stv_storyboard_1',
        type: 'libtv_storyboard' as NodeData['type'],
        label: '分镜表格',
        category: 'process',
        position: { x: 360, y: 40 },
        config: {},
        title: '分镜规划',
      } as NodeData,
    ],
    edges: [
      { id: 'e1', source: 'stv_script_1', target: 'stv_storyboard_1' },
    ],
  },
  {
    id: 'character_design',
    name: '角色三视图',
    description: '角色描述 → 三视图生成',
    color: 'linear-gradient(135deg, #1a1a2a 0%, #0d0d1a 100%)',
    nodes: [
      {
        id: 'char_script_1',
        type: 'libtv_script' as NodeData['type'],
        label: '角色设定',
        category: 'input',
        position: { x: 60, y: 120 },
        config: {},
        title: '角色设定',
        content: '描述角色的外貌、性格、服装风格...',
      } as NodeData,
      {
        id: 'char_image_front',
        type: 'libtv_image' as NodeData['type'],
        label: '正面',
        category: 'output',
        position: { x: 340, y: 40 },
        config: {},
      } as NodeData,
      {
        id: 'char_image_side',
        type: 'libtv_image' as NodeData['type'],
        label: '侧面',
        category: 'output',
        position: { x: 340, y: 220 },
        config: {},
      } as NodeData,
      {
        id: 'char_image_back',
        type: 'libtv_image' as NodeData['type'],
        label: '背面',
        category: 'output',
        position: { x: 340, y: 400 },
        config: {},
      } as NodeData,
    ],
    edges: [
      { id: 'e1', source: 'char_script_1', target: 'char_image_front' },
      { id: 'e2', source: 'char_script_1', target: 'char_image_side' },
      { id: 'e3', source: 'char_script_1', target: 'char_image_back' },
    ],
  },
  {
    id: 'storyboard_to_video',
    name: '首帧图生视频',
    description: '分镜图片 → 视频片段',
    color: 'linear-gradient(135deg, #1a1218 0%, #0d0a0f 100%)',
    nodes: [
      {
        id: 'sb_storyboard_1',
        type: 'libtv_storyboard' as NodeData['type'],
        label: '分镜表格',
        category: 'process',
        position: { x: 60, y: 60 },
        config: {},
        title: '分镜规划',
      } as NodeData,
      {
        id: 'sb_image_1',
        type: 'libtv_image' as NodeData['type'],
        label: '首帧图',
        category: 'output',
        position: { x: 360, y: 60 },
        config: {},
      } as NodeData,
    ],
    edges: [
      { id: 'e1', source: 'sb_storyboard_1', target: 'sb_image_1' },
    ],
  },
  {
    id: 'music_video',
    name: '音频生视频',
    description: '音乐 + 歌词 → 视觉化视频',
    color: 'linear-gradient(135deg, #1a1a12 0%, #0d0d0a 100%)',
    nodes: [
      {
        id: 'mv_script_1',
        type: 'libtv_script' as NodeData['type'],
        label: '歌词 / 概念',
        category: 'input',
        position: { x: 60, y: 100 },
        config: {},
        title: '歌词与风格',
        content: '填写歌词或音乐风格描述...',
      } as NodeData,
      {
        id: 'mv_storyboard_1',
        type: 'libtv_storyboard' as NodeData['type'],
        label: '分镜',
        category: 'process',
        position: { x: 340, y: 20 },
        config: {},
        title: 'MV 分镜',
      } as NodeData,
      {
        id: 'mv_image_1',
        type: 'libtv_image' as NodeData['type'],
        label: '视觉帧',
        category: 'output',
        position: { x: 340, y: 260 },
        config: {},
      } as NodeData,
    ],
    edges: [
      { id: 'e1', source: 'mv_script_1', target: 'mv_storyboard_1' },
      { id: 'e2', source: 'mv_storyboard_1', target: 'mv_image_1' },
    ],
  },
]

// Default workflow nodes — demo project
function getDefaultNodes(): NodeData[] {
  return [
    {
      id: 'libtv_script_1',
      type: 'libtv_script' as NodeData['type'],
      label: '剧本',
      category: 'input',
      position: { x: 60, y: 80 },
      config: {},
      title: '第一章：红岸基地',
      initialMode: 'content',
      content: `1967年的冬天，大兴安岭雷达站比往年来得更早。\n\n凛冽的北风从西伯利亚呼啸而来，裹挟着细碎的冰晶，在雷达站的山脊上掀起一片茫茫雪雾。气温已经降到零下三十度，连空气都仿佛被冻成了固体，每一次呼吸像是在吞咽碎玻璃。\n\n叶文洁站在红岸基地的观测平台上，仰望着苍穹。\n\n雷达站大型抛物面天线在夜色中静默矗立，如一只巨眼深邃的眸。`,
    } as NodeData,
    {
      id: 'libtv_storyboard_1',
      type: 'libtv_storyboard' as NodeData['type'],
      label: '分镜表格',
      category: 'process',
      position: { x: 340, y: 10 },
      config: {},
      title: '红岸基地：第一声鸣响',
    } as NodeData,
    {
      id: 'libtv_image_1',
      type: 'libtv_image' as NodeData['type'],
      label: '图片节点 2',
      category: 'output',
      position: { x: 340, y: 320 },
      config: {},
    } as NodeData,
  ]
}

function getDefaultEdges(): EdgeData[] {
  return [
    { id: 'e1', source: 'libtv_script_1', target: 'libtv_storyboard_1' },
    { id: 'e2', source: 'libtv_storyboard_1', target: 'libtv_image_1' },
  ]
}
