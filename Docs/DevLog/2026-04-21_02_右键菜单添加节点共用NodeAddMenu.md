# 2026-04-21_02 右键菜单「添加节点」共用 NodeAddMenu

## 背景

画布右键菜单中有「添加节点」选项，但点击后直接创建了一个固定的 `libtv_script` 节点，
没有给用户选择节点类型的机会。左侧 `+` 号已有完善的 `NodeAddMenu`（文本/图片/视频/视频合成/音频/脚本），
两处应复用同一个菜单。

---

## 改动内容

### `NodeAddMenu.tsx` — 支持独立（standalone）模式

原来的组件假定总有一个 source 节点，用 `position: absolute` 贴在节点 handle 旁边。
新增两个可选 prop：

| Prop | 说明 |
|------|------|
| `fixedPosition?: {x, y}` | 以 `position: fixed` 渲染在屏幕坐标，用于从画布右键菜单调起 |
| `spawnPosition?: {x, y}` | 画布坐标，新节点放置位置（standalone 模式下无 source 节点，不连边） |

- `sourceNodeId` / `sourcePosition` 改为可选
- `handleSelect` 中区分 standalone 与有 source 两种路径
- 标题文字：`fixedPosition` 存在时显示「添加节点」，否则沿用原来的「添加前置节点」/「引用该节点生成」

### `WorkflowCanvas.tsx`

- 新增 `paneNodeAddOpen: boolean` state
- `handleAddNode` 不再直接 `addNode`，改为 `setPaneNodeAddOpen(true)`
- 渲染 `NodeAddMenu`（fixed 定位，紧靠右键菜单右侧 210px 处）
- import `NodeAddMenu`

### `CanvasContextMenu.tsx`

- 「添加节点」`onClick` 去掉 `onClose()`，点击后保留右键菜单，NodeAddMenu 在旁边弹出

---

## 交互流程

1. 画布空白处右键 → 弹出 CanvasContextMenu
2. 点「添加节点」→ NodeAddMenu 出现在右键菜单右侧
3. 在 NodeAddMenu 中选择节点类型 → 节点在右键坐标处创建，两个菜单关闭
4. 点击任意菜单外区域 → 两个菜单均关闭

---

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `frontend/src/components/nodes/shared/NodeAddMenu.tsx` | feat: 支持 fixedPosition / spawnPosition standalone 模式 |
| `frontend/src/components/canvas/WorkflowCanvas.tsx` | feat: 右键「添加节点」改为弹出 NodeAddMenu |
| `frontend/src/components/canvas/CanvasContextMenu.tsx` | fix: 「添加节点」不再自动关闭右键菜单 |
