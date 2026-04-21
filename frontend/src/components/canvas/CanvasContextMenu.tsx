import { useEffect, useRef } from 'react'
import { Upload, Bookmark, PlusSquare, Undo2, Redo2, Clipboard } from 'lucide-react'

interface MenuItem {
  icon?: React.ReactNode
  label: string
  shortcut?: string
  disabled?: boolean
  dividerAfter?: boolean
  onClick: () => void
}

interface CanvasContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onAddNode: () => void
}

export default function CanvasContextMenu({ x, y, onClose, onAddNode }: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to stay inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
  }

  const items: MenuItem[] = [
    {
      icon: <Upload size={13} />,
      label: '上传',
      onClick: () => { onClose() },
    },
    {
      icon: <Bookmark size={13} />,
      label: '保存到我的素材',
      disabled: true,
      dividerAfter: true,
      onClick: () => { onClose() },
    },
    {
      icon: <PlusSquare size={13} />,
      label: '添加节点',
      dividerAfter: true,
      onClick: () => { onAddNode() },
    },
    {
      icon: <Undo2 size={13} />,
      label: '撤销',
      shortcut: '⌘Z',
      disabled: true,
      onClick: () => { onClose() },
    },
    {
      icon: <Redo2 size={13} />,
      label: '重做',
      shortcut: '⇧⌘Z',
      disabled: true,
      dividerAfter: true,
      onClick: () => { onClose() },
    },
    {
      icon: <Clipboard size={13} />,
      label: '粘贴',
      shortcut: '⌘V',
      onClick: () => { onClose() },
    },
  ]

  return (
    <div
      ref={menuRef}
      style={style}
      onContextMenu={e => e.preventDefault()}
    >
      <div style={{
        background: '#1e1e1e',
        border: '1px solid #333',
        borderRadius: 10,
        padding: '5px 0',
        minWidth: 200,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {items.map((item, idx) => (
          <div key={idx}>
            <div
              onClick={item.disabled ? undefined : item.onClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 16px',
                cursor: item.disabled ? 'default' : 'pointer',
                color: item.disabled ? '#555' : '#ddd',
                fontSize: 13,
                userSelect: 'none',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = '#2a2a2a' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: item.disabled ? '#444' : '#888', width: 16, display: 'flex', alignItems: 'center' }}>
                  {item.icon}
                </span>
                {item.label}
              </div>
              {item.shortcut && (
                <span style={{ fontSize: 11, color: '#555', marginLeft: 24 }}>{item.shortcut}</span>
              )}
            </div>
            {item.dividerAfter && (
              <div style={{ height: 1, background: '#2a2a2a', margin: '4px 0' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
