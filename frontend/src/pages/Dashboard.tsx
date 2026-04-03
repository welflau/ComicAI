import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import {
  Plus, Search, Film, MoreHorizontal, Trash2,
  Clock, Grid3X3, List, LogOut, User, Zap, Loader2
} from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsApi } from '@/api'
import { useAuthStore } from '@/stores/authStore'
import type { Project } from '@/types'

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: { label: '草稿', cls: 'bg-white/10 text-white/50' },
  in_progress: { label: '制作中', cls: 'bg-yellow-500/20 text-yellow-400' },
  completed: { label: '已完成', cls: 'bg-green-500/20 text-green-400' },
  archived: { label: '已归档', cls: 'bg-white/5 text-white/30' },
}

function CreateProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (p: Project) => void }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const project = await projectsApi.create({ name: name.trim(), description: desc.trim() })
      onCreate(project)
      toast.success('项目创建成功')
      onClose()
    } catch {
      toast.error('创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-canvas-surface border border-canvas-border rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <h2 className="text-lg font-semibold mb-4">新建项目</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-white/60 block mb-1.5">项目名称 *</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例：《晴天漫画》第一季"
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="text-sm text-white/60 block mb-1.5">项目描述</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="简要描述项目内容..."
              rows={3}
              className="input-base w-full resize-none"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 py-2">
              取消
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="btn-primary flex-1 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              创建项目
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

function ProjectCard({
  project,
  viewMode,
  onOpen,
  onDelete,
}: {
  project: Project
  viewMode: 'grid' | 'list'
  onOpen: () => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const badge = STATUS_BADGE[project.status] || STATUS_BADGE.draft

  const dateStr = new Date(project.updated_at).toLocaleDateString('zh-CN', {
    month: 'short', day: 'numeric'
  })

  if (viewMode === 'list') {
    return (
      <div
        onClick={onOpen}
        className="flex items-center gap-4 p-3 rounded-xl border border-canvas-border bg-canvas-surface hover:border-white/20 cursor-pointer group transition-all"
      >
        <div className="w-12 h-8 rounded-lg bg-canvas-bg flex items-center justify-center flex-shrink-0">
          <Film className="w-4 h-4 text-primary-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{project.name}</p>
          {project.description && (
            <p className="text-xs text-white/40 truncate mt-0.5">{project.description}</p>
          )}
        </div>
        <span className={clsx('badge text-[10px] px-2 py-0.5 rounded-md', badge.cls)}>{badge.label}</span>
        <div className="flex items-center gap-1 text-white/30 text-xs">
          <Clock className="w-3 h-3" />
          {dateStr}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 btn-ghost p-1.5 text-red-400 hover:text-red-300"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onClick={onOpen}
      className="group relative rounded-xl border border-canvas-border bg-canvas-surface hover:border-white/20 cursor-pointer overflow-hidden transition-all"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-canvas-bg flex items-center justify-center relative">
        <Film className="w-10 h-10 text-white/10" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-purple-500/5" />

        {/* Status badge */}
        <div className={clsx('absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-md', badge.cls)}>
          {badge.label}
        </div>

        {/* Menu button */}
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(v => !v) }}
          className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 btn-ghost p-1"
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>

        {showMenu && (
          <div className="absolute top-8 left-2 bg-canvas-surface border border-canvas-border rounded-lg shadow-xl z-10 min-w-[120px]">
            <button
              onClick={e => { e.stopPropagation(); onDelete(); setShowMenu(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/5"
            >
              <Trash2 className="w-3.5 h-3.5" /> 删除项目
            </button>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium truncate">{project.name}</h3>
        {project.description && (
          <p className="text-xs text-white/40 mt-1 line-clamp-2">{project.description}</p>
        )}
        <div className="flex items-center gap-1 text-white/25 text-[10px] mt-2">
          <Clock className="w-3 h-3" />
          {dateStr}
        </div>
      </div>
    </motion.div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    projectsApi.list()
      .then(setProjects)
      .catch(() => toast.error('加载项目失败'))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确认删除该项目？此操作不可撤销。')) return
    try {
      await projectsApi.delete(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      toast.success('项目已删除')
    } catch {
      toast.error('删除失败')
    }
  }

  const filtered = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-canvas-bg">
      {/* Header */}
      <header className="border-b border-canvas-border bg-canvas-surface sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 mr-6">
            <div className="w-8 h-8 rounded-xl bg-primary-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">ComicFlow</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜索项目..."
              className="input-base w-full pl-9 py-2 text-sm"
            />
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-3">
            {/* View toggle */}
            <div className="flex gap-0.5 bg-canvas-bg rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={clsx('p-1.5 rounded', viewMode === 'grid' ? 'bg-primary-500 text-white' : 'text-white/40 hover:text-white')}
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={clsx('p-1.5 rounded', viewMode === 'list' ? 'bg-primary-500 text-white' : 'text-white/40 hover:text-white')}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* New project */}
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2 py-2 px-4"
            >
              <Plus className="w-4 h-4" />
              新建项目
            </button>

            {/* User menu */}
            <div className="flex items-center gap-2 pl-3 border-l border-canvas-border">
              <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center">
                <User className="w-4 h-4 text-primary-400" />
              </div>
              <span className="text-sm text-white/70 hidden sm:block">{user?.username}</span>
              <button onClick={logout} className="btn-ghost p-1.5 text-white/40 hover:text-white/70">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: '总项目', value: projects.length, color: 'text-primary-400' },
            { label: '制作中', value: projects.filter(p => p.status === 'in_progress').length, color: 'text-yellow-400' },
            { label: '已完成', value: projects.filter(p => p.status === 'completed').length, color: 'text-green-400' },
          ].map(stat => (
            <div key={stat.label} className="bg-canvas-surface rounded-xl p-4 border border-canvas-border">
              <p className="text-xs text-white/40 mb-1">{stat.label}</p>
              <p className={clsx('text-2xl font-bold', stat.color)}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Section title */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">我的项目</h2>
          <span className="text-xs text-white/30">{filtered.length} 个项目</span>
        </div>

        {/* Projects */}
        {loading ? (
          <div className="flex items-center justify-center h-48 text-white/30">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span>加载中...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-white/20">
            <Film className="w-16 h-16 mb-4" />
            <p className="text-lg font-medium text-white/30">
              {search ? '未找到匹配项目' : '还没有项目'}
            </p>
            {!search && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                创建第一个项目
              </button>
            )}
          </div>
        ) : (
          <AnimatePresence>
            <div className={clsx(
              viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
                : 'flex flex-col gap-2'
            )}>
              {filtered.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  viewMode={viewMode}
                  onOpen={() => navigate(`/project/${project.id}`)}
                  onDelete={() => handleDelete(project.id)}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </main>

      {/* Create modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateProjectModal
            onClose={() => setShowCreate(false)}
            onCreate={p => setProjects(prev => [p, ...prev])}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
