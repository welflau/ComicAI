# ScriptNode content 模式交互修复

**日期：** 2026-04-14  
**涉及文件：**
- `frontend/src/components/nodes/ScriptNode.tsx`

---

## 本次修复汇总

### 1. content 节点无法选中/拖拽

**问题：** content 模式滚动区加了 `nodrag nopan nowheel`，其中 `nodrag`/`nopan` 会在 `mousedown` 时 `stopPropagation`，阻断 ReactFlow 的节点选中与拖拽事件。

**修复：** 只保留 `nowheel`（防止滚轮穿透给画布），移除 `nodrag nopan`。

---

### 2. content 模式双击进入编辑 + 格式工具条

**约定规范：**

| 状态 | 触发 | 表现 |
|------|------|------|
| 查看（view） | 生成完成默认 | 只读渲染，中性边框 |
| 选中（selected） | 单击 | 亮边框 + 顶部下载按钮 |
| 编辑（editing） | 双击内容区 | 上方浮出格式工具条 + textarea 激活 |
| 退出编辑 | Escape / blur | 工具条消失，恢复只读 |

**工具条按钮（11个，5组）：**
- 标题组：H1 H2 H3 ¶（切换行首标题标记）
- 格式组：B I（包裹选中文字）
- 列表组：无序列表 / 有序列表（行首前缀）
- 分隔组：—（插入 `\n---\n`）
- 工具组：复制全文 / 全屏（占位）

**关键实现：** 工具条按钮全部使用 `onMouseDown + e.preventDefault()` 防止 blur 触发，确保 textarea 保持焦点。

---

### 3. 生成内容刷新后丢失

**问题：** 生成完成只调用 `setText`/`setMode` 更新 React state，从未写入 IndexedDB，刷新后节点恢复 idle 空态。

**修复：** 在三处调用 `updateNode` 持久化：
- `onDone`（AI 流式生成完毕）
- mock `onDone`（降级 mock 完毕）
- `stopGenerate`（用户中断，保存已生成部分）
- content 编辑 textarea `onBlur`（编辑后退出保存）

持久化字段：`{ content, initialMode: 'content', initialPrompt: userPrompt }`

---

### 4. 提示词刷新后丢失

**问题：** `prompt` 状态未持久化，刷新后 `data.initialPrompt` 还是旧值（或空）。

**修复：** `updateNode` 时加入 `initialPrompt: userPrompt`，刷新后提示词面板恢复原内容。

---

### 5. 有提示词/上游图片时隐藏快捷操作列表

**问题：** img2prompt 创建的节点已有预填提示词 + 上游图片，快捷操作列表多余。

**修复：** 渲染条件改为：
```tsx
{showQuickActions && !prompt.trim() && !sourceImageRef && (
```
有提示词或上游图片引用时，快捷列表不渲染。

---

### 6. 快捷列表隐藏后节点高度缩小

**问题：** 快捷列表消失后，预览区只有 150px，卡片整体缩水。

**修复：** 预览区高度根据是否显示快捷列表动态切换：
```tsx
height: (showQuickActions && !prompt.trim() && !sourceImageRef) ? 150 : IDLE_CARD_H
```
快捷列表隐藏时，预览区撑满 `IDLE_CARD_H = 292px`，卡片尺寸保持不变。
