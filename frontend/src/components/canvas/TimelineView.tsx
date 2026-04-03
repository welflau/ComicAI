import { useRef, useState, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import type { Timeline, TimelineClip } from '@/types'
import { useProjectStore } from '@/stores/projectStore'
import { Play, Pause, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-react'

const TRACK_HEIGHT = 56
const HEADER_WIDTH = 80
const PIXELS_PER_SECOND = 80

const TRACK_CONFIGS = [
  { id: 'video', label: '视频', color: 'bg-blue-500', height: TRACK_HEIGHT },
  { id: 'dialogue', label: '对白', color: 'bg-green-500', height: 40 },
  { id: 'bgm', label: '背景音乐', color: 'bg-purple-500', height: 40 },
  { id: 'subtitles', label: '字幕', color: 'bg-yellow-500', height: 36 },
]

export default function TimelineView() {
  const { storyboards } = useProjectStore()
  const [playhead, setPlayhead] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)
  const playInterval = useRef<ReturnType<typeof setInterval>>()

  const timeline = storyboards[0]?.timing_data?.timeline
  const shots = storyboards[0]?.shots || []
  const totalDuration = storyboards[0]?.timing_data?.total_duration || 0

  const pps = PIXELS_PER_SECOND * zoom

  const togglePlay = useCallback(() => {
    setIsPlaying(p => {
      if (!p) {
        playInterval.current = setInterval(() => {
          setPlayhead(prev => {
            if (prev >= totalDuration) {
              clearInterval(playInterval.current)
              setIsPlaying(false)
              return 0
            }
            return prev + 0.1
          })
        }, 100)
      } else {
        clearInterval(playInterval.current)
      }
      return !p
    })
  }, [totalDuration])

  useEffect(() => () => clearInterval(playInterval.current), [])

  // Build clip data from shots if no formal timeline
  const videoClips = timeline?.timeline || shots.map((shot, i) => {
    const startTime = shots.slice(0, i).reduce((sum, s) => sum + s.duration_seconds, 0)
    return {
      clip_id: shot.id,
      shot_id: shot.id,
      start_time: startTime,
      end_time: startTime + shot.duration_seconds,
      in_point: 0,
      out_point: shot.duration_seconds,
      image_url: shot.image_url,
    } as TimelineClip
  })

  const dialogueClips = shots
    .filter(s => s.audio_url)
    .map((shot, i) => {
      const startTime = shots.slice(0, shots.indexOf(shot)).reduce((sum, s) => sum + s.duration_seconds, 0)
      return { clip_id: shot.id, start_time: startTime + 0.2, duration: shot.duration_seconds - 0.4, url: shot.audio_url }
    })

  return (
    <div className="h-full flex flex-col bg-canvas-bg">
      {/* Transport controls */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-canvas-border bg-canvas-surface flex-shrink-0">
        <button onClick={() => setPlayhead(0)} className="btn-ghost p-1.5">
          <SkipBack className="w-4 h-4" />
        </button>
        <button onClick={togglePlay} className="btn-primary px-3 py-1.5 flex items-center gap-1.5">
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span>{isPlaying ? '暂停' : '播放'}</span>
        </button>
        <button onClick={() => setPlayhead(totalDuration)} className="btn-ghost p-1.5">
          <SkipForward className="w-4 h-4" />
        </button>

        <span className="text-sm font-mono text-white/60 ml-2">
          {playhead.toFixed(1)}s / {totalDuration.toFixed(1)}s
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="btn-ghost p-1">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-white/40 w-10 text-center">{(zoom * 100).toFixed(0)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="btn-ghost p-1">
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Timeline body */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className="flex" style={{ minWidth: `${HEADER_WIDTH + totalDuration * pps + 40}px` }}>
          {/* Track headers */}
          <div className="flex-shrink-0 sticky left-0 z-10 bg-canvas-surface border-r border-canvas-border" style={{ width: HEADER_WIDTH }}>
            {/* Ruler placeholder */}
            <div className="h-8 border-b border-canvas-border" />
            {TRACK_CONFIGS.map(track => (
              <div
                key={track.id}
                className="flex items-center px-2 border-b border-canvas-border text-xs text-white/50 font-medium"
                style={{ height: track.height }}
              >
                <div className={clsx('w-2 h-2 rounded-full mr-2', track.color)} />
                {track.label}
              </div>
            ))}
          </div>

          {/* Tracks area */}
          <div className="flex-1 relative" style={{ width: `${totalDuration * pps + 40}px` }}>
            {/* Time ruler */}
            <div className="h-8 border-b border-canvas-border relative">
              {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 flex items-end pb-1"
                  style={{ left: i * pps }}
                >
                  <div className="w-px bg-canvas-border h-3" />
                  <span className="text-[10px] text-white/30 ml-1">{i}s</span>
                </div>
              ))}
            </div>

            {/* Video track */}
            <div className="relative border-b border-canvas-border" style={{ height: TRACK_HEIGHT }}>
              {videoClips.map((clip) => (
                <div
                  key={clip.clip_id}
                  className="timeline-clip bg-blue-500/30 border-blue-500/50 hover:bg-blue-500/40"
                  style={{
                    left: clip.start_time * pps,
                    width: (clip.end_time - clip.start_time) * pps - 2,
                  }}
                  title={`Shot: ${clip.shot_id}`}
                >
                  {clip.image_url && (
                    <img
                      src={clip.image_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover opacity-40 rounded"
                    />
                  )}
                  <span className="relative z-10 text-blue-200 truncate">{clip.shot_id}</span>
                </div>
              ))}
            </div>

            {/* Dialogue track */}
            <div className="relative border-b border-canvas-border" style={{ height: 40 }}>
              {dialogueClips.map(clip => (
                <div
                  key={clip.clip_id}
                  className="timeline-clip bg-green-500/30 border-green-500/50"
                  style={{
                    left: clip.start_time * pps,
                    width: clip.duration * pps - 2,
                  }}
                >
                  <span className="text-green-200 truncate">🎤</span>
                </div>
              ))}
            </div>

            {/* BGM track */}
            <div className="relative border-b border-canvas-border" style={{ height: 40 }}>
              {totalDuration > 0 && (
                <div
                  className="timeline-clip bg-purple-500/30 border-purple-500/50"
                  style={{ left: 0, width: totalDuration * pps - 2 }}
                >
                  <span className="text-purple-200">🎵 背景音乐</span>
                </div>
              )}
            </div>

            {/* Subtitles track */}
            <div className="relative border-b border-canvas-border" style={{ height: 36 }}>
              {shots.filter(s => s.dialogue).map((shot) => {
                const startTime = shots.slice(0, shots.indexOf(shot)).reduce((sum, s) => sum + s.duration_seconds, 0)
                return (
                  <div
                    key={shot.id}
                    className="timeline-clip bg-yellow-500/20 border-yellow-500/40 text-yellow-200"
                    style={{
                      left: (startTime + 0.3) * pps,
                      width: (shot.duration_seconds - 0.6) * pps - 2,
                    }}
                  >
                    <span className="truncate">{shot.dialogue}</span>
                  </div>
                )
              })}
            </div>

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
              style={{ left: playhead * pps }}
            >
              <div className="absolute -top-1 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
