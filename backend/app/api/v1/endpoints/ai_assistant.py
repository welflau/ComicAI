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


class AssistantResponse(BaseModel):
    reply: str
    suggestions: list[str] = []
    generated_content: Optional[dict] = None


SYSTEM_PROMPTS = {
    "general": "你是 ComicFlow AI 漫剧创作平台的智能助手，专精于漫画、动漫、剧本创作。",
    "script": "你是专业的漫画剧本顾问。请帮助用户改进剧本结构、对白和情节。提供具体、可操作的建议。",
    "character": "你是专业的漫画角色设计顾问。请帮助用户设计角色外观、性格和背景故事。",
    "storyboard": "你是专业的漫画分镜师。请帮助用户优化分镜构图、镜头语言和视觉叙事。",
    "prompt": "你是 AI 绘图提示词专家。请帮助用户优化图像生成提示词，提升生成质量。",
}


@router.post("/assistant", response_model=AssistantResponse)
async def ai_assistant(
    request: AssistantRequest,
    current_user: User = Depends(get_current_user)
):
    if not settings.OPENAI_API_KEY and not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI service not configured. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY."
        )

    system_prompt = SYSTEM_PROMPTS.get(request.context_type, SYSTEM_PROMPTS["general"])

    # Build context
    user_message = request.message
    if request.context_data:
        import json
        user_message = f"上下文数据：\n{json.dumps(request.context_data, ensure_ascii=False)}\n\n用户问题：{request.message}"

    try:
        if settings.OPENAI_API_KEY:
            import openai
            client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL_TEXT,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.7,
                max_tokens=1500
            )
            reply = response.choices[0].message.content

        else:
            # Use httpx directly to support custom proxy endpoints
            import httpx
            api_key = settings.ANTHROPIC_API_KEY
            base_url = (settings.ANTHROPIC_BASE_URL or "https://api.anthropic.com").rstrip("/")
            # If base_url already ends with /anthropic, append /v1/messages directly
            endpoint = f"{base_url}/v1/messages"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            }
            payload = {
                "model": settings.ANTHROPIC_MODEL,
                "system": system_prompt,
                "messages": [{"role": "user", "content": user_message}],
                "max_tokens": 1500,
            }
            async with httpx.AsyncClient(timeout=60) as http:
                res = await http.post(endpoint, headers=headers, json=payload)
                res.raise_for_status()
                data = res.json()
            reply = data["content"][0]["text"]

        # Extract suggestions if present
        suggestions = []
        if "建议" in reply or "suggestion" in reply.lower():
            import re
            matches = re.findall(r'[•·-]\s*(.+)', reply)
            suggestions = matches[:5]

        return AssistantResponse(reply=reply, suggestions=suggestions)

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


STREAM_SYSTEM_PROMPTS = {
    "script": (
        "你是专业的影视剧本创作者。根据用户的要求，直接输出完整的故事脚本内容。"
        "不需要解释，不需要前言，直接用中文写出脚本正文。"
        "文笔流畅，富有画面感，场景描写细腻。"
    ),
    "storyboard": (
        "你是专业的分镜脚本创作者。根据提供的剧本或描述，直接输出分镜脚本。"
        "格式：按镜头编号，每个镜头包含景别、画面描述、对话/旁白（如有）。"
        "直接输出内容，不需要额外解释。"
    ),
    "general": (
        "你是专业的影视内容创作助手，擅长剧本、分镜、角色设计。直接根据用户要求输出内容。"
    ),
}


async def _stream_anthropic(system: str, prompt: str, model: str,
                            api_key: Optional[str] = None,
                            base_url: Optional[str] = None):
    """Stream from Anthropic API using httpx."""
    import httpx
    api_key = api_key or settings.ANTHROPIC_API_KEY
    base_url = (base_url or settings.ANTHROPIC_BASE_URL or "https://api.anthropic.com").rstrip("/")
    endpoint = f"{base_url}/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "accept": "text/event-stream",
    }
    payload = {
        "model": model or settings.ANTHROPIC_MODEL,
        "system": system,
        "messages": [{"role": "user", "content": prompt}],
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
