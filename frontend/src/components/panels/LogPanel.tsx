import { useState, useEffect, useRef } from 'react'
import { X, Trash2, ChevronRight } from 'lucide-react'
import { useLogStore } from '@/stores/logStore'
import type { LogLevel, LogCategory, LogEntry } from '@/stores/logStore'

/* ── Constants ────────────────────────────────────────────────── */

const CATEGORY_TABS: { id: LogCategory | 'all'; label: string }[] = [
  { id: 'all',       label: '全部'   },
  { id: 'operation', label: '操作'   },
  { id: 'ai',        label: 'AI'     },
  { id: 'system',    label: '系统'   },
  { id: 'network',   label: '网络'   },
]

const LEVEL_FILTERS: { id: LogLevel | 'all'; label: string }[] = [
  { id: 'all',   label: '全部'  },
  { id: 'info',  label: 'Info'  },
  { id: 'warn',  label: 'Warn'  },
  { id: 'error', label: 'Error' },
  { id: 'debug', label: 'Debug' },
]

/* ── Level styling ────────────────────────────────────────────── */

function levelColor(level: LogLevel): string {
  switch (level) {
    case 'info':  return '#60a5fa'
    case 'warn':  return '#fbbf24'
    case 'error': return '#f87171'
    case 'debug': return '#a3a3a3'
  }
}

function levelBg(level: LogLevel): string {
  switch (level) {
    case 'info':  return 'rgba(96,165,250,0.1)'
    case 'warn':  return 'rgba(251,191,36,0.1)'
    case 'error': return 'rgba(248,113,113,0.1)'
    case 'debug': return 'rgba(163,163,163,0.08)'
  }
}

function levelLabel(level: LogLevel): string {
  return level.toUpperCase()
}

/* ── Time format ──────────────────────────────────────────────── */

function formatTime(d: Date): string {
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/* ── Single log row ───────────────────────────────────────────── */

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        borderBottom: '1px solid #1a1a1a',
        padding: '7px 12px',
        cursor: entry.detail ? 'pointer' : 'default',
        background: expanded ? levelBg(entry.level) : 'transparent',
        transition: 'background 0.1s',
      }}
      onClick={() => entry.detail && setExpanded(v => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Expand arrow */}
        <div style={{ width: 14, flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: 1 }}>
          {entry.detail && (
            <ChevronRight
              size={12}
              color="#555"
              style={{
                transform: expanded ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          )}
        </div>

        {/* Level badge */}
        <span style={{
          flexShrink: 0,
          fontSize: 9,
          fontWeight: 700,
          fontFamily: 'monospace',
          color: levelColor(entry.level),
          background: levelBg(entry.level),
          border: `1px solid ${levelColor(entry.level)}33`,
          borderRadius: 3,
          padding: '1px 5px',
          minWidth: 38,
          textAlign: 'center',
          letterSpacing: 0.5,
          marginTop: 1,
        }}>
          {levelLabel(entry.level)}
        </span>

        {/* Message */}
        <span style={{
          flex: 1,
          fontSize: 12,
          color: entry.level === 'error' ? '#f87171' : entry.level === 'warn' ? '#fbbf24' : '#d0d0d0',
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}>
          {entry.message}
        </span>

        {/* Timestamp */}
        <span style={{
          flexShrink: 0,
          fontSize: 10,
          color: '#444',
          fontFamily: 'monospace',
          marginTop: 2,
        }}>
          {formatTime(entry.timestamp)}
        </span>
      </div>

      {/* Detail */}
      {expanded && entry.detail && (
        <div style={{
          marginTop: 6,
          marginLeft: 22,
          padding: '6px 10px',
          background: '#111',
          border: '1px solid #1e1e1e',
          borderRadius: 6,
          fontSize: 11,
          color: '#888',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.6,
        }}>
          {entry.detail}
        </div>
      )}
    </div>
  )
}

/* ── Log Panel ────────────────────────────────────────────────── */

export default function LogPanel({ onClose }: { onClose: () => void }) {
  const entries   = useLogStore(s => s.entries)
  const clearLogs = useLogStore(s => s.clearLogs)

  const [category, setCategory] = useState<LogCategory | 'all'>('all')
  const [level,    setLevel]    = useState<LogLevel | 'all'>('all')

  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  const filtered = entries.filter(e => {
    const catOk = category === 'all' || e.category === category
    const lvlOk = level    === 'all' || e.level    === level
    return catOk && lvlOk
  })

  // Count errors/warns for header badge
  const errorCount = entries.filter(e => e.level === 'error').length
  const warnCount  = entries.filter(e => e.level === 'warn').length

  return (
    <div style={{
      width: 380,
      height: '100%',
      background: '#111',
      borderLeft: '1px solid #1e1e1e',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px 10px 14px',
        borderBottom: '1px solid #1e1e1e',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#d0d0d0' }}>日志</span>
          {errorCount > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10,
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.3)',
              color: '#f87171', fontWeight: 600,
            }}>{errorCount} 错误</span>
          )}
          {warnCount > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10,
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.25)',
              color: '#fbbf24', fontWeight: 600,
            }}>{warnCount} 警告</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={clearLogs}
            title="清空日志"
            style={{
              width: 26, height: 26, background: 'none', border: 'none',
              cursor: 'pointer', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#555',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#aaa' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#555' }}
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={onClose}
            title="关闭日志面板"
            style={{
              width: 26, height: 26, background: 'none', border: 'none',
              cursor: 'pointer', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#555',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#aaa' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#555' }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{
        display: 'flex',
        gap: 2,
        padding: '8px 10px 0',
        borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
      }}>
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setCategory(tab.id)}
            style={{
              padding: '4px 10px 8px',
              background: 'none', border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: category === tab.id ? 600 : 400,
              color: category === tab.id ? '#d0d0d0' : '#555',
              borderBottom: category === tab.id ? '2px solid #60a5fa' : '2px solid transparent',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => { if (category !== tab.id) e.currentTarget.style.color = '#999' }}
            onMouseLeave={e => { if (category !== tab.id) e.currentTarget.style.color = '#555' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Level filter chips */}
      <div style={{
        display: 'flex',
        gap: 4,
        padding: '8px 12px',
        borderBottom: '1px solid #1a1a1a',
        flexShrink: 0,
      }}>
        {LEVEL_FILTERS.map(lf => (
          <button
            key={lf.id}
            onClick={() => setLevel(lf.id)}
            style={{
              padding: '2px 10px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              background: level === lf.id ? '#2a2a2a' : 'transparent',
              color: level === lf.id
                ? (lf.id === 'all' ? '#d0d0d0' : levelColor(lf.id as LogLevel))
                : '#555',
              transition: 'background 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { if (level !== lf.id) e.currentTarget.style.background = '#1e1e1e' }}
            onMouseLeave={e => { if (level !== lf.id) e.currentTarget.style.background = 'transparent' }}
          >
            {lf.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#333', alignSelf: 'center' }}>{filtered.length} 条</span>
      </div>

      {/* Log entries */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: '#333', fontSize: 13,
          }}>
            暂无日志
          </div>
        ) : (
          filtered.map(entry => (
            <LogRow key={entry.id} entry={entry} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
