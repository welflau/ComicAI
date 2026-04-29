# 2026-04-21_07 ScriptGenNode 生成分镜图节点流程

## 背景

分镜脚本节点内容完成后，工具条中「生成分镜」按钮仅打印日志，无任何实际功能。
需要实现完整的「选择分镜 → 批量生成图片节点」流程。

---

## 设计

用户操作流程：

1. 工具条点击「生成分镜」按钮
2. 视角聚焦到该节点（`requestSelectNode`）
3. 分镜表切换为「选择模式」，所有行默认全选，带紫色 checkbox
4. 底部出现操作栏：模型下拉 | 比例下拉 | 已选 N/N | 风格 | **⚡N** | ✕
5. 可逐行点击切换勾选；点击 ✕ 退出选择模式
6. 点击「⚡N」：每个选中镜头创建一个 `libtv_image` 节点，连边，退出选择模式

---

## 实现

### 新增 state

```ts
const [shotGenMode, setShotGenMode]       = useState(false)
const [selectedShotIds, setSelectedShotIds] = useState<Set<string | number>>(new Set())
const [imgModel, setImgModel]             = useState('Z Image Turbo')
const [imgRatio, setImgRatio]             = useState('16:9·2K')
const [modelDropOpen, setModelDropOpen]   = useState(false)
const [ratioDropOpen, setRatioDropOpen]   = useState(false)
```

### 「生成分镜」按钮

```ts
onClick={() => {
  setShotGenMode(true)
  setSelectedShotIds(new Set(shots.map(s => s.id)))
  setViewMode('script')          // 切换到脚本视图以显示 checkbox
  requestSelectNode(data.id)     // 触发 WorkflowCanvas fitView 聚焦
}}
```

### StoryboardTable — 选择模式

新增可选 props：`selectable`, `selectedIds`, `onToggle`

- `selectable=true` 时 gridTemplateColumns 前插入 24px checkbox 列
- 行点击触发 `onToggle(shot.id)` 切换 Set 内成员
- 已选行背景变为 `rgba(124,106,247,0.08)`（紫色调）

### 底部操作栏

渲染位置：storyboard card 下方，通过 `ZoomInvariantPanel` 保持固定像素尺寸

| 元素 | 说明 |
|------|------|
| 模型下拉 | `Z Image Turbo / Pro / FLUX Schnell / SDXL`，外部点击关闭 |
| 比例下拉 | `16:9·2K / 9:16·2K / 1:1·2K / 4:3·2K / 21:9·2K`，外部点击关闭 |
| 已选徽标 | `已选 N/N` |
| 风格按钮 | 占位，待扩展 |
| **⚡N** 生成 | 紫色主按钮，0 选时禁用变灰 |
| ✕ | hover 变红，退出选择模式 |

### 生成逻辑

```ts
const selectedShots = shots.filter(s => selectedShotIds.has(s.id))
const SPACING_Y = 280
const startX = data.position.x + NODE_W + 80
const startY = data.position.y - ((selectedShots.length - 1) * SPACING_Y) / 2

selectedShots.forEach((shot, idx) => {
  const newId = `libtv_image_${Date.now()}_${idx}`
  addNode({
    id: newId,
    type: 'libtv_image',
    label: `分镜 #${shot.sequence}`,
    category: 'output',
    position: { x: startX, y: startY + idx * SPACING_Y },
    config: {},
    title: '分镜图·脚本生成器',
    imagePrompt: shot.description,
  })
  addEdge({ id: `e-${data.id}-${newId}`, source: data.id, target: newId })
})
setShotGenMode(false)
```

节点垂直居中对齐：以脚本节点 Y 坐标为中心，按 280px 间距向上下扩展。

---

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `frontend/src/components/nodes/ScriptGenNode.tsx` | feat: 生成分镜图节点选择模式与批量创建 |
