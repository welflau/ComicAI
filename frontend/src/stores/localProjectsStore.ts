/**
 * Local-first project store — persisted to IndexedDB via Dexie.
 *
 * Replaces the previous Zustand-persist/localStorage approach.
 * Projects and workflow data are stored in the `projects` and
 * `workflows` IndexedDB tables (see stores/db.ts).
 *
 * One-time migration from the old localStorage key is performed
 * automatically on first use.
 */
import { create } from 'zustand'
import { db } from './db'
import { deleteProjectImages } from './imageStore'
import type { Project, NodeData, EdgeData } from '@/types'

const LS_LEGACY_KEY = 'comicai_projects'

/* ── State ────────────────────────────────────────────────── */

interface LocalProjectsState {
  /** In-memory cache of the projects list (populated by init) */
  projects: Project[]
  /** Whether the store has finished loading from IndexedDB */
  ready: boolean

  /** Load all projects from IndexedDB into memory */
  init: () => Promise<void>
  /** Migrate legacy localStorage data to IndexedDB (one-time) */
  migrateFromLocalStorage: () => Promise<void>

  createProject: (name: string, description?: string) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
  updateProjectName: (id: string, name: string) => Promise<void>

  saveWorkflow: (projectId: string, nodes: NodeData[], edges: EdgeData[]) => Promise<void>
  getWorkflow: (projectId: string) => Promise<{ nodes: NodeData[]; edges: EdgeData[] } | null>
}

/* ── Helpers ──────────────────────────────────────────────── */

function makeId() {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/* ── Store ────────────────────────────────────────────────── */

export const useLocalProjectsStore = create<LocalProjectsState>()((set, get) => ({
  projects: [],
  ready: false,

  /* ── init ── */
  init: async () => {
    if (get().ready) return

    // Run one-time migration first (no-op if already done)
    await get().migrateFromLocalStorage()

    const projects = await db.projects
      .orderBy('updated_at')
      .reverse()
      .toArray()

    set({ projects, ready: true })
  },

  /* ── one-time localStorage migration ── */
  migrateFromLocalStorage: async () => {
    try {
      const raw = localStorage.getItem(LS_LEGACY_KEY)
      if (!raw) return

      const parsed = JSON.parse(raw) as {
        state?: {
          projects?: Project[]
          workflows?: Record<string, { nodes: NodeData[]; edges: EdgeData[] }>
        }
      }

      const legacyProjects  = parsed?.state?.projects  ?? []
      const legacyWorkflows = parsed?.state?.workflows ?? {}

      if (legacyProjects.length === 0) {
        localStorage.removeItem(LS_LEGACY_KEY)
        return
      }

      // Write projects (skip those that already exist in IDB)
      const existingIds = new Set((await db.projects.toArray()).map(p => p.id))
      const toInsert = legacyProjects.filter(p => !existingIds.has(p.id))
      if (toInsert.length > 0) await db.projects.bulkAdd(toInsert)

      // Write workflows
      for (const [projectId, wf] of Object.entries(legacyWorkflows)) {
        const exists = await db.workflows.get(projectId)
        if (!exists) {
          await db.workflows.put({
            projectId,
            nodes: wf.nodes,
            edges: wf.edges,
            updatedAt: Date.now(),
          })
        }
      }

      // Remove old localStorage key so migration never runs again
      localStorage.removeItem(LS_LEGACY_KEY)
      console.info('[localProjectsStore] Migrated from localStorage → IndexedDB')
    } catch (e) {
      console.warn('[localProjectsStore] Migration failed:', e)
    }
  },

  /* ── createProject ── */
  createProject: async (name, description = '') => {
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
    await db.projects.add(project)
    set(state => ({ projects: [project, ...state.projects] }))
    return project
  },

  /* ── deleteProject ── */
  deleteProject: async (id) => {
    await Promise.all([
      db.projects.delete(id),
      db.workflows.delete(id),
      deleteProjectImages(id),
    ])
    set(state => ({ projects: state.projects.filter(p => p.id !== id) }))
  },

  /* ── updateProjectName ── */
  updateProjectName: async (id, name) => {
    const now = new Date().toISOString()
    await db.projects.update(id, { name, updated_at: now })
    set(state => ({
      projects: state.projects.map(p =>
        p.id === id ? { ...p, name, updated_at: now } : p
      ),
    }))
  },

  /* ── saveWorkflow ── */
  saveWorkflow: async (projectId, nodes, edges) => {
    const now = new Date().toISOString()
    await Promise.all([
      db.workflows.put({ projectId, nodes, edges, updatedAt: Date.now() }),
      db.projects.update(projectId, { updated_at: now }),
    ])
    set(state => ({
      projects: state.projects.map(p =>
        p.id === projectId ? { ...p, updated_at: now } : p
      ),
    }))
  },

  /* ── getWorkflow ── */
  getWorkflow: async (projectId) => {
    const record = await db.workflows.get(projectId)
    if (!record) return null
    return { nodes: record.nodes, edges: record.edges }
  },
}))
