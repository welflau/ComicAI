# 开发日志 — ProjectEditor 左侧边栏与画布交互优化

**日期：** 2026-04-08  
**涉及文件：**
- `frontend/src/pages/ProjectEditor.tsx`
- `frontend/src/components/canvas/WorkflowCanvas.tsx`
- `frontend/src/components/nodes/ScriptNode.tsx`
- `frontend/src/components/nodes/StoryboardTableNode.tsx`
- `frontend/src/stores/projectStore.ts`

---

## 一、问题背景

在项目编辑器（ProjectEditor）开发过程中，陆续发现并修复了以下几类问题：

1. 新建项目后画布显示旧的 demo 内容（三体文本）
2. 故事脚本生成模板创建了错误的节点
3. 画布鼠标交互不符合预期（框选 / 平移）
4. 左侧边栏面板从点击触发改为悬停触发，且位置对齐问题

---

## 二、修复内容

### 1. 新项目画布内容清空

**问题：** 切换到新项目后，ReactFlow 画布仍显示上一个项目（demo）的节点内容。

**根因：** `useNodesState` / `useEdgesState` 只在初始化时消费传入值，项目切换后 store 更新了 nodes/edges，但 ReactFlow 本地状态未同步。

**修复（WorkflowCanvas.tsx）：**
```tsx
useEffect(() => { setNodes(rfNodes) }, [rfNodes])
useEffect(() => { setEdges(rfEdges) }, [rfEdges])
```

---

### 2. 故事脚本生成模板节点

**问题：** 选择「故事脚本生成」模板后，创建的是 demo 的旧节点（含三体内容），而非干净的剧本 + 分镜节点。

**修复（projectStore.ts）：** 将 `script_to_video` 模板的 nodes/edges 改为独立的 2 个节点：

```ts
nodes: [
  { id: 'stv_script_1', type: 'libtv_script', label: '剧本', title: '新剧本', content: '' },
  { id: 'stv_storyboard_1', type: 'libtv_storyboard', label: '分镜表格', title: '分镜规划' },
],
edges: [{ id: 'e1', source: 'stv_script_1', target: 'stv_storyboard_1' }]
```

---

### 3. StoryboardTableNode 去除 Mock 数据

**问题：** 分镜节点在新建项目时显示硬编码的三体 mock 数据。

**修复（StoryboardTableNode.tsx）：**
- 移除 `MOCK_SHOTS` fallback，空节点显示「暂无分镜，生成剧本后自动填充」
- 默认标题改为 `'分镜表格'`

---

### 4. ScriptNode 生成按钮

**新增（ScriptNode.tsx）：**
- 添加「生成剧本」按钮（绿色风格，Sparkles 图标）
- 生成中状态显示 Loader2 旋转动画
- 空内容时提示「暂无内容，点击下方按钮生成剧本」
- 节点宽度从 200 → 220px

---

### 5. 画布鼠标交互

**需求：** 左键拖拽 = 框选；中键拖拽 = 平移画布

**修复（WorkflowCanvas.tsx）：**
```tsx
selectionOnDrag
selectionMode={SelectionMode.Partial}
panOnDrag={[1]}   // 1 = 中键
panOnScroll={false}
```

---

### 6. 左侧边栏：添加节点弹出菜单

**新增（ProjectEditor.tsx）：** `LeftSidebar` 组件重构：

- **添加节点菜单：** `+` 按钮弹出菜单，分两组：
  - 「添加节点」：文本 / 图片 / 视频 / 视频合成(Beta) / 音频 / 脚本(Beta)
  - 「添加资源」：上传 / 从图库选择
- **工具箱面板：** 第二个图标，显示 3 列预设工具卡片网格
- **素材库面板：** 第三个图标，含「我的素材 / 我的主体库」tab + 分类筛选 pill

---

### 7. 左侧边栏：图标垂直居中

**修复：** Icon rail 的 flexbox 改为 `justifyContent: 'center'`，所有图标在侧栏中垂直居中显示。

---

### 8. 侧栏面板：悬停触发 + 顶端对齐

**问题：** 面板之前是点击触发，且添加节点面板有 `marginTop: 4, marginLeft: 4` 偏移，导致面板出现在侧栏顶端以上位置（错位）。

**修复（ProjectEditor.tsx）：**

1. **hover 触发：** 将 `onClick` 改为 `onMouseEnter` 触发 `showPanel(id)`
2. **防抖隐藏：** `onMouseLeave` 启动 150ms 的 `hideTimer`，鼠标滑入面板时 `cancelHide()` 防止面板消失
3. **位置对齐：** 添加节点面板去除 `marginTop: 4, marginLeft: 4`，改为 `position: absolute, top: 0, left: 44`，与侧栏顶端完全对齐

```tsx
const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const showPanel = (id: string) => {
  if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  setActive(id)
}

const scheduleHide = () => {
  hideTimerRef.current = setTimeout(() => setActive(null), 150)
}

const cancelHide = () => {
  if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
}
```

---

## 三、架构说明

| 组件 | 职责 |
|------|------|
| `WorkflowCanvas` | ReactFlow 画布，负责节点渲染与状态同步 |
| `ScriptNode` | 剧本文本输入节点，含生成按钮 |
| `StoryboardTableNode` | 分镜表格节点，支持空状态 |
| `ImageNode` | 图片生成节点 |
| `projectStore` | Zustand store，管理节点/边/模板/本地持久化 |
| `LeftSidebar` | 左侧图标栏 + hover 面板（添加节点 / 工具箱 / 素材库） |

---

## 四、待办

- [ ] `ScriptNode` 生成按钮接入真实 API
- [ ] 素材库面板内容接入真实数据
- [ ] 工具箱预设点击后实际应用到画布
- [ ] 画布底部 Zoom 控件与 ReactFlow 实例联动
