import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import { authApi } from '@/api'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  /** true after the initial auth check has completed (either restored or cleared) */
  isInitialized: boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { email: string; username: string; password: string; full_name?: string }) => Promise<void>
  logout: () => void
  loadUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,
      isInitialized: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const data = await authApi.login(email, password)
          localStorage.setItem('comicflow_token', data.access_token)
          set({ user: data.user, token: data.access_token, isAuthenticated: true, isLoading: false })
        } catch (e) {
          // DEV fallback: accept any email/password when backend is offline
          if (import.meta.env.DEV) {
            const mockUser: User = {
              id: 'dev_user',
              email,
              username: email.split('@')[0],
              plan: 'pro',
              credits: 100,
              created_at: new Date().toISOString(),
            }
            localStorage.setItem('comicflow_token', 'dev_token')
            set({ user: mockUser, token: 'dev_token', isAuthenticated: true, isLoading: false })
            return
          }
          set({ isLoading: false })
          throw e
        }
      },

      register: async (userData) => {
        set({ isLoading: true })
        try {
          await authApi.register(userData)
          // Auto-login after register
          await get().login(userData.email, userData.password)
        } catch (e) {
          set({ isLoading: false })
          throw e
        }
      },

      logout: () => {
        localStorage.removeItem('comicflow_token')
        set({ user: null, token: null, isAuthenticated: false, isInitialized: true })
      },

      loadUser: async () => {
        // Prefer the zustand-persisted token; fall back to the standalone key
        const token = get().token ?? localStorage.getItem('comicflow_token')
        if (!token) {
          set({ isInitialized: true })
          return
        }
        // DEV: restore mock session without hitting the backend
        if (import.meta.env.DEV && token === 'dev_token') {
          const stored = get().user
          if (stored) {
            set({ isAuthenticated: true, token, isInitialized: true })
          } else {
            set({
              user: { id: 'dev_user', email: 'dev@comicai.local', username: 'dev', plan: 'pro', credits: 100, created_at: new Date().toISOString() },
              token,
              isAuthenticated: true,
              isInitialized: true,
            })
          }
          return
        }
        try {
          const user = await authApi.me()
          set({ user, token, isAuthenticated: true, isInitialized: true })
        } catch {
          localStorage.removeItem('comicflow_token')
          set({ user: null, token: null, isAuthenticated: false, isInitialized: true })
        }
      },
    }),
    {
      name: 'comicflow-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
