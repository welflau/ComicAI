import { memo, useState } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Film, Maximize2, TableIcon } from 'lucide-react'

export interface ShotRow {
  id: string | number
  sequence: number
  duration: number
  description: string
  character1?: string
  character1Detail?: string
  character2?: string
  character2Detail?: string
  reference?: boolean
  imageGen?: string
}

export interface StoryboardTableNodeData {
  id: string
  type: string
  label: string
  category: string
  position: { x: number; y: number }
  config: Record<string, unknown>
  title?: string
  shots?: ShotRow[]
}

const MOCK_SHOTS: ShotRow[] = [
  {
    id: 1, sequence: 1, duration: 3.5,
    description: '1967年冬，大兴安岭远达峰在风暴雪中巍然矗立，巨大的物品天线指向苍穹各号。',
    character1: '', character1Detail: '',
    character2: '', character2Detail: '',
    reference: false, imageGen: '特\nUp',
  },
  {
    id: 2, sequence: 2, duration: 3.5,
    description: '巨型输物面天线特写，像一只巨轮深渊的眼眸。',
    character1: '', character1Detail: '',
    reference: false, imageGen: '特\nUp',
  },
  {
    id: 3, sequence: 3, duration: 4,
    description: '叶文洁站在观测平台上，呼呼化白雾，仰望星空。',
    character1: '叶文洁',
    character1Detail: '[叶文洁: 年轻女性，约20岁，身穿厚重的六十年代军绿大衣，垂着雪弧地，面容坚毅白]',
    reference: false, imageGen: '中\nSho',
  },
  {
    id: 4, sequence: 4, duration: 4,
    description: '叶文洁的回忆: 父亲叶哲泰在批斗会上被攻击, 鼻孔处流血。',
    character1: '叶哲泰',
    character1Detail: '[叶哲泰: 老年男性，满头灰白，一脸沧桑的忧伤，身上被扯烂，颤抖地流血。]',
    reference: false, imageGen: '特\nUp',
  },
  {
    id: 5, sequence: 5, duration: 3.5,
    description: '母亲坐镜在人群中高举拳举，面容轻蔑，喊着口号。',
    character1: '妈妈',
    character1Detail: '[妈妈: 中年女性，穿着笔挺的深灰色军装，手举口宁，面容冷漠，喊着红色标语。]',
    reference: false, imageGen: '中\nClo',
  },
  {
    id: 6, sequence: 6, duration: 3.5,
    description: '铜扣皮带专委抽打在叶哲泰身身',
    character1: '', character1Detail: '',
    reference: false, imageGen: '极\n',
  },
]

function StoryboardTableNode({ data, selected }: NodeProps<StoryboardTableNodeData>) {
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table')
  const shots = data.shots && data.shots.length > 0 ? data.shots : []
  const title = data.title || '分镜表格'

  return (
    <div
      className="nodrag"
      style={{
        width: 460,
        background: '#1a1a1a',
        border: selected ? '1.5px solid #4f6ef7' : '1px solid #2e2e2e',
        borderRadius: 8,
        boxShadow: selected
          ? '0 0 0 3px rgba(79,110,247,0.18), 0 4px 20px rgba(0,0,0,0.5)'
          : '0 4px 20px rgba(0,0,0,0.5)',
        fontFamily: 'Inter, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: 8, height: 8,
          background: '#333', border: '1.5px solid #666',
          left: -5,
        }}
      />

      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: '1px solid #2a2a2a',
          background: '#1e1e1e',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#ccc', fontWeight: 500 }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* View mode toggle */}
          <div style={{ display: 'flex', background: '#111', borderRadius: 4, padding: 2, gap: 1 }}>
            <button
              className="nodrag nopan"
              onClick={() => setViewMode('table')}
              style={{
                padding: '2px 8px',
                borderRadius: 3,
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                background: viewMode === 'table' ? '#333' : 'transparent',
                color: viewMode === 'table' ? '#fff' : '#666',
              }}
            >
              剧本视图
            </button>
          </div>
          <Maximize2 size={12} color="#666" style={{ cursor: 'pointer' }} />
        </div>
      </div>

      {/* Table */}
      <div style={{ overflow: 'hidden' }}>
        {/* Table header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '28px 36px 1fr 60px 60px 24px 48px',
            padding: '5px 8px',
            borderBottom: '1px solid #2a2a2a',
            background: '#161616',
          }}
        >
          {['编号', '时长', '画面描述', '角色1', '角色描述1', '参考', '图'].map((h) => (
            <div key={h} style={{ fontSize: 10, color: '#555', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h}
            </div>
          ))}
        </div>

        {/* Rows */}
        {shots.length === 0 ? (
          <div style={{
            padding: '16px 8px',
            textAlign: 'center',
            fontSize: 11,
            color: '#444',
          }}>
            暂无分镜，生成剧本后自动填充
          </div>
        ) : shots.map((shot, idx) => (
          <div
            key={shot.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 36px 1fr 60px 60px 24px 48px',
              padding: '5px 8px',
              borderBottom: '1px solid #222',
              background: idx % 2 === 0 ? '#1a1a1a' : '#181818',
              alignItems: 'start',
            }}
          >
            {/* 编号 */}
            <div style={{ fontSize: 10, color: '#777' }}>{shot.sequence}</div>

            {/* 时长 */}
            <div style={{ fontSize: 10, color: '#777' }}>{shot.duration}</div>

            {/* 描述 */}
            <div style={{ fontSize: 10, color: '#ccc', lineHeight: 1.5, paddingRight: 4 }}>
              {shot.description}
            </div>

            {/* 角色1 */}
            <div style={{ fontSize: 10, color: '#aaa' }}>
              {shot.character1 || ''}
            </div>

            {/* 角色描述1 */}
            <div
              style={{
                fontSize: 9, color: '#777', lineHeight: 1.4,
                maxHeight: 48, overflow: 'hidden',
              }}
            >
              {shot.character1Detail || ''}
            </div>

            {/* 参考 (image placeholder icon) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 2 }}>
              <div style={{
                width: 16, height: 16,
                border: '1px solid #333', borderRadius: 2,
                background: '#111',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Film size={8} color="#444" />
              </div>
            </div>

            {/* 图生成 */}
            <div
              style={{
                fontSize: 9, color: '#555', lineHeight: 1.4,
                whiteSpace: 'pre-line',
              }}
            >
              {shot.imageGen || ''}
            </div>
          </div>
        ))}
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: 8, height: 8,
          background: '#333', border: '1.5px solid #666',
          right: -5,
        }}
      />
    </div>
  )
}

export default memo(StoryboardTableNode)
