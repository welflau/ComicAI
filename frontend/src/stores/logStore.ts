import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

export const useLogStore = create<LogState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: 'comicai-logs',
      // 最多保留 500 条，避免 localStorage 无限膨胀
      partialize: (state) => ({
        // AI prompt/response 条目仅在当前会话有意义，不持久化到 localStorage
        entries: state.entries
          .filter(e => !(e.category === 'ai' && (e.kind === 'prompt' || e.kind === 'response')))
          .slice(-500),
      }),
      // timestamp 序列化为字符串，反序列化时还原成 Date 对象
      storage: {
        getItem: (key) => {
          const raw = localStorage.getItem(key)
          if (!raw) return null
          const parsed = JSON.parse(raw)
          if (parsed?.state?.entries) {
            parsed.state.entries = parsed.state.entries.map((e: LogEntry & { timestamp: string }) => ({
              ...e,
              timestamp: new Date(e.timestamp),
            }))
          }
          return parsed
        },
        setItem: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
        removeItem: (key) => localStorage.removeItem(key),
      },
    }
  )
)

/** Convenience helper — call outside React */
export function addLog(entry: Omit<LogEntry, 'id' | 'timestamp'>) {
  useLogStore.getState().addLog(entry)
}
