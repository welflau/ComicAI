"""
AI Assistant endpoint: 通用 AI 助手对话接口。
支持剧本建议、角色设计、提示词优化等。
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
from loguru import logger
import json

from app.core.security import get_current_user
from app.models.user import User
from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["ai-assistant"])


class AssistantRequest(BaseModel):
    message: str
    context_type: str = "general"  # general | script | character | storyboard | prompt
    context_data: Optional[dict] = None
    project_id: Optional[str] = None
    history: Optional[list[dict]] = None  # [{"role": "user"|"assistant", "content": "..."}]
    image_data_url: Optional[str] = None  # base64 data URL or http(s) URL for vision


class AssistantResponse(BaseModel):
    reply: str
    suggestions: list[str] = []
    generated_content: Optional[dict] = None
    actions: list[dict] = []  # canvas actions returned by AI


PLATFORM_BASE_PROMPT = """
# ComicFlow AI 智能助手 System Prompt

你是 ComicFlow Canvas 平台的智能创作助手。ComicFlow 是一个革命性的 AI 漫剧创作平台，集成了无限智能画布、节点工作流编辑器和全链路 AI 自动化能力。

## 产品核心

**产品愿景**: "让每个人都能像导演一样创作专业级漫剧"

**核心功能**:
- 无限智能画布 + 节点工作流系统（输入→处理→输出）
- 完整自动化管道：剧本 → AI 解析 → 分镜生成 → 图像绘制 → 配音合成 → 视频输出
- 实时多人协作、工作流模板库、素材市场

**目标用户**: 个人创作者、短视频制作者、漫画爱好者、内容团队、企业营销部门

---

## 节点系统详解

画布中共有 **6 种节点**，通过左上角「+」按钮添加：

| 节点名称 | 类型 ID | 说明 |
|---------|--------|------|
| 文本 | `libtv_script` | 输入剧本/描述文字，工作流起点 |
| 图片 | `libtv_image` | 上传或 AI 生成图像，含提示词面板 |
| 视频 | `libtv_video` | 上传或 AI 生成视频（支持 Kling/即梦模型） |
| 视频合成 (Beta) | `auto_edit` | 将多个视频/图片合成为完整视频 |
| 音频 | `tts` | 文字转语音配音 |
| 脚本 (Beta) | `libtv_script_gen` | AI 生成/编辑分镜脚本 |

**重要**：目前只有以上 6 种节点可用。不存在"剧本解析节点""角色设计节点""场景设计节点"等其他节点。

### 节点数据结构
每个节点包含：id、type、label（中文）、category（input/process/output）、position {x,y}、config（节点配置）、status（idle/running/completed/error）、progress（0-100%）、output（执行结果）

---

## 画布操作与工作流设计

### 核心操作
- **添加节点** - 双击空白画布或从左侧节点库拖拽
- **连接节点** - 从源节点的 output handle 拖至目标节点的 input handle
- **移动节点** - 拖拽节点改变位置（自动网格对齐）
- **多选** - Shift/Ctrl+Click 选中多个节点
- **删除** - Delete 键删除选中节点（自动删除相关连线）
- **缩放平移** - 鼠标滚轮缩放，右键/中键拖拽平移

#### 节点连接方式
- 从源节点右侧的 **output handle**（小圆点）拖拽到目标节点左侧的 **input handle**
- 一个节点可连接多个下游节点（并行分支）
- 连线建立后，上游节点的输出数据会自动传递给下游节点

### 工作流模板（双击空白画布时显示）
1. **故事脚本生成** - 文本节点 → 脚本节点（描述剧情，AI 生成完整分镜脚本）
2. **图文转视频** - 文本节点 → 图片节点 → 视频节点（文字描述→生成图像→生成视频）
3. **多镜头合成** - 多个视频节点 → 视频合成节点（将多段视频/图片剪辑合成）
4. **配音短片** - 文本节点 → 图片节点 + 音频节点（生成画面和配音，再合成）

### 工作流最佳实践
1. **从文本节点出发** - 用文字描述你想要的内容，作为工作流起点
2. **按处理链路连接** - 文本 → 图片 → 视频，数据逐步加工
3. **并行生成多帧** - 添加多个图片/视频节点并行生成，最后汇入视频合成节点
4. **注意节点顺序** - 上游节点执行完才能触发下游节点
5. **随时预览结果** - 每个节点都可以独立执行查看输出

---

## AI 助手画布操作能力

你可以识别以下用户意图（前端本地执行）：

| Intent | 触发模式 | 执行操作 |
|--------|---------|---------|
| ADD_NODE | 创建/添加/新建 + 节点类型 | 添加指定节点到画布 |
| DELETE_SELECTED | 删除/移除 + 选中/这个/当前 | 删除当前选中节点 |
| CLEAR_CANVAS | 清空/全部删除/清除 | 删除所有节点 |
| LIST_NODES | 现在有哪些/列出/告诉我 + 节点 | 返回当前节点列表 |

节点类型关键词映射（用于画布操作 Intent）：
- '图片'/'图像' → libtv_image
- '视频' → libtv_video（注意：视频合成=auto_edit）
- '文本'/'文字'/'剧本'/'脚本文字' → libtv_script
- '脚本'/'分镜脚本' → libtv_script_gen
- '音频'/'配音'/'语音' → tts
- '视频合成'/'合成' → auto_edit

---

## 常见创作场景（仅使用现有 6 种节点）

### 场景 1: 图文转视频（最常用）
1. **文本节点** → 写下场景描述或角色描述
2. **图片节点** → 根据描述用 AI 生成图像（配置提示词）
3. **视频节点** → 将图片转为视频片段（Kling/即梦模型）
4. 重复步骤 2-3 生成多个镜头
5. **视频合成节点** → 将多段视频拼接为完整短片

### 场景 2: 带配音的短视频
1. **文本节点** → 写旁白/台词文本
2. **音频节点（TTS）** → 将文字转为语音配音
3. **图片节点** → 生成对应画面
4. **视频节点** → 图片生成视频
5. **视频合成节点** → 合并视频+音频

### 场景 3: AI 脚本创作
1. **文本节点** → 写简单的故事概念或主题
2. **脚本节点（Beta）** → AI 根据概念生成详细分镜脚本
3. **图片节点 ×N** → 根据每个分镜生成画面
4. **视频节点 ×N** → 将画面转为视频
5. **视频合成节点** → 合成最终成片

---

## 生成模型
- 文本: OpenAI GPT-4o / Anthropic Claude 3.5
- 图像: DALL-E 3 / Stability AI SDXL
- 视频: Replicate SVD / Runway Gen-3 / Kling / Jimeng
- 配音: Azure Text-to-Speech / OpenAI TTS

## 配额限制
- 免费版: 每日 10 分钟生成
- 专业版: 每日 120 分钟生成
- 团队版: 每用户每日 60 分钟

---

## 你的角色与职责

1. **画布操作助手** - 识别用户自然语言意图，执行画布操作
2. **创作建议顾问** - 针对剧本、角色、分镜、提示词等提供专业建议
3. **工作流规划师** - 帮助用户设计和优化工作流，推荐模板和节点组合
4. **问题解决者** - 回答用户关于平台的所有问题

## 对话风格
- **热情友好** - 使用 emoji 和鼓励性语言
- **专业准确** - 提供具体、可操作的建议
- **清晰明了** - 用简短的句子和列表组织信息
- **中文优先** - 响应用户使用的语言

**你是创意助手，不是强制执行者。鼓励用户探索、尝试、犯错和学习。每个创作者的风格和需求都不同，灵活地提供建议而不是单一答案。**
""".strip()

# Full system prompt for AI Assistant chat (adds JSON output requirement)
_JSON_OUTPUT_SECTION = """

---

## 结构化输出（重要）

**你必须始终以 JSON 格式回复**，格式如下：

```json
{
  "reply": "给用户看的自然语言回复（支持 Markdown）",
  "actions": []
}
```

### actions 字段说明

当用户请求操作画布时，在 `actions` 数组中填入操作指令。否则 `actions` 留空数组 `[]`。

支持的 action 类型：

#### ADD_NODE — 添加单个节点
```json
{
  "type": "ADD_NODE",
  "nodeType": "libtv_image",
  "nodeLabel": "图片节点"
}
```
nodeType 必须是以下 6 种之一：`libtv_script` | `libtv_image` | `libtv_video` | `auto_edit` | `tts` | `libtv_script_gen`

#### ADD_WORKFLOW — 添加多节点工作流（自动连线）
```json
{
  "type": "ADD_WORKFLOW",
  "nodes": [
    { "nodeType": "libtv_script", "nodeLabel": "文本" },
    { "nodeType": "libtv_image", "nodeLabel": "图片" },
    { "nodeType": "libtv_video", "nodeLabel": "视频" }
  ],
  "edges": [
    { "fromIdx": 0, "toIdx": 1 },
    { "fromIdx": 1, "toIdx": 2 }
  ]
}
```

#### DELETE_SELECTED — 删除当前选中的节点
```json
{ "type": "DELETE_SELECTED" }
```

#### CLEAR_CANVAS — 清空整个画布
```json
{ "type": "CLEAR_CANVAS" }
```

### 判断何时输出 actions

- 用户说"帮我创建/添加 X 节点" → ADD_NODE
- 用户说"帮我搭建 X 工作流" 或 "X 怎么做，帮我建一下" → ADD_WORKFLOW（建议完整链路）
- 用户说"删除选中节点"/"删掉这个" → DELETE_SELECTED
- 用户说"清空画布" → CLEAR_CANVAS
- 纯咨询、建议、问答类问题 → actions 为 `[]`

### 注意事项
- reply 字段**必须是自然语言**，不要在 reply 里包含 JSON
- 整个响应**只能是合法 JSON**，不要有 JSON 之外的任何文字
- 不要用 ```json 代码块包裹，直接输出裸 JSON
- 提及具体节点 ID 时，**用反引号包裹**，例如 `libtv_image_123456`，方便用户点击定位
""".strip()

# Combine for the AI chat assistant (JSON output required)
PLATFORM_SYSTEM_PROMPT = PLATFORM_BASE_PROMPT + "\n\n" + _JSON_OUTPUT_SECTION


SYSTEM_PROMPTS = {
    "general": PLATFORM_SYSTEM_PROMPT,
    "script": PLATFORM_SYSTEM_PROMPT + "\n\n## 当前模式：剧本顾问\n你现在专注于帮助用户改进剧本结构、对白和情节。提供具体、可操作的剧本建议，包括故事弧、人物动机、场景节奏等。",
    "character": PLATFORM_SYSTEM_PROMPT + "\n\n## 当前模式：角色设计师\n你现在专注于帮助用户设计角色外观、性格、背景故事和视觉一致性。给出具体的角色描述建议和提示词优化方向。",
    "storyboard": PLATFORM_SYSTEM_PROMPT + "\n\n## 当前模式：分镜师\n你现在专注于帮助用户优化分镜构图、镜头语言和视觉叙事。从景别、运镜、转场等维度提供专业分析。",
    "prompt": PLATFORM_SYSTEM_PROMPT + "\n\n## 当前模式：提示词专家\n你现在专注于优化 AI 图像/视频生成提示词。将用户的中文描述转化为高质量英文提示词，并给出正向/负向提示词建议。",
}


@router.post("/assistant", response_model=AssistantResponse)
async def ai_assistant(
    request: AssistantRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user)
):
    # Read client-supplied keys from headers (frontend settings)
    client_anthropic_key  = http_request.headers.get("X-Anthropic-Key") or None
    client_anthropic_base = http_request.headers.get("X-Anthropic-Base") or None
    client_openai_key     = http_request.headers.get("X-OpenAI-Key") or None

    eff_anthropic_key = client_anthropic_key or settings.ANTHROPIC_API_KEY
    eff_openai_key    = client_openai_key    or settings.OPENAI_API_KEY

    if not eff_anthropic_key and not eff_openai_key:
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Please set API keys in system settings."
        )

    system_prompt = SYSTEM_PROMPTS.get(request.context_type, SYSTEM_PROMPTS["general"])

    # Build context
    user_message = request.message
    if request.context_data:
        ctx = request.context_data
        node_count = ctx.get("nodeCount", 0)
        nodes = ctx.get("nodes", [])
        selected_count = ctx.get("selectedCount", 0)
        if nodes:
            node_lines = []
            for n in nodes:
                line = f"  - [{n.get('type','')}] {n.get('label', n.get('id',''))}  id={n.get('id','')}"
                content = n.get('content', {})
                if content:
                    content_str = "，".join(f"{k}={v}" for k, v in content.items())
                    line += f"  内容：{content_str}"
                elif n.get('isEmpty', True):
                    line += "  (空节点)"
                node_lines.append(line)
            node_list = "\n".join(node_lines)
            canvas_desc = f"当前画布共 {node_count} 个节点，选中 {selected_count} 个：\n{node_list}"
        else:
            canvas_desc = "当前画布为空（0个节点）"
        user_message = f"【画布状态】{canvas_desc}\n\n【用户消息】{request.message}"

    # Build messages list with history
    history_messages = []
    if request.history:
        for h in request.history[-10:]:  # keep last 10 turns to avoid token overflow
            role = h.get("role", "user")
            content = h.get("content", "")
            if role in ("user", "assistant") and content:
                history_messages.append({"role": role, "content": content})

    try:
        if eff_openai_key:
            import openai
            client = openai.AsyncOpenAI(api_key=eff_openai_key)
            messages = [{"role": "system", "content": system_prompt}]
            messages.extend(history_messages)
            messages.append({"role": "user", "content": user_message})
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL_TEXT,
                messages=messages,
                temperature=0.7,
                max_tokens=1500
            )
            reply = response.choices[0].message.content

        else:
            # Use httpx directly to support custom proxy endpoints
            import httpx
            base_url = (client_anthropic_base or settings.ANTHROPIC_BASE_URL or "https://api.anthropic.com").rstrip("/")
            if base_url and not base_url.startswith("http"):
                base_url = "https://api.anthropic.com"
            endpoint = f"{base_url}/v1/messages"
            headers = {
                "x-api-key": eff_anthropic_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            # Build Anthropic messages (no system role in messages array)
            anthropic_messages = list(history_messages)
            # Build user content: image + text if image provided
            if request.image_data_url:
                img_url = request.image_data_url
                if img_url.startswith("data:"):
                    media_type = img_url.split(";")[0].split(":")[1]
                    image_data = img_url.split(",")[1]
                    image_block = {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": image_data},
                    }
                else:
                    image_block = {
                        "type": "image",
                        "source": {"type": "url", "url": img_url},
                    }
                user_content = [image_block, {"type": "text", "text": user_message}]
            else:
                user_content = user_message
            anthropic_messages.append({"role": "user", "content": user_content})
            payload = {
                "model": settings.ANTHROPIC_MODEL,
                "system": system_prompt,
                "messages": anthropic_messages,
                "max_tokens": 1500,
            }
            async with httpx.AsyncClient(timeout=60) as http:
                res = await http.post(endpoint, headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
            reply = data["content"][0]["text"]

        # Parse structured JSON response { reply, actions }
        import re
        actions: list[dict] = []
        try:
            clean = reply.strip()
            # Strip markdown code fences if present
            if clean.startswith("```"):
                clean = re.sub(r'^```[a-zA-Z]*\n?', '', clean)
                clean = re.sub(r'\n?```$', '', clean.strip()).strip()
            parsed = json.loads(clean)
            reply = parsed.get("reply", reply)
            actions = parsed.get("actions", [])
        except (json.JSONDecodeError, AttributeError):
            # AI didn't return valid JSON — treat full text as reply, no actions
            pass

        # Extract suggestions if present
        suggestions = []
        if "建议" in reply or "suggestion" in reply.lower():
            matches = re.findall(r'[•·-]\s*(.+)', reply)
            suggestions = matches[:5]

        return AssistantResponse(reply=reply, suggestions=suggestions, actions=actions)

    except Exception as e:
        logger.error(f"AI assistant error: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")


@router.post("/optimize-prompt")
async def optimize_prompt(
    data: dict,
    current_user: User = Depends(get_current_user)
):
    """优化 AI 绘图提示词"""
    original_prompt = data.get("prompt", "")
    style = data.get("style", "manga")
    context = data.get("context", "")

    if not settings.OPENAI_API_KEY:
        return {"optimized_prompt": original_prompt, "negative_prompt": "bad anatomy, deformed"}

    import openai
    client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    system = """你是专业的 AI 绘图提示词工程师。
请将用户提供的中文描述优化为高质量的英文提示词，适用于 Stable Diffusion / DALL-E。
输出 JSON 格式：{"optimized_prompt": "...", "negative_prompt": "...", "tips": "优化说明"}"""

    user_msg = f"原始描述：{original_prompt}\n风格：{style}\n场景上下文：{context}"

    response = await client.chat.completions.create(
        model=settings.OPENAI_MODEL_TEXT,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg}
        ],
        response_format={"type": "json_object"},
        temperature=0.4
    )

    import json
    return json.loads(response.choices[0].message.content)


# ─── Streaming endpoint ──────────────────────────────────────────────────────

class StreamRequest(BaseModel):
    prompt: str
    context_type: str = "script"  # script | storyboard
    model: Optional[str] = None   # client-side model hint (informational)
    system_override: Optional[str] = None
    image_data_url: Optional[str] = None  # base64 data URL or http(s) URL for vision


STREAM_SYSTEM_PROMPTS = {
    "script": (
        PLATFORM_BASE_PROMPT + "\n\n## 当前任务：脚本生成\n"
        "根据用户的要求，直接输出完整的故事脚本内容。"
        "不需要解释，不需要前言，直接用中文写出脚本正文。"
        "文笔流畅，富有画面感，场景描写细腻。"
    ),
    "storyboard": (
        PLATFORM_BASE_PROMPT + "\n\n## 当前任务：分镜生成\n"
        "根据提供的剧本或描述，直接输出分镜脚本。"
        "格式：按镜头编号，每个镜头包含景别、画面描述、对话/旁白（如有）。"
        "直接输出内容，不需要额外解释。"
    ),
    "general": (
        PLATFORM_BASE_PROMPT + "\n\n直接根据用户要求输出内容。"
    ),
}


async def _stream_anthropic(system: str, prompt: str, model: str,
                            api_key: Optional[str] = None,
                            base_url: Optional[str] = None,
                            image_data_url: Optional[str] = None):
    """Stream from Anthropic API using httpx."""
    import httpx
    api_key = api_key or settings.ANTHROPIC_API_KEY
    # Discard relative paths (e.g. "/api/anthropic" sent by frontend as a Vite proxy path)
    if base_url and not base_url.startswith("http"):
        base_url = None
    base_url = (base_url or settings.ANTHROPIC_BASE_URL or "https://api.anthropic.com").rstrip("/")
    endpoint = f"{base_url}/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "accept": "text/event-stream",
    }

    # Build message content: image + text if image provided
    if image_data_url:
        if image_data_url.startswith("data:"):
            media_type = image_data_url.split(";")[0].split(":")[1]
            image_data = image_data_url.split(",")[1]
            image_block = {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": image_data},
            }
        else:
            image_block = {
                "type": "image",
                "source": {"type": "url", "url": image_data_url},
            }
        user_content = [image_block, {"type": "text", "text": prompt}]
    else:
        user_content = prompt

    payload = {
        "model": model or settings.ANTHROPIC_MODEL,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
        "max_tokens": 2048,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=120) as http:
        async with http.stream("POST", endpoint, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str or data_str == "[DONE]":
                    continue
                try:
                    ev = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                if ev.get("type") == "content_block_delta":
                    delta = ev.get("delta", {})
                    if delta.get("type") == "text_delta":
                        yield delta.get("text", "")


async def _stream_openai(system: str, prompt: str, model: str,
                         api_key: Optional[str] = None,
                         base_url: Optional[str] = None):
    """Stream from OpenAI API using httpx."""
    import httpx
    api_key = api_key or settings.OPENAI_API_KEY
    # Discard relative paths (e.g. "/api/openai" sent by frontend as a Vite proxy path)
    if base_url and not base_url.startswith("http"):
        base_url = None
    base_url = (base_url or "https://api.openai.com").rstrip("/")
    endpoint = f"{base_url}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or settings.OPENAI_MODEL_TEXT,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 2048,
        "stream": True,
    }
    async with httpx.AsyncClient(timeout=120) as http:
        async with http.stream("POST", endpoint, headers=headers, json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str or data_str == "[DONE]":
                    continue
                try:
                    ev = json.loads(data_str)
                except json.JSONDecodeError:
                    continue
                delta = ev.get("choices", [{}])[0].get("delta", {})
                if "content" in delta and delta["content"]:
                    yield delta["content"]


@router.post("/stream")
async def ai_stream(
    request: StreamRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
):
    """SSE streaming endpoint — yields text/event-stream chunks.

    Supports client-supplied API keys via request headers:
      X-Anthropic-Key   — Anthropic API key from frontend settings
      X-Anthropic-Base  — Anthropic base URL (optional)
      X-OpenAI-Key      — OpenAI API key from frontend settings
      X-OpenAI-Base     — OpenAI base URL (optional)
    Client-supplied keys take priority over server .env values.
    """
    # Read client-supplied keys from headers (frontend settings)
    client_anthropic_key  = http_request.headers.get("X-Anthropic-Key") or None
    client_anthropic_base = http_request.headers.get("X-Anthropic-Base") or None
    client_openai_key     = http_request.headers.get("X-OpenAI-Key") or None
    client_openai_base    = http_request.headers.get("X-OpenAI-Base") or None

    # Effective keys: client > env
    eff_anthropic_key = client_anthropic_key or settings.ANTHROPIC_API_KEY
    eff_openai_key    = client_openai_key    or settings.OPENAI_API_KEY

    if not eff_anthropic_key and not eff_openai_key:
        raise HTTPException(status_code=503, detail="AI service not configured. Please set API keys in system settings.")

    system = request.system_override or STREAM_SYSTEM_PROMPTS.get(
        request.context_type, STREAM_SYSTEM_PROMPTS["general"]
    )

    async def event_gen():
        try:
            if eff_anthropic_key:
                gen = _stream_anthropic(
                    system, request.prompt, request.model or "",
                    api_key=eff_anthropic_key,
                    base_url=client_anthropic_base,
                    image_data_url=request.image_data_url,
                )
            else:
                gen = _stream_openai(
                    system, request.prompt, request.model or "",
                    api_key=eff_openai_key,
                    base_url=client_openai_base,
                )

            async for chunk in gen:
                if await http_request.is_disconnected():
                    break
                payload = json.dumps({"text": chunk}, ensure_ascii=False)
                yield f"data: {payload}\n\n"

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
