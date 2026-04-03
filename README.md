# ComicFlow AI

**输入剧本，输出完整漫剧视频** — AI 驱动的端到端漫剧创作平台

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + ReactFlow + Zustand |
| 后端 | Python FastAPI + async SQLAlchemy + PostgreSQL (pgvector) |
| 任务队列 | Celery + Redis |
| 对象存储 | MinIO (S3-compatible) |
| AI 引擎 | OpenAI GPT-4o / DALL-E 3, Anthropic Claude 3.5, Stability AI, Replicate SVD, Azure TTS |
| 基础设施 | Docker Compose |

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入你的 API 密钥
```

### 2. 启动所有服务

```bash
docker compose up -d
```

服务启动后访问：
- **前端**: http://localhost
- **API 文档**: http://localhost/api/v1/docs
- **Flower (任务监控)**: http://localhost:5555
- **MinIO 控制台**: http://localhost:9001

### 3. 本地开发

**后端：**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**前端：**
```bash
cd frontend
npm install
npm run dev  # 访问 http://localhost:5173
```

**Celery Worker：**
```bash
cd backend
celery -A app.tasks.worker.celery_app worker --loglevel=info -Q generation,default
```

## 核心功能

### 🎬 工作流编辑器
基于 ReactFlow 的可视化节点编辑器，支持拖拽连接 AI 处理节点。

**节点类型：**
- `script_input` — 剧本输入
- `script_parse` — AI 剧本解析（GPT-4o / Claude）
- `storyboard_gen` — 分镜生成
- `character_design` — 角色一致性设计
- `image_gen` — AI 图像生成（DALL-E 3 / Stability AI）
- `video_gen` — 图生视频（Replicate SVD）
- `tts` — AI 配音合成（Azure TTS）
- `music_gen` — 背景音乐生成
- `auto_edit` — 智能剪辑
- `preview` / `export` — 预览与导出

### 🖼️ 分镜板
网格/列表双视图，展示所有分镜帧，支持预览图片/视频/音频状态。

### ⏱️ 时间轴编辑器
多轨道时间轴（视频/对白/BGM/字幕），支持缩放和播放预览。

### 🤝 实时协作
基于 WebSocket 的多人协作，支持光标同步和操作变换（OT）。

## API 文档

启动后访问 http://localhost/api/v1/docs 查看完整的 OpenAPI 文档。

### 主要端点

```
POST /api/v1/auth/register    — 注册
POST /api/v1/auth/login       — 登录

GET  /api/v1/projects         — 项目列表
POST /api/v1/projects         — 创建项目
POST /api/v1/projects/{id}/tasks  — 提交 AI 生成任务

POST /api/v1/ai/assistant     — AI 创作助手
POST /api/v1/ai/optimize-prompt  — 优化提示词

POST /api/v1/assets/upload/{project_id}  — 上传素材

WS   /ws/collab/{project_id}  — 实时协作
```

## 项目结构

```
ComicAI/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # REST API 路由
│   │   ├── core/               # 配置、数据库、安全
│   │   ├── models/             # SQLAlchemy ORM 模型
│   │   ├── schemas/            # Pydantic 请求/响应模型
│   │   ├── services/
│   │   │   ├── ai/             # AI 核心引擎
│   │   │   └── generation/     # 图像/视频/TTS 生成服务
│   │   ├── tasks/              # Celery 异步任务
│   │   └── websocket/          # 实时协作
│   └── migrations/             # Alembic 数据库迁移
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── canvas/         # 工作流/分镜/时间轴视图
│       │   ├── nodes/          # ReactFlow 自定义节点
│       │   └── panels/         # 左/右侧面板
│       ├── pages/              # 路由页面
│       ├── stores/             # Zustand 状态管理
│       ├── api/                # API 客户端
│       └── types/              # TypeScript 类型定义
├── docker/
│   ├── nginx/nginx.conf
│   └── postgres/init.sql
├── docker-compose.yml
└── .env.example
```

## License

MIT
