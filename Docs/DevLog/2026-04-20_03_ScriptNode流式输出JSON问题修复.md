# 2026-04-20_03 ScriptNode 流式输出 JSON 问题修复

**日期：** 2026-04-20  
**涉及文件：**
- `backend/app/api/v1/endpoints/ai_assistant.py`

---

## 问题现象

ScriptNode（文本节点）连接 ImageNode（含已上传图片），点击生成后，节点内容显示原始 JSON 而非正常文本：

```json
{
  "reply": "您好！我注意到您的请求中提到了「根据图片生成提示词」，但目前**没有收到任何图片** ...",
  "actions": []
}
```

DevTools 日志显示流式请求完整完成（`生成完成 — 325 字符，耗时 7.1s`），说明网络通信正常，图片也确实传到了后端。但 AI 回复的就是 `{"reply":..., "actions":[]}` 格式的 JSON 文本。

---

## 历史背景

同一问题在此前已修复两次：

| 日期 | 根因 | 修复文件 |
|------|------|---------|
| 2026-04-14 | `resolveImageToDataUrl` 对 `default://placeholder` 直接返回 null，图片未传出 | `imageStore.ts` |
| 2026-04-16 | `/uploads/...` 相对路径被原样发给 Anthropic，远端服务器无法访问 localhost | `imageStore.ts` |
| **2026-04-20** | **`STREAM_SYSTEM_PROMPTS` 继承了含 JSON 强制输出要求的 system prompt** | **`ai_assistant.py`** |

---

## 根因分析

`2026-04-18` 的 `Phase 2 AI structured output` commit（`3358665`）在 `PLATFORM_SYSTEM_PROMPT` 末尾加入了：

```
## 结构化输出（重要）
你必须始终以 JSON 格式回复，格式如下：
{"reply": "...", "actions": []}
```

这是为 `/ai/assistant`（聊天助手端点）设计的，目的是让 AI 助手能返回 canvas actions。

但 `/ai/stream`（ScriptNode 流式生成端点）的 `STREAM_SYSTEM_PROMPTS` 也以 `PLATFORM_SYSTEM_PROMPT` 为基础构建：

```python
STREAM_SYSTEM_PROMPTS = {
    "script": PLATFORM_SYSTEM_PROMPT + "\n\n## 当前任务：脚本生成\n...",
    ...
}
```

导致流式端点也继承了 JSON 格式要求，模型忠实地输出 `{"reply":..., "actions":[]}` —— 而这段 JSON 字符串被 SSE 直接 chunk 进 ScriptNode 的文本内容里。

---

## 修复方案

将 `PLATFORM_SYSTEM_PROMPT` 拆为两部分：

```python
# 不含 JSON 要求的基础 prompt（流式端点使用）
PLATFORM_BASE_PROMPT = """...""".strip()

# JSON 输出要求（仅聊天助手端点使用）
_JSON_OUTPUT_SECTION = """
---
## 结构化输出（重要）
你必须始终以 JSON 格式回复...
""".strip()

# 聊天助手完整 prompt = 基础 + JSON 要求
PLATFORM_SYSTEM_PROMPT = PLATFORM_BASE_PROMPT + "\n\n" + _JSON_OUTPUT_SECTION
```

`STREAM_SYSTEM_PROMPTS` 改为使用 `PLATFORM_BASE_PROMPT`：

```python
STREAM_SYSTEM_PROMPTS = {
    "script":     PLATFORM_BASE_PROMPT + "\n\n## 当前任务：脚本生成\n...",
    "storyboard": PLATFORM_BASE_PROMPT + "\n\n## 当前任务：分镜生成\n...",
    "general":    PLATFORM_BASE_PROMPT + "\n\n直接根据用户要求输出内容。",
}
```

`SYSTEM_PROMPTS`（供 `/ai/assistant` 使用）继续使用 `PLATFORM_SYSTEM_PROMPT`，行为不变。

---

## 端点职责对比

| 端点 | 用途 | System Prompt | 输出格式 |
|------|------|--------------|---------|
| `POST /ai/assistant` | 右侧 AI 聊天面板 | `PLATFORM_SYSTEM_PROMPT`（含 JSON 要求） | `{"reply":..., "actions":[]}` |
| `POST /ai/stream` | ScriptNode 流式文本生成 | `PLATFORM_BASE_PROMPT`（无 JSON 要求） | 纯文本流 |

---

## 改动文件

| 文件 | 改动内容 |
|------|---------|
| `backend/app/api/v1/endpoints/ai_assistant.py` | 将 `PLATFORM_SYSTEM_PROMPT` 拆为 `PLATFORM_BASE_PROMPT` + `_JSON_OUTPUT_SECTION`；`STREAM_SYSTEM_PROMPTS` 改用 `PLATFORM_BASE_PROMPT` |
