import { create } from 'zustand'

/* ── Types ─────────────────────────────────────────────────────── */

export type LogLevel    = 'info' | 'warn' | 'error' | 'debug'
export type LogCategory = 'operation' | 'ai' | 'system' | 'network'

export interface LogEntry {
  id: string
  timestamp: Date
  level: LogLevel
  category: LogCategory
  message: string
  detail?: string
  /** For 'ai' category: 'prompt' = outgoing request, 'response' = incoming result */
  kind?: 'prompt' | 'response'
}

interface LogState {
  entries: LogEntry[]
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void
  clearLogs: () => void
}

let _seq = 0

export const useLogStore = create<LogState>((set) => ({
  entries: [
    {
      id: 'init-1',
      timestamp: new Date(Date.now() - 12000),
      level: 'info',
      category: 'system',
      message: '编辑器已就绪',
    },
    {
      id: 'init-2',
      timestamp: new Date(Date.now() - 8000),
      level: 'info',
      category: 'operation',
      message: '加载项目成功',
    },
  ],

  addLog: (entry) =>
    set(state => ({
      entries: [
        ...state.entries,
        {
          ...entry,
          id: `log-${Date.now()}-${_seq++}`,
          timestamp: new Date(),
        },
      ],
    })),

  clearLogs: () => set({ entries: [] }),
}))

/** Convenience helper — call outside React */
export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
  useLogStore.getState().addLog(entry)
}
