# ComicFlow 开发日志

---

## 2026-04-18 — AI 助手知识修正 & 交互体验优化

### 背景

AI 助手面板（RightPanel）在上一阶段完成了基础搭建（Intent 识别 + 后端对话代理），本次针对实际测试中暴露的 3 个核心问题进行修复和优化。

---

### 问题 1：AI 幻觉节点类型

**现象**：用户询问"有哪些节点"，AI 回答了 14 种节点（剧本解析节点、角色设计节点、场景设计节点……），但画布中实际只能添加 6 种节点。

**根因**：后端 `ai_assistant.py` 原来没有 system prompt，AI 依赖训练数据自由发挥；后来补充的 system prompt 是从 `CLAUDE_SYSTEM_PROMPT.txt`（产品设计文档）复制过来的，包含了规划中但尚未实现的节点类型。

**修复**：
- 以 `frontend/src/components/nodes/shared/NodeAddMenu.tsx` 的 `MENU_ITEMS` 为唯一真相来源，确认实际可用节点只有 6 种
- 重写 `PLATFORM_SYSTEM_PROMPT`，只列出真实存在的 6 个节点，并加上明确声明："不存在剧本解析节点、角色设计节点、场景设计节点等其他节点"
- 同步更新前端 `src/api/index.ts` 中的 `PLATFORM_CONTEXT`（直连模式备用 prompt）

---

### 问题 2：LIST_NODES Intent 过度匹配

**现象**：用户问"现在有哪些类型的节点可以用"，前端正则把它识别为 `LIST_NODES` intent，直接 dump 当前画布节点列表，而不是路由给 AI 回答平台知识问题。

**根因**：Intent 正则 `/现在.*节点/` 匹配范围太宽，无法区分"告诉我画布里有什么"和"告诉我平台支持哪些节点类型"。

**修复**（`RightPanel.tsx`）：

```typescript
// 修复前
if (/有哪些节点|列出节点|查看节点|节点列表|现在.*节点/.test(t)) { ... }

// 修复后：加负向条件，含"类型/功能/介绍/可以用"等词时走 AI
if (/有哪些节点|列出节点|查看节点|节点列表|现在.*节点/.test(t)
    && !/类型|功能|介绍|说明|支持|系统|平台|可以用|可用/.test(t)) { ... }
```

---

### 问题 3：Markdown 表格渲染为原始文本

**现象**：AI 返回的 Markdown 表格（`| 节点 | 说明 |`）直接显示为纯文本，没有渲染成 HTML 表格。

**根因**：`react-markdown` v10 默认不支持 GFM（GitHub Flavored Markdown）语法，需要显式安装插件。

**修复**：
```bash
npm install remark-gfm
```

```tsx
// RightPanel.tsx
import remarkGfm from 'remark-gfm'
// ...
<ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
```

同步在 `globals.css` 补充了 `.markdown-body` 样式，覆盖表格、代码块、blockquote、标题等 GFM 元素的暗色主题样式。

---

### 新增：对话历史上下文

**改动**（`ai_assistant.py`）：`AssistantRequest` 新增 `history` 字段，后端构建消息时将最近 10 轮对话追加到 messages 列表，让 AI 能理解上下文、不重复追问已知信息。

```python
history: Optional[list[dict]] = None  # [{"role": "user"|"assistant", "content": "..."}]
```

前端 `RightPanel.tsx` 在发送请求时自动携带当前聊天记录（最近 20 条消息）。

---

### 新增：工作流场景知识（修正版）

旧 system prompt 中"常见创作场景"引用了大量不存在的节点（角色设计节点、预览节点、智能剪辑节点等），本次全部替换为基于真实 6 种节点的场景：

| 场景 | 节点链路 |
|------|---------|
| 图文转视频 | 文本 → 图片 → 视频 → 视频合成 |
| 带配音短片 | 文本 → 音频(TTS) + 图片 → 视频 → 视频合成 |
| AI 脚本创作 | 文本 → 脚本(Beta) → 图片×N → 视频×N → 视频合成 |

AI 现在可以准确回答"如何连接节点实现某个创作目标"的问题。

---

### 文件变更汇总

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `backend/app/api/v1/endpoints/ai_assistant.py` | 重写 | 添加完整 PLATFORM_SYSTEM_PROMPT，修正节点列表为 6 种，新增 history 支持，修正创作场景 |
| `frontend/src/components/panels/RightPanel.tsx` | 修复+增强 | 修复 LIST_NODES 过度匹配，添加 remark-gfm，携带对话历史 |
| `frontend/src/api/index.ts` | 同步更新 | PLATFORM_CONTEXT 与后端保持一致，补充工作流场景 |
| `frontend/src/assets/styles/globals.css` | 新增样式 | .markdown-body 暗色主题样式（表格、代码、blockquote 等） |
| `frontend/package.json` / `package-lock.json` | 依赖 | 新增 remark-gfm |

---

### 架构备注

- **知识同步问题**：系统提示目前为硬编码字符串，若后续新增节点类型需手动同步 3 处（`ai_assistant.py`、`api/index.ts`、`NodeAddMenu.tsx`）。建议后续将节点定义抽为单一配置文件，由构建脚本自动注入 prompt。
- **画布状态感知**（待做）：AI 目前无法感知当前画布有哪些节点、节点配置如何。可通过将 `canvas_state` 附在请求的 `context_data` 中实现，已预留字段。
