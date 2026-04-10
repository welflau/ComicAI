import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const anthropicBaseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3010,
      proxy: {
        '/api/anthropic': {
          target: anthropicBaseUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
        },
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
        '/ws': {
          target: env.VITE_WS_URL || 'ws://localhost:8000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    define: {
      'import.meta.env.VITE_ANTHROPIC_BASE_URL': JSON.stringify('/api/anthropic'),
      'import.meta.env.VITE_ANTHROPIC_AUTH_TOKEN': JSON.stringify(env.ANTHROPIC_AUTH_TOKEN),
    },
  }
})
