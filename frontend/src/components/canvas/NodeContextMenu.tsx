import { useEffect, useRef } from 'react'
import { Bookmark, User2, Copy, Clipboard, CopyPlus, Trash2 } from 'lucide-react'

interface NodeContextMenuProps {
  x: number
  y: number
  nodeId: string
  onClose: () => void
  onCopy: () => void
  onDuplicate: () => void
  onDelete: () => void
  onCopyToClipboard: () => void
}

export default function NodeContextMenu({
  x, y, onClose, onCopy, onDuplicate, onDelete, onCopyToClipboard,
}: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

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

  type Item = {
    icon?: React.ReactNode
    label: string
    shortcut?: string
    disabled?: boolean
    dividerAfter?: boolean
    hint?: boolean
    onClick: () => void
  }

  const items: Item[] = [
    {
      icon: <Bookmark size={13} />,
      label: '保存到我的素材',
      disabled: true,
      onClick: onClose,
    },
    {
      icon: <User2 size={13} />,
      label: '创建主体',
      disabled: true,
      dividerAfter: true,
      onClick: onClose,
    },
    {
      icon: <Copy size={13} />,
      label: '复制',
      shortcut: '⌘C',
      onClick: () => { onCopy(); onClose() },
    },
    {
      icon: <Clipboard size={13} />,
      label: '粘贴',
      shortcut: '⌘V',
      disabled: true,
      dividerAfter: true,
      onClick: onClose,
    },
    {
      icon: <CopyPlus size={13} />,
      label: '创建副本',
      hint: true,
      onClick: () => { onDuplicate(); onClose() },
    },
    {
      icon: <Trash2 size={13} />,
      label: '删除',
      shortcut: '⌘⌫',
      dividerAfter: true,
      onClick: () => { onDelete(); onClose() },
    },
    {
      icon: <Clipboard size={13} />,
      label: '复制到剪贴板',
      onClick: () => { onCopyToClipboard(); onClose() },
    },
  ]

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
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
              }}
              onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = '#2a2a2a' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: item.disabled ? '#444' : '#888', width: 16, display: 'flex', alignItems: 'center' }}>
                  {item.icon}
                </span>
                {item.label}
                {item.hint && (
                  <span style={{
                    fontSize: 10, color: '#555',
                    border: '1px solid #444', borderRadius: 3,
                    padding: '0 4px', marginLeft: 4,
                  }}>?</span>
                )}
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
