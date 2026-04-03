"""
VideoGenerationService: 图生视频，将静态图像转为动态镜头。
支持 Stable Video Diffusion (via Replicate) 和 Runway。
"""
import httpx
import asyncio
from typing import Optional
from loguru import logger

from app.core.config import settings
from app.services.storage import StorageService


class VideoGenerationService:

    def __init__(self):
        self.storage = StorageService()

    async def generate_video_from_image(
        self,
        image_url: str,
        duration_seconds: float = 3.0,
        motion_intensity: float = 0.5,
        camera_movement: str = "static",
        project_id: Optional[str] = None
    ) -> dict:
        """
        将图像转为短视频片段。
        返回: {video_url, duration, provider}
        """
        provider = settings.VIDEO_GEN_PROVIDER

        if provider == "replicate" and settings.REPLICATE_API_KEY:
            result = await self._replicate_svd(image_url, duration_seconds, motion_intensity)
        elif provider == "runway":
            result = await self._runway_generate(image_url, duration_seconds, camera_movement)
        else:
            result = {
                "video_url": None,
                "duration": duration_seconds,
                "provider": "none",
                "message": "No video generation provider configured"
            }

        return result

    async def _replicate_svd(
        self, image_url: str, duration: float, motion_intensity: float
    ) -> dict:
        """使用 Replicate 的 Stable Video Diffusion"""
        async with httpx.AsyncClient(timeout=180.0) as client:
            # Create prediction
            create_resp = await client.post(
                "https://api.replicate.com/v1/predictions",
                headers={
                    "Authorization": f"Token {settings.REPLICATE_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "version": "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
                    "input": {
                        "input_image": image_url,
                        "frames_per_second": 8,
                        "num_frames": int(duration * 8),
                        "motion_bucket_id": int(motion_intensity * 255),
                        "decoding_t": 14,
                        "sizing_strategy": "preserve_aspect_ratio"
                    }
                }
            )
            create_resp.raise_for_status()
            prediction = create_resp.json()
            prediction_id = prediction["id"]

            # Poll for completion
            for _ in range(60):
                await asyncio.sleep(3)
                poll_resp = await client.get(
                    f"https://api.replicate.com/v1/predictions/{prediction_id}",
                    headers={"Authorization": f"Token {settings.REPLICATE_API_KEY}"}
                )
                data = poll_resp.json()
                status = data.get("status")

                if status == "succeeded":
                    output = data.get("output", [])
                    video_url = output[0] if output else None
                    return {
                        "video_url": video_url,
                        "duration": duration,
                        "provider": "replicate_svd"
                    }
                elif status in ("failed", "canceled"):
                    raise Exception(f"Replicate prediction failed: {data.get('error')}")

            raise TimeoutError("Video generation timed out")

    async def _runway_generate(
        self, image_url: str, duration: float, camera_movement: str
    ) -> dict:
        """使用 Runway Gen-3 生成视频（占位，等待 SDK 稳定）"""
        # Runway API v2 placeholder
        motion_prompt_map = {
            "static": "subtle ambient motion",
            "pan_left": "slow camera pan to the left",
            "pan_right": "slow camera pan to the right",
            "zoom_in": "slow zoom in",
            "zoom_out": "slow zoom out",
            "tilt_up": "slow tilt up",
            "tilt_down": "slow tilt down"
        }
        motion_prompt = motion_prompt_map.get(camera_movement, "subtle ambient motion")

        async with httpx.AsyncClient(timeout=180.0) as client:
            # This is a placeholder - update with actual Runway API when available
            logger.info(f"Runway generation requested: {motion_prompt}")
            return {
                "video_url": None,
                "duration": duration,
                "provider": "runway",
                "message": "Runway integration pending"
            }
