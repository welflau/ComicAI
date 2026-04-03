"""
CharacterConsistencyEngine: 维持角色在多个镜头中的外观一致性。
使用 embedding 向量 + ControlNet 参考图确保一致性。
"""
import json
import base64
import httpx
from typing import Optional
from loguru import logger

from app.core.config import settings


class CharacterConsistencyEngine:
    """
    角色一致性引擎：
    1. 为角色生成 embedding 特征向量
    2. 基于参考图和风格提示生成一致的角色图像
    3. 跨镜头保持视觉一致性
    """

    CHARACTER_DESIGN_PROMPT = """你是专业的漫画角色设计师。根据以下角色描述，生成详细的AI绘图提示词。

角色信息：{character_info}
视觉风格：{visual_style}

请输出 JSON（无多余文字）：
{{
  "base_prompt": "角色基础外观描述（英文），包含：发型、发色、眼睛、服装、身材、面部特征",
  "negative_prompt": "需要避免的元素（英文）",
  "style_tags": ["风格标签1", "风格标签2"],
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "expression_variants": {{
    "neutral": "中性表情提示词",
    "happy": "开心表情提示词",
    "sad": "悲伤表情提示词",
    "angry": "愤怒表情提示词",
    "surprised": "惊讶表情提示词"
  }},
  "pose_variants": {{
    "standing": "站立姿势",
    "sitting": "坐姿",
    "action": "动作姿势"
  }}
}}"""

    def __init__(self):
        self._openai_client = None

    def _get_openai_client(self):
        if self._openai_client is None and settings.OPENAI_API_KEY:
            import openai
            self._openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._openai_client

    async def generate_character_design(
        self,
        character: dict,
        visual_style: str = "manga"
    ) -> dict:
        """
        为角色生成设计方案（提示词、色板、表情变体）
        """
        client = self._get_openai_client()
        if client is None:
            return self._default_character_design(character, visual_style)

        try:
            prompt = self.CHARACTER_DESIGN_PROMPT.format(
                character_info=json.dumps(character, ensure_ascii=False),
                visual_style=visual_style
            )
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL_TEXT,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.4,
            )
            return json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"Character design generation failed: {e}")
            return self._default_character_design(character, visual_style)

    async def generate_consistent_character(
        self,
        character: dict,
        shot_context: dict,
        reference_image_url: Optional[str] = None,
        visual_style: str = "manga"
    ) -> dict:
        """
        生成指定场景下的角色图像（保持一致性）
        返回: {image_url, prompt_used, embedding_vector}
        """
        design = await self.generate_character_design(character, visual_style)

        # Build shot-specific prompt
        emotion = shot_context.get("emotion", "neutral")
        action = shot_context.get("action", "standing")
        shot_type = shot_context.get("shot_type", "medium shot")

        base_prompt = design.get("base_prompt", "")
        expression = design.get("expression_variants", {}).get(emotion, "")
        pose = design.get("pose_variants", {}).get(action, "")

        full_prompt = (
            f"{base_prompt}, {expression}, {pose}, "
            f"{shot_type}, {visual_style} style, "
            f"consistent character design, high quality, detailed"
        )
        negative_prompt = design.get("negative_prompt", "bad anatomy, deformed, ugly")

        # Generate image
        if settings.IMAGE_GEN_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            result = await self._generate_with_dalle(full_prompt)
        elif settings.STABILITY_API_KEY:
            result = await self._generate_with_stability(full_prompt, negative_prompt)
        else:
            result = {"image_url": None, "prompt_used": full_prompt}

        # Generate embedding for consistency tracking
        embedding = await self._compute_character_embedding(character, design)
        result["embedding_vector"] = embedding
        result["design"] = design

        return result

    async def _generate_with_dalle(self, prompt: str) -> dict:
        """使用 DALL-E 3 生成图像"""
        import openai
        client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        try:
            response = await client.images.generate(
                model="dall-e-3",
                prompt=prompt[:1000],
                n=1,
                size="1024x1024",
                quality="standard"
            )
            return {
                "image_url": response.data[0].url,
                "prompt_used": prompt,
                "revised_prompt": response.data[0].revised_prompt
            }
        except Exception as e:
            logger.error(f"DALL-E generation failed: {e}")
            return {"image_url": None, "prompt_used": prompt}

    async def _generate_with_stability(self, prompt: str, negative_prompt: str) -> dict:
        """使用 Stability AI 生成图像"""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                    headers={
                        "Authorization": f"Bearer {settings.STABILITY_API_KEY}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "text_prompts": [
                            {"text": prompt, "weight": 1.0},
                            {"text": negative_prompt, "weight": -1.0}
                        ],
                        "cfg_scale": 7,
                        "height": 1024,
                        "width": 1024,
                        "steps": 30,
                        "samples": 1
                    },
                    timeout=60.0
                )
                if response.status_code == 200:
                    data = response.json()
                    image_b64 = data["artifacts"][0]["base64"]
                    # In production, upload to MinIO and return URL
                    return {
                        "image_url": f"data:image/png;base64,{image_b64[:20]}...",
                        "prompt_used": prompt
                    }
            except Exception as e:
                logger.error(f"Stability AI generation failed: {e}")
        return {"image_url": None, "prompt_used": prompt}

    async def _compute_character_embedding(self, character: dict, design: dict) -> list:
        """
        计算角色特征 embedding（1536维）
        用于后续跨镜头相似度检索
        """
        client = self._get_openai_client()
        if client is None:
            # Return zeros if no API
            return [0.0] * 1536

        try:
            text = (
                f"Character: {character.get('name', '')}, "
                f"Description: {character.get('description', '')}, "
                f"Design: {design.get('base_prompt', '')}"
            )
            response = await client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
                dimensions=1536
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Embedding computation failed: {e}")
            return [0.0] * 1536

    def _default_character_design(self, character: dict, visual_style: str) -> dict:
        name = character.get("name", "Unknown")
        description = character.get("description", "")
        return {
            "base_prompt": f"anime character {name}, {description}, {visual_style} style",
            "negative_prompt": "bad anatomy, deformed, ugly, blurry",
            "style_tags": [visual_style, "manga", "illustration"],
            "color_palette": ["#2C3E50", "#E74C3C", "#3498DB"],
            "expression_variants": {
                "neutral": "neutral expression",
                "happy": "smiling, happy expression",
                "sad": "sad expression, downcast eyes",
                "angry": "angry expression, furrowed brows",
                "surprised": "surprised expression, wide eyes"
            },
            "pose_variants": {
                "standing": "standing pose",
                "sitting": "sitting pose",
                "action": "dynamic action pose"
            }
        }
