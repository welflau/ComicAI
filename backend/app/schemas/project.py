from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


# ─── Project ───────────────────────────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tags: list[str] = []
    workflow_config: dict = {}


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    tags: Optional[list[str]] = None
    workflow_config: Optional[dict] = None
    thumbnail_url: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    user_id: str
    status: str
    workflow_config: dict
    thumbnail_url: Optional[str] = None
    tags: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Script ────────────────────────────────────────────────────────────────
class ScriptCreate(BaseModel):
    title: Optional[str] = None
    content: str


class ScriptUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class ScriptResponse(BaseModel):
    id: str
    project_id: str
    title: Optional[str] = None
    content: str
    parsed_data: dict
    extra_metadata: dict
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Storyboard ────────────────────────────────────────────────────────────
class StoryboardCreate(BaseModel):
    script_id: Optional[str] = None
    title: Optional[str] = None
    shots: list = []
    timing_data: dict = {}
    visual_style: dict = {}


class StoryboardUpdate(BaseModel):
    title: Optional[str] = None
    shots: Optional[list] = None
    timing_data: Optional[dict] = None
    visual_style: Optional[dict] = None


class StoryboardResponse(BaseModel):
    id: str
    project_id: str
    script_id: Optional[str] = None
    title: Optional[str] = None
    shots: list
    timing_data: dict
    visual_style: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Character ─────────────────────────────────────────────────────────────
class CharacterCreate(BaseModel):
    name: str
    description: Optional[str] = None
    style_prompt: Optional[str] = None
    traits: dict = {}
    color_palette: list[str] = []


class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    style_prompt: Optional[str] = None
    traits: Optional[dict] = None
    color_palette: Optional[list[str]] = None


class CharacterResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    style_prompt: Optional[str] = None
    style_images: list
    traits: dict
    color_palette: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Scene ─────────────────────────────────────────────────────────────────
class SceneCreate(BaseModel):
    name: str
    description: Optional[str] = None
    style: dict = {}
    lighting: Optional[str] = None
    mood: Optional[str] = None


class SceneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    style: Optional[dict] = None
    lighting: Optional[str] = None
    mood: Optional[str] = None


class SceneResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    background_images: list
    style: dict
    lighting: Optional[str] = None
    mood: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Generation Task ───────────────────────────────────────────────────────
class GenerationTaskCreate(BaseModel):
    task_type: str
    input_params: dict = {}


class GenerationTaskResponse(BaseModel):
    id: str
    project_id: str
    celery_task_id: Optional[str] = None
    task_type: str
    input_params: dict
    output_urls: list
    status: str
    progress: int
    error_message: Optional[str] = None
    credits_used: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ─── Asset ─────────────────────────────────────────────────────────────────
class AssetResponse(BaseModel):
    id: str
    project_id: str
    asset_type: str
    name: Optional[str] = None
    url: str
    thumbnail_url: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    extra_metadata: dict
    used_in_shots: list
    created_at: datetime

    model_config = {"from_attributes": True}
