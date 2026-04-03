import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'
import { authApi } from '@/api'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
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

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const data = await authApi.login(email, password)
          localStorage.setItem('comicflow_token', data.access_token)
          set({ user: data.user, token: data.access_token, isAuthenticated: true, isLoading: false })
        } catch (e) {
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
        set({ user: null, token: null, isAuthenticated: false })
      },

      loadUser: async () => {
        const token = localStorage.getItem('comicflow_token')
        if (!token) return
        try {
          const user = await authApi.me()
          set({ user, token, isAuthenticated: true })
        } catch {
          localStorage.removeItem('comicflow_token')
          set({ user: null, token: null, isAuthenticated: false })
        }
      },
    }),
    {
      name: 'comicflow-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
)
