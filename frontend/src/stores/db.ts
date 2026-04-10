/**
 * ComicAI — Dexie (IndexedDB) database definition
 *
 * Tables:
 *   images     — raw image blobs, keyed by auto-increment id
 *   projects   — project metadata (replaces localStorage "comicai_projects".projects)
 *   workflows  — per-project node/edge data (replaces localStorage "comicai_projects".workflows)
 */
import Dexie, { type Table } from 'dexie'
import type { Project, NodeData, EdgeData } from '@/types'

/* ── Table row types ──────────────────────────────────────── */

export interface ImageRecord {
  id?: number          // auto-increment primary key
  projectId: string    // which project this image belongs to
  fileName: string     // original file name (for display)
  mimeType: string     // e.g. "image/jpeg"
  data: Blob           // raw binary — no base64 overhead
  createdAt: number    // Date.now()
}

export interface WorkflowRecord {
  projectId: string    // primary key
  nodes: NodeData[]
  edges: EdgeData[]
  updatedAt: number
}

/* ── DB class ─────────────────────────────────────────────── */

class ComicAIDatabase extends Dexie {
  images!:    Table<ImageRecord,   number>
  projects!:  Table<Project,       string>
  workflows!: Table<WorkflowRecord, string>

  constructor() {
    super('ComicAI')
    this.version(1).stores({
      images:    '++id, projectId, createdAt',
      projects:  'id, user_id, status, updated_at',
      workflows: 'projectId',
    })
  }
}

export const db = new ComicAIDatabase()
