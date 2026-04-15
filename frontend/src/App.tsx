import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from '@/stores/authStore'
import { useLocalProjectsStore } from '@/stores/localProjectsStore'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import ProjectEditor from '@/pages/ProjectEditor'

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuthStore()
  // Wait for the initial auth check before deciding to redirect
  if (!isInitialized) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitialized } = useAuthStore()
  if (!isInitialized) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { loadUser, isAuthenticated } = useAuthStore()

  useEffect(() => {
    // zustand-persist rehydrates synchronously on first render for localStorage,
    // so by the time this effect runs the store already has the persisted token.
    // loadUser() handles both "has token" and "no token" cases and always sets
    // isInitialized = true, so we can call it unconditionally.
    loadUser().catch(() => {
      // Token expired or invalid — authStore handles clearing + sets isInitialized
    })
  }, [])

  // After login is confirmed, trigger one-time IndexedDB → backend migration
  useEffect(() => {
    if (isAuthenticated) {
      useLocalProjectsStore.getState().migrateToBackend().catch((e) => {
        console.warn('[App] IndexedDB migration failed:', e)
      })
    }
  }, [isAuthenticated])

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer>
        <Routes>
          {/* Public */}
          <Route path="/login" element={
            <GuestGuard><Login /></GuestGuard>
          } />
          <Route path="/register" element={
            <GuestGuard><Register /></GuestGuard>
          } />

          {/* Protected */}
          <Route path="/dashboard" element={
            <AuthGuard><Dashboard /></AuthGuard>
          } />
          <Route path="/project/:projectId" element={
            <AuthGuard><ProjectEditor /></AuthGuard>
          } />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1E2235',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: '13px',
              borderRadius: '10px',
            },
            success: {
              iconTheme: { primary: '#10B981', secondary: '#fff' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: '#fff' },
            },
          }}
        />
      </AppInitializer>
    </BrowserRouter>
  )
}
