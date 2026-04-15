"""
数据迁移接口：将前端 IndexedDB 数据导入到 SQLite。
POST /migrate/import  — 导入项目 + 工作流
返回 { id_map: { "local_xxx": "new-uuid" }, imported: N }
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Any

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.project import Project

router = APIRouter(prefix="/migrate", tags=["migration"])


class ProjectImport(BaseModel):
    id: str
    name: str
    description: str = ""
    tags: list[str] = []
    created_at: str = ""
    updated_at: str = ""


class WorkflowData(BaseModel):
    nodes: list[Any] = []
    edges: list[Any] = []


class MigrateImportRequest(BaseModel):
    projects: list[ProjectImport]
    workflows: dict[str, WorkflowData] = {}   # key = old local project id


@router.post("/import")
async def import_local_data(
    data: MigrateImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    id_map = {}  # old_id → new_id
    imported_count = 0

    for p in data.projects:
        # 检查是否已有同名项目（避免重复导入）
        result = await db.execute(
            select(Project).where(
                Project.user_id == current_user.id,
                Project.name == p.name
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            id_map[p.id] = existing.id
            continue

        wf = data.workflows.get(p.id)
        workflow_config = {"nodes": wf.nodes, "edges": wf.edges} if wf else {}

        project = Project(
            user_id=current_user.id,
            name=p.name,
            description=p.description,
            tags=p.tags,
            status="draft",
            workflow_config=workflow_config,
        )
        db.add(project)
        await db.flush()   # get id before commit
        id_map[p.id] = project.id
        imported_count += 1

    await db.commit()
    return {"id_map": id_map, "imported": imported_count}
