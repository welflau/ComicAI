# ScriptNode 上游文本传递与 + 菜单创建优化

**日期：** 2026-04-14  
**涉及文件：**
- `frontend/src/components/nodes/ScriptNode.tsx`
- `frontend/src/components/nodes/shared/NodeAddMenu.tsx`

---

## 本次修复汇总

### 1. + 菜单选"文本"——直接创建带提示词面板的节点

**问题：** 从 `+` 菜单点"文本"创建的节点，会显示快捷操作列表，而非直接展示提示词面板。

**修复：** `NodeAddMenu.tsx` 中，点击 `libtv_script` 类型时无论是否有上游图片，均附加 `hideQuickActions: true`：

```ts
// 修复前：仅有 sourceImageUrl 时才隐藏快捷列表
if (item.targetType === 'libtv_script' && sourceImageUrl) {
  hideQuickActions = true
}

// 修复后：从 + 菜单创建的文本节点一律隐藏快捷列表
if (item.targetType === 'libtv_script') {
  hideQuickActions = true
  if (sourceImageUrl) { ... }
}
```

**效果：** 从 `+` 菜单创建的文本节点直接显示提示词面板，单击选中后即可输入发送，无多余快捷选项。

---

### 2. 上游文本节点内容未传递给 AI

**问题：** 将一个写有内容的文本节点（如"孙悟空"）连线到另一个文本节点，点发送后 AI 没有读取到上游文本，回复询问用户要生成什么内容。

**根因：** `startGenerate` 只处理了上游图片节点（`libtv_image`），未读取上游文本节点（`libtv_script`）的 `content`。

**修复方案：**

**① 在 `useEffect` 中同时检测上游文本节点：**

```ts
// 上游文本 (libtv_script 有 content 的节点)
const upstreamTexts = upstreamNodes
  .filter(n => n.type === 'libtv_script' && !!(n as NodeData).content)
  .map(n => (n as NodeData).content as string)
  .filter(Boolean)
setSourceTextContent(upstreamTexts.length > 0 ? upstreamTexts.join('\n\n') : undefined)
```

**② `startGenerate` 中拼装 finalPrompt：**

```ts
const finalPrompt = sourceTextContent
  ? `上游内容：\n${sourceTextContent}\n\n指令：${userPrompt}`
  : userPrompt
```

`finalPrompt` 传给 `streamAI({ prompt: finalPrompt, ... })`，`userPrompt`（用户自己写的）仍用于 log 和 `initialPrompt` 持久化。

---

### 3. write 模式文本未持久化——下游读不到

**问题：** write 模式 textarea 的 `onBlur` 只做了 `setFocused(false)`，没有写入 IndexedDB，导致 store 中的节点 `content` 为空，下游 `useEffect` 读不到。

**修复：** blur 时同步持久化：

```ts
onBlur={() => {
  setFocused(false)
  if (text.trim()) updateNode(data.id, { content: text, initialMode: 'write' })
}}
```

---

## 完整数据链路

```
文本节点 A (write 模式)
  → onBlur → updateNode({ content: '孙悟空' })
  → store.allNodes 更新

文本节点 B (idle/content 模式)
  → useEffect 监听 allEdges/allNodes
  → 检测到上游 libtv_script 有 content = '孙悟空'
  → setSourceTextContent('孙悟空')

用户在 B 输入"根据内容生成故事" → 点发送
  → finalPrompt = "上游内容：\n孙悟空\n\n指令：根据内容生成故事"
  → streamAI({ prompt: finalPrompt })
  → AI 正确读取上下文，生成完整故事
```
