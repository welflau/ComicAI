import { memo, useState, useRef, useCallback } from 'react'
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from 'reactflow'

/**
 * AnimatedFlowEdge
 *
 * Features:
 *  1. Flowing light-pulse animation (stroke-dashoffset CSS keyframes)
 *  2. Hover 0.5 s → scissor icon appears at path midpoint; mousedown deletes edge
 *  3. Alt + click anywhere on the edge → delete edge
 */
const AnimatedFlowEdge = memo(function AnimatedFlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  style,
}: EdgeProps) {
  const { deleteElements } = useReactFlow()

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const DOT_LEN  = 40
  const GAP_LEN  = 600
  const filterId = `glow-${id}`

  const baseColor  = selected ? '#818cf8' : '#555'
  const glowColor  = selected ? '#a5b4fc' : '#93c5fd'

  // ── Scissor visibility state ──────────────────────────────────
  const [showScissor, setShowScissor] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const deleteEdge = useCallback(() => {
    deleteElements({ edges: [{ id }] })
  }, [id, deleteElements])

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setShowScissor(true), 500)
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setShowScissor(false)
  }, [])

  // Alt+click on the invisible hit-area path → delete
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (e.altKey) {
      e.stopPropagation()
      deleteEdge()
    }
  }, [deleteEdge])

  // Scissor button mousedown → delete (mousedown so it fires before blur etc.)
  const handleScissorMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    deleteEdge()
  }, [deleteEdge])

  // Scissor size / position
  const SC = 26 // icon circle diameter

  return (
    <>
      {/* ── Glow filter ── */}
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Base static edge ── */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: baseColor, strokeWidth: 1.5, ...style }}
      />

      {/* ── Flowing dot ── */}
      <path
        d={edgePath}
        fill="none"
        stroke={glowColor}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${DOT_LEN} ${GAP_LEN}`}
        filter={`url(#${filterId})`}
        style={{ animation: 'flow-edge 2.4s linear infinite', pointerEvents: 'none' }}
      />

      {/* ── Invisible wide hit-area for hover & alt+click ── */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: showScissor ? 'pointer' : 'default' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />

      {/* ── Scissor icon (appears after 0.5 s hover) ── */}
      {showScissor && (
        <foreignObject
          x={labelX - SC / 2}
          y={labelY - SC / 2}
          width={SC}
          height={SC}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div
            // @ts-ignore — xmlns required for foreignObject children
            xmlns="http://www.w3.org/1999/xhtml"
            onMouseDown={handleScissorMouseDown}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              width: SC, height: SC,
              borderRadius: '50%',
              background: '#1a1a1a',
              border: '1px solid #444',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              pointerEvents: 'all',
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              transition: 'background 0.15s',
            }}
            onMouseOver={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#2a2a2a' }}
            onMouseOut={(e)  => { (e.currentTarget as HTMLDivElement).style.background = '#1a1a1a' }}
          >
            {/* Scissors SVG */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <line x1="20" y1="4" x2="8.12" y2="15.88"/>
              <line x1="14.47" y1="14.48" x2="20" y2="20"/>
              <line x1="8.12" y1="8.12" x2="12" y2="12"/>
            </svg>
          </div>
        </foreignObject>
      )}

      {/* ── Keyframes (injected once; duplicate <style> tags are harmless) ── */}
      <style>{`
        @keyframes flow-edge {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -${DOT_LEN + GAP_LEN}; }
        }
      `}</style>
    </>
  )
})

export default AnimatedFlowEdge
