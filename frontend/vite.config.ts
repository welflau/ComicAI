import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import https from 'https'
import http from 'http'
import fs from 'fs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')

  // Read .env.local directly to avoid system env vars (like Claude Code's ANTHROPIC_BASE_URL) overriding project config
  let anthropicBaseUrl = 'https://api.anthropic.com'
  let anthropicAuthToken = ''
  try {
    const envLocal = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8')
    const urlMatch = envLocal.match(/^ANTHROPIC_BASE_URL\s*=\s*(.+)$/m)
    if (urlMatch) anthropicBaseUrl = urlMatch[1].trim()
    const tokenMatch = envLocal.match(/^ANTHROPIC_AUTH_TOKEN\s*=\s*(.+)$/m)
    if (tokenMatch) anthropicAuthToken = tokenMatch[1].trim()
  } catch {
    // .env.local not found, fall back to env
    anthropicBaseUrl = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    anthropicAuthToken = env.ANTHROPIC_AUTH_TOKEN || ''
  }

  return {
    plugins: [
      react(),
      {
        name: 'cors-proxy-middleware',
        configureServer(server) {
          // /api/cors-proxy/{encodedFullUrl}
          // 通用 CORS 代理：将完整 URL encode 后放在路径里
          server.middlewares.use('/api/cors-proxy', (req: any, res: any) => {
            if (req.method === 'OPTIONS') {
              res.setHeader('access-control-allow-origin', '*')
              res.setHeader('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS')
              res.setHeader('access-control-allow-headers', '*')
              res.statusCode = 204
              res.end()
              return
            }

            const rawUrl = req.url || '/'
            let targetUrl: string
            try {
              targetUrl = decodeURIComponent(rawUrl.replace(/^\//, ''))
            } catch {
              res.statusCode = 400
              res.end('cors-proxy: invalid encoded URL')
              return
            }

            if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
              res.statusCode = 400
              res.end('cors-proxy: target must start with http:// or https://')
              return
            }

            const parsedTarget = new URL(targetUrl)
            const lib = parsedTarget.protocol === 'https:' ? https : http

            const chunks: Buffer[] = []
            req.on('data', (chunk: Buffer) => chunks.push(chunk))
            req.on('end', () => {
              const body = chunks.length > 0 ? Buffer.concat(chunks) : null

              const skipHeaders = new Set(['host', 'connection', 'transfer-encoding', 'origin', 'referer'])
              const forwardHeaders: Record<string, string | string[]> = { host: parsedTarget.host }
              for (const [k, v] of Object.entries(req.headers as Record<string, string | string[]>)) {
                if (!skipHeaders.has(k.toLowerCase())) forwardHeaders[k] = v
              }
              if (body) forwardHeaders['content-length'] = String(body.length)

              const options = {
                hostname: parsedTarget.hostname,
                port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
                path: parsedTarget.pathname + parsedTarget.search,
                method: req.method,
                headers: forwardHeaders,
              }

              const proxyReq = lib.request(options, (proxyRes: any) => {
                res.statusCode = proxyRes.statusCode
                const skipRes = new Set(['transfer-encoding', 'connection', 'keep-alive'])
                for (const [k, v] of Object.entries(proxyRes.headers as Record<string, string>)) {
                  if (!skipRes.has(k.toLowerCase())) res.setHeader(k, v)
                }
                res.setHeader('access-control-allow-origin', '*')
                res.setHeader('access-control-allow-headers', '*')
                proxyRes.pipe(res, { end: true })
              })

              proxyReq.on('error', (err: Error) => {
                console.error('[cors-proxy] error:', err.message)
                if (!res.headersSent) { res.statusCode = 502; res.end(`cors-proxy error: ${err.message}`) }
              })

              if (body) proxyReq.write(body)
              proxyReq.end()
            })
          })
        },
      },
    ],
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
        '/api/lightai': {
          target: env.VITE_LIGHTAI_BASE_URL || 'https://api.lightai.woa.com',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: env.VITE_API_URL || 'http://localhost:8002',
          changeOrigin: true,
        },
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8002',
          changeOrigin: true,
        },
        '/ws': {
          target: env.VITE_WS_URL || 'ws://localhost:8002',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    define: {
      'import.meta.env.VITE_ANTHROPIC_BASE_URL': JSON.stringify('/api/anthropic'),
      'import.meta.env.VITE_ANTHROPIC_BASE_URL_DISPLAY': JSON.stringify(anthropicBaseUrl),
      'import.meta.env.VITE_ANTHROPIC_AUTH_TOKEN': JSON.stringify(anthropicAuthToken),
    },
  }
})
