import { memo } from 'react'
import {
  BaseEdge,
  EdgeProps,
  getBezierPath,
  useReactFlow,
} from 'reactflow'

/**
 * AnimatedFlowEdge
 *
 * Renders a bezier edge with a flowing "light pulse" effect — a bright,
 * blurred dot that travels continuously along the path from source to target.
 *
 * Implementation:
 *   - A second <path> on top of the base edge uses a very short stroke-dasharray
 *     (a small bright segment + a long gap), animated by stroke-dashoffset.
 *   - The total dasharray length equals the path's getTotalLength() so one cycle
 *     = one full traversal. We use a CSS animation rather than JS for performance.
 *   - A SVG <filter> adds a glow/blur around the moving dot.
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
  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  // We can't call getTotalLength() here (no DOM ref available at render time),
  // so we use a fixed large number for the dash gap — it just needs to be longer
  // than any realistic edge. The animation duration controls the speed.
  const DOT_LEN  = 40   // length (px in SVG space) of the bright moving dot
  const GAP_LEN  = 600  // gap between dots — effectively "one dot at a time"
  const filterId = `glow-${id}`

  const baseColor   = selected ? '#818cf8' : '#555'
  const glowColor   = selected ? '#a5b4fc' : '#93c5fd'

  return (
    <>
      {/* ── Glow filter (unique per edge to avoid id collision) ── */}
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
        style={{
          stroke: baseColor,
          strokeWidth: 1.5,
          ...style,
        }}
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
        style={{
          animation: `flow-edge 2.4s linear infinite`,
          // stroke-dashoffset starts at 0 and counts down to -(DOT_LEN + GAP_LEN)
          // so the dot travels source → target once per cycle
        }}
      />

      {/* ── Keyframes injected once via a shared <style> tag ── */}
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
