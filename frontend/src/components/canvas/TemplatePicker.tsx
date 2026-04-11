import { useProjectStore } from '@/stores/projectStore'
import { WORKFLOW_TEMPLATES } from '@/stores/projectStore'
import { addLog } from '@/stores/logStore'

// Template card background images (abstract/cinematic placeholders via CSS)
const CARD_ACCENTS: Record<string, string> = {
  script_to_video:    '#1e3a2a',
  character_design:   '#1e2a3a',
  storyboard_to_video:'#2a1e2e',
  music_video:        '#2a2a1e',
}

export default function TemplatePicker() {
  const { updateWorkflow } = useProjectStore()

  const pick = (templateId: string) => {
    const tpl = WORKFLOW_TEMPLATES.find(t => t.id === templateId)
    if (tpl) {
      updateWorkflow(tpl.nodes, tpl.edges)
      addLog({
        level: 'info',
        category: 'operation',
        message: `应用模板: ${tpl.name}`,
        detail: `模板ID: ${tpl.id} | 节点数: ${tpl.nodes.length} | 连接数: ${tpl.edges.length}`,
      })
    }
  }

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      {/* Hint */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 24, color: '#555', fontSize: 13,
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        双击画布 自由生成节点
      </div>

      {/* Template cards */}
      <div style={{
        display: 'flex', gap: 8,
        pointerEvents: 'auto',
      }}>
        {WORKFLOW_TEMPLATES.map(tpl => (
          <button
            key={tpl.id}
            onClick={() => pick(tpl.id)}
            style={{
              width: 160, height: 88,
              background: CARD_ACCENTS[tpl.id] ?? '#1a1a1a',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              cursor: 'pointer',
              padding: '10px 12px',
              textAlign: 'left',
              position: 'relative',
              overflow: 'hidden',
              transition: 'border-color 0.15s, transform 0.1s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#444'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#2a2a2a'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {/* Decorative silhouette */}
            <div style={{
              position: 'absolute', right: -8, bottom: -8,
              width: 72, height: 72,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.03)',
            }} />
            <div style={{
              position: 'absolute', right: 8, bottom: 8,
              width: 44, height: 44,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.04)',
            }} />

            <span style={{
              fontSize: 13, color: '#ddd', fontWeight: 500,
              display: 'block', position: 'relative', zIndex: 1,
            }}>
              {tpl.name}
            </span>
            <span style={{
              fontSize: 11, color: '#666', marginTop: 4,
              display: 'block', position: 'relative', zIndex: 1,
            }}>
              {tpl.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
