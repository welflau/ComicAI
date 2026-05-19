import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Share2, Star, History, HelpCircle,
  Loader2, User2, Coins, User, LogOut, Settings,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useProjectStore } from '@/stores/projectStore'
import { useLogStore } from '@/stores/logStore'
import { useAuthStore } from '@/stores/authStore'
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import AddNodePanel from '@/components/canvas/AddNodePanel'
import StoryboardView from '@/components/canvas/StoryboardView'
import TimelineView from '@/components/canvas/TimelineView'
import LogPanel from '@/components/panels/LogPanel'
import RightPanel from '@/components/panels/RightPanel'
import SettingsModal from '@/components/settings/SettingsModal'
import { projectsApi } from '@/api'
import { getViewportCenter } from '@/stores/viewportCenter'

// ─── Top bar brand/navigation icons ────────────────────────────────────────────

function TopBar({ projectName }: { projectName: string }) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [name, setName] = useState(projectName || '未命名')
  const { currentProject } = useProjectStore()
  const { user, logout } = useAuthStore()
  const userMenuRef = useRef<HTMLDivElement>(null)

  // sync when project loads
  useEffect(() => {
    if (projectName) setName(projectName)
  }, [projectName])

  // close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showUserMenu])

  // avatar letter
  const avatarLetter = (user?.username ?? user?.email ?? 'A')[0].toUpperCase()

  return (
    <>
      <header
        style={{
          height: 44,
          background: '#111',
          borderBottom: '1px solid #222',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 0,
          flexShrink: 0,
          position: 'relative',
          zIndex: 30,
        }}
      >
        {/* Logo + dropdown */}
        <div style={{ position: 'relative', marginRight: 16 }}>
          <div
            onClick={() => setShowMenu(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
          >
            <div style={{
              width: 22, height: 22,
              background: 'linear-gradient(135deg, #4f6ef7, #8b5cf6)',
              borderRadius: 5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>C</span>
            </div>
            <span style={{ fontSize: 13, color: '#ccc', fontWeight: 600, letterSpacing: 0.2 }}>ComicAI</span>
          </div>

          {showMenu && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setShowMenu(false)}
              />
              <div style={{
                position: 'absolute', top: 30, left: 0, zIndex: 100,
                background: '#1a1a1a', border: '1px solid #2a2a2a',
                borderRadius: 8, minWidth: 140,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              }}>
                {[
                  { label: '回到主页', action: () => navigate('/dashboard') },
                  { label: '全部项目', action: () => navigate('/dashboard') },
                  { label: '创建新项目', action: () => navigate('/dashboard') },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => { item.action(); setShowMenu(false) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '8px 14px', fontSize: 13, color: '#ccc',
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: '1px solid #222',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#252525')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Project name — inline editable */}
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{
            fontSize: 13,
            color: '#ccc',
            marginRight: 'auto',
            background: 'transparent',
            border: '1px solid transparent',
            borderRadius: 5,
            padding: '2px 8px',
            outline: 'none',
            minWidth: 80,
            maxWidth: 280,
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#333')}
          onMouseLeave={e => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'transparent' }}
          onFocus={e => (e.currentTarget.style.borderColor = '#4f6ef7')}
          onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
        />

        {/* Right side controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* ComicAI Skills button */}
          <button style={{
            height: 28, padding: '0 12px',
            background: '#1e1e1e', border: '1px solid #333',
            borderRadius: 6, fontSize: 12, color: '#ccc',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            ComicAI Skills
          </button>

          {/* Share */}
          <button style={{
            width: 28, height: 28,
            background: '#1e1e1e', border: '1px solid #333',
            borderRadius: 6, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Share2 size={13} color="#888" />
          </button>

          {/* Notification bell */}
          <button style={{
            width: 28, height: 28, position: 'relative',
            background: '#1e1e1e', border: '1px solid #333',
            borderRadius: 6, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 7, height: 7, background: '#ef4444',
              borderRadius: '50%', border: '1px solid #111',
            }} />
          </button>

          {/* User info chip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 28, padding: '0 8px',
            background: '#1e1e1e', border: '1px solid #333', borderRadius: 6,
          }}>
            <User2 size={12} color="#888" />
            <span style={{ fontSize: 11, color: '#888' }}>会员特惠39折</span>
            <span style={{ fontSize: 10, color: '#555', margin: '0 2px' }}>•</span>
            <Coins size={11} color="#f59e0b" />
            <span style={{ fontSize: 11, color: '#aaa' }}>100</span>
            <span style={{ fontSize: 11, color: '#666' }}>免费发布</span>
          </div>

          {/* Avatar — user menu trigger */}
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                width: 28, height: 28,
                background: showUserMenu ? '#6366f1' : '#4f6ef7',
                borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s',
                outline: showUserMenu ? '2px solid rgba(99,102,241,0.4)' : 'none',
              }}
              onMouseEnter={e => { if (!showUserMenu) (e.currentTarget as HTMLDivElement).style.background = '#6366f1' }}
              onMouseLeave={e => { if (!showUserMenu) (e.currentTarget as HTMLDivElement).style.background = '#4f6ef7' }}
            >
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>{avatarLetter}</span>
            </div>

            {showUserMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: '#1a1a1a', border: '1px solid #2e2e2e',
                borderRadius: 12, minWidth: 190,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                overflow: 'hidden', zIndex: 200,
              }}>
                {/* User info */}
                <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #252525' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: 'rgba(99,102,241,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <User size={16} color="#818cf8" />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>
                        {user?.username ?? '用户'}
                      </div>
                      {user?.email && (
                        <div style={{ fontSize: 11, color: '#555', marginTop: 1 }}>
                          {user.email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div style={{ padding: '6px 0' }}>
                  {[
                    { icon: Settings, label: '系统设置', onClick: () => { setShowSettings(true); setShowUserMenu(false) }, danger: false },
                    { icon: LogOut,   label: '退出登录',  onClick: () => { logout(); navigate('/login') }, danger: true },
                  ].map(({ icon: Icon, label, onClick, danger }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                        padding: '8px 14px', background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 13,
                        color: danger ? '#f87171' : '#aaa',
                        transition: 'background 0.1s, color 0.1s',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#242424'
                        e.currentTarget.style.color = danger ? '#fca5a5' : '#e0e0e0'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'none'
                        e.currentTarget.style.color = danger ? '#f87171' : '#aaa'
                      }}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </>
  )
}

// ─── Assets Panel ──────────────────────────────────────────────────────────────

const ASSET_TABS = ['全部', '人物', '场景', '物品', '风格', '音效', '其他']

function AssetsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState('全部')
  const [subTab, setSubTab] = useState<'我的素材' | '我的主体库'>('我的素材')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
      {/* Top row: title tabs + close */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {(['我的素材', '我的主体库'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 15, fontWeight: subTab === t ? 600 : 400,
                color: subTab === t ? '#e0e0e0' : '#555',
                padding: '0 0 10px',
                borderBottom: subTab === t ? '2px solid #e0e0e0' : '2px solid transparent',
                transition: 'color 0.15s',
              }}
            >{t}</button>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, background: 'none', border: 'none',
            cursor: 'pointer', borderRadius: 6, marginBottom: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#666' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#242424', flexShrink: 0 }} />

      {/* Category tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '10px 16px',
        flexShrink: 0,
      }}>
        {ASSET_TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              background: tab === t ? '#e0e0e0' : 'transparent',
              color: tab === t ? '#111' : '#777',
              fontWeight: tab === t ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { if (tab !== t) e.currentTarget.style.background = '#252525' }}
            onMouseLeave={e => { if (tab !== t) e.currentTarget.style.background = 'transparent' }}
          >{t}</button>
        ))}
      </div>

      {/* Content area */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#555', fontSize: 14,
      }}>
        暂无素材
      </div>
    </div>
  )
}

// ─── Toolbox mock data ─────────────────────────────────────────────────────────

interface WorkflowNode { type: string; label: string; dx: number; dy: number; extra?: Record<string, unknown> }
interface WorkflowPreset {
  id: number
  label: string
  desc: string
  color: string
  accent: string
  chain: string[]   // node labels shown as preview chips
  nodes: WorkflowNode[]
  edges: Array<[number, number]>  // [fromIdx, toIdx]
}

const WORKFLOW_PRESETS: WorkflowPreset[] = [
  {
    id: 1, label: '文生图', desc: '输入剧本描述，直接生成一张配图',
    color: '#1a1a2e', accent: '#7c6af7',
    chain: ['文本', '图片'],
    nodes: [
      { type: 'libtv_script', label: '剧本', dx: 0,   dy: 0 },
      { type: 'libtv_image',  label: '图片', dx: 600,  dy: 0 },
    ],
    edges: [[0, 1]],
  },
  {
    id: 2, label: '文生视频', desc: '从剧本一步生成视频片段',
    color: '#1a1e2e', accent: '#4a9eff',
    chain: ['文本', '视频'],
    nodes: [
      { type: 'libtv_script', label: '剧本', dx: 0,   dy: 0 },
      { type: 'libtv_video',  label: '视频', dx: 600,  dy: 0 },
    ],
    edges: [[0, 1]],
  },
  {
    id: 3, label: '分镜脚本', desc: '剧本拆解为分镜表，逐镜生成图片',
    color: '#1e1a2e', accent: '#9b8fff',
    chain: ['文本', '分镜脚本', '图片'],
    nodes: [
      { type: 'libtv_script',     label: '剧本',   dx: 0,    dy: 0 },
      { type: 'libtv_script_gen', label: '分镜脚本', dx: 600,  dy: 0 },
      { type: 'libtv_image',      label: '配图',   dx: 1200, dy: 0 },
    ],
    edges: [[0, 1], [1, 2]],
  },
  {
    id: 4, label: '图生视频', desc: '上传参考图，生成动态视频',
    color: '#1e2a1a', accent: '#4caf50',
    chain: ['图片', '视频'],
    nodes: [
      { type: 'libtv_image', label: '参考图', dx: 0,   dy: 0 },
      { type: 'libtv_video', label: '视频',  dx: 580,  dy: 0 },
    ],
    edges: [[0, 1]],
  },
  {
    id: 5, label: '多镜头合成', desc: '多段视频拼接成完整作品',
    color: '#2a1a1a', accent: '#ff8c42',
    chain: ['视频1', '视频2', '合成'],
    nodes: [
      { type: 'libtv_video',         label: '视频1', dx: 0,    dy: -160 },
      { type: 'libtv_video',         label: '视频2', dx: 0,    dy: 160  },
      { type: 'libtv_video_compose', label: '合成',  dx: 600,  dy: 0    },
    ],
    edges: [[0, 2], [1, 2]],
  },
  {
    id: 6, label: '角色设计', desc: '从剧本提取角色，批量生成人物设定图',
    color: '#2a1e1a', accent: '#ff6b9d',
    chain: ['文本', '角色图×N'],
    nodes: [
      { type: 'libtv_script', label: '剧本',     dx: 0, dy: 0 },
    ],
    edges: [],
  },
  {
    id: 7, label: '小说转图', desc: '导入小说，按章节自动拆分并生成配图',
    color: '#1a2a2a', accent: '#26c6da',
    chain: ['小说文本', '章节分解', '分镜'],
    nodes: [
      { type: 'libtv_script',        label: '小说',   dx: 0,    dy: 0 },
      { type: 'libtv_chapter_split', label: '章节分解', dx: 600,  dy: 0 },
      { type: 'libtv_script_gen',    label: '分镜脚本', dx: 1200, dy: 0 },
    ],
    edges: [[0, 1], [1, 2]],
  },
  {
    id: 8, label: '循环批处理', desc: '遍历组内节点，逐一推送给下游处理',
    color: '#1e2a1e', accent: '#66bb6a',
    chain: ['节点组', '循环', '分镜脚本'],
    nodes: [
      { type: 'libtv_group',      label: '节点组', dx: 0,    dy: 0 },
      { type: 'libtv_loop',       label: '循环',   dx: 320,  dy: 0 },
      { type: 'libtv_script_gen', label: '分镜',   dx: 680,  dy: 0 },
    ],
    edges: [[0, 1], [1, 2]],
  },
  {
    id: 9, label: '完整漫画流水线', desc: '从剧本到分镜图到视频的完整链路',
    color: '#1a1a1a', accent: '#ffd54f',
    chain: ['文本', '分镜脚本', '图片', '视频', '合成'],
    nodes: [
      { type: 'libtv_script',        label: '剧本',   dx: 0,    dy: 0 },
      { type: 'libtv_script_gen',    label: '分镜脚本', dx: 600,  dy: 0 },
      { type: 'libtv_image',         label: '配图',   dx: 1200, dy: -120 },
      { type: 'libtv_video',         label: '视频',   dx: 1800, dy: -120 },
      { type: 'libtv_video_compose', label: '合成',   dx: 2400, dy: 0 },
    ],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
]

// ─── Left icon sidebar ─────────────────────────────────────────────────────────

function LeftSidebar() {
  const [active, setActive] = useState<string | null>(null)
  const [wfTab, setWfTab]   = useState<'mine' | 'basic' | 'examples'>('basic')
  const hideTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tabSwitchingRef = useRef(false)   // blocks scheduleHide during tab switch
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const { nodes, addNode, addEdge } = useProjectStore()

  // Create a preset workflow at viewport center
  const createWorkflow = (preset: WorkflowPreset) => {
    const center = getViewportCenter()
    const ts = Date.now()
    const ids: string[] = []
    preset.nodes.forEach((n, i) => {
      const id = `${n.type}_${ts}_${i}`
      ids.push(id)
      addNode({
        id, type: n.type as any, label: n.label,
        category: 'process' as any,
        position: { x: center.x + n.dx - (preset.nodes.length * 300) / 2, y: center.y + n.dy },
        config: {},
        ...n.extra,
      } as any)
    })
    preset.edges.forEach(([from, to], ei) => {
      addEdge({ id: `e_${ts}_${ei}`, source: ids[from], target: ids[to] })
    })
    setActive(null)
  }

  // IDs that have a real flyout panel
  const PANEL_IDS = ['add', 'toolbox', 'assets']

  const showPanel = (id: string) => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (PANEL_IDS.includes(id)) {
      setActive(id)
    } else {
      // No panel for this button — close whatever is open immediately
      setActive(null)
    }
  }

  const scheduleHide = () => {
    if (tabSwitchingRef.current) return   // ignore during tab switch
    hideTimerRef.current = setTimeout(() => setActive(null), 80)
  }

  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }

  const sideItems = [
    { id: 'add',     icon: <Plus size={18} />,        label: '添加' },
    { id: 'toolbox', icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ), label: '工作流' },
    { id: 'assets',  icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    ), label: '素材库' },
    { id: 'history', icon: <History size={17} />,     label: '历史' },
    { id: 'help',    icon: <HelpCircle size={17} />,  label: '帮助' },
    { id: 'more',    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
      </svg>
    ), label: '更多' },
  ]

  return (
    <div
      onMouseLeave={scheduleHide}
      style={{ display: 'flex', flexShrink: 0, position: 'relative', zIndex: 20 }}
    >
      {/* Icon rail */}
      <div style={{
        width: 44,
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 0',
        gap: 2,
        position: 'relative',
        zIndex: 30,
      }}>
        {sideItems.map((item) => (
          <button
            key={item.id}
            ref={item.id === 'add' ? addBtnRef : undefined}
            title={item.label}
            onMouseEnter={() => showPanel(item.id)}
            style={{
              width: 36, height: 36,
              border: 'none',
              borderRadius: 8,
              background: active === item.id ? '#2a2a2a' : 'transparent',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: active === item.id ? '#fff' : '#555',
              transition: 'background 0.15s, color 0.15s',
            }}
            onFocus={() => showPanel(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {/* Add panel */}
      {active === 'add' && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 15 }}
            onClick={() => setActive(null)}
          />
          <div
            onMouseEnter={cancelHide}
            style={{
              position: 'absolute',
              top: addBtnRef.current ? addBtnRef.current.offsetTop : 0,
              left: 44, zIndex: 16,
              width: 220,
              background: '#1c1c1c',
              border: '1px solid #2a2a2a',
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              padding: '8px 0 12px',
            }}>
            <AddNodePanel onClose={() => setActive(null)} />
          </div>
        </>
      )}

      {/* Toolbox panel */}
      {active === 'toolbox' && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 15 }}
            onClick={() => setActive(null)}
          />
          <div onMouseEnter={cancelHide} onMouseLeave={scheduleHide} style={{
            position: 'fixed',
            top: '50%', left: 60,
            transform: 'translateY(-50%)',
            zIndex: 16,
            width: 700,
            maxHeight: '75vh',
            background: '#1c1c1c',
            border: '1px solid #2a2a2a',
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px 0',
              flexShrink: 0,
            }}>
              {/* Tab bar */}
              <div style={{ display: 'flex', gap: 2 }}>
                {([
                  { id: 'mine',     label: '我的工作流' },
                  { id: 'basic',    label: '基础工作流' },
                  { id: 'examples', label: '工作流案例' },
                ] as const).map(tab => (
                  <button key={tab.id} onClick={() => {
                      tabSwitchingRef.current = true
                      cancelHide()
                      setWfTab(tab.id)
                      setTimeout(() => { tabSwitchingRef.current = false }, 300)
                    }}
                    style={{
                      padding: '6px 14px', borderRadius: '8px 8px 0 0', border: 'none',
                      background: wfTab === tab.id ? '#252525' : 'transparent',
                      color: wfTab === tab.id ? '#e0e0e0' : '#666',
                      fontSize: 13, fontWeight: wfTab === tab.id ? 600 : 400,
                      cursor: 'pointer',
                      borderBottom: wfTab === tab.id ? '2px solid #7c6af7' : '2px solid transparent',
                      transition: 'color 0.12s',
                    }}
                    onMouseEnter={e => { if (wfTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#aaa' }}
                    onMouseLeave={e => { if (wfTab !== tab.id) (e.currentTarget as HTMLButtonElement).style.color = '#666' }}
                  >{tab.label}</button>
                ))}
              </div>
              <button
                onClick={() => setActive(null)}
                style={{
                  width: 28, height: 28, background: 'none', border: 'none',
                  cursor: 'pointer', borderRadius: 6, marginBottom: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ccc' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#666' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Tab divider */}
            <div style={{ height: 1, background: '#242424', flexShrink: 0 }} />

            {/* ── 我的工作流 ── */}
            {wfTab === 'mine' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.2">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <path d="M9 9h6M9 12h6M9 15h4"/>
                </svg>
                <div style={{ fontSize: 14, color: '#555', textAlign: 'center' }}>
                  还没有保存的工作流
                </div>
                <div style={{ fontSize: 12, color: '#3a3a3a', textAlign: 'center', maxWidth: 240 }}>
                  在画布中搭建好工作流后，右键画布空白处 → 「保存为工作流」即可收藏到这里
                </div>
              </div>
            )}

            {/* ── 基础工作流（原有 Grid）── */}
            {wfTab === 'basic' && (
            <div style={{
              overflowY: 'auto',
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}>
              {WORKFLOW_PRESETS.map(preset => (
                <div
                  key={preset.id}
                  onClick={() => createWorkflow(preset)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Card */}
                  <div style={{
                    position: 'relative', borderRadius: 10, overflow: 'hidden',
                    aspectRatio: '4/3', background: preset.color,
                    border: '1px solid #2a2a2a',
                    transition: 'border-color 0.15s, transform 0.1s',
                  }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = preset.accent
                      ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'
                      ;(e.currentTarget as HTMLElement).style.transform = 'none'
                    }}
                  >
                    {/* Background gradient */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: `radial-gradient(ellipse at 30% 40%, ${preset.accent}22 0%, transparent 70%)`,
                    }} />
                    {/* Node chain preview */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: 4, padding: '0 12px', flexWrap: 'wrap',
                    }}>
                      {preset.chain.map((name, i) => (
                        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            padding: '2px 7px', borderRadius: 5,
                            background: `${preset.accent}22`,
                            border: `1px solid ${preset.accent}55`,
                            fontSize: 10, color: preset.accent, whiteSpace: 'nowrap',
                            fontWeight: 500,
                          }}>{name}</span>
                          {i < preset.chain.length - 1 && (
                            <span style={{ color: '#444', fontSize: 10 }}>→</span>
                          )}
                        </span>
                      ))}
                    </div>
                    {/* Hover: 一键创建 */}
                    <div className="wf-hover" style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(0,0,0,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: 0, transition: 'opacity 0.15s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}
                    >
                      <span style={{
                        padding: '5px 14px', borderRadius: 8,
                        background: preset.accent, color: '#fff',
                        fontSize: 12, fontWeight: 600,
                      }}>一键创建</span>
                    </div>
                  </div>
                  {/* Label + desc */}
                  <div style={{ marginTop: 7, paddingLeft: 2 }}>
                    <div style={{ fontSize: 12, color: '#ccc', fontWeight: 500 }}>{preset.label}</div>
                    <div style={{ fontSize: 10, color: '#555', marginTop: 2, lineHeight: 1.4,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{preset.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            )}

            {/* ── 工作流案例 ── */}
            {wfTab === 'examples' && (
              <div style={{ overflowY: 'auto', padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                {[
                  {
                    id: 'e1', label: '古风爱情漫画', tag: '漫画创作',
                    desc: '从古风爱情故事剧本，自动生成 5 幕分镜脚本，再批量生成水墨风配图，最终合成完整漫画视频。',
                    color: '#1e1a2e', accent: '#c8a0ff',
                    chain: ['剧本', '分镜脚本×5', '配图×5', '视频合成'],
                    nodes: [
                      { type: 'libtv_script', label: '古风剧本', dx: 0, dy: 0, extra: { content: '一位江南才女与云游侠客的月下邂逅……', initialMode: 'content' } },
                      { type: 'libtv_script_gen', label: '分镜脚本', dx: 600, dy: 0 },
                      { type: 'libtv_image', label: '配图1', dx: 1200, dy: -120, extra: { imagePrompt: '古风，江南水乡，月色朦胧，远景' } },
                      { type: 'libtv_video_compose', label: '视频合成', dx: 1800, dy: 0 },
                    ],
                    edges: [[0,1],[1,2],[2,3]] as [number,number][],
                  },
                  {
                    id: 'e2', label: '小说批量配图', tag: '小说创作',
                    desc: '导入长篇小说，自动按章节拆分后打组，循环遍历每章生成分镜脚本，实现批量配图。',
                    color: '#1a2a1e', accent: '#4caf50',
                    chain: ['小说 .md', '章节分解', '章节组', '循环', '分镜脚本'],
                    nodes: [
                      { type: 'libtv_script', label: '小说全文', dx: 0, dy: 0 },
                      { type: 'libtv_chapter_split', label: '章节分解', dx: 600, dy: 0 },
                      { type: 'libtv_loop', label: '循环遍历', dx: 1000, dy: 0 },
                      { type: 'libtv_script_gen', label: '分镜脚本', dx: 1360, dy: 0 },
                    ],
                    edges: [[0,1],[1,2],[2,3]] as [number,number][],
                  },
                  {
                    id: 'e3', label: '角色一致性生图', tag: '角色设计',
                    desc: '先从剧本提取角色外貌描述，生成角色参考图，再以参考图为基准批量生成各场景中的角色形象。',
                    color: '#2a1a1e', accent: '#ff6b9d',
                    chain: ['剧本', '角色图×N', '分镜图'],
                    nodes: [
                      { type: 'libtv_script', label: '剧本', dx: 0, dy: 0 },
                      { type: 'libtv_image', label: '角色参考图', dx: 600, dy: -80 },
                      { type: 'libtv_image', label: '分镜配图', dx: 600, dy: 80 },
                    ],
                    edges: [[0,1],[0,2]] as [number,number][],
                  },
                  {
                    id: 'e4', label: '产品宣传视频', tag: '商业应用',
                    desc: '输入产品描述文案，生成多角度展示图片，再转化为动态视频片段，拼接成完整宣传视频。',
                    color: '#1a1e2a', accent: '#ffd54f',
                    chain: ['文案', '产品图×3', '视频×3', '合成'],
                    nodes: [
                      { type: 'libtv_script', label: '产品文案', dx: 0, dy: 0 },
                      { type: 'libtv_image', label: '产品图', dx: 600, dy: 0 },
                      { type: 'libtv_video', label: '展示视频', dx: 1200, dy: 0 },
                      { type: 'libtv_video_compose', label: '合成', dx: 1800, dy: 0 },
                    ],
                    edges: [[0,1],[1,2],[2,3]] as [number,number][],
                  },
                ].map(ex => (
                  <div key={ex.id} onClick={() => createWorkflow(ex as any)} style={{ cursor: 'pointer' }}>
                    <div style={{
                      position: 'relative', borderRadius: 10, overflow: 'hidden',
                      height: 120, background: ex.color,
                      border: '1px solid #2a2a2a',
                      transition: 'border-color 0.15s, transform 0.1s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = ex.accent; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#2a2a2a'; (e.currentTarget as HTMLElement).style.transform = 'none' }}
                    >
                      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 20% 50%, ${ex.accent}22 0%, transparent 65%)` }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 4, flexWrap: 'wrap' }}>
                        {ex.chain.map((n, i) => (
                          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ padding: '2px 7px', borderRadius: 5, background: `${ex.accent}22`, border: `1px solid ${ex.accent}55`, fontSize: 10, color: ex.accent, whiteSpace: 'nowrap', fontWeight: 500 }}>{n}</span>
                            {i < ex.chain.length - 1 && <span style={{ color: '#444', fontSize: 10 }}>→</span>}
                          </span>
                        ))}
                      </div>
                      <div style={{ position: 'absolute', top: 8, right: 10 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: `${ex.accent}33`, fontSize: 10, color: ex.accent }}>{ex.tag}</span>
                      </div>
                      <div className="wf-hover" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0' }}>
                        <span style={{ padding: '5px 14px', borderRadius: 8, background: ex.accent, color: '#fff', fontSize: 12, fontWeight: 600 }}>一键使用</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 7, paddingLeft: 2 }}>
                      <div style={{ fontSize: 12, color: '#ccc', fontWeight: 500 }}>{ex.label}</div>
                      <div style={{ fontSize: 10, color: '#555', marginTop: 2, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{ex.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </>
      )}
      {/* Assets panel */}
      {active === 'assets' && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 15 }}
            onClick={() => setActive(null)}
          />
          <div onMouseEnter={cancelHide} onMouseLeave={scheduleHide} style={{
            position: 'fixed',
            top: '50%', left: 60,
            transform: 'translateY(-50%)',
            zIndex: 16,
            width: 700,
            height: '72vh',
            background: '#1c1c1c',
            border: '1px solid #2a2a2a',
            borderRadius: 16,
            boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <AssetsPanel onClose={() => setActive(null)} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Bottom zoom bar ───────────────────────────────────────────────────────────

function BottomBar({ onToggleLog, logOpen, errorCount }: { onToggleLog?: () => void; logOpen?: boolean; errorCount?: number }) {
  const [zoom, setZoom] = useState(87)
  return (
    <div style={{
      height: 36,
      background: '#111',
      borderTop: '1px solid #1e1e1e',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: 6,
      flexShrink: 0,
    }}>
      {/* User avatar */}
      <div style={{
        width: 20, height: 20, borderRadius: 4,
        background: '#4f6ef7',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: '#fff', fontWeight: 600,
      }}>A</div>

      {/* Settings */}
      <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {/* Log toggle button — always visible in status bar */}
      {onToggleLog && (
        <button
          onClick={onToggleLog}
          title={logOpen ? '隐藏日志' : '查看日志'}
          style={{
            position: 'relative',
            display: 'flex', alignItems: 'center', gap: 5,
            height: 24, padding: '0 8px',
            background: logOpen ? '#1e2a1e' : 'none',
            border: `1px solid ${logOpen ? '#2a4a2a' : '#252525'}`,
            borderRadius: 5, cursor: 'pointer',
            color: logOpen ? '#4ade80' : (errorCount ?? 0) > 0 ? '#f87171' : '#555',
            fontSize: 11,
            transition: 'color 0.15s, border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => {
            if (!logOpen) {
              e.currentTarget.style.background = '#1e1e1e'
              e.currentTarget.style.borderColor = '#333'
              e.currentTarget.style.color = (errorCount ?? 0) > 0 ? '#fca5a5' : '#aaa'
            }
          }}
          onMouseLeave={e => {
            if (!logOpen) {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.borderColor = '#252525'
              e.currentTarget.style.color = (errorCount ?? 0) > 0 ? '#f87171' : '#555'
            }
          }}
        >
          {/* Terminal icon */}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 17 10 11 4 5"/>
            <line x1="12" y1="19" x2="20" y2="19"/>
          </svg>
          日志
          {(errorCount ?? 0) > 0 && !logOpen && (
            <span style={{
              minWidth: 14, height: 14, borderRadius: 7,
              background: '#ef4444',
              color: '#fff', fontSize: 9, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px',
            }}>
              {errorCount}
            </span>
          )}
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Zoom controls */}
      <button
        onClick={() => setZoom(z => Math.max(10, z - 10))}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
      >−</button>
      <span style={{ fontSize: 12, color: '#777', minWidth: 34, textAlign: 'center' }}>{zoom}%</span>
      <button
        onClick={() => setZoom(z => Math.min(300, z + 10))}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
      >+</button>
    </div>
  )
}

// ─── Preview placeholder ───────────────────────────────────────────────────────

function PreviewView() {
  return (
    <div className="h-full flex items-center justify-center" style={{ background: '#0d0d0d' }}>
      <div style={{ color: '#333', textAlign: 'center' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1" style={{ margin: '0 auto 12px' }}>
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <p style={{ fontSize: 14, color: '#444' }}>暂无预览</p>
      </div>
    </div>
  )
}

// ─── Main editor ───────────────────────────────────────────────────────────────

export default function ProjectEditor() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const {
    currentProject, scripts, storyboards,
    activeView, setActiveView, loadProject,
    isLoading, tasks, addTask, startTaskPolling
  } = useProjectStore()

  const [runningTask, setRunningTask] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [rightPanelWidth, setRightPanelWidth] = useState(260)
  const isDraggingPanel = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  // Badge: count unread errors/warns
  const errorCount = useLogStore(s => s.entries.filter(e => e.level === 'error' || e.level === 'warn').length)

  useEffect(() => {
    if (projectId) {
      loadProject(projectId).catch(() => {
        toast.error('加载项目失败')
        navigate('/dashboard')
      })
    }
  }, [projectId])

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d0d' }}>
        <Loader2 size={24} color="#444" className="animate-spin" />
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0d0d0d', overflow: 'hidden' }}>
      {/* Top bar */}
      <TopBar projectName={currentProject?.name || '未命名'} />

      {/* Middle: canvas + right panel */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>
        {/* Canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeView === 'workflow' && <WorkflowCanvas />}
          {activeView === 'storyboard' && <StoryboardView />}
          {activeView === 'timeline' && <TimelineView />}
          {activeView === 'preview' && <PreviewView />}

          {/* Floating left sidebar — only on workflow view */}
          {activeView === 'workflow' && (
            <div style={{ position: 'absolute', top: '50%', left: 16, transform: 'translateY(-50%)', zIndex: 20 }}>
              <LeftSidebar />
            </div>
          )}

          {/* Right panel toggle button — only shown when panel is collapsed */}
          {!rightPanelOpen && (
            <div style={{ position: 'absolute', top: '50%', right: 16, transform: 'translateY(-50%)', zIndex: 20 }}>
              <button
                onClick={() => setRightPanelOpen(true)}
                title="展开 AI 面板"
                style={{
                  width: 44,
                  background: '#1a1a1a',
                  border: '1px solid #2a2a2a',
                  borderRadius: 12,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '10px 0',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, color: '#555', transition: 'color 0.15s, background 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ccc'; (e.currentTarget as HTMLElement).style.background = '#2a2a2a' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {/* Bot icon */}
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="10" rx="2"/>
                    <circle cx="12" cy="5" r="2"/>
                    <line x1="12" y1="7" x2="12" y2="11"/>
                    <line x1="8" y1="16" x2="8" y2="16" strokeLinecap="round" strokeWidth="2.5"/>
                    <line x1="16" y1="16" x2="16" y2="16" strokeLinecap="round" strokeWidth="2.5"/>
                  </svg>
                </span>
                <span style={{ fontSize: 10, color: '#555', letterSpacing: 0.2 }}>AI</span>
                {errorCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 8, height: 8,
                    background: '#ef4444', borderRadius: '50%',
                    border: '1px solid #1a1a1a',
                  }} />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Right panel — resizable sidebar */}
        {rightPanelOpen && (
          <div style={{ width: rightPanelWidth, flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/* Drag-to-resize handle */}
            <div
              onMouseDown={e => {
                isDraggingPanel.current = true
                dragStartX.current = e.clientX
                dragStartWidth.current = rightPanelWidth
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
                const onMove = (ev: MouseEvent) => {
                  if (!isDraggingPanel.current) return
                  const delta = dragStartX.current - ev.clientX
                  const newW = Math.min(520, Math.max(200, dragStartWidth.current + delta))
                  setRightPanelWidth(newW)
                }
                const onUp = () => {
                  isDraggingPanel.current = false
                  document.body.style.cursor = ''
                  document.body.style.userSelect = ''
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
              style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: 4, cursor: 'col-resize', zIndex: 20,
                background: 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.4)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            />
            {/* Collapse button */}
            <button
              onClick={() => setRightPanelOpen(false)}
              title="收起面板"
              style={{
                position: 'absolute', top: 8, left: -14, zIndex: 10,
                width: 20, height: 20,
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#555',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ccc' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#555' }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <RightPanel />
          </div>
        )}

        {/* Log panel overlay (legacy, keep for backward compat) */}
        {logOpen && (
          <LogPanel onClose={() => setLogOpen(false)} />
        )}
      </div>

      {/* Bottom bar */}
      <BottomBar onToggleLog={() => setLogOpen(v => !v)} logOpen={logOpen} errorCount={errorCount} />
    </div>
  )
}
