"""
StorageService: MinIO 对象存储封装。
"""
import io
from typing import Optional
from loguru import logger

from app.core.config import settings


class StorageService:

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            from minio import Minio
            self._client = Minio(
                settings.MINIO_ENDPOINT,
                access_key=settings.MINIO_ACCESS_KEY,
                secret_key=settings.MINIO_SECRET_KEY,
                secure=settings.MINIO_SECURE
            )
            # Ensure buckets exist
            for bucket in [settings.MINIO_BUCKET_ASSETS, settings.MINIO_BUCKET_OUTPUTS]:
                if not self._client.bucket_exists(bucket):
                    self._client.make_bucket(bucket)
        return self._client

    async def upload_image(self, data: bytes, object_name: str) -> str:
        return await self._upload(data, object_name, "image/png", settings.MINIO_BUCKET_ASSETS)

    async def upload_audio(self, data: bytes, object_name: str) -> str:
        return await self._upload(data, object_name, "audio/mpeg", settings.MINIO_BUCKET_ASSETS)

    async def upload_video(self, data: bytes, object_name: str) -> str:
        return await self._upload(data, object_name, "video/mp4", settings.MINIO_BUCKET_OUTPUTS)

    async def upload_file(self, data: bytes, object_name: str, content_type: str) -> str:
        return await self._upload(data, object_name, content_type, settings.MINIO_BUCKET_ASSETS)

    async def _upload(self, data: bytes, object_name: str, content_type: str, bucket: str) -> str:
        try:
            client = self._get_client()
            client.put_object(
                bucket,
                object_name,
                io.BytesIO(data),
                length=len(data),
                content_type=content_type
            )
            # Build public URL
            endpoint = settings.MINIO_ENDPOINT
            protocol = "https" if settings.MINIO_SECURE else "http"
            return f"{protocol}://{endpoint}/{bucket}/{object_name}"
        except Exception as e:
            logger.error(f"Storage upload failed: {e}")
            raise

    async def get_presigned_url(self, bucket: str, object_name: str, expiry_seconds: int = 3600) -> str:
        from datetime import timedelta
        client = self._get_client()
        return client.presigned_get_object(
            bucket, object_name,
            expires=timedelta(seconds=expiry_seconds)
        )

    async def delete_object(self, bucket: str, object_name: str) -> bool:
        try:
            client = self._get_client()
            client.remove_object(bucket, object_name)
            return True
        except Exception as e:
            logger.error(f"Storage delete failed: {e}")
            return False
