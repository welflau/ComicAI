import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ── Per-service field values ──────────────────────────────── */

export interface ServiceSettings {
  baseUrl: string
  apiKey: string
  endpoint: string
}

export interface AllSettings {
  anthropic: ServiceSettings
  antsk: ServiceSettings
  lightai: ServiceSettings
  openai: ServiceSettings
}

/* ── Read from VITE_ env (build-time) ──────────────────────── */

function fromEnv(): AllSettings {
  const e = import.meta.env
  return {
    anthropic: {
      baseUrl:  e.VITE_ANTHROPIC_BASE_URL   ?? '',
      apiKey:   e.VITE_ANTHROPIC_AUTH_TOKEN ?? '',
      endpoint: '',
    },
    antsk: {
      baseUrl:  '',
      apiKey:   e.VITE_ANTSK_API_KEY       ?? '',
      endpoint: e.VITE_ANTSK_ENDPOINT      ?? 'https://api.antsk.cn',
    },
    lightai: {
      baseUrl:  e.VITE_LIGHTAI_BASE_URL    ?? 'https://api.lightai.woa.com',
      apiKey:   e.VITE_LIGHTAI_API_KEY     ?? '',
      endpoint: '',
    },
    openai: {
      baseUrl:  e.VITE_OPENAI_BASE_URL     ?? '',
      apiKey:   e.VITE_OPENAI_API_KEY      ?? '',
      endpoint: '',
    },
  }
}

/* ── Test status per service ────────────────────────────────── */

export type ServiceTestStatus = 'ok' | 'fail' | 'idle'

/* ── Store ──────────────────────────────────────────────────── */

interface SettingsState {
  /** Values read once from env at app start */
  envDefaults: AllSettings
  /** User overrides — persisted to localStorage */
  overrides: Partial<AllSettings>
  /** Last connection test result per service — persisted */
  testStatuses: Partial<Record<keyof AllSettings, ServiceTestStatus>>

  /** Merged effective value for a service */
  get: (id: keyof AllSettings) => ServiceSettings

  /** Set a field override for a service */
  setField: (id: keyof AllSettings, field: keyof ServiceSettings, value: string) => void

  /** Clear all overrides for a service (revert to env) */
  resetService: (id: keyof AllSettings) => void

  /** Persist the result of a connection test */
  setTestStatus: (id: keyof AllSettings, status: ServiceTestStatus) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      envDefaults: fromEnv(),
      overrides: {},
      testStatuses: {},

      get: (id) => {
        const { envDefaults, overrides } = get()
        return { ...envDefaults[id], ...(overrides[id] ?? {}) }
      },

      setField: (id, field, value) =>
        set(state => ({
          overrides: {
            ...state.overrides,
            [id]: {
              ...(state.overrides[id] ?? state.envDefaults[id]),
              [field]: value,
            },
          },
          // Reset test status when credentials change
          testStatuses: { ...state.testStatuses, [id]: 'idle' },
        })),

      resetService: (id) =>
        set(state => {
          const nextOverrides = { ...state.overrides }
          delete nextOverrides[id]
          const nextStatuses = { ...state.testStatuses }
          delete nextStatuses[id]
          return { overrides: nextOverrides, testStatuses: nextStatuses }
        }),

      setTestStatus: (id, status) =>
        set(state => ({
          testStatuses: { ...state.testStatuses, [id]: status },
        })),
    }),
    {
      name: 'comicai-settings',
      // Only persist overrides and test statuses, not env defaults
      partialize: (s) => ({ overrides: s.overrides, testStatuses: s.testStatuses }),
    },
  ),
)

/** Convenience: get effective value for a service (outside React) */
export function getServiceSettings(id: keyof AllSettings): ServiceSettings {
  return useSettingsStore.getState().get(id)
}
