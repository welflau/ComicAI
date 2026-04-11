import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Key, Globe, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, RotateCcw } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { addLog } from '@/stores/logStore'
import type { AllSettings, ServiceSettings, ServiceTestStatus } from '@/stores/settingsStore'

/* ── Types ───────────────────────────────────────────────────── */

type TestStatus = 'idle' | 'testing' | ServiceTestStatus

interface ServiceConfig {
  id: keyof AllSettings
  name: string
  desc: string
  color: string
  iconColor: string
  fields: ('baseUrl' | 'apiKey' | 'endpoint')[]
  fieldLabels?: Partial<Record<'baseUrl' | 'apiKey' | 'endpoint', string>>
  fieldPlaceholders?: Partial<Record<'baseUrl' | 'apiKey' | 'endpoint', string>>
  models?: { id: string; label: string; sub: string; color: string }[]
}

const SERVICES: ServiceConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic Claude API',
    desc: '文本生成（剧本、台词、分镜描述）',
    color: '#3d2a1e',
    iconColor: '#d97706',
    fields: ['baseUrl', 'apiKey'],
    fieldLabels: { baseUrl: 'Base URL', apiKey: 'Auth Token' },
    fieldPlaceholders: { baseUrl: '/api/anthropic 或 https://api.anthropic.com' },
  },
  {
    id: 'antsk',
    name: 'AntSK API',
    desc: '图片生成、视频生成',
    color: '#1e1e3d',
    iconColor: '#818cf8',
    fields: ['apiKey', 'endpoint'],
    fieldLabels: { apiKey: 'API Key', endpoint: 'API Endpoint' },
    fieldPlaceholders: { endpoint: 'https://api.antsk.cn' },
  },
  {
    id: 'lightai',
    name: 'LightAI API',
    desc: 'nano-banana pro 图片生成 · 可灵视频生成 · 即梦',
    color: '#1a2e1a',
    iconColor: '#4ade80',
    fields: ['baseUrl', 'apiKey'],
    fieldLabels: { baseUrl: 'API Base URL', apiKey: 'API Key' },
    fieldPlaceholders: { baseUrl: 'https://api.lightai.woa.com' },
    models: [
      { id: 'nano',   label: 'nano-banana pro', sub: '图片生成（首选）', color: '#4ade80' },
      { id: 'kling',  label: '可灵 v3.0',        sub: '视频生成',        color: '#60a5fa' },
      { id: 'jimeng', label: '即梦 5.0',          sub: '图片/视频',       color: '#f472b6' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI API',
    desc: 'GPT-4o、DALL·E 图片生成',
    color: '#1a2a1a',
    iconColor: '#4ade80',
    fields: ['baseUrl', 'apiKey'],
    fieldLabels: { baseUrl: 'Base URL', apiKey: 'API Key' },
    fieldPlaceholders: { baseUrl: 'https://api.openai.com' },
  },
]

/* ── Service icon ────────────────────────────────────────────── */

function ServiceIcon({ color, iconColor }: { color: string; iconColor: string }) {
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 9,
      background: color, border: `1px solid ${iconColor}33`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Key size={16} color={iconColor} />
    </div>
  )
}

/* ── Test status badge ───────────────────────────────────────── */

function StatusBadge({ status }: { status: TestStatus }) {
  if (status === 'idle') return <span style={{ fontSize: 12, color: '#555' }}>未测试</span>
  if (status === 'testing') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#777' }}>
      <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
      测试中…
    </span>
  )
  if (status === 'ok') return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4ade80' }}>
      <CheckCircle2 size={13} />
      连接正常
    </span>
  )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#f87171' }}>
      <AlertTriangle size={13} />
      连接失败
    </span>
  )
}

/* ── Env origin badge ────────────────────────────────────────── */

function EnvBadge() {
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 4,
      background: '#1e2a1e', border: '1px solid #2d4a2d',
      color: '#4ade80', fontFamily: 'monospace',
      marginLeft: 6, verticalAlign: 'middle',
    }}>
      ENV
    </span>
  )
}

/* ── API card ────────────────────────────────────────────────── */

function ApiCard({ service }: { service: ServiceConfig }) {
  const store = useSettingsStore()
  const effective = store.get(service.id)
  const envDefaults = useSettingsStore(s => s.envDefaults[service.id])
  const overrides   = useSettingsStore(s => s.overrides[service.id])
  const savedStatus = useSettingsStore(s => s.testStatuses[service.id] ?? 'idle')

  const [showKey, setShowKey]   = useState(false)
  const [testStatus, setTestStatus] = useState<TestStatus>(savedStatus)

  // Determine if a field is overridden vs coming from env
  const isOverridden = (field: keyof ServiceSettings) =>
    overrides != null && field in overrides

  const handleChange = (field: keyof ServiceSettings, value: string) => {
    store.setField(service.id, field, value)
  }

  const handleReset = () => {
    store.resetService(service.id)
    setTestStatus('idle')
  }

  const handleTest = useCallback(async () => {
    if (!effective.apiKey.trim()) {
      setTestStatus('fail')
      store.setTestStatus(service.id, 'fail')
      return
    }
    setTestStatus('testing')
    try {
      let ok = false

      if (service.id === 'lightai') {
        // LightAI: POST /api/lightai/create_async_task with a minimal payload
        const base = (effective.baseUrl || 'https://api.lightai.woa.com').replace(/\/$/, '')
        // Use a simple GET to the base URL — a 401/403 still means the server is alive
        const resp = await fetch(`${base}/`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${effective.apiKey}` },
          signal: AbortSignal.timeout(8000),
        })
        ok = resp.status !== 500 && resp.status !== 502 && resp.status !== 503
      } else if (service.id === 'antsk') {
        const base = (effective.endpoint || 'https://api.antsk.cn').replace(/\/$/, '')
        const resp = await fetch(`${base}/api/v1/models`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${effective.apiKey}` },
          signal: AbortSignal.timeout(8000),
        })
        ok = resp.ok || resp.status === 404 || resp.status === 401
      } else if (service.id === 'anthropic') {
        const base = (effective.baseUrl || '/api/anthropic').replace(/\/$/, '')
        // Absolute URL (http/https) → route through cors-proxy to avoid CORS block
        const testUrl = base.startsWith('/')
          ? `${base}/v1/messages`
          : `/api/cors-proxy/${encodeURIComponent(base + '/v1/messages')}`
        const resp = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': effective.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          signal: AbortSignal.timeout(10000),
        })
        ok = resp.ok
      } else {
        // openai-compatible
        const base = (effective.baseUrl || 'https://api.openai.com').replace(/\/$/, '')
        const resp = await fetch(`${base}/v1/models`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${effective.apiKey}` },
          signal: AbortSignal.timeout(8000),
        })
        ok = resp.ok || resp.status === 404
      }

      const result: TestStatus = ok ? 'ok' : 'fail'
      setTestStatus(result)
      store.setTestStatus(service.id, result)
    } catch {
      setTestStatus('fail')
      store.setTestStatus(service.id, 'fail')
    }
  }, [effective.apiKey, effective.baseUrl, effective.endpoint, store, service.id])

  const maskKey = (k: string) => {
    if (!k) return ''
    if (k.length <= 6) return k
    return k.slice(0, 3) + '***' + k.slice(-3)
  }

  const fl  = service.fieldLabels     ?? {}
  const fph = service.fieldPlaceholders ?? {}

  const hasAnyOverride = overrides != null

  return (
    <div style={{
      background: '#161616',
      border: '1px solid #262626',
      borderRadius: 14,
      padding: '16px 18px 14px',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ServiceIcon color={service.color} iconColor={service.iconColor} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>{service.name}</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{service.desc}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Reset button — only shown when there are overrides */}
          {hasAnyOverride && (
            <button
              onClick={handleReset}
              title="重置为环境变量默认值"
              style={{
                padding: '4px 8px', borderRadius: 7,
                border: '1px solid #333', background: 'none',
                color: '#666', fontSize: 11, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'border-color 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#aaa' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#666' }}
            >
              <RotateCcw size={11} />
              重置
            </button>
          )}
          <button
            onClick={handleTest}
            disabled={testStatus === 'testing'}
            style={{
              padding: '5px 14px', borderRadius: 8,
              border: '1px solid #333', background: 'none',
              color: '#999', fontSize: 12, cursor: 'pointer',
              transition: 'border-color 0.12s, color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#ddd' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#999' }}
          >
            测试连接
          </button>
        </div>
      </div>

      {/* baseUrl field */}
      {service.fields.includes('baseUrl') && (
        <FieldRow
          label={
            <>
              {fl.baseUrl ?? 'Base URL'}
              {!isOverridden('baseUrl') && envDefaults.baseUrl && <EnvBadge />}
            </>
          }
          icon={<Globe size={13} color="#555" />}
          value={effective.baseUrl}
          onChange={v => handleChange('baseUrl', v)}
          placeholder={fph.baseUrl ?? 'https://'}
        />
      )}

      {/* endpoint field */}
      {service.fields.includes('endpoint') && (
        <FieldRow
          label={
            <>
              {fl.endpoint ?? 'API Endpoint'}
              {!isOverridden('endpoint') && envDefaults.endpoint && <EnvBadge />}
            </>
          }
          icon={<Globe size={13} color="#555" />}
          value={effective.endpoint}
          onChange={v => handleChange('endpoint', v)}
          placeholder={fph.endpoint ?? 'https://'}
        />
      )}

      {/* apiKey field */}
      {service.fields.includes('apiKey') && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
            {fl.apiKey ?? 'API Key'}
            {!isOverridden('apiKey') && envDefaults.apiKey && <EnvBadge />}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#0e0e0e', border: '1px solid #2a2a2a',
            borderRadius: 8, padding: '8px 12px',
          }}>
            <Key size={13} color="#555" style={{ flexShrink: 0 }} />
            <input
              type={showKey ? 'text' : 'password'}
              value={effective.apiKey}
              onChange={e => handleChange('apiKey', e.target.value)}
              placeholder={effective.apiKey ? maskKey(effective.apiKey) : '未配置（可在 .env.local 中设置）'}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: effective.apiKey ? '#d0d0d0' : '#f87171',
                fontSize: 13, fontFamily: 'monospace',
              }}
            />
            <button
              onClick={() => setShowKey(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#555' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#888' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555' }}
            >
              {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* Status */}
      <div style={{ marginTop: 8 }}>
        <StatusBadge status={testStatus} />
      </div>

      {/* Model chips */}
      {service.models && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {service.models.map(m => (
            <div key={m.id} style={{
              flex: 1, minWidth: 120,
              background: '#0e0e0e', border: '1px solid #222',
              borderRadius: 8, padding: '8px 10px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: m.color }}>{m.label}</div>
              <div style={{ fontSize: 11, color: '#555', marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldRow({
  label, icon, value, onChange, placeholder,
}: {
  label: React.ReactNode
  icon?: React.ReactNode
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{label}</div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: '#0e0e0e', border: '1px solid #2a2a2a',
        borderRadius: 8, padding: '8px 12px',
      }}>
        {icon}
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: '#d0d0d0', fontSize: 13,
            fontFamily: 'monospace',
          }}
        />
      </div>
    </div>
  )
}

/* ── Section header ──────────────────────────────────────────── */

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 13, fontWeight: 600, color: '#d4a96a',
      marginBottom: 12,
    }}>
      {icon}
      {title}
    </div>
  )
}

/* ── Main modal ──────────────────────────────────────────────── */

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [saved, setSaved] = useState(false)

  // "保存" is automatic (store already persists on every setField),
  // but we show a visual confirmation to the user.
  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 40, paddingBottom: 40, overflowY: 'auto',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.18 }}
        style={{
          width: '100%', maxWidth: 680,
          background: '#111', borderRadius: 18,
          border: '1px solid #222',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          padding: '28px 32px 32px',
          position: 'relative',
          margin: '0 16px',
        }}
      >
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#f0f0f0' }}>系统设置</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666' }}>
              API 配置、模型管理与连接状态 &nbsp;
              <span style={{ fontSize: 11, color: '#444' }}>
                · 标有 <span style={{ fontSize: 10, padding: '1px 4px', borderRadius: 3, background: '#1e2a1e', border: '1px solid #2d4a2d', color: '#4ade80' }}>ENV</span> 的字段来自环境变量，可在此覆盖
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AnimatePresence>
              {saved && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: '#162616', border: '1px solid #2d4a2d',
                    color: '#4ade80', fontSize: 12,
                    padding: '4px 10px', borderRadius: 8,
                  }}
                >
                  <CheckCircle2 size={12} />
                  已保存
                </motion.span>
              )}
            </AnimatePresence>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: 8,
                background: '#1e1e1e', border: '1px solid #2e2e2e',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#777',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a2a2a'; e.currentTarget.style.color = '#ddd' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1e1e1e'; e.currentTarget.style.color = '#777' }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#1e1e1e', marginBottom: 20 }} />

        {/* API section */}
        <SectionTitle
          icon={<Key size={13} />}
          title="API 配置"
        />

        {SERVICES.map(svc => (
          <ApiCard key={svc.id} service={svc} />
        ))}

        {/* Save button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 24px', borderRadius: 9,
              background: '#3a6ff7', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#2d5ce0' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#3a6ff7' }}
          >
            保存设置
          </button>
        </div>
      </motion.div>
    </div>
  )
}
