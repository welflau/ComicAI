import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type {
  Project, Script, Storyboard, Character, GenerationTask, Asset,
  NodeData, EdgeData, CollabUser
} from '@/types'
import { projectsApi } from '@/api'

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
  activeView: 'workflow' | 'storyboard' | 'timeline' | 'preview'

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
  addNode: (node: NodeData) => void
  updateNode: (id: string, updates: Partial<NodeData>) => void
  deleteNode: (id: string) => void

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
    activeView: 'workflow',
    collabUsers: [],
    wsConnected: false,
    isLoading: false,

    loadProject: async (projectId) => {
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
          nodes: workflowConfig.nodes || getDefaultNodes(),
          edges: workflowConfig.edges || getDefaultEdges(),
          isLoading: false
        })
      } catch (e) {
        set({ isLoading: false })
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
      }
    },

    setActiveView: (view) => set({ activeView: view }),
    selectNodes: (ids) => set({ selectedNodeIds: ids }),

    addNode: (node) => set((state) => ({ nodes: [...state.nodes, node] })),

    updateNode: (id, updates) => set((state) => ({
      nodes: state.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
    })),

    deleteNode: (id) => set((state) => ({
      nodes: state.nodes.filter(n => n.id !== id),
      edges: state.edges.filter(e => e.source !== id && e.target !== id)
    })),

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

// Default workflow nodes (input → parse → storyboard → image → edit → preview)
function getDefaultNodes(): NodeData[] {
  return [
    { id: 'script_input', type: 'script_input', label: '剧本输入', category: 'input', position: { x: 80, y: 200 }, config: {} },
    { id: 'script_parse', type: 'script_parse', label: 'AI 剧本解析', category: 'process', position: { x: 320, y: 200 }, config: {} },
    { id: 'storyboard_gen', type: 'storyboard_gen', label: '分镜生成', category: 'process', position: { x: 560, y: 200 }, config: { visual_style: 'manga' } },
    { id: 'image_gen', type: 'image_gen', label: '图像生成', category: 'process', position: { x: 800, y: 120 }, config: { style: 'manga' } },
    { id: 'tts', type: 'tts', label: '配音合成', category: 'process', position: { x: 800, y: 280 }, config: { voice_id: 'zh_female_gentle' } },
    { id: 'auto_edit', type: 'auto_edit', label: '智能剪辑', category: 'process', position: { x: 1040, y: 200 }, config: { style: 'dynamic' } },
    { id: 'preview', type: 'preview', label: '预览', category: 'output', position: { x: 1280, y: 200 }, config: {} },
  ]
}

function getDefaultEdges(): EdgeData[] {
  return [
    { id: 'e1', source: 'script_input', target: 'script_parse' },
    { id: 'e2', source: 'script_parse', target: 'storyboard_gen' },
    { id: 'e3', source: 'storyboard_gen', target: 'image_gen' },
    { id: 'e4', source: 'storyboard_gen', target: 'tts' },
    { id: 'e5', source: 'image_gen', target: 'auto_edit' },
    { id: 'e6', source: 'tts', target: 'auto_edit' },
    { id: 'e7', source: 'auto_edit', target: 'preview' },
  ]
}
