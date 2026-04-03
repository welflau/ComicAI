"""
ImageGenerationService: 统一的图像生成服务接口。
支持 OpenAI DALL-E 3、Stability AI SDXL、本地 ComfyUI/A1111。
"""
import uuid
import httpx
import base64
from io import BytesIO
from typing import Optional
from loguru import logger

from app.core.config import settings
from app.services.storage import StorageService


class ImageGenerationService:

    def __init__(self):
        self.storage = StorageService()

    async def generate_image(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        style: str = "manga",
        reference_image_url: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> dict:
        """
        生成图像，自动选择可用的供应商。
        返回: {url, width, height, prompt_used, provider}
        """
        # Enhance prompt with style
        enhanced_prompt = self._enhance_prompt(prompt, style)

        provider = settings.IMAGE_GEN_PROVIDER

        if provider == "openai" and settings.OPENAI_API_KEY:
            result = await self._dalle_generate(enhanced_prompt, width, height)
        elif provider == "stability" and settings.STABILITY_API_KEY:
            result = await self._stability_generate(enhanced_prompt, negative_prompt, width, height)
        elif provider == "sdxl_local":
            result = await self._local_sdxl_generate(enhanced_prompt, negative_prompt, width, height)
        else:
            # Placeholder when no provider configured
            result = {
                "url": None,
                "width": width,
                "height": height,
                "provider": "none",
                "prompt_used": enhanced_prompt
            }

        # Upload to object storage if we got image data
        if result.get("image_data") and project_id:
            url = await self.storage.upload_image(
                result["image_data"],
                f"projects/{project_id}/images/{uuid.uuid4()}.png"
            )
            result["url"] = url
            del result["image_data"]

        return result

    def _enhance_prompt(self, prompt: str, style: str) -> str:
        style_suffixes = {
            "manga": "manga style, black and white comic, detailed linework, professional illustration",
            "comic": "comic book style, vibrant colors, bold outlines, dynamic composition",
            "anime": "anime style, cel shading, vibrant, detailed, studio quality",
            "webtoon": "webtoon style, clean lines, bright colors, Korean manhwa style",
            "realistic": "realistic, photorealistic, detailed, high quality render",
            "watercolor": "watercolor illustration, soft colors, artistic brush strokes"
        }
        suffix = style_suffixes.get(style, "high quality illustration, detailed")
        return f"{prompt}, {suffix}"

    async def _dalle_generate(self, prompt: str, width: int, height: int) -> dict:
        import openai
        client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

        # DALL-E 3 supports: 1024x1024, 1792x1024, 1024x1792
        if width > height:
            size = "1792x1024"
        elif height > width:
            size = "1024x1792"
        else:
            size = "1024x1024"

        try:
            response = await client.images.generate(
                model="dall-e-3",
                prompt=prompt[:4000],
                n=1,
                size=size,
                quality="standard",
                response_format="url"
            )
            return {
                "url": response.data[0].url,
                "width": width,
                "height": height,
                "provider": "dalle3",
                "prompt_used": prompt,
                "revised_prompt": response.data[0].revised_prompt
            }
        except Exception as e:
            logger.error(f"DALL-E generation failed: {e}")
            raise

    async def _stability_generate(
        self, prompt: str, negative_prompt: str, width: int, height: int
    ) -> dict:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
                headers={"Authorization": f"Bearer {settings.STABILITY_API_KEY}"},
                json={
                    "text_prompts": [
                        {"text": prompt, "weight": 1.0},
                        {"text": negative_prompt or "bad anatomy, deformed", "weight": -1.0}
                    ],
                    "cfg_scale": 7,
                    "height": min(height, 1024),
                    "width": min(width, 1024),
                    "steps": 30,
                    "samples": 1
                }
            )
            response.raise_for_status()
            data = response.json()
            image_b64 = data["artifacts"][0]["base64"]
            return {
                "image_data": base64.b64decode(image_b64),
                "width": width,
                "height": height,
                "provider": "stability",
                "prompt_used": prompt
            }

    async def _local_sdxl_generate(
        self, prompt: str, negative_prompt: str, width: int, height: int
    ) -> dict:
        """调用本地 ComfyUI / Automatic1111 API"""
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{settings.SDXL_API_URL}/sdapi/v1/txt2img",
                json={
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "width": width,
                    "height": height,
                    "steps": 25,
                    "cfg_scale": 7,
                    "sampler_name": "DPM++ 2M Karras"
                }
            )
            response.raise_for_status()
            data = response.json()
            image_b64 = data["images"][0]
            return {
                "image_data": base64.b64decode(image_b64),
                "width": width,
                "height": height,
                "provider": "sdxl_local",
                "prompt_used": prompt
            }
