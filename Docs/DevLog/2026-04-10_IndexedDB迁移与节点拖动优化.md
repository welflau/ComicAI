# DevLog — 2026-04-10 IndexedDB 迁移 & 节点拖动视觉优化

## 概述

本次迭代完成两件独立的事：

1. **数据持久化全面迁移到 IndexedDB**：项目元数据、工作流、图片二进制全部从 localStorage 移入 IndexedDB（Dexie.js），彻底解除 5 MB 限制。
2. **节点拖动时保持 hover 视觉**：拖动节点时不再展开完整形态，改为与鼠标经过时一致的轻量显示。

---

## 一、IndexedDB 迁移

### 背景

原来的 `localProjectsStore` 使用 Zustand `persist` 中间件把所有内容序列化进 `localStorage`。图片使用 `FileReader.readAsDataURL` 转成 base64 后也塞进 store，导致：

- 单个高清图可达 3–5 MB，几张图就触及 5 MB 上限
- base64 有约 33% 的体积膨胀
- 项目/工作流/图片全部混在同一个 localStorage key，难以单独管理

### 新架构

```
frontend/src/stores/
  db.ts              — Dexie 数据库定义（images / projects / workflows 三张表）
  imageStore.ts      — 图片存取辅助函数（saveImage / resolveImageUrl / deleteImage）
  localProjectsStore.ts — 重写：去掉 persist，改为直接操作 IndexedDB
```

**`db.ts`** 定义三张表：

| 表 | 主键 | 作用 |
|---|---|---|
| `images` | `++id`（自增） | 存储图片 Blob，通过 `projectId` 索引关联项目 |
| `projects` | `id`（字符串） | 项目元数据（替代 localStorage projects 数组） |
| `workflows` | `projectId` | 每个项目的节点/连线数据 |

**`imageStore.ts`** 提供轻量工具函数：
- `saveImage(projectId, file)` → 存入 Blob，返回 `idb://123` 引用字符串
- `resolveImageUrl(ref)` → `idb://` 转为临时 `blob:` URL；普通 URL 直接透传；找不到返回 `null`
- `deleteImage(ref)` / `deleteProjectImages(projectId)` — 删除时清理

**`localProjectsStore.ts`** 关键变化：
- 去掉 `persist` middleware，所有方法改为 `async`
- 新增 `init()` — 应用启动时调用，先做 localStorage→IndexedDB 一次性迁移，再加载所有项目到内存
- 新增 `migrateFromLocalStorage()` — 读取旧 `comicai_projects` key，批量写入 IndexedDB，完成后删除 localStorage key（幂等，只跑一次）
- `deleteProject` 同时调用 `deleteProjectImages` 清理关联图片

### 联动改动

**`projectStore.ts`**：
- `loadProject`：调用前先 `await localStore.init()`，`getWorkflow` 改为 `await`
- `updateWorkflow`：本地项目的 `saveWorkflow` 改为 `await`

**`Dashboard.tsx`**：
- 组件挂载时调用 `localInit()` 确保 IndexedDB 加载完成（含 migration）
- `localCreate` / `localDelete` 改为 `await`

**`ImageNode.tsx`**：
- `handleFileChange` 改为 `async`，调用 `saveImage(projectId, file)` 存入 IndexedDB，只把 `idb://` 引用写入 `nodeData.imageUrl`
- 新增 `useEffect` 监听 `data.imageUrl`，调用 `resolveImageUrl` 解析为 `blob:` URL 赋给 `displayUrl` state
- `<img src={displayUrl}>` 展示；`useEffect` 清理时 `URL.revokeObjectURL` 防止内存泄漏

### 图片存储对比

| | 旧方案（base64） | 新方案（IndexedDB Blob） |
|---|---|---|
| 存储位置 | localStorage（5 MB 上限） | IndexedDB（磁盘剩余 60%） |
| 图片引用 | 完整 base64 data URL（~4 MB/张）| `idb://123`（几个字节） |
| 刷新后可用 | ✅（base64 持久） | ✅（IndexedDB 持久） |
| 内存效率 | 差（字符串常驻内存） | 好（按需解析为 blob URL，用完 revoke） |

---

## 二、节点拖动视觉优化

### 问题

拖动节点时 ReactFlow 仍保留 `selected=true`，导致节点处于"完整展开"状态（PromptPanel、快捷操作列表可见），拖动时视觉上很重，不够简洁。

### 方案

ReactFlow 的 `NodeProps` 本身提供 `dragging: boolean`，无需额外监听鼠标事件。

**修改了 4 个节点文件（ScriptNode / ScriptGenNode / ImageNode / StoryboardTableNode）：**

1. **删除**各节点内部的 `const [dragging, setDragging] = useState(false)` 和相应的 `onMouseDown/Up/Leave` 设置逻辑
2. **解构** `dragging` 自 `NodeProps`
3. 所有依赖 `selected` 的视觉逻辑改为 `selected && !dragging`：

```ts
// 之前
const isExpanded    = selected || mode === 'write' || mode === 'generating'
const handlesVisible = isHovered || selected || mode === 'write'

// 之后
const isExpanded    = (selected && !dragging) || mode === 'write' || mode === 'generating'
const handlesVisible = isHovered || (selected && !dragging) || mode === 'write'
```

同样处理的还有：`border`、`boxShadow`、`CollapsibleSection expanded`、浮动上传按钮的显示条件。

**效果：** 拖动时视觉降级为 hover 状态（淡边框 + 无阴影光晕 + 内容折叠），松手后立即恢复完整选中态。write/generating 模式不受影响（`dragging` 在这些模式下理论上不触发）。

---

## 文件变更清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `frontend/src/stores/db.ts` | 新建 | Dexie 数据库定义 |
| `frontend/src/stores/imageStore.ts` | 新建 | 图片 IndexedDB 存取工具 |
| `frontend/src/stores/localProjectsStore.ts` | 重写 | 移除 persist，全面改用 IndexedDB |
| `frontend/src/stores/projectStore.ts` | 修改 | loadProject/updateWorkflow 适配异步 API |
| `frontend/src/pages/Dashboard.tsx` | 修改 | 挂载时 init，create/delete 改 await |
| `frontend/src/components/nodes/ImageNode.tsx` | 修改 | 改用 saveImage + resolveImageUrl；拖动优化 |
| `frontend/src/components/nodes/ScriptNode.tsx` | 修改 | 拖动时折叠，移除本地 dragging state |
| `frontend/src/components/nodes/ScriptGenNode.tsx` | 修改 | 同上 |
| `frontend/src/components/nodes/StoryboardTableNode.tsx` | 修改 | 拖动时降级视觉样式 |
| `frontend/package.json` | 修改 | 新增 `dexie ^4.4.2` 依赖 |
