# 开发日志 — 节点系统重构与 NodeAddMenu 实现

**日期：** 2026-04-10  
**涉及文件（新增）：**
- `frontend/src/components/nodes/ScriptGenNode.tsx`
- `frontend/src/components/nodes/shared/CollapsibleSection.tsx`
- `frontend/src/components/nodes/shared/NodeAddMenu.tsx`
- `frontend/src/components/panels/LogPanel.tsx`
- `frontend/src/components/settings/SettingsModal.tsx`
- `frontend/src/stores/logStore.ts`
- `frontend/src/stores/settingsStore.ts`
- `frontend/src/stores/viewportCenter.ts`

**涉及文件（修改）：**
- `frontend/src/components/nodes/ScriptNode.tsx`
- `frontend/src/components/nodes/ScriptGenNode.tsx`
- `frontend/src/components/nodes/ImageNode.tsx`
- `frontend/src/components/nodes/StoryboardTableNode.tsx`

---

## 一、背景

本轮开发延续上一轮节点系统基础，重点完成三项功能：

1. **新节点类型 `ScriptGenNode`**（分镜脚本生成节点）
2. **节点精简/完整形态切换**（未选中收起、选中展开，含动画过渡）
3. **节点 `+` 按钮弹出菜单**（点击 source handle 弹出「引用该节点生成」菜单，选择后自动创建并连接新节点）

---

## 二、新增组件

### 1. `ScriptGenNode`（分镜脚本生成节点）

路径：`frontend/src/components/nodes/ScriptGenNode.tsx`

功能与 `ScriptNode` 类似，但定位为「剧本 → 分镜脚本」的中间处理节点。

**三种模式：**

| 模式 | 触发 | 显示内容 |
|------|------|----------|
| `idle` | 初始 / 停止生成后无内容 | 预览占位图 + 快捷操作列表 + PromptPanel |
| `generating` | 点击生成 | AI 流式输出 + 停止按钮 |
| `content` | 生成完成 / 手动编写 | 全文展示 + 编辑/重新生成按钮 + PromptPanel |

**快捷操作：**
- 根据剧本生成分镜脚本（自动创建 `libtv_script` 节点并连边）
- 文生视频分镜
- 图片转分镜脚本
- 手动编写分镜脚本

**生成逻辑：** 优先调用 `streamAI` API，失败自动 fallback 到内置 mock 流式内容。

---

### 2. `CollapsibleSection`（可折叠容器）

路径：`frontend/src/components/nodes/shared/CollapsibleSection.tsx`

基于 `scrollHeight` 动画实现的平滑展开/收起容器，供所有节点复用。

**动画机制：**
- 展开：`setVisible(true)` → rAF 后设 `height: scrollHeight` → timeout 后设 `height: 'auto'`
- 收起：先锁定 `height: scrollHeight` → double rAF 后设 `height: 0` → timeout 后 `setVisible(false)`

```tsx
interface Props {
  expanded: boolean
  children: React.ReactNode
  duration?: number  // 默认 220ms
}
```

---

### 3. `NodeAddMenu`（节点快速添加菜单）

路径：`frontend/src/components/nodes/shared/NodeAddMenu.tsx`

点击节点右侧 `+` handle 后弹出，标题「引用该节点生成」，列出可连接的目标节点类型。

**菜单项定义：**

| ID | 标签 | 目标节点类型 | Badge |
|----|------|------------|-------|
| `text` | 文本 | `libtv_script` | — |
| `image` | 图片 | `libtv_image` | — |
| `video` | 视频 | `video_gen` | — |
| `video_compose` | 视频合成 | `auto_edit` | Beta |
| `audio` | 音频 | `tts` | — |
| `script` | 脚本 | `libtv_script_gen` | Beta |

**各节点类型的可用项：**

| 节点类型 | 可用菜单项 |
|----------|-----------|
| `libtv_script` | text / image / video / script |
| `libtv_script_gen` | text / image / video / script |
| `libtv_storyboard` | image / video / script |
| `libtv_image` | text / image / video / script |
| `default` | text / image / video |

不可用的项目以灰色显示，点击无效。

**选中行为：** 调用 `useProjectStore` 的 `addNode` + `addEdge`，新节点默认放置在源节点右侧（`x + nodeWidth + 80`，`y` 相同）。

**关闭行为：** 点击菜单外部（capture 阶段 `mousedown`）或按 `Escape` 自动关闭。

**菜单定位：** `position: absolute; left: 100%; top: 50%; transform: translateY(-50%); marginLeft: 14px`，相对于 handle wrapper div 定位，不受 `overflow: hidden` 影响。

---

## 三、节点精简/完整形态切换

### 设计规则

| 状态 | 形态 |
|------|------|
| 未选中（idle/content 模式） | 精简：只显示标题 + 主内容卡片 + handles |
| 选中 | 完整：展开快捷操作列表 + PromptPanel / 底部操作栏 |
| write / generating 模式 | 始终完整，不受 selected 影响 |

### 派生值

**ScriptNode：**
```ts
const isExpanded = selected || mode === 'write' || mode === 'generating'
```

**ScriptGenNode：**
```ts
const isExpanded = selected || mode === 'generating'
```

**ImageNode：**
```ts
// 快捷操作列表通过 CollapsibleSection expanded={!!selected} 控制
```

### CollapsibleSection 用法

```tsx
// idle 模式：快捷操作列表
<CollapsibleSection expanded={isExpanded}>
  <div style={{ padding: '10px 16px 12px' }}>
    {/* 快捷操作项 */}
  </div>
</CollapsibleSection>

// idle / content 模式：PromptPanel
<CollapsibleSection expanded={isExpanded}>
  <PromptPanel value={prompt} onChange={setPrompt} onSend={handleSend} />
</CollapsibleSection>
```

---

## 四、Handle + NodeAddMenu 架构

### 问题：`overflow: hidden` 裁剪弹窗

原来节点根元素（或卡片元素）设有 `overflow: hidden`，导致绝对定位的菜单被裁剪。

### 解决方案：wrapper div 方案

所有节点改为「outer 容器（无 overflow:hidden）+ inner 卡片（overflow:hidden）」结构：

```
<div style={{ position: 'relative', width: NODE_W }}>   ← outer，无 overflow
  <Handle type="target" ... />                           ← 左侧 handle，在 outer 内
  <div style={{ overflow: 'hidden', ... }}>              ← inner card
    {/* 节点内容 */}
  </div>
  <div style={{ position: 'absolute', right: -11, ... }}> ← handle wrapper，在 outer 内
    <Handle type="source" ... />
    {menuOpen && <NodeAddMenu ... />}                     ← 菜单不受 inner overflow 影响
  </div>
</div>
```

### `CircleHandle` 内嵌菜单版本

ScriptNode / ScriptGenNode 使用封装的 `CircleHandle` 组件，将 wrapper div + Handle + NodeAddMenu 三者合一：

```tsx
function CircleHandle({ type, position, top, visible,
  onSourceClick, menuOpen, onMenuClose,
  nodeType, sourceNodeId, sourcePosition, sourceNodeWidth }) {
  const isSource = type === 'source'
  return (
    <div style={{ position: 'absolute', top, ...side, transform: 'translateY(-50%)', width: 22, height: 22 }}>
      <Handle
        style={{ position: 'relative', ... }}
        onClick={isSource ? (e) => { e.stopPropagation(); onSourceClick?.() } : undefined}
      >
        <span>+</span>
      </Handle>
      {isSource && menuOpen && nodeType && sourceNodeId && sourcePosition && (
        <NodeAddMenu nodeType={nodeType} sourceNodeId={sourceNodeId}
          sourcePosition={sourcePosition} sourceNodeWidth={sourceNodeWidth}
          onClose={onMenuClose!} />
      )}
    </div>
  )
}
```

Handle 上 `position: 'relative'` 配合 wrapper div 的绝对定位，避免 ReactFlow 默认的 transform 定位干扰。

---

## 五、其他新增模块

### `LogPanel`（运行日志面板）

路径：`frontend/src/components/panels/LogPanel.tsx`

悬浮在画布右下角，记录 AI 调用、节点操作等运行时日志，分级（info / warn / error）展示，支持展开/收起。

### `SettingsModal`（设置弹窗）

路径：`frontend/src/components/settings/SettingsModal.tsx`

支持配置各 AI 服务 API Key，含连通性测试按钮，测试结果写入 `settingsStore.testStatuses`，影响 `ModelDropdown` 中模型的排序和绿点指示。

### `settingsStore`

路径：`frontend/src/stores/settingsStore.ts`

持久化各 AI 服务配置（Anthropic / OpenAI / Replicate 等）及连通性测试结果。

### `logStore`

路径：`frontend/src/stores/logStore.ts`

轻量全局日志 store，`addLog({ level, category, message, detail })` 供任意模块调用。

### `viewportCenter`

路径：`frontend/src/stores/viewportCenter.ts`

存储当前画布视口中心坐标（`x, y`），用于「从侧栏添加节点时放置到视口中央」。

---

## 六、架构总览

```
nodes/
├── ScriptNode.tsx          文本生成节点（idle / write / generating / content）
├── ScriptGenNode.tsx       分镜脚本生成节点（idle / generating / content）
├── ImageNode.tsx           图片生成节点
├── StoryboardTableNode.tsx 分镜表格节点
└── shared/
    ├── CollapsibleSection.tsx  动画折叠容器
    └── NodeAddMenu.tsx         引用生成快速菜单

stores/
├── projectStore.ts         节点 / 边 / 项目状态
├── settingsStore.ts        AI 服务配置与连通状态
├── logStore.ts             运行日志
└── viewportCenter.ts       画布视口中心
```

---

## 七、待办

- [ ] `video_gen` / `auto_edit` / `tts` 节点组件尚未实现（NodeAddMenu 中已可创建但无对应渲染组件）
- [ ] `NodeAddMenu` 的 `video_compose` / `audio` 项目待开放（当前所有节点均为 disabled）
- [ ] Handle 位置随节点高度动态变化时的 `top` transition 微调（`CollapsibleSection` 动画与 handle 位移同步）
- [ ] `LogPanel` 接入更多节点操作事件
- [ ] `SettingsModal` 接入真实 API 连通性检测端点
