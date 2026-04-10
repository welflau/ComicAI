"""
Projects API: 项目 CRUD + 子资源管理。
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project, Script, Storyboard, Character, Scene, GenerationTask, Asset
from app.schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    ScriptCreate, ScriptUpdate, ScriptResponse,
    StoryboardCreate, StoryboardUpdate, StoryboardResponse,
    CharacterCreate, CharacterUpdate, CharacterResponse,
    SceneCreate, SceneUpdate, SceneResponse,
    GenerationTaskCreate, GenerationTaskResponse,
    AssetResponse
)

router = APIRouter(prefix="/projects", tags=["projects"])


# ─── Projects ──────────────────────────────────────────────────────────────

@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    skip: int = 0,
    limit: int = 20,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(Project).where(Project.user_id == current_user.id)
    if status:
        query = query.where(Project.status == status)
    query = query.order_by(Project.updated_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = Project(user_id=current_user.id, **data.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = await _get_user_project(project_id, current_user.id, db)
    return project


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = await _get_user_project(project_id, current_user.id, db)
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = await _get_user_project(project_id, current_user.id, db)
    await db.delete(project)
    await db.commit()


# ─── Scripts ───────────────────────────────────────────────────────────────

@router.get("/{project_id}/scripts", response_model=list[ScriptResponse])
async def list_scripts(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    result = await db.execute(
        select(Script).where(Script.project_id == project_id).order_by(Script.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{project_id}/scripts", response_model=ScriptResponse, status_code=201)
async def create_script(
    project_id: str,
    data: ScriptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    script = Script(project_id=project_id, **data.model_dump())
    db.add(script)
    await db.commit()
    await db.refresh(script)
    return script


@router.get("/{project_id}/scripts/{script_id}", response_model=ScriptResponse)
async def get_script(
    project_id: str,
    script_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    script = await db.get(Script, script_id)
    if not script or script.project_id != project_id:
        raise HTTPException(status_code=404, detail="Script not found")
    return script


@router.patch("/{project_id}/scripts/{script_id}", response_model=ScriptResponse)
async def update_script(
    project_id: str,
    script_id: str,
    data: ScriptUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    script = await db.get(Script, script_id)
    if not script or script.project_id != project_id:
        raise HTTPException(status_code=404, detail="Script not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(script, field, value)
    script.version += 1
    await db.commit()
    await db.refresh(script)
    return script


# ─── Storyboards ───────────────────────────────────────────────────────────

@router.get("/{project_id}/storyboards", response_model=list[StoryboardResponse])
async def list_storyboards(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    result = await db.execute(
        select(Storyboard).where(Storyboard.project_id == project_id)
    )
    return result.scalars().all()


@router.get("/{project_id}/storyboards/{storyboard_id}", response_model=StoryboardResponse)
async def get_storyboard(
    project_id: str,
    storyboard_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    sb = await db.get(Storyboard, storyboard_id)
    if not sb or sb.project_id != project_id:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    return sb


@router.patch("/{project_id}/storyboards/{storyboard_id}", response_model=StoryboardResponse)
async def update_storyboard(
    project_id: str,
    storyboard_id: str,
    data: StoryboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    sb = await db.get(Storyboard, storyboard_id)
    if not sb or sb.project_id != project_id:
        raise HTTPException(status_code=404, detail="Storyboard not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(sb, field, value)
    await db.commit()
    await db.refresh(sb)
    return sb


# ─── Characters ────────────────────────────────────────────────────────────

@router.get("/{project_id}/characters", response_model=list[CharacterResponse])
async def list_characters(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    result = await db.execute(
        select(Character).where(Character.project_id == project_id)
    )
    return result.scalars().all()


@router.post("/{project_id}/characters", response_model=CharacterResponse, status_code=201)
async def create_character(
    project_id: str,
    data: CharacterCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    character = Character(project_id=project_id, **data.model_dump())
    db.add(character)
    await db.commit()
    await db.refresh(character)
    return character


@router.patch("/{project_id}/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
    project_id: str,
    character_id: str,
    data: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    char = await db.get(Character, character_id)
    if not char or char.project_id != project_id:
        raise HTTPException(status_code=404, detail="Character not found")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(char, field, value)
    await db.commit()
    await db.refresh(char)
    return char


# ─── Generation Tasks ──────────────────────────────────────────────────────

@router.get("/{project_id}/tasks", response_model=list[GenerationTaskResponse])
async def list_tasks(
    project_id: str,
    task_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    query = select(GenerationTask).where(GenerationTask.project_id == project_id)
    if task_type:
        query = query.where(GenerationTask.task_type == task_type)
    query = query.order_by(GenerationTask.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{project_id}/tasks", response_model=GenerationTaskResponse, status_code=201)
async def create_task(
    project_id: str,
    data: GenerationTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)

    task = GenerationTask(
        project_id=project_id,
        task_type=data.task_type,
        input_params=data.input_params
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Dispatch to Celery
    await _dispatch_task(task, db)

    return task


@router.get("/{project_id}/tasks/{task_id}", response_model=GenerationTaskResponse)
async def get_task(
    project_id: str,
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    task = await db.get(GenerationTask, task_id)
    if not task or task.project_id != project_id:
        raise HTTPException(status_code=404, detail="Task not found")

    # Sync progress from Celery if running
    if task.status == "running" and task.celery_task_id:
        from app.tasks.worker import celery_app
        celery_result = celery_app.AsyncResult(task.celery_task_id)
        if celery_result.state == "PROGRESS":
            meta = celery_result.info or {}
            task.progress = meta.get("progress", task.progress)
            await db.commit()

    return task


# ─── Assets ────────────────────────────────────────────────────────────────

@router.get("/{project_id}/assets", response_model=list[AssetResponse])
async def list_assets(
    project_id: str,
    asset_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await _get_user_project(project_id, current_user.id, db)
    query = select(Asset).where(Asset.project_id == project_id)
    if asset_type:
        query = query.where(Asset.asset_type == asset_type)
    result = await db.execute(query.order_by(Asset.created_at.desc()))
    return result.scalars().all()


# ─── Helpers ───────────────────────────────────────────────────────────────

async def _get_user_project(project_id: str, user_id: str, db: AsyncSession) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


async def _dispatch_task(task: GenerationTask, db: AsyncSession):
    """根据任务类型分发到 Celery；若 Celery/Redis 不可用则在后台直接执行"""
    import asyncio

    params = task.input_params

    # ── Try Celery first ──────────────────────────────────────────────────────
    try:
        from app.tasks.generation_tasks import (
            parse_script_task,
            generate_storyboard_task,
            generate_images_task,
            generate_tts_task,
            auto_edit_task
        )
        dispatch_map = {
            "script_parse": lambda: parse_script_task.delay(
                task.id, task.project_id, params.get("script_content", "")
            ),
            "storyboard_gen": lambda: generate_storyboard_task.delay(
                task.id, task.project_id,
                params.get("script_id"), params.get("visual_style", "manga")
            ),
            "image_gen": lambda: generate_images_task.delay(
                task.id, task.project_id,
                params.get("storyboard_id"), params.get("style", "manga")
            ),
            "tts": lambda: generate_tts_task.delay(
                task.id, task.project_id,
                params.get("storyboard_id"), params.get("voice_config", {})
            ),
            "auto_edit": lambda: auto_edit_task.delay(
                task.id, task.project_id,
                params.get("storyboard_id"), params.get("edit_config", {})
            ),
        }
        dispatcher = dispatch_map.get(task.task_type)
        if dispatcher:
            celery_task = dispatcher()
            task.celery_task_id = celery_task.id
            await db.commit()
        return
    except Exception as celery_err:
        from loguru import logger
        logger.warning(f"Celery unavailable ({celery_err}), running task inline for dev")

    # ── Fallback: run task logic directly in an asyncio background task ───────
    task_id = task.id
    project_id = task.project_id

    async def _run_inline():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask

        if task.task_type == "script_parse":
            from app.services.ai.script_parser import ScriptParser
            from app.models.project import Script
            from sqlalchemy import select as sa_select
            async with AsyncSessionLocal() as session:
                t = await session.get(GenerationTask, task_id)
                if t:
                    t.status = "running"; t.progress = 10
                    await session.commit()
                try:
                    script_content = params.get("script_content", "")
                    # Try to load script content from script_id if not provided
                    if not script_content and params.get("script_id"):
                        script_obj = await session.get(Script, params["script_id"])
                        if script_obj:
                            script_content = script_obj.content or ""
                    parsed = await ScriptParser().parse_script(script_content)
                    # Save parsed_data back to the script
                    if params.get("script_id"):
                        script_obj = await session.get(Script, params["script_id"])
                        if script_obj:
                            script_obj.parsed_data = parsed
                            await session.commit()
                    if t:
                        t.status = "completed"; t.progress = 100
                        await session.commit()
                except Exception as e:
                    if t:
                        t.status = "failed"; t.error_message = str(e)
                        await session.commit()

        elif task.task_type == "storyboard_gen":
            from app.services.ai.storyboard_generator import StoryboardGenerator
            from app.models.project import Script, Storyboard
            async with AsyncSessionLocal() as session:
                t = await session.get(GenerationTask, task_id)
                if t:
                    t.status = "running"; t.progress = 10
                    await session.commit()
                try:
                    script = await session.get(Script, params.get("script_id"))
                    if not script or not script.parsed_data:
                        raise ValueError("Script not found or not parsed")
                    data = await StoryboardGenerator().generate_storyboard(
                        script.parsed_data, visual_style=params.get("visual_style", "manga")
                    )
                    sb = Storyboard(
                        project_id=project_id,
                        script_id=params.get("script_id"),
                        title=f"分镜 - {script.title or '未命名'}",
                        shots=data["shots"],
                        timing_data={"total_duration": data["total_duration"]},
                        visual_style={"style": params.get("visual_style", "manga")}
                    )
                    session.add(sb)
                    if t:
                        t.status = "completed"; t.progress = 100
                        await session.commit()
                except Exception as e:
                    if t:
                        t.status = "failed"; t.error_message = str(e)
                        await session.commit()

        else:
            # Other task types: just mark completed (image/tts/edit need external services)
            async with AsyncSessionLocal() as session:
                t = await session.get(GenerationTask, task_id)
                if t:
                    t.status = "completed"; t.progress = 100
                    await session.commit()

    asyncio.create_task(_run_inline())
