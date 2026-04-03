"""
Assets upload endpoint.
"""
import uuid
import aiofiles
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Asset, Project
from app.services.storage import StorageService
from app.schemas.project import AssetResponse

router = APIRouter(prefix="/assets", tags=["assets"])

ALLOWED_TYPES = {
    "image": ["image/jpeg", "image/png", "image/webp", "image/gif"],
    "video": ["video/mp4", "video/quicktime", "video/webm"],
    "audio": ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"],
}


@router.post("/upload/{project_id}", response_model=AssetResponse, status_code=201)
async def upload_asset(
    project_id: str,
    file: UploadFile = File(...),
    asset_type: str = "image",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Verify project access
    project = await db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    # Validate file type
    allowed_mimes = ALLOWED_TYPES.get(asset_type, ALLOWED_TYPES["image"])
    if file.content_type not in allowed_mimes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type {file.content_type}. Allowed: {allowed_mimes}"
        )

    # Read file
    content = await file.read()
    file_size = len(content)

    if file_size > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    # Upload to storage
    storage = StorageService()
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    object_name = f"projects/{project_id}/{asset_type}s/{uuid.uuid4()}.{ext}"

    try:
        url = await storage.upload_file(content, object_name, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    # Save to DB
    asset = Asset(
        project_id=project_id,
        asset_type=asset_type,
        name=file.filename,
        url=url,
        file_size=file_size,
        mime_type=file.content_type,
        extra_metadata={"original_filename": file.filename}
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    return asset
