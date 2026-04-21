# 2026-04-21_03 AddNodePanel 提取为共用组件

## 背景

上一步（_02）已让右键「添加节点」共用 `NodeAddMenu`，但 `NodeAddMenu` 的 standalone
模式是把「添加节点」/「添加资源」的所有 item 重新写了一遍，没有真正复用左侧 `+` 号面板的代码。
用户指出「为啥没有共用那个菜单，而是重新新建的」，因此做进一步重构。

---

## 改动内容

### 新增 `AddNodePanel.tsx`

路径：`frontend/src/components/canvas/AddNodePanel.tsx`

- 从 `ProjectEditor.tsx` 中提取「添加节点」面板的全部逻辑：
  - `ADD_NODE_ITEMS`：文本 / 图片 / 视频 / 视频合成（Beta）/ 音频 / 脚本（Beta）
  - `ADD_RESOURCE_ITEMS`：上传 / 从图库选择
  - `handleAddNode`：根据 `spawnPosition` 或 `getViewportCenter()` 计算落点，调用 `addNode`
  - hover 样式、desc 展开交互
- Props：
  | Prop | 说明 |
  |------|------|
  | `spawnPosition?: {x, y}` | 画布坐标；缺省时使用视口中心 + jitter |
  | `onClose: () => void` | 选中节点后关闭面板 |

### 改动 `NodeAddMenu.tsx`

- standalone 模式（`fixedPosition` 存在时）不再重复 item 列表，改为直接渲染：
  ```tsx
  <AddNodePanel spawnPosition={spawnPosition} onClose={onClose} />
  ```
- 删除了 standalone 分支中所有重复的 item 数据与渲染代码（~80 行）

### 改动 `ProjectEditor.tsx`

- 添加 `import AddNodePanel from '@/components/canvas/AddNodePanel'`
- 删除原本内联的 `ADD_NODE_ITEMS`、`ADD_RESOURCE_ITEMS`、`LABELS`、`CATEGORIES` 常量
- 删除 `handleAddNode` 函数（约 30 行）
- 删除 `hoveredId` state
- 删除不再需要的 lucide-react 导入：`FileText, Image, Video, Scissors, Music, ScrollText, Upload, LayoutGrid`
- 删除 `getViewportCenter` 导入
- `const { addNode, nodes }` → `const { nodes }`
- 「Add panel」展开区域替换为：`<AddNodePanel onClose={() => setActive(null)} />`

---

## 效果

左侧 `+` 号面板、右键「添加节点」弹出的 NodeAddMenu，两者现在渲染的是**同一个** `AddNodePanel` 组件，
视觉与功能完全一致，后续只需维护一份代码。

---

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `frontend/src/components/canvas/AddNodePanel.tsx` | feat: 新增共用「添加节点」面板组件 |
| `frontend/src/components/nodes/shared/NodeAddMenu.tsx` | refactor: standalone 模式改用 AddNodePanel |
| `frontend/src/pages/ProjectEditor.tsx` | refactor: 删除内联面板代码，改用 AddNodePanel |
