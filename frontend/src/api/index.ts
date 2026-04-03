import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || ''

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
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
