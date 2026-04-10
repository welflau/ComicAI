from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    # App
    APP_NAME: str = "ComicFlow AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://comicflow:comicflow123@localhost:5432/comicflow"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 0

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # MinIO / S3
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET_ASSETS: str = "comicflow-assets"
    MINIO_BUCKET_OUTPUTS: str = "comicflow-outputs"
    MINIO_SECURE: bool = False

    # AI API Keys
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL_TEXT: str = "gpt-4o"
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_BASE_URL: Optional[str] = None
    ANTHROPIC_CUSTOM_HEADERS: Optional[str] = None  # e.g. "x-api-key: xxxxx"
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"
    STABILITY_API_KEY: Optional[str] = None
    REPLICATE_API_KEY: Optional[str] = None
    AZURE_TTS_KEY: Optional[str] = None
    AZURE_TTS_REGION: str = "eastasia"

    # Image Generation
    SDXL_API_URL: str = "http://localhost:7860"
    IMAGE_GEN_PROVIDER: str = "openai"  # openai | stability | sdxl_local

    # Video Generation
    VIDEO_GEN_PROVIDER: str = "replicate"  # replicate | runway | local
    SVD_API_URL: Optional[str] = None

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # File Upload
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50MB

    class Config:
        env_file = ".env"
        case_sensitive = True
        env_file_encoding = "utf-8"

    @classmethod
    def settings_customise_sources(cls, settings_cls, init_settings, env_settings, dotenv_settings, **kwargs):
        # dotenv (.env file) takes priority over system environment variables
        return dotenv_settings, env_settings, init_settings


settings = Settings()
