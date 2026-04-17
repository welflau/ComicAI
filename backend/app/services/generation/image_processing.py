"""Image processing service"""
import io, uuid, httpx
from typing import Optional, List
from PIL import Image, ImageEnhance
from loguru import logger
from app.services.storage import StorageService

class ImageProcessingService:
    def __init__(self):
        self.storage = StorageService()

    async def _download_image(self, image_url: str):
        if image_url.startswith("idb://"): raise ValueError("Cannot process IndexedDB URLs")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content))

    async def _upload_processed_image(self, image, filename: str, pid: str) -> str:
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        buf.seek(0)
        return await self.storage.upload_image(buf.getvalue(), f"projects/{pid}/images/{filename}")

    async def generate_multi_angles(self, image_url: str, angles: List[str], style=None, project_id=None) -> List[str]:
        image = await self._download_image(image_url)
        results = []
        transforms = {
            "front": lambda i: i, "前": lambda i: i,
            "left": lambda i: i.transpose(Image.FLIP_LEFT_RIGHT), "左侧": lambda i: i.transpose(Image.FLIP_LEFT_RIGHT),
            "right": lambda i: i, "右侧": lambda i: i,
            "top": lambda i: i.rotate(-15, expand=True), "俯视": lambda i: i.rotate(-15, expand=True),
            "bottom": lambda i: i.rotate(15, expand=True), "仰视": lambda i: i.rotate(15, expand=True),
        }
        for i, angle in enumerate(angles):
            t = transforms.get(angle, lambda x: x)
            proc = t(image.copy())
            url = await self._upload_processed_image(proc, f"angle-{i}-{uuid.uuid4()}.png", project_id or "local")
            results.append(url)
        return results

    async def apply_lighting(self, image_url: str, lighting_type: str, intensity: float=1.0, project_id=None) -> str:
        image = await self._download_image(image_url)
        if image.mode != "RGBA": image = image.convert("RGBA")
        if lighting_type == "warm":
            image = ImageEnhance.Brightness(image).enhance(1.1*intensity)
            image = ImageEnhance.Contrast(image).enhance(1.05*intensity)
        elif lighting_type == "cool":
            image = ImageEnhance.Brightness(image).enhance(0.9*intensity)
            image = ImageEnhance.Contrast(image).enhance(1.15*intensity)
        elif lighting_type == "dramatic":
            image = ImageEnhance.Brightness(image).enhance(0.85*intensity)
            image = ImageEnhance.Contrast(image).enhance(1.3*intensity)
        elif lighting_type == "soft":
            image = ImageEnhance.Brightness(image).enhance(1.05*intensity)
            image = ImageEnhance.Contrast(image).enhance(0.85*intensity)
        elif lighting_type == "studio":
            image = ImageEnhance.Brightness(image).enhance(1.0*intensity)
            image = ImageEnhance.Contrast(image).enhance(1.1*intensity)
        if image.mode == "RGBA": image = image.convert("RGB")
        return await self._upload_processed_image(image, f"lighting-{lighting_type}-{uuid.uuid4()}.png", project_id or "local")

    async def crop_grid_9(self, image_url: str, auto_detect=True, project_id=None) -> List[str]:
        image = await self._download_image(image_url)
        w, h = image.size
        cw, ch = w // 3, h // 3
        results = []
        for r in range(3):
            for c in range(3):
                l, t = c * cw, r * ch
                r_pos = l + cw if c < 2 else w
                b_pos = t + ch if r < 2 else h
                crop = image.crop((l, t, r_pos, b_pos))
                url = await self._upload_processed_image(crop, f"grid9-{r}-{c}-{uuid.uuid4()}.png", project_id or "local")
                results.append(url)
        return results

    async def upscale_hd(self, image_url: str, scale: int=2, model: str="realesrgan", project_id=None) -> str:
        image = await self._download_image(image_url)
        w, h = image.size
        nw, nh = w * scale, h * scale
        up = image.resize((nw, nh), Image.Resampling.LANCZOS)
        up = ImageEnhance.Sharpness(up).enhance(1.2)
        return await self._upload_processed_image(up, f"upscale-{scale}x-{uuid.uuid4()}.png", project_id or "local")

    async def split_grid(self, image_url: str, grid_size: int=3, project_id=None) -> List[str]:
        image = await self._download_image(image_url)
        w, h = image.size
        cw, ch = w // grid_size, h // grid_size
        results = []
        for r in range(grid_size):
            for c in range(grid_size):
                l, t = c * cw, r * ch
                r_pos = l + cw if c < grid_size - 1 else w
                b_pos = t + ch if r < grid_size - 1 else h
                crop = image.crop((l, t, r_pos, b_pos))
                url = await self._upload_processed_image(crop, f"grid-{grid_size}-{r}-{c}-{uuid.uuid4()}.png", project_id or "local")
                results.append(url)
        return results

    async def optimize_image(self, image_url: str, enhance_type: str, intensity: float=1.0, project_id=None) -> str:
        image = await self._download_image(image_url)
        if enhance_type == "colors":
            image = ImageEnhance.Color(image).enhance(1.2*intensity)
        elif enhance_type == "contrast":
            image = ImageEnhance.Contrast(image).enhance(1.15*intensity)
        elif enhance_type == "sharpness":
            image = ImageEnhance.Sharpness(image).enhance(1.3*intensity)
        elif enhance_type == "auto":
            image = ImageEnhance.Color(image).enhance(1.1*intensity)
            image = ImageEnhance.Contrast(image).enhance(1.1*intensity)
            image = ImageEnhance.Sharpness(image).enhance(1.15*intensity)
        return await self._upload_processed_image(image, f"optimize-{enhance_type}-{uuid.uuid4()}.png", project_id or "local")
