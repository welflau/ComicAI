"""
StorageService: 本地文件系统存储（替代 MinIO）。
文件保存在 backend/uploads/ 目录下，可随项目文件夹一起拷贝迁移。
"""
import aiofiles
from pathlib import Path
from loguru import logger

# 相对于 uvicorn 启动目录（backend/）
UPLOAD_ROOT = Path("uploads")

SUBDIR_MAP = {
    "image/png": "images", "image/jpeg": "images", "image/webp": "images",
    "image/gif": "images", "image/bmp": "images",
    "video/mp4": "videos", "video/webm": "videos",
    "audio/mpeg": "audio", "audio/wav": "audio", "audio/ogg": "audio",
}


class StorageService:

    def _get_subdir(self, content_type: str) -> str:
        return SUBDIR_MAP.get(content_type, "assets")

    def _ensure_dir(self, subdir: str) -> Path:
        path = UPLOAD_ROOT / subdir
        path.mkdir(parents=True, exist_ok=True)
        return path

    async def upload_image(self, data: bytes, object_name: str) -> str:
        return await self._upload(data, object_name, "image/png")

    async def upload_audio(self, data: bytes, object_name: str) -> str:
        return await self._upload(data, object_name, "audio/mpeg")

    async def upload_video(self, data: bytes, object_name: str) -> str:
        return await self._upload(data, object_name, "video/mp4")

    async def upload_file(self, data: bytes, object_name: str, content_type: str) -> str:
        return await self._upload(data, object_name, content_type)

    async def _upload(self, data: bytes, object_name: str, content_type: str) -> str:
        subdir = self._get_subdir(content_type)
        dir_path = self._ensure_dir(subdir)
        # object_name 可含子路径，取最后一段作为文件名
        filename = Path(object_name).name
        file_path = dir_path / filename
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(data)
        url = f"/uploads/{subdir}/{filename}"
        logger.info(f"File saved: {file_path} → {url}")
        return url

    async def delete_object(self, bucket: str, object_name: str) -> bool:
        try:
            # bucket 参数忽略，直接用 object_name 作相对路径
            path = UPLOAD_ROOT / object_name
            if path.exists():
                path.unlink()
            return True
        except Exception as e:
            logger.error(f"Storage delete failed: {e}")
            return False

    async def get_presigned_url(self, bucket: str, object_name: str, expiry_seconds: int = 3600) -> str:
        return f"/uploads/{object_name}"
