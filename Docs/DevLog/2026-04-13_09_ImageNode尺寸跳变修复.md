# ImageNode 刷新尺寸跳变修复

**日期：** 2026-04-13  
**涉及文件：**
- `frontend/src/components/nodes/ImageNode.tsx`
- `frontend/src/stores/projectStore.ts`
- `frontend/src/types/index.ts`

---

## 问题现象

页面刷新后，包含图片的 ImageNode 会出现明显的从大到小动画：节点先以 `NODE_W=400px` 的宽度渲染，随即缩小至图片的真实宽度（如竖图约 240px）。整个过程有约 150ms 的过渡动画，视觉上非常突兀。

---

## 根因分析

### 根因一：`renderedW/H` 未持久化到 IndexedDB

`handleImgLoad` 在图片加载后会计算渲染尺寸并调用：

```ts
updateNode(data.id, { renderedW: Math.round(w), renderedH: Math.round(h) })
```

但 `updateNode` 只更新了内存中的 Zustand store，**并未写入 IndexedDB**：

```ts
// 旧实现 — 只更新内存
updateNode: (id, updates) => {
  set((state) => ({
    nodes: state.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
  }))
},
```

`saveWorkflow`（写入 IndexedDB）只在拖拽节点、连线、删除等操作时才会被调用。  
因此每次刷新页面，`data.renderedW/H` 均为 `undefined`，节点必然从 `NODE_W=400` 开始渲染，再跳变到图片真实尺寸。

### 根因二：空 `src` 触发 onError → 尺寸重置

`displayUrl` 是异步解析的（`idb://` → blob URL），解析完成前为 `null`。  
原代码将 img 的 src 设为空字符串：

```tsx
<img src={displayUrl ?? ''} onError={handleImgError} />
```

部分浏览器对 `src=""` 会立即触发 `onError`，导致：

```
onError → setImgBroken(true) → hasImageData=false → nodeW 回退到 NODE_W=400
```

URL 解析完成后 `imgBroken` 再被清除，节点重新跳变回正确尺寸。

---

## 修复方案

### 1. `updateNode` 同步持久化到 IndexedDB

```ts
updateNode: (id, updates) => {
  set((state) => ({
    nodes: state.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
  }))
  // 持久化，使 renderedW/H 等属性在刷新后仍可用
  const { currentProject, nodes: updatedNodes, edges } = get()
  if (currentProject) {
    if (import.meta.env.DEV && (currentProject.id === 'demo' || currentProject.id.startsWith('local_'))) {
      useLocalProjectsStore.getState().saveWorkflow(currentProject.id, updatedNodes, edges).catch(() => {})
    }
  }
},
```

### 2. img src 改为 `undefined` 而非空字符串

```tsx
<img
  src={displayUrl ?? undefined}   // undefined 不触发 onError
  onLoad={handleImgLoad}
  onError={handleImgError}
  style={{
    opacity: displayUrl ? 1 : 0,      // URL 未就绪时透明（骨架效果）
    minHeight: imgRenderedH ?? undefined, // 预留正确高度，无布局跳变
    background: imgRenderedH ? '#141414' : undefined,
  }}
/>
```

### 3. `handleImgError` 忽略 URL 未就绪时的假错误

```ts
function handleImgError() {
  // displayUrl 还未解析时 src 是 undefined，忽略此时的 error 事件
  if (!displayUrl) return
  setImgBroken(true)
  setImgRenderedH(null)
  setImgRenderedW(null)
}
```

### 4. `NodeData` 类型补充 `renderedW/H` 字段

```ts
// types/index.ts
export interface NodeData {
  // ...
  renderedW?: number   // 持久化的渲染图片宽度 (px)
  renderedH?: number   // 持久化的渲染图片高度 (px)
}
```

---

## 刷新后的正确流程

```
页面加载
  ↓
data.renderedW=240, data.renderedH=320  ← 从 IndexedDB 读取（已持久化）
  ↓
imgRenderedW=240, imgRenderedH=320      ← useState 初始值
hasImageData=true, widthReady=true      ← 立即进入图片模式
nodeW=240, imageAreaH=320               ← 正确尺寸，无跳变
  ↓
img src=undefined, opacity=0            ← 骨架占位（不触发 onError）
minHeight=320                           ← 保持高度，无布局偏移
  ↓
resolveImageUrl() → displayUrl 就绪
  ↓
img src=blob:... → onLoad → opacity 淡入  ← 仅淡入，无尺寸变化
```

---

## 附：本次 session 同步完成的其他修复

| 功能 | 描述 |
|------|------|
| img2prompt 提示词自动填充 | 点击"图片反推提示词"后，ScriptNode 的提示词输入框自动填入指定文案 |
| ZoomInvariantPanel 居中修复 | ScriptNode、ScriptGenNode 的提示词面板重新套上 `ZoomInvariantPanel`，保持固定大小居中 |
| ZoomInvariantPanel nodeWidth 参数 | 新增 `nodeWidth` 参数，支持面板宽度与节点宽度不一致时的正确居中计算 |
