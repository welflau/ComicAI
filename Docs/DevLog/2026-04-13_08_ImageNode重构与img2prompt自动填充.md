# ImageNode 重构、img2prompt 自动填充、Auth 黑屏修复

**日期：** 2026-04-13  
**涉及文件：**
- `frontend/src/components/nodes/ImageNode.tsx`
- `frontend/src/components/nodes/ScriptNode.tsx`
- `frontend/src/stores/authStore.ts`
- `frontend/src/stores/imageStore.ts`
- `frontend/src/App.tsx`

---

## 一、Auth 黑屏问题修复

### 问题现象

应用启动后页面全黑，无任何内容渲染。

### 根因分析

`AuthGuard` 和 `GuestGuard` 使用 `isInitialized` 作为守卫：

```tsx
function AuthGuard({ children }) {
  const { isAuthenticated, isInitialized } = useAuthStore()
  if (!isInitialized) return null   // 黑屏就卡在这里
  ...
}
```

`isInitialized` 只有在 `loadUser()` 执行后才会被设为 `true`，但旧版 `loadUser()` 存在一个分支没有设置该值：

```ts
loadUser: async () => {
  const token = localStorage.getItem('comicflow_token')
  if (!token) return   // ← 忘记设 isInitialized: true，AuthGuard 永远返回 null
  ...
}
```

此外，`AppInitializer` 从 store hook 读取 `token` 来决定是否调用 `loadUser()`，但 zustand-persist 的 rehydration 是异步的，导致第一次渲染时 `token` 仍为 `null`，`loadUser()` 被跳过，`isInitialized` 永远不会被设置。

### 修复方案

**`authStore.ts`** — `loadUser()` 所有代码路径均设置 `isInitialized: true`：

```ts
loadUser: async () => {
  const token = get().token ?? localStorage.getItem('comicflow_token')
  if (!token) {
    set({ isInitialized: true })   // ← 修复点
    return
  }
  if (import.meta.env.DEV && token === 'dev_token') {
    set({ ..., isInitialized: true })
    return
  }
  try {
    const user = await authApi.me()
    set({ user, token, isAuthenticated: true, isInitialized: true })
  } catch {
    set({ user: null, token: null, isAuthenticated: false, isInitialized: true })
  }
},
logout: () => {
  localStorage.removeItem('comicflow_token')
  set({ user: null, token: null, isAuthenticated: false, isInitialized: true })
},
```

同时 `token` 读取方式改为 `get().token ?? localStorage.getItem('comicflow_token')`，优先使用 zustand-persist 恢复的值，兜底读取原始 localStorage key。

**`App.tsx`** — `AppInitializer` 无条件调用 `loadUser()`，不在 hook 里判断 token：

```tsx
function AppInitializer({ children }) {
  const { loadUser } = useAuthStore()
  useEffect(() => {
    loadUser().catch(() => {})
  }, [])
  return <>{children}</>
}
```

这样无论 persist 有没有 rehydrate 完成，`loadUser()` 都会执行并最终设置 `isInitialized`。

---

## 二、ImageNode 交互重构

### 问题现象

上传图片后，节点下方的"尝试"快速操作区域依然显示，需要手动折叠，体验不符合预期。

### 根因

快速操作区域用 `!hasImage` 控制显示，而 `hasImage = !!displayUrl && !imgBroken`。`displayUrl` 是异步解析 `idb://` 引用后才赋值的，存在短暂窗口期仍为 `null`，加之视觉上这块区域本身也不应该在上传节点中出现。

### 修复方案

**移除快速操作区，改为 placeholder 即上传入口。**

旧设计：placeholder 区域 + 独立快速操作区（"自己编写内容"、"图片反推提示词"…）

新设计：
- placeholder 区域本身即可点击上传
- 悬停时显示上传提示覆盖层（Upload 图标 + "点击上传"文字），图片半透明淡出
- `isUploadedOnly`（`imageSource === 'uploaded'`）模式下：隐藏 target handle、提示词面板、快速操作

```tsx
// 统一 placeholder：点击上传 + 悬停提示
<div
  onClick={!generating ? handleUploadClick : undefined}
  onMouseEnter={() => setPlaceholderHovered(true)}
  onMouseLeave={() => setPlaceholderHovered(false)}
  style={{ height: PLACEHOLDER_H, cursor: 'pointer', position: 'relative' }}
>
  <img src={placeholderImage} style={{ opacity: hovered ? 0.3 : 0.55, transition: 'opacity 150ms' }} />
  <div style={{ opacity: hovered ? 1 : 0, transition: 'opacity 150ms', /* 覆盖层 */ }}>
    <Upload size={16} />
    <span>点击上传</span>
  </div>
</div>
```

已上传图片的节点只显示图片本体 + 右上角替换按钮，无其他冗余区域。

---

## 三、img2prompt 快速操作 — 自动初始化

### 功能背景

ScriptNode（文本节点）的快速操作"图片反推提示词"会在左侧创建一个 ImageNode 并连线，让用户上传图片后直接反推提示词。

### 原有问题

1. 创建的 ImageNode 为空白状态（无图片），显示为空 placeholder，不直观
2. ScriptNode 的提示词输入框保持空白，用户需要手动输入反推指令

### 修复

**1. 预加载默认占位图**

`imageStore.ts` 中 `DEFAULT_IMAGE_URL = 'default://placeholder'`，`resolveImageUrl()` 会将其解析为本地 webp 资源 URL。创建 ImageNode 时传入该值，节点立即呈现"已有图片"的上传型状态，用户替换图片后即可使用：

```ts
addNode({
  id: imgNodeId,
  type: 'libtv_image',
  imageSource: 'uploaded',
  imageUrl: DEFAULT_IMAGE_URL,   // ← 预加载默认图
  ...
})
```

**2. 自动填入反推提示词**

```ts
setPrompt('根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。')
```

点击"图片反推提示词"后，ScriptNode 的 PromptPanel 输入框即自动填入该文本，用户换完图片后直接点发送即可。

---

## 交互流程总结（img2prompt）

```
用户点击 ScriptNode "图片反推提示词"
        ↓
  左侧创建 ImageNode
  imageSource: 'uploaded'
  imageUrl: DEFAULT_IMAGE_URL（默认占位图，立即可见）
        ↓
  连线 ImageNode → ScriptNode
        ↓
  ScriptNode PromptPanel 自动填入：
  "根据图片生成结构化中文提示词，包括主体描述、环境、光影、镜头语言、风格关键词。"
        ↓
  用户点击 ImageNode 替换图片
        ↓
  点击 ScriptNode 发送 → AI 生成反推提示词
```
