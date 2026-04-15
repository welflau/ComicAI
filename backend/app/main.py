"""
FastAPI Application Entry Point
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from loguru import logger

from app.core.config import settings
from app.api.v1.router import api_router
from app.core.database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App startup / shutdown"""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Create all tables
    async with engine.begin() as conn:
        # Import all models so they are registered
        import app.models  # noqa
        await conn.run_sync(Base.metadata.create_all)

    logger.info("Database tables created")

    # Ensure uploads subdirectories exist
    from pathlib import Path
    for subdir in ["images", "videos", "audio", "assets"]:
        Path(f"uploads/{subdir}").mkdir(parents=True, exist_ok=True)
    logger.info("Upload directories ready")

    yield
    logger.info("Shutting down...")
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="ComicFlow AI - AI 漫剧智能创作平台",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# ─── Middleware ──────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# ─── Routes ─────────────────────────────────────────────────────────────────

app.include_router(api_router)

# 静态文件服务：/uploads/* → backend/uploads/
from pathlib import Path as _Path
from fastapi.staticfiles import StaticFiles
_Path("uploads").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.websocket("/ws/collab/{project_id}")
async def websocket_collab(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...)
):
    """实时协作 WebSocket 端点"""
    from app.websocket.collaboration import websocket_endpoint
    await websocket_endpoint(websocket, project_id, token)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "service": settings.APP_NAME
    }


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API", "docs": "/docs"}
