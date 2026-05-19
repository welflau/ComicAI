# ComicFlow AI

**输入剧本，输出完整漫剧视频** — AI 驱动的端到端漫剧创作平台

## 运行效果

### 工作流编辑器

![工作流编辑器](Docs/screenshots/workflow-editor.png)

基于 ReactFlow 的可视化节点画布，截图展示了一个以「孙悟空」为角色的创作工作流：
- 左侧两个 **图片节点** 展示角色参考图（猪头人身妖怪风格）
- 中间 **文本节点** 自动生成了结构化中文提示词（主体描述 + 环境）
- 下方 **文本节点** 接收角色名称输入，连接至剧本生成节点
- 右侧 **文本节点** 输出《齐天》分镜剧本（第一幕：石破 场景）
- 最右 **图片节点** 展示多帧 AI 生成分镜图

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + TailwindCSS + ReactFlow + Zustand |
| 后端 | Python FastAPI + SQLite (aiosqlite) / PostgreSQL |
| 对象存储 | 本地 `/uploads` 目录（开发）/ MinIO S3（生产） |
| AI 引擎 | Anthropic Claude, LightAI (Kling / 即梦 / nano-banana) |
| 基础设施 | Docker Compose |

## 快速开始（本地开发）

### 1. 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt
# 推荐使用自动重启脚本（进程崩溃后 3 秒自动拉起）
powershell -File start.ps1
# 或直接启动
uvicorn app.main:app --port 8002
```

### 2. 前端

```bash
cd frontend
npm install
npm run dev                    # 访问 http://localhost:3000
```

> **注意**：前端通过 Vite 代理转发请求到后端（`/api` → `http://localhost:8002`）。

### 3. 环境变量

```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8002
ANTHROPIC_BASE_URL=<your-anthropic-proxy>
ANTHROPIC_AUTH_TOKEN=<your-token>
VITE_LIGHTAI_BASE_URL=https://api.lightai.woa.com
VITE_LIGHTAI_API_KEY=<your-key>
```

服务启动后访问：
- **前端**: http://localhost:3000
- **API 文档**: http://localhost:8002/docs

---

## 核心功能

### 🎬 可视化工作流编辑器

基于 ReactFlow 的无限画布，支持拖拽连接节点构建 AI 生成流水线。

**节点类型：**

| 节点 | 说明 |
|------|------|
| 文本节点 | 剧本编写、MD 文件导入、AI 角色提取 |
| 分镜脚本节点 | AI 生成分镜表 + 批量创建配图节点 |
| 图片节点 | 文生图（Lib Nano Pro / 即梦）、图生图 |
| 视频节点 | 文生视频 / 图生视频（可灵 / 即梦） |
| 视频合成节点 | 多段拼接 + 转场效果（FFmpeg） |
| 章节分解节点 | 小说自动按章节拆分，生成章节节点组 |
| 节点组 | 将多个节点打包，双击进入子画布 |
| 循环遍历节点 | 逐一推送组内节点内容，支持一键遍历全部 |
| Log 节点 | 读取上游节点输出，调试用 |

### 📦 节点打组与层级画布

- **多选打组**：框选节点 → 工具条「打组」→ 收纳为单一组节点
- **双击进入**：进入组内子画布，显示输入/输出边界端口
- **自动排版**：首次进组时内容节点自动网格排列
- **缩放不变端口**：输入（蓝）/ 输出（橙）端口始终以固定像素显示

### 🔄 循环遍历 + 一键批处理

- 循环节点连接组节点，自动读取组内文字节点列表
- **一键遍历**：点击 ⟳ 按钮，自动逐项推送内容到下游节点（如 ScriptGenNode）
- 下游节点收到 `triggerRun` 信号后自动执行生成，完成后自动推进到下一项
- 支持随时停止（■ 按钮）

### 📖 小说转图工作流

```
导入 .md 文件（拖拽到画布）
  ↓
章节分解节点（正则 + AI 识别章节）
  ↓ 自动打组（> 3 章时）
循环遍历节点 → 分镜脚本节点 → 配图节点 × N
```

### 🤖 AI 助手自然语言搭建工作流

右侧 AI 助手面板，输入自然语言自动在画布上生成工作流：

```
用户：帮我搭一个 5 镜头的古风漫画工作流
AI：创建 剧本 → 分镜脚本 → 配图×5（预填提示词）
```

### ⚡ 工作流模板（一键创建）

左侧工具栏「工作流」按钮，9 个预设模板，点击即在视口中心生成完整节点链：

| 模板 | 节点链 |
|---|---|
| 文生图 | 文本 → 图片 |
| 文生视频 | 文本 → 视频 |
| 分镜脚本 | 文本 → 分镜脚本 → 图片 |
| 图生视频 | 图片 → 视频 |
| 多镜头合成 | 视频×N → 合成 |
| 小说转图 | 小说 → 章节分解 → 分镜 |
| 循环批处理 | 节点组 → 循环 → 分镜脚本 |
| 完整漫画流水线 | 文本 → 分镜 → 图片 → 视频 → 合成 |

### ↩️ 撤销 / 重做

- `Ctrl+Z` 撤销，`Ctrl+Y` / `Ctrl+Shift+Z` 重做（最多 50 步）
- 覆盖：添加节点、删除节点、连线、打组、拖拽移动

### 🗂️ 其他交互

- **拖入文件**：直接将 `.md` / `.txt` 拖到画布，自动创建文本节点
- **上游文本排序**：图片节点提示词面板显示来源 tag，可拖拽调整顺序 / 点 × 禁用
- **即梦图片模型**：图片节点支持 Lib Nano Pro（2-5 分钟）和即梦（10-60 秒）两种模型

---

## 项目结构

```
ComicAI/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/   # REST API 路由
│   │   ├── core/               # 配置、数据库、安全
│   │   ├── models/             # SQLAlchemy ORM 模型
│   │   └── services/           # AI / 生成服务
│   ├── start.ps1               # 自动重启启动脚本
│   └── comicflow.db            # SQLite 数据库（开发）
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── canvas/         # 工作流画布 + 节点面板
│       │   ├── nodes/          # 所有自定义节点组件
│       │   └── panels/         # 左/右侧面板
│       ├── pages/              # Dashboard / ProjectEditor
│       ├── stores/             # Zustand 状态（含 undo/redo）
│       ├── api/                # Axios + LightAI API 客户端
│       └── types/              # TypeScript 类型定义
├── Docs/
│   ├── DevLog/                 # 每日开发日志
│   └── 设计文档/               # 功能设计方案
├── docker-compose.yml
└── README.md
```

---

## API 主要端点

```
POST /api/v1/auth/register    — 注册
POST /api/v1/auth/login       — 登录（返回 JWT Token）

GET  /api/v1/projects         — 项目列表
POST /api/v1/projects         — 创建项目
PATCH /api/v1/projects/{id}   — 更新工作流/节点

POST /api/v1/ai/assistant     — AI 助手对话（画布感知）
POST /api/v1/video/compose    — 视频合成（FFmpeg）
POST /api/v1/video/persist    — CDN 视频持久化到本地

GET  /uploads/{filename}      — 访问已上传/生成文件
```

## License

MIT
