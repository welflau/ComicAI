import { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Workflow, Film, Clock, Eye,
  ChevronLeft, Users, Wifi, WifiOff, Play, Loader2,
  Plus
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useProjectStore } from '@/stores/projectStore'
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import StoryboardView from '@/components/canvas/StoryboardView'
import TimelineView from '@/components/canvas/TimelineView'
import LeftPanel from '@/components/panels/LeftPanel'
import RightPanel from '@/components/panels/RightPanel'
import { projectsApi } from '@/api'

type ViewMode = 'workflow' | 'storyboard' | 'timeline' | 'preview'

const VIEW_TABS: { id: ViewMode; label: string; icon: React.ElementType }[] = [
  { id: 'workflow', label: '工作流', icon: Workflow },
  { id: 'storyboard', label: '分镜板', icon: Film },
  { id: 'timeline', label: '时间轴', icon: Clock },
  { id: 'preview', label: '预览', icon: Eye },
]

// Quick action bar - run AI pipeline steps
const QUICK_ACTIONS = [
  { taskType: 'script_parse', label: '解析剧本', color: 'btn-ghost' },
  { taskType: 'storyboard_gen', label: '生成分镜', color: 'btn-ghost' },
  { taskType: 'image_gen', label: '生成图像', color: 'btn-ghost' },
  { taskType: 'tts', label: '合成配音', color: 'btn-ghost' },
  { taskType: 'auto_edit', label: '智能剪辑', color: 'btn-primary' },
]

function PreviewView() {
  const { storyboards } = useProjectStore()
  const shots = storyboards[0]?.shots || []

  return (
    <div className="h-full flex items-center justify-center bg-black">
      {shots.length === 0 ? (
        <div className="text-white/30 text-center">
          <Eye className="w-16 h-16 mx-auto mb-4" />
          <p className="text-lg">暂无预览内容</p>
          <p className="text-sm mt-2">请先生成分镜和图像</p>
        </div>
      ) : (
        <div className="relative w-full max-w-4xl mx-auto aspect-video bg-canvas-bg rounded-xl overflow-hidden border border-canvas-border">
          {shots[0]?.image_url ? (
            <img src={shots[0].image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20">
              <Eye className="w-12 h-12" />
            </div>
          )}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <button className="btn-primary flex items-center gap-2 px-6 py-2.5">
              <Play className="w-4 h-4" />
              播放预览
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectEditor() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const {
    currentProject, storyboards, tasks,
    activeView, setActiveView, loadProject,
    isLoading, wsConnected
  } = useProjectStore()

  const [runningTask, setRunningTask] = useState<string | null>(null)

  useEffect(() => {
    if (projectId) {
      loadProject(projectId).catch(e => {
        toast.error('加载项目失败')
        navigate('/dashboard')
      })
    }
  }, [projectId])

  const handleRunTask = async (taskType: string) => {
    if (!projectId || !currentProject) return
    setRunningTask(taskType)
    try {
      const scriptId = storyboards[0]?.script_id
      const storyboardId = storyboards[0]?.id

      const params: Record<string, unknown> = {}
      if (taskType === 'script_parse' && scriptId) params.script_id = scriptId
      if (taskType === 'storyboard_gen' && scriptId) params.script_id = scriptId
      if (['image_gen', 'tts', 'auto_edit'].includes(taskType) && storyboardId) {
        params.storyboard_id = storyboardId
      }

      await projectsApi.runTask(projectId, { task_type: taskType, params })
      toast.success('任务已提交')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '提交失败'
      toast.error(msg)
    } finally {
      setRunningTask(null)
    }
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas-bg">
        <div className="flex items-center gap-3 text-white/50">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>加载项目中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-canvas-bg overflow-hidden">
      {/* ── Top Bar ── */}
      <header className="flex items-center gap-3 px-4 py-2.5 border-b border-canvas-border bg-canvas-surface flex-shrink-0">
        {/* Back + project name */}
        <button onClick={() => navigate('/dashboard')} className="btn-ghost p-1.5">
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary-500/20 flex items-center justify-center">
            <Film className="w-3.5 h-3.5 text-primary-400" />
          </div>
          <span className="text-sm font-semibold truncate max-w-[160px]">
            {currentProject?.name || '加载中...'}
          </span>
        </div>

        {/* View tabs */}
        <div className="flex gap-0.5 bg-canvas-bg rounded-lg p-0.5 ml-4">
          {VIEW_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                activeView === tab.id
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-white/40 hover:text-white/70'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 ml-4 border-l border-canvas-border pl-4">
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.taskType}
              onClick={() => handleRunTask(action.taskType)}
              disabled={!!runningTask}
              className={clsx(
                action.color,
                'text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50'
              )}
            >
              {runningTask === action.taskType ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {action.label}
            </button>
          ))}
        </div>

        {/* Status indicators */}
        <div className="ml-auto flex items-center gap-3">
          {/* Active tasks count */}
          {tasks.filter(t => t.status === 'running').length > 0 && (
            <div className="flex items-center gap-1.5 text-yellow-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">{tasks.filter(t => t.status === 'running').length} 任务运行中</span>
            </div>
          )}

          {/* WebSocket status */}
          <div className={clsx('flex items-center gap-1.5', wsConnected ? 'text-green-400' : 'text-white/30')}>
            {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="text-xs">{wsConnected ? '已连接' : '离线'}</span>
          </div>

          {/* Collab avatars */}
          <div className="flex -space-x-1.5">
            {[...Array(2)].map((_, i) => (
              <div
                key={i}
                className="w-7 h-7 rounded-full bg-primary-500/30 border-2 border-canvas-surface flex items-center justify-center"
              >
                <Users className="w-3 h-3 text-primary-400" />
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main 3-column layout ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel — only show for workflow view */}
        {activeView === 'workflow' && (
          <div className="w-56 flex-shrink-0">
            <LeftPanel />
          </div>
        )}

        {/* Center canvas */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'workflow' && <WorkflowCanvas />}
          {activeView === 'storyboard' && <StoryboardView />}
          {activeView === 'timeline' && <TimelineView />}
          {activeView === 'preview' && <PreviewView />}
        </div>

        {/* Right panel — always visible */}
        <div className="w-64 flex-shrink-0">
          <RightPanel />
        </div>
      </div>
    </div>
  )
}
