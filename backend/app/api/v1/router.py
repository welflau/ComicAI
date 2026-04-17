from fastapi import APIRouter
from app.api.v1.endpoints import auth, projects, ai_assistant, assets, migration, image_toolbar

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(ai_assistant.router)
api_router.include_router(assets.router)
api_router.include_router(migration.router)
api_router.include_router(image_toolbar.router)
