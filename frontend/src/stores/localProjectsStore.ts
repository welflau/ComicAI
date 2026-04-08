/**
 * Local-first project store — persists to localStorage so projects survive
 * page refresh without a backend. When a real backend is available this is
 * bypassed and the API is used instead.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Project, NodeData, EdgeData } from '@/types'

const LS_KEY = 'comicai_projects'

function makeId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

interface LocalWorkflow {
  nodes: NodeData[]
  edges: EdgeData[]
}

interface LocalProjectsState {
  projects: Project[]
  workflows: Record<string, LocalWorkflow>  // projectId → workflow

  createProject: (name: string, description?: string) => Project
  deleteProject: (id: string) => void
  updateProjectName: (id: string, name: string) => void
  saveWorkflow: (projectId: string, nodes: NodeData[], edges: EdgeData[]) => void
  getWorkflow: (projectId: string) => LocalWorkflow | null
}

export const useLocalProjectsStore = create<LocalProjectsState>()(
  persist(
    (set, get) => ({
      projects: [],
      workflows: {},

      createProject: (name, description = '') => {
        const now = new Date().toISOString()
        const project: Project = {
          id: makeId(),
          name,
          description,
          user_id: 'local',
          status: 'draft',
          workflow_config: {},
          tags: [],
          created_at: now,
          updated_at: now,
        }
        set(state => ({ projects: [project, ...state.projects] }))
        return project
      },

      deleteProject: (id) =>
        set(state => ({
          projects: state.projects.filter(p => p.id !== id),
          workflows: Object.fromEntries(
            Object.entries(state.workflows).filter(([k]) => k !== id)
          ),
        })),

      updateProjectName: (id, name) =>
        set(state => ({
          projects: state.projects.map(p =>
            p.id === id ? { ...p, name, updated_at: new Date().toISOString() } : p
          ),
        })),

      saveWorkflow: (projectId, nodes, edges) =>
        set(state => ({
          workflows: { ...state.workflows, [projectId]: { nodes, edges } },
          projects: state.projects.map(p =>
            p.id === projectId ? { ...p, updated_at: new Date().toISOString() } : p
          ),
        })),

      getWorkflow: (projectId) => get().workflows[projectId] ?? null,
    }),
    { name: LS_KEY }
  )
)
