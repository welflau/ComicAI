import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 3000, // 后端不可用时 3s 内 fallback
})

// Auth interceptor
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('comicflow_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('comicflow_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { email: string; username: string; password: string; full_name?: string }) =>
    apiClient.post('/auth/register', data).then(r => r.data),

  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }).then(r => r.data),

  me: () => apiClient.get('/auth/me').then(r => r.data),
}

// ─── Projects ───────────────────────────────────────────────────────────────
export const projectsApi = {
  list: (params?: { skip?: number; limit?: number; status?: string }) =>
    apiClient.get('/projects', { params }).then(r => r.data),

  get: (id: string) => apiClient.get(`/projects/${id}`).then(r => r.data),

  create: (data: { name: string; description?: string; tags?: string[] }) =>
    apiClient.post('/projects', data).then(r => r.data),

  update: (id: string, data: Partial<{ name: string; description: string; status: string; tags: string[]; workflow_config: object }>) =>
    apiClient.patch(`/projects/${id}`, data).then(r => r.data),

  delete: (id: string) => apiClient.delete(`/projects/${id}`),

  // Scripts
  getScripts: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/scripts`).then(r => r.data),

  createScript: (projectId: string, data: { title?: string; content: string }) =>
    apiClient.post(`/projects/${projectId}/scripts`, data).then(r => r.data),

  updateScript: (projectId: string, scriptId: string, data: { title?: string; content?: string }) =>
    apiClient.patch(`/projects/${projectId}/scripts/${scriptId}`, data).then(r => r.data),

  // Storyboards
  getStoryboards: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/storyboards`).then(r => r.data),

  getStoryboard: (projectId: string, storyboardId: string) =>
    apiClient.get(`/projects/${projectId}/storyboards/${storyboardId}`).then(r => r.data),

  updateStoryboard: (projectId: string, storyboardId: string, data: object) =>
    apiClient.patch(`/projects/${projectId}/storyboards/${storyboardId}`, data).then(r => r.data),

  // Characters
  getCharacters: (projectId: string) =>
    apiClient.get(`/projects/${projectId}/characters`).then(r => r.data),

  createCharacter: (projectId: string, data: object) =>
    apiClient.post(`/projects/${projectId}/characters`, data).then(r => r.data),

  // Tasks
  getTasks: (projectId: string, taskType?: string) =>
    apiClient.get(`/projects/${projectId}/tasks`, { params: { task_type: taskType } }).then(r => r.data),

  getTask: (projectId: string, taskId: string) =>
    apiClient.get(`/projects/${projectId}/tasks/${taskId}`).then(r => r.data),

  createTask: (projectId: string, taskType: string, inputParams: object) =>
    apiClient.post(`/projects/${projectId}/tasks`, { task_type: taskType, input_params: inputParams }).then(r => r.data),

  runTask: (projectId: string, data: { task_type: string; params?: object }) =>
    apiClient.post(`/projects/${projectId}/tasks`, { task_type: data.task_type, input_params: data.params || {} }).then(r => r.data),

  // Assets
  getAssets: (projectId: string, assetType?: string) =>
    apiClient.get(`/projects/${projectId}/assets`, { params: { asset_type: assetType } }).then(r => r.data),
}

// ─── AI Assistant ────────────────────────────────────────────────────────────
export const aiApi = {
  chat: (payload: { message: string; context_type?: string; context_data?: object; history?: { role: string; content: string }[] }) =>
    apiClient.post('/ai/assistant', { message: payload.message, context_type: payload.context_type, context_data: payload.context_data, history: payload.history }).then(r => r.data),

  optimizePrompt: (prompt: string, style?: string, context?: string) =>
    apiClient.post('/ai/optimize-prompt', { prompt, style, context }).then(r => r.data),
}

// ─── System prompts (mirrored from backend) ───────────────────────────────────
const DIRECT_SYSTEM_PROMPTS: Record<string, string> = {
  script: (
    '你是专业的影视剧本创作者。根据用户的要求，直接输出完整的故事脚本内容。' +
    '不需要解释，不需要前言，直接用中文写出脚本正文。' +
    '文笔流畅，富有画面感，场景描写细腻。'
  ),
  storyboard: (
    '你是专业的分镜脚本创作者。根据提供的剧本或描述，直接输出分镜脚本。' +
    '格式：按镜头编号，每个镜头包含景别、画面描述、对话/旁白（如有）。' +
    '直接输出内容，不需要额外解释。'
  ),
  general: '你是专业的影视内容创作助手，擅长剧本、分镜、角色设计。直接根据用户要求输出内容。',
}

/**
 * Stream directly from Anthropic API in the browser.
 * Requires `anthropic-dangerous-direct-browser-access: true` header.
 */
async function streamDirectAnthropic({
  system, prompt, model, apiKey, baseUrl, onChunk, signal,
}: {
  system: string; prompt: string; model?: string
  apiKey: string; baseUrl?: string
  onChunk: (text: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '')
  const isOfficialApi = base.includes('api.anthropic.com')
  const endpoint = `${base}/v1/messages`
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(isOfficialApi
        ? {
            'x-api-key': apiKey,
            'anthropic-dangerous-direct-browser-access': 'true',
          }
        : {
            'Authorization': `Bearer ${apiKey}`,
          }),
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
      stream: true,
    }),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`Anthropic API error ${resp.status}: ${text}`)
  }
  const reader = resp.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      try {
        const ev = JSON.parse(data)
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          onChunk(ev.delta.text ?? '')
        }
      } catch { /* ignore */ }
    }
  }
}

/**
 * Stream directly from OpenAI-compatible API in the browser.
 */
async function streamDirectOpenAI({
  system, prompt, model, apiKey, baseUrl, onChunk, signal,
}: {
  system: string; prompt: string; model?: string
  apiKey: string; baseUrl?: string
  onChunk: (text: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const base = (baseUrl || 'https://api.openai.com').replace(/\/$/, '')
  const endpoint = `${base}/v1/chat/completions`
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      max_tokens: 2048,
      stream: true,
    }),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`OpenAI API error ${resp.status}: ${text}`)
  }
  const reader = resp.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data || data === '[DONE]') return
      try {
        const ev = JSON.parse(data)
        const content = ev.choices?.[0]?.delta?.content
        if (content) onChunk(content)
      } catch { /* ignore */ }
    }
  }
}

/**
 * SSE streaming helper for AI text generation.
 *
 * Priority:
 *   1. Backend proxy  (/api/v1/ai/stream)  — used when server is running
 *   2. Direct Anthropic API                — browser-direct, requires apiKey
 *   3. Direct OpenAI-compatible API        — browser-direct, requires apiKey
 *   4. Throws — caller (node) falls back to mock
 *
 * Usage:
 *   const ctrl = new AbortController()
 *   await streamAI({ prompt, contextType: 'script', onChunk: c => ..., onDone: () => ..., signal: ctrl.signal })
 */
export async function streamAI({
  prompt,
  contextType = 'script',
  model,
  onChunk,
  onDone,
  onError,
  signal,
}: {
  prompt: string
  contextType?: 'script' | 'storyboard' | 'general'
  model?: string
  onChunk: (text: string) => void
  onDone: (stats?: { chars: number; elapsed: number }) => void
  onError?: (err: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const token = localStorage.getItem('comicflow_token')
  const API_BASE = (import.meta.env.VITE_API_URL as string) || ''

  const { getServiceSettings } = await import('@/stores/settingsStore')
  const anthropicSettings = getServiceSettings('anthropic')
  const openaiSettings    = getServiceSettings('openai')

  const startTime = Date.now()
  let totalChars = 0
  const trackChunk = (text: string) => { totalChars += text.length; onChunk(text) }

  // ── 1. Try backend proxy ─────────────────────────────────────────────────
  let backendFailed = false
  try {
    const resp = await fetch(`${API_BASE}/api/v1/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(anthropicSettings.apiKey ? { 'X-Anthropic-Key': anthropicSettings.apiKey } : {}),
        ...(anthropicSettings.baseUrl ? { 'X-Anthropic-Base': anthropicSettings.baseUrl } : {}),
        ...(openaiSettings.apiKey ? { 'X-OpenAI-Key': openaiSettings.apiKey } : {}),
        ...(openaiSettings.baseUrl ? { 'X-OpenAI-Base': openaiSettings.baseUrl } : {}),
      },
      body: JSON.stringify({ prompt, context_type: contextType, model }),
      signal,
    })

    if (resp.ok) {
      // Backend responded — consume SSE stream
      const reader = resp.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data || data === '[DONE]') {
              onDone({ chars: totalChars, elapsed: Date.now() - startTime })
              return
            }
            try {
              const ev = JSON.parse(data) as { text?: string; error?: string }
              if (ev.error) { onError?.(ev.error); return }
              if (ev.text) trackChunk(ev.text)
            } catch { /* ignore malformed */ }
          }
        }
        onDone({ chars: totalChars, elapsed: Date.now() - startTime })
        return
      }
    } else {
      // Backend returned HTTP error (503 = no keys configured, etc.)
      backendFailed = true
    }
  } catch (fetchErr) {
    // Network error — backend not running
    if (signal?.aborted) throw fetchErr
    backendFailed = true
  }

  if (!backendFailed) return

  // ── 2. Direct Anthropic API ──────────────────────────────────────────────
  if (anthropicSettings.apiKey) {
    try {
      const system = DIRECT_SYSTEM_PROMPTS[contextType] ?? DIRECT_SYSTEM_PROMPTS.general
      await streamDirectAnthropic({
        system, prompt, model,
        apiKey: anthropicSettings.apiKey,
        baseUrl: anthropicSettings.baseUrl || undefined,
        onChunk: trackChunk,
        signal,
      })
      onDone({ chars: totalChars, elapsed: Date.now() - startTime })
      return
    } catch (err) {
      if (signal?.aborted) throw err
      const msg = String(err)
      onError?.(msg)
      throw new Error(msg)
    }
  }

  // ── 3. Direct OpenAI API ─────────────────────────────────────────────────
  if (openaiSettings.apiKey) {
    try {
      const system = DIRECT_SYSTEM_PROMPTS[contextType] ?? DIRECT_SYSTEM_PROMPTS.general
      await streamDirectOpenAI({
        system, prompt, model,
        apiKey: openaiSettings.apiKey,
        baseUrl: openaiSettings.baseUrl || undefined,
        onChunk: trackChunk,
        signal,
      })
      onDone({ chars: totalChars, elapsed: Date.now() - startTime })
      return
    } catch (err) {
      if (signal?.aborted) throw err
      const msg = String(err)
      onError?.(msg)
      throw new Error(msg)
    }
  }

  // ── 4. No API available ──────────────────────────────────────────────────
  const msg = '未配置 API Key，且后端服务不可用'
  onError?.(msg)
  throw new Error(msg)
}

// ─── Assets Upload ────────────────────────────────────────────────────────────
export const assetsApi = {
  upload: (projectId: string, file: File, assetType: string = 'image') => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post(`/assets/upload/${projectId}?asset_type=${assetType}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data)
  }
}
