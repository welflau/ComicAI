"""
AI Assistant endpoint: 通用 AI 助手对话接口。
支持剧本建议、角色设计、提示词优化等。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from loguru import logger

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
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
            response = await client.messages.create(
                model=settings.ANTHROPIC_MODEL,
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
                max_tokens=1500
            )
            reply = response.content[0].text

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
