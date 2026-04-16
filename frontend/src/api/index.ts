import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
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
      const token = localStorage.getItem('comicflow_token')
      // DEV mode with mock token: don't redirect, just let callers handle it
      if (import.meta.env.DEV && token === 'dev_token') {
        return Promise.reject(error)
      }
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
  system, prompt, imageDataUrl, model, apiKey, baseUrl, onChunk, signal,
}: {
  system: string; prompt: string; imageDataUrl?: string | null; model?: string
  apiKey: string; baseUrl?: string
  onChunk: (text: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const base = (baseUrl || '/api/anthropic').replace(/\/$/, '')
  // Absolute URL (http/https) → route through cors-proxy to avoid CORS block
  const endpoint = base.startsWith('/')
    ? `${base}/v1/messages`
    : `/api/cors-proxy/${encodeURIComponent(base + '/v1/messages')}`

  // Build message content: vision block + text, or plain text
  let userContent: unknown
  if (imageDataUrl) {
    const imageBlock = imageDataUrl.startsWith('data:')
      ? {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageDataUrl.split(';')[0].split(':')[1] as string,
            data: imageDataUrl.split(',')[1],
          },
        }
      : {
          type: 'image',
          source: { type: 'url', url: imageDataUrl },
        }
    userContent = [imageBlock, { type: 'text', text: prompt }]
  } else {
    userContent = prompt
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      system,
      messages: [{ role: 'user', content: userContent }],
      max_tokens: 2048,
      // stream: false — Skynet proxy does not support SSE streaming
    }),
    signal,
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText)
    throw new Error(`Anthropic API error ${resp.status}: ${text}`)
  }
  const data = await resp.json()
  const text = data.content?.[0]?.text ?? ''
  // Simulate streaming: emit chunks of ~8 chars with small delay
  const CHUNK = 8
  for (let i = 0; i < text.length; i += CHUNK) {
    if (signal?.aborted) return
    onChunk(text.slice(i, i + CHUNK))
    await new Promise<void>(r => setTimeout(r, 16))
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
  imageDataUrl,
  contextType = 'script',
  model,
  systemOverride,
  onChunk,
  onDone,
  onError,
  signal,
}: {
  prompt: string
  imageDataUrl?: string | null
  contextType?: 'script' | 'storyboard' | 'general'
  model?: string
  /** Override the system prompt — useful for specialized one-off tasks */
  systemOverride?: string
  onChunk: (text: string) => void
  onDone: (stats?: { chars: number; elapsed: number }) => void
  onError?: (err: string) => void
  signal?: AbortSignal
}): Promise<void> {
  const token = localStorage.getItem('comicflow_token')
  const API_BASE = (import.meta.env.VITE_API_URL as string) || ''

  const { getServiceSettings } = await import('@/stores/settingsStore')
  const { addLog } = await import('@/stores/logStore')
  const anthropicSettings = getServiceSettings('anthropic')
  const openaiSettings    = getServiceSettings('openai')

  const startTime = Date.now()
  let totalChars = 0
  let responseBuffer = ''  // collect first 600 chars for log detail
  const trackChunk = (text: string) => {
    totalChars += text.length
    if (responseBuffer.length < 600) responseBuffer += text
    onChunk(text)
  }

  const usedModel = model || 'claude-sonnet-4-6'
  const promptPreview = prompt.length > 200 ? prompt.slice(0, 200) + '…' : prompt

  // ── 1. Try backend proxy ─────────────────────────────────────────────────
  let backendFailed = false
  addLog({
    level: 'debug', category: 'network',
    message: `[AI] 尝试后端代理 ${API_BASE}/api/v1/ai/stream`,
    detail: `contextType: ${contextType}\nmodel: ${usedModel}\n\n${promptPreview}`,
  })
  try {
    const resp = await fetch(`${API_BASE}/api/v1/ai/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(anthropicSettings.apiKey ? { 'X-Anthropic-Key': anthropicSettings.apiKey } : {}),
        // Only send base URL if it's a full HTTP URL — relative paths (e.g. /api/anthropic) are Vite proxy paths and cannot be used by the backend's httpx
        ...(anthropicSettings.baseUrl?.startsWith('http') ? { 'X-Anthropic-Base': anthropicSettings.baseUrl } : {}),
        ...(openaiSettings.apiKey ? { 'X-OpenAI-Key': openaiSettings.apiKey } : {}),
        ...(openaiSettings.baseUrl?.startsWith('http') ? { 'X-OpenAI-Base': openaiSettings.baseUrl } : {}),
      },
      body: JSON.stringify({ prompt, image_data_url: imageDataUrl || undefined, context_type: contextType, model, system_override: systemOverride || undefined }),
      signal,
    })

    if (resp.ok) {
      addLog({ level: 'info', category: 'network', message: '[AI] 后端代理响应成功，开始接收流...' })
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
              const elapsed = Date.now() - startTime
              addLog({
                level: 'info', category: 'ai', kind: 'response',
                message: `[AI] 生成完成 — ${totalChars} 字符，耗时 ${(elapsed / 1000).toFixed(1)}s（后端代理）`,
                detail: responseBuffer.length > 0 ? responseBuffer + (totalChars > responseBuffer.length ? `\n…（共 ${totalChars} 字符）` : '') : undefined,
              })
              onDone({ chars: totalChars, elapsed })
              return
            }
            try {
              const ev = JSON.parse(data) as { text?: string; error?: string }
              if (ev.error) {
                addLog({ level: 'error', category: 'ai', message: `[AI] 后端返回错误: ${ev.error}` })
                onError?.(ev.error)
                return
              }
              if (ev.text) trackChunk(ev.text)
            } catch { /* ignore malformed */ }
          }
        }
        const elapsed = Date.now() - startTime
        addLog({
          level: 'info', category: 'ai', kind: 'response',
          message: `[AI] 生成完成 — ${totalChars} 字符，耗时 ${(elapsed / 1000).toFixed(1)}s（后端代理）`,
          detail: responseBuffer.length > 0 ? responseBuffer + (totalChars > responseBuffer.length ? `\n…（共 ${totalChars} 字符）` : '') : undefined,
        })
        onDone({ chars: totalChars, elapsed })
        return
      }
    } else {
      // Backend returned HTTP error (503 = no keys configured, etc.)
      addLog({ level: 'warn', category: 'network', message: `[AI] 后端代理不可用 (HTTP ${resp.status})，切换直连模式` })
      backendFailed = true
    }
  } catch (fetchErr) {
    // Network error — backend not running
    if (signal?.aborted) throw fetchErr
    addLog({ level: 'warn', category: 'network', message: '[AI] 后端代理连接失败，切换直连模式', detail: String(fetchErr) })
    backendFailed = true
  }

  if (!backendFailed) return

  // ── 2. Direct Anthropic API ──────────────────────────────────────────────
  if (anthropicSettings.apiKey) {
    const base = (anthropicSettings.baseUrl || '/api/anthropic').replace(/\/$/, '')
    const displayUrl = base.startsWith('/') ? `[proxy]${base}` : base
    addLog({
      level: 'info', category: 'ai', kind: 'prompt',
      message: `[AI] 请求 Anthropic → ${displayUrl}`,
      detail: `model: ${usedModel}\ncontextType: ${contextType}\n\nPrompt:\n${promptPreview}`,
    })
    try {
      const system = systemOverride || DIRECT_SYSTEM_PROMPTS[contextType] ?? DIRECT_SYSTEM_PROMPTS.general
      await streamDirectAnthropic({
        system, prompt, imageDataUrl,  model,
        apiKey: anthropicSettings.apiKey,
        baseUrl: anthropicSettings.baseUrl || undefined,
        onChunk: trackChunk,
        signal,
      })
      const elapsed = Date.now() - startTime
      addLog({
        level: 'info', category: 'ai', kind: 'response',
        message: `[AI] Anthropic 生成完成 — ${totalChars} 字符，耗时 ${(elapsed / 1000).toFixed(1)}s`,
        detail: responseBuffer.length > 0 ? responseBuffer + (totalChars > responseBuffer.length ? `\n…（共 ${totalChars} 字符）` : '') : undefined,
      })
      onDone({ chars: totalChars, elapsed })
      return
    } catch (err) {
      if (signal?.aborted) throw err
      const msg = String(err)
      addLog({ level: 'error', category: 'ai', message: `[AI] Anthropic 请求失败: ${msg.slice(0, 100)}`, detail: msg })
      onError?.(msg)
      throw new Error(msg)
    }
  }

  // ── 3. Direct OpenAI API ─────────────────────────────────────────────────
  if (openaiSettings.apiKey) {
    const displayUrl = openaiSettings.baseUrl || 'https://api.openai.com'
    addLog({
      level: 'info', category: 'ai', kind: 'prompt',
      message: `[AI] 请求 OpenAI → ${displayUrl}`,
      detail: `model: ${usedModel}\ncontextType: ${contextType}\n\nPrompt:\n${promptPreview}`,
    })
    try {
      const system = systemOverride || DIRECT_SYSTEM_PROMPTS[contextType] ?? DIRECT_SYSTEM_PROMPTS.general
      await streamDirectOpenAI({
        system, prompt, model,
        apiKey: openaiSettings.apiKey,
        baseUrl: openaiSettings.baseUrl || undefined,
        onChunk: trackChunk,
        signal,
      })
      const elapsed = Date.now() - startTime
      addLog({
        level: 'info', category: 'ai', kind: 'response',
        message: `[AI] OpenAI 生成完成 — ${totalChars} 字符，耗时 ${(elapsed / 1000).toFixed(1)}s`,
        detail: responseBuffer.length > 0 ? responseBuffer + (totalChars > responseBuffer.length ? `\n…（共 ${totalChars} 字符）` : '') : undefined,
      })
      onDone({ chars: totalChars, elapsed })
      return
    } catch (err) {
      if (signal?.aborted) throw err
      const msg = String(err)
      addLog({ level: 'error', category: 'ai', message: `[AI] OpenAI 请求失败: ${msg.slice(0, 100)}`, detail: msg })
      onError?.(msg)
      throw new Error(msg)
    }
  }

  // ── 4. No API available ──────────────────────────────────────────────────
  const msg = '未配置 API Key，且后端服务不可用'
  addLog({ level: 'error', category: 'ai', message: `[AI] 无可用 API: ${msg}` })
  onError?.(msg)
  throw new Error(msg)
}

// ─── LightAI Image Generation ────────────────────────────────────────────────

// ─── LightAI Image Generation ────────────────────────────────────────────────

const LIGHTAI_API_BASE = '/api/lightai'

export async function lightaiGenerateImage(
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const { getServiceSettings } = await import('@/stores/settingsStore')
  const { addLog } = await import('@/stores/logStore')
  const apiKey = getServiceSettings('lightai').apiKey || ''
  if (!apiKey) throw new Error('未配置 LightAI API Key')

  // 1. 创建异步任务
  addLog({ level: 'info', category: 'ai', message: '正在提交生图任务...', detail: prompt.slice(0, 60) })

  const createResp = await fetch(`${LIGHTAI_API_BASE}/create_async_task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      service_name: 'foreign',
      api_name: 'Genai-banana2img',
      app_info: { model: 'gemini-3-pro-image-preview', mode: '' },
      task_query: {
        path: {},
        params: {},
        json: {
          model: 'gemini-3-pro-image-preview',
          prompt,
          image_size: '2K',
        },
        data: {},
        file: {},
      },
      custom_data: {},
    }),
    signal,
  })

  if (!createResp.ok) {
    const errText = await createResp.text().catch(() => createResp.statusText)
    throw new Error(`LightAI 创建任务失败 ${createResp.status}: ${errText}`)
  }

  const createData = await createResp.json()
  const taskId: string = createData.task_id || createData.taskId || createData.data?.task_id || createData.data?.taskId || ''
  if (!taskId) throw new Error('LightAI 返回无 task_id')

  addLog({ level: 'info', category: 'ai', message: `任务已提交，等待生成...`, detail: `task_id: ${taskId}` })

  // 2. 轮询任务状态（15s间隔，最长10分钟）
  const INTERVAL = 15000
  const MAX_WAIT = 600000
  const start = Date.now()

  await new Promise<void>(r => setTimeout(r, INTERVAL))

  let pollCount = 0
  while (Date.now() - start < MAX_WAIT) {
    if (signal?.aborted) throw new Error('已取消')

    pollCount++
    const elapsed = Math.round((Date.now() - start) / 1000)
    addLog({ level: 'info', category: 'ai', message: `轮询中 #${pollCount}（已等待 ${elapsed}s）`, detail: taskId })

    const pollResp = await fetch(`${LIGHTAI_API_BASE}/get_task_status/${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal,
    })
    if (!pollResp.ok) {
      await new Promise<void>(r => setTimeout(r, INTERVAL))
      continue
    }

    const pollData = await pollResp.json()
    // status may be a number (2 = success) or string
    const status: number | string = pollData.status ?? pollData.data?.status ?? ''

    addLog({ level: 'debug', category: 'ai', message: `任务状态: ${status}`, detail: JSON.stringify(pollData).slice(0, 120) })

    // status 2 or "success"/"completed"/"done" means success
    const isSuccess = status === 2 || status === '2' || status === 'completed' || status === 'success' || status === 'done'
    const isFailed  = status === 'failed' || status === 'error' || status === -1 || status === '-1'

    if (isSuccess) {
      // 3. 提取图片URL
      const urls = _lightaiExtractUrls(pollData)
      if (urls.length === 0) throw new Error('LightAI 图片生成未返回图片 URL，原始数据: ' + JSON.stringify(pollData).slice(0, 200))
      addLog({ level: 'info', category: 'ai', message: '生图成功，正在下载...', detail: urls[0].slice(0, 80) })
      return urls[0]
    }

    if (isFailed) {
      throw new Error(`LightAI 任务失败: ${JSON.stringify(pollData)}`)
    }

    await new Promise<void>(r => setTimeout(r, INTERVAL))
  }

  throw new Error('LightAI 任务超时 (600s)')
}

function _lightaiExtractUrls(result: Record<string, unknown>): string[] {
  const urls: string[] = []

  // Recursively collect all string values that look like image URLs
  function collectUrls(obj: unknown, depth = 0) {
    if (depth > 6 || !obj) return
    if (typeof obj === 'string') {
      if (obj.startsWith('http') && (
        obj.includes('.png') || obj.includes('.jpg') || obj.includes('.jpeg') ||
        obj.includes('.webp') || obj.includes('cos.') || obj.includes('image') ||
        obj.includes('banana2img') || obj.includes('img')
      )) {
        urls.push(obj)
      }
      return
    }
    if (Array.isArray(obj)) {
      for (const item of obj) collectUrls(item, depth + 1)
      return
    }
    if (typeof obj === 'object') {
      for (const val of Object.values(obj as Record<string, unknown>)) {
        collectUrls(val, depth + 1)
      }
    }
  }

  // Also do a targeted search: data.result.banana2img_* fields
  const data = (result.data as Record<string, unknown>) ?? result
  if (typeof data === 'object' && data !== null) {
    const resultObj = (data as Record<string, unknown>).result
    if (typeof resultObj === 'object' && resultObj !== null) {
      for (const [key, val] of Object.entries(resultObj as Record<string, unknown>)) {
        if (key.startsWith('banana2img') && typeof val === 'string' && val.startsWith('http')) {
          urls.push(val)
        }
      }
    }
  }

  if (urls.length === 0) {
    // Fallback: deep scan entire response for http URLs
    collectUrls(result)
  }

  return urls
}

// ─── Assets Upload ────────────────────────────────────────────────────────────
export const assetsApi = {
  upload: (projectId: string, file: File, assetType: string = 'image') => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post(`/assets/upload/${projectId}?asset_type=${assetType}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,  // 30s for file uploads
    }).then(r => r.data)
  }
}

// ─── Migration ────────────────────────────────────────────────────────────────
export const migrationApi = {
  importLocal: (data: {
    projects: { id: string; name: string; description: string; tags: string[] }[]
    workflows: Record<string, { nodes: unknown[]; edges: unknown[] }>
  }) =>
    apiClient.post('/migrate/import', data, { timeout: 30000 }).then(r => r.data),
}
