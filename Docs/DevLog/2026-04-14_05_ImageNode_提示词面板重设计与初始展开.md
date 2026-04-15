# ImageNode 提示词面板重设计 + 菜单创建默认展开

**日期：** 2026-04-14  
**涉及文件：**
- `frontend/src/components/nodes/ImageNode.tsx`
- `frontend/src/components/nodes/shared/NodeAddMenu.tsx`
- `frontend/src/types/index.ts`

---

## 本次修改汇总

### 1. + 菜单选"图片"——创建后提示词面板自动展开

**需求：** 从文本节点（或任意节点）的 `+` 菜单点"图片"创建图片节点时，提示词面板应直接处于展开状态，方便用户立即输入。

**实现：**

**① `NodeAddMenu.tsx` — 创建 `libtv_image` 节点时附加 `initialPanelExpanded: true`：**

```ts
if (item.targetType === 'libtv_image') {
  initialPanelExpanded = true
}

addNode({
  ...
  ...(initialPanelExpanded ? { initialPanelExpanded } : {}),
})
```

**② `ImageNodeData` 接口新增字段（`types/index.ts` 同步更新）：**

```ts
initialPanelExpanded?: boolean  // prompt panel shown by default (e.g. created from + menu)
```

**③ `ImageNode.tsx` — `hadInitialExpand` 状态管理：**

```ts
// 初始化：若 data.initialPanelExpanded 为 true，则 hadInitialExpand = true
const [hadInitialExpand, setHadInitialExpand] = useState(() => !!data.initialPanelExpanded)

// CollapsibleSection：选中 OR 初始展开标志，任一满足即展开
<CollapsibleSection expanded={(!!selected && !dragging) || hadInitialExpand}>

// 一旦节点失去选中状态，清除初始展开标志，之后恢复正常的"选中才展开"行为
useEffect(() => {
  if (!selected && hadInitialExpand) {
    setHadInitialExpand(false)
  }
}, [selected, hadInitialExpand])
```

---

### 2. ImagePromptPanel UI 重设计

**旧设计：** 顶部一个"风格"方形图标按钮 + 带边框 textarea + 底部含 Video/Languages/SlidersHorizontal 图标。

**新设计（对齐截图参考）：**

#### 顶部 Tab 栏（3 个）
| 按钮 | 功能 |
|------|------|
| 风格 | 风格相关参数 |
| 标记 | 标记/标签 |
| 聚焦 | 聚焦区域 |

选中 tab 高亮（`#2a2a2a` 背景 + `#3a3a3a` 边框），未选中淡灰色。

#### Textarea
- 背景透明，无边框，直接贴卡片背景
- 新 placeholder：`描述你想要生成的画面内容，按/呼出指令，@引用素材`

#### 底部工具栏
从左到右：
1. **Lib Nano Pro ▾** — 模型选择
2. **分隔线**
3. **16:9 · 2K ▾** — 比例/分辨率
4. **分隔线**
5. **摄像机控制**（Camera 图标 + 文字）— 运镜参数
6. **弹性空间**
7. **文A**（Type 图标）— 中英文切换
8. **↕**（ArrowUpDown 图标）— 排列顺序切换
9. **1张 ▾** — 生成数量
10. **⚡14** — 消耗积分
11. **发送按钮**（白底黑箭头，无内容时半透明禁用）

---

## 完整数据链路（新建图片节点）

```
用户在文本节点点 + → 选"图片"
  → NodeAddMenu: addNode({ type: 'libtv_image', initialPanelExpanded: true, ... })
  → ImageNode 挂载: hadInitialExpand = true
  → CollapsibleSection expanded = true（面板立即展开）

用户点击画布其他区域（节点失去选中）
  → selected = false
  → useEffect: setHadInitialExpand(false)
  → CollapsibleSection expanded = false（面板收起）

用户再次单击节点
  → selected = true
  → CollapsibleSection expanded = true（正常选中展开）
```
