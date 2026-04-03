"""
WebSocket Collaboration: 多用户实时协作。
支持：游标同步、节点操作广播、OT 冲突解决。
"""
import json
import uuid
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from loguru import logger


class CollaborationSession:
    """单个项目的协作会话"""
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.connections: dict[str, WebSocket] = {}  # user_id -> websocket
        self.user_info: dict[str, dict] = {}
        self.version = 0
        self.operations_log = []

    async def connect(self, user_id: str, user_data: dict, websocket: WebSocket):
        await websocket.accept()
        self.connections[user_id] = websocket
        self.user_info[user_id] = {**user_data, "user_id": user_id, "cursor": None}

        # Broadcast join event
        await self.broadcast({
            "type": "user_joined",
            "user_id": user_id,
            "user": user_data,
            "active_users": list(self.user_info.values())
        }, exclude=user_id)

        # Send current state to new user
        await self.send_to(user_id, {
            "type": "session_init",
            "project_id": self.project_id,
            "version": self.version,
            "active_users": list(self.user_info.values())
        })

        logger.info(f"User {user_id} joined project {self.project_id}")

    async def disconnect(self, user_id: str):
        self.connections.pop(user_id, None)
        self.user_info.pop(user_id, None)
        await self.broadcast({
            "type": "user_left",
            "user_id": user_id,
            "active_users": list(self.user_info.values())
        })
        logger.info(f"User {user_id} left project {self.project_id}")

    async def handle_message(self, user_id: str, message: dict):
        msg_type = message.get("type")

        if msg_type == "cursor_move":
            # Sync cursor position
            if user_id in self.user_info:
                self.user_info[user_id]["cursor"] = message.get("cursor")
            await self.broadcast({
                "type": "cursor_update",
                "user_id": user_id,
                "cursor": message.get("cursor")
            }, exclude=user_id)

        elif msg_type == "operation":
            # OT operation (node add/update/delete, etc.)
            op = message.get("operation", {})
            op_id = op.get("id") or str(uuid.uuid4())
            op["id"] = op_id
            op["user_id"] = user_id
            op["server_version"] = self.version

            # Apply and broadcast
            self.version += 1
            self.operations_log.append(op)

            await self.broadcast({
                "type": "operation",
                "operation": op,
                "version": self.version
            }, exclude=user_id)

            # Ack to sender
            await self.send_to(user_id, {
                "type": "operation_ack",
                "op_id": op_id,
                "server_version": self.version
            })

        elif msg_type == "selection":
            # Share selection state
            await self.broadcast({
                "type": "selection_update",
                "user_id": user_id,
                "selected_ids": message.get("selected_ids", [])
            }, exclude=user_id)

        elif msg_type == "ping":
            await self.send_to(user_id, {"type": "pong"})

    async def send_to(self, user_id: str, data: dict):
        ws = self.connections.get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception as e:
                logger.warning(f"Failed to send to {user_id}: {e}")

    async def broadcast(self, data: dict, exclude: Optional[str] = None):
        disconnected = []
        for uid, ws in self.connections.items():
            if uid == exclude:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                disconnected.append(uid)

        for uid in disconnected:
            await self.disconnect(uid)

    @property
    def is_empty(self) -> bool:
        return len(self.connections) == 0


class CollaborationManager:
    """全局协作会话管理器"""
    def __init__(self):
        self.sessions: dict[str, CollaborationSession] = {}  # project_id -> session

    def get_or_create_session(self, project_id: str) -> CollaborationSession:
        if project_id not in self.sessions:
            self.sessions[project_id] = CollaborationSession(project_id)
        return self.sessions[project_id]

    def cleanup_empty(self):
        empty = [pid for pid, s in self.sessions.items() if s.is_empty]
        for pid in empty:
            del self.sessions[pid]
            logger.info(f"Cleaned up empty session for project {pid}")


manager = CollaborationManager()


async def websocket_endpoint(
    websocket: WebSocket,
    project_id: str,
    token: str
):
    """WebSocket 连接入口"""
    from app.core.security import get_current_user
    from app.core.database import AsyncSessionLocal
    from jose import jwt, JWTError
    from app.core.config import settings

    # Authenticate via token
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except JWTError:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Get user info
    async with AsyncSessionLocal() as db:
        from app.models.user import User
        user = await db.get(User, user_id)
        if not user:
            await websocket.close(code=4002, reason="User not found")
            return

        user_data = {
            "username": user.username,
            "avatar_url": user.avatar_url,
            "color": _user_color(user_id)
        }

    session = manager.get_or_create_session(project_id)
    await session.connect(user_id, user_data, websocket)

    try:
        while True:
            data = await websocket.receive_json()
            await session.handle_message(user_id, data)
    except WebSocketDisconnect:
        await session.disconnect(user_id)
        manager.cleanup_empty()
    except Exception as e:
        logger.error(f"WebSocket error for {user_id}: {e}")
        await session.disconnect(user_id)


def _user_color(user_id: str) -> str:
    """为用户分配一个一致的颜色"""
    colors = [
        "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
        "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"
    ]
    idx = int(user_id[-1], 16) % len(colors) if user_id else 0
    return colors[idx]
