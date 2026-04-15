# SQLite 后台存储方案

> 目标：将所有用户数据从浏览器 IndexedDB 迁移到后台 SQLite 数据库，实现"拷贝项目文件夹即迁移全部数据"。

---

## 一、当前架构 vs 目标架构

### 现在（IndexedDB 本地存储）

```
浏览器
└── IndexedDB (ComicAI)
    ├── projects     ← 项目列表、工作流节点/连线
    ├── workflows    ← 画布节点状态
    └── images       ← 生成图片（base64 blob）
```

- 数据绑定**浏览器+机器**，换机器数据消失
- 不同浏览器之间无法同步
- 无用户概念，任何人打开都能看到所有数据

### 目标（SQLite 后台存储）

```
ComicAI/
├── backend/
│   ├── comicflow.db        ← SQLite 数据库（所有结构化数据）
│   ├── uploads/            ← 图片/素材文件
│   │   ├── images/
│   │   └── assets/
│   └── app/
└── frontend/
```

- 数据绑定**用户账号**，任何机器登录即可访问
- 拷贝 `backend/comicflow.db` + `backend/uploads/` = 完整数据迁移
- 多用户隔离，数据安全

---

## 二、数据库结构（已有模型）

后台 SQLAlchemy 模型已定义完整，无需新增表：

| 表名 | 内容 | 对应前端 |
|---|---|---|
| `users` | 用户账号、密码、套餐 | authStore |
| `projects` | 项目基本信息、工作流节点/连线（JSON） | projectStore |
| `scripts` | 剧本内容、解析结果 | ScriptNode |
| `storyboards` | 分镜数据 | StoryboardTableNode |
| `characters` | 角色设计 | — |
| `scenes` | 场景设计 | — |
| `assets` | 图片、视频、音频素材 | ImageNode |
| `generation_tasks` | AI生成任务队列 | — |

**关键字段：** `projects.workflow_config` 存 JSON，直接保存画布的 nodes + edges。

---

## 三、配置修改（切换到 SQLite）

### 1. 新建 `backend/.env`

```env
# 数据库：SQLite（文件在 backend/comicflow.db）
DATABASE_URL=sqlite+aiosqlite:///./comicflow.db

# 关闭 Debug 模式（生产用）
DEBUG=false

# JWT 密钥（随机字符串，保持固定否则重启后 token 失效）
SECRET_KEY=your-fixed-secret-key-here

# AI 接口
OPENAI_API_KEY=sk-xxx
# 或使用 LightAI 等自定义接口（在代码层配置）
```

### 2. 安装 SQLite 异步驱动

```bash
cd backend
pip install aiosqlite
```

无需安装 PostgreSQL，SQLite 是 Python 内置的。

### 3. 初始化数据库

```bash
cd backend
python -c "
import asyncio
from app.core.database import engine, Base
import app.models

async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print('数据库初始化完成')

asyncio.run(init())
"
```

执行后生成 `backend/comicflow.db`。

---

## 四、前端改造（需要开发）

### 4.1 projectStore 改造

**现在：** 直接读写 Dexie（IndexedDB）

**改成：** 调用后台 API

```typescript
// 现在（Dexie）
const projects = await db.projects.toArray()

// 改后（API）
const projects = await projectApi.list()
```

需要新增 `frontend/src/api/projectApi.ts`：

```typescript
export const projectApi = {
  list: () => request.get('/projects'),
  get: (id: string) => request.get(`/projects/${id}`),
  create: (data) => request.post('/projects', data),
  update: (id, data) => request.patch(`/projects/${id}`, data),
  delete: (id) => request.delete(`/projects/${id}`),
  
  // 工作流（存在 workflow_config 字段里）
  saveWorkflow: (id, nodes, edges) => 
    request.patch(`/projects/${id}`, { 
      workflow_config: { nodes, edges } 
    }),
}
```

### 4.2 图片存储改造

**现在：** 图片生成后存 IndexedDB blob

**改成：** 上传到后台 `uploads/` 目录，存储 URL

后台需要新增文件上传接口：
```
POST /api/v1/assets/upload
→ 保存到 backend/uploads/images/
→ 返回 { url: "/uploads/images/xxx.png" }
```

前端 ImageNode 改成保存 URL 而非 base64。

### 4.3 认证集成

前端已有 `authStore`，login/register 接口后台已实现（`/api/v1/auth/`）。  
开启后台后去掉 DEV fallback，使用真实 token 即可。

---

## 五、文件目录（完成后）

```
ComicAI/
├── backend/
│   ├── .env                ← 配置文件（含密钥，不要提交 git）
│   ├── comicflow.db        ← SQLite 数据库 ⭐
│   ├── uploads/            ← 图片素材目录 ⭐
│   │   ├── images/
│   │   └── assets/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── database.py
│   │   ├── models/         ← 数据表定义（已完成）
│   │   ├── api/            ← REST 接口（已完成）
│   │   └── ...
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/            ← 需要新增 projectApi.ts
│       └── stores/
│           └── projectStore.ts  ← 需要改造
└── Docs/
```

---

## 六、迁移换机器操作步骤

```bash
# 旧机器：打包需要迁移的内容
zip -r comicai_data.zip backend/comicflow.db backend/uploads/ backend/.env

# 新机器：
# 1. 拷贝整个项目文件夹（或 git pull 代码）
# 2. 解压数据覆盖到对应位置
# 3. 安装依赖
cd backend && pip install -r requirements.txt
# 4. 启动
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

数据库文件 + uploads 目录就是全部用户数据，其他都是代码。

---

## 七、开发优先级

| 阶段 | 任务 | 工作量 |
|---|---|---|
| 1 | 配置 SQLite，启动后台，测试注册/登录 | 0.5天 |
| 2 | 新增文件上传接口，静态文件服务 | 0.5天 |
| 3 | 改造 projectStore → API | 1天 |
| 4 | 改造 ImageNode 图片存储 → URL | 1天 |
| 5 | 联调测试，去掉 DEV fallback | 0.5天 |

**总计约 3-4 天工作量。**

---

## 八、注意事项

1. **`.env` 不要提交 git**（含密钥），已在 `.gitignore` 中排除
2. **`comicflow.db` 建议定期备份**，直接复制文件即可
3. **`SECRET_KEY` 要固定**，改变后所有用户 token 失效需重新登录
4. **并发写入**：SQLite 在单机单用户场景完全够用；若多人同时大量写入考虑切 PostgreSQL
5. **`uploads/` 目录**需要配置为静态文件服务（FastAPI `StaticFiles`），前端才能通过 URL 访问图片
