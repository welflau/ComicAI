"""
Celery Worker: 异步任务处理。
所有 AI 生成任务在此执行，支持进度报告。
"""
import asyncio
from celery import Celery
from loguru import logger

from app.core.config import settings

# Create Celery app
celery_app = Celery(
    "comicflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        "app.tasks.generation_tasks",
        "app.tasks.export_tasks",
    ]
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "app.tasks.generation_tasks.*": {"queue": "generation"},
        "app.tasks.export_tasks.*": {"queue": "export"},
    },
    beat_schedule={
        "cleanup-expired-tasks": {
            "task": "app.tasks.generation_tasks.cleanup_expired_tasks",
            "schedule": 3600.0,
        }
    }
)


def run_async(coro):
    """Run async coroutine in celery sync context"""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
