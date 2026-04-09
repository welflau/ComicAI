import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Share2, Star, History, HelpCircle,
  Loader2, User2, Coins,
  FileText, Image, Video, Scissors, Music, ScrollText,
  Upload, LayoutGrid,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useProjectStore } from '@/stores/projectStore'
import WorkflowCanvas from '@/components/canvas/WorkflowCanvas'
import StoryboardView from '@/components/canvas/StoryboardView'
import TimelineView from '@/components/canvas/TimelineView'
import { projectsApi } from '@/api'

// ─── Top bar brand/navigation icons ────────────────────────────────────────────

function TopBar({ projectName }: { projectName: string }) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState(projectName || '未命名')
  const { currentProject } = useProjectStore()

  // sync when project loads
  useEffect(() => {
    if (projectName) setName(projectName)
  }, [projectName])

  return (
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
            {/* backdrop */}
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
          {/* badge */}
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

        {/* Avatar */}
        <div style={{
          width: 28, height: 28,
          background: '#4f6ef7', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>A</span>
        </div>
      </div>
    </header>
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

const TOOLBOX_ITEMS = [
  { id: 1, label: '【预设】左弧滑行',     color: '#2a1a1a' },
  { id: 2, label: '【预设】电商手机弹…',  color: '#1a1a2a' },
  { id: 3, label: '【预设】咖啡杯出场',   color: '#1a2a1a' },
  { id: 4, label: '【预设】360旋转展示',  color: '#2a1a2a' },
  { id: 5, label: '【预设】机械臂视角',   color: '#2a2a1a' },
  { id: 6, label: '【预设】Live 2D',      color: '#1a2a2a' },
  { id: 7, label: '【预设】人物特写',     color: '#2a1a1a' },
  { id: 8, label: '【预设】暗调写真',     color: '#111' },
  { id: 9, label: '【预设】产品礼盒',     color: '#1a1a2a' },
]

// ─── Left icon sidebar ─────────────────────────────────────────────────────────

const ADD_NODE_ITEMS = [
  { id: 'libtv_script',     icon: <FileText size={20} />,  label: '文本',    badge: null,   desc: '剧本、广告词、品牌文案' },
  { id: 'libtv_image',      icon: <Image size={20} />,     label: '图片',    badge: null,   desc: '海报、分镜、角色设计' },
  { id: 'video',            icon: <Video size={20} />,     label: '视频',    badge: null,   desc: '创意广告、动画、电影' },
  { id: 'video_compose',    icon: <Scissors size={20} />,  label: '视频合成', badge: 'Beta', desc: '多个视频片段合为一个' },
  { id: 'audio',            icon: <Music size={20} />,     label: '音频',    badge: null,   desc: '音效、配音、音乐' },
  { id: 'libtv_storyboard', icon: <ScrollText size={20} />,label: '脚本',    badge: 'Beta', desc: '创意脚本、生成故事板' },
]

const ADD_RESOURCE_ITEMS = [
  { id: 'upload',   icon: <Upload size={20} />,     label: '上传',     badge: null, desc: '可上传图片、视频、音频文件' },
  { id: 'library',  icon: <LayoutGrid size={20} />, label: '从图库选择', badge: null, desc: '从历史生成中选择素材' },
]

function LeftSidebar() {
  const [active, setActive] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const { addNode, nodes } = useProjectStore()

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
    hideTimerRef.current = setTimeout(() => setActive(null), 80)
  }

  const cancelHide = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
  }

  const handleAddNode = (typeId: string) => {
    // Only add supported node types
    if (!['libtv_script', 'libtv_storyboard', 'libtv_image'].includes(typeId)) return
    const id = `${typeId}_${Date.now()}`
    // Offset new node slightly from existing ones
    const offset = nodes.length * 20
    addNode({
      id,
      type: typeId as any,
      label: typeId === 'libtv_script' ? '文本' : typeId === 'libtv_image' ? '图片' : '脚本',
      category: typeId === 'libtv_script' ? 'input' : typeId === 'libtv_storyboard' ? 'process' : 'output',
      position: { x: 100 + offset, y: 100 + offset },
      config: {},
    })
    setActive(null)
  }

  const sideItems = [
    { id: 'add',     icon: <Plus size={18} />,        label: '添加' },
    { id: 'toolbox', icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/>
        <circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/>
        <circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>
      </svg>
    ), label: '工具箱' },
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
            {/* Section: 添加节点 */}
            <div style={{ padding: '6px 14px 4px', fontSize: 11, color: '#555', fontWeight: 500 }}>添加节点</div>
            {ADD_NODE_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => handleAddNode(item.id)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: 12, padding: '8px 14px',
                  background: hoveredId === item.id ? '#252525' : 'none',
                  border: 'none', cursor: 'pointer',
                  color: '#ccc', textAlign: 'left',
                  transition: 'background 0.12s',
                  borderRadius: 8,
                }}
              >
                <span style={{
                  width: 36, height: 36, background: '#252525', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: '#aaa',
                }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13 }}>{item.label}</span>
                    {item.badge && (
                      <span style={{
                        fontSize: 10, padding: '1px 5px',
                        background: '#2a2a2a', border: '1px solid #3a3a3a',
                        borderRadius: 4, color: '#666',
                      }}>{item.badge}</span>
                    )}
                  </span>
                  {hoveredId === item.id && item.desc && (
                    <span style={{ display: 'block', fontSize: 11, color: '#666', marginTop: 2, lineHeight: 1.4 }}>
                      {item.desc}
                    </span>
                  )}
                </span>
              </button>
            ))}

            {/* Divider */}
            <div style={{ height: 1, background: '#222', margin: '6px 14px' }} />

            {/* Section: 添加资源 */}
            <div style={{ padding: '6px 14px 4px', fontSize: 11, color: '#555', fontWeight: 500 }}>添加资源</div>
            {ADD_RESOURCE_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActive(null)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  gap: 12, padding: '8px 14px',
                  background: hoveredId === item.id ? '#252525' : 'none',
                  border: 'none', cursor: 'pointer',
                  color: '#ccc', textAlign: 'left',
                  transition: 'background 0.12s',
                  borderRadius: 8,
                }}
              >
                <span style={{
                  width: 36, height: 36, background: '#252525', borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: '#aaa',
                }}>
                  {item.icon}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                  {hoveredId === item.id && item.desc && (
                    <span style={{ display: 'block', fontSize: 11, color: '#666', marginTop: 2, lineHeight: 1.4 }}>
                      {item.desc}
                    </span>
                  )}
                </span>
              </button>
            ))}
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
              padding: '16px 20px',
              borderBottom: '1px solid #242424',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#e0e0e0' }}>我的工具箱</span>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '1px solid #444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}>
                  <HelpCircle size={11} color="#666" />
                </div>
              </div>
              <button
                onClick={() => setActive(null)}
                style={{
                  width: 28, height: 28, background: 'none', border: 'none',
                  cursor: 'pointer', borderRadius: 6,
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

            {/* Grid */}
            <div style={{
              overflowY: 'auto',
              padding: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}>
              {TOOLBOX_ITEMS.map(item => (
                <div
                  key={item.id}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.querySelector('.tb-overlay') as HTMLElement|null)!.style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget.querySelector('.tb-overlay') as HTMLElement|null)!.style.opacity = '0'}
                >
                  <div style={{
                    position: 'relative',
                    borderRadius: 8,
                    overflow: 'hidden',
                    aspectRatio: '4/3',
                    background: item.color,
                    border: '1px solid #2a2a2a',
                  }}>
                    {/* Placeholder gradient */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: `linear-gradient(135deg, ${item.color} 0%, #111 100%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                      </svg>
                    </div>
                    {/* Hover overlay */}
                    <div className="tb-overlay" style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(79,110,247,0.15)',
                      border: '2px solid #4f6ef7',
                      borderRadius: 8,
                      opacity: 0,
                      transition: 'opacity 0.15s',
                    }} />
                  </div>
                  <div style={{
                    fontSize: 12, color: '#aaa',
                    marginTop: 6, paddingLeft: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
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

function BottomBar() {
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

      {/* Middle: canvas fills full width, sidebar floats on top */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {activeView === 'workflow' && <WorkflowCanvas />}
        {activeView === 'storyboard' && <StoryboardView />}
        {activeView === 'timeline' && <TimelineView />}
        {activeView === 'preview' && <PreviewView />}

        {/* Floating sidebar — only on workflow view */}
        {activeView === 'workflow' && (
          <div style={{ position: 'absolute', top: '50%', left: 16, transform: 'translateY(-50%)', zIndex: 20 }}>
            <LeftSidebar />
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <BottomBar />
    </div>
  )
}
