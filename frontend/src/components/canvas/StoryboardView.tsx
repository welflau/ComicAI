import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx } from 'clsx'
import type { Shot, Storyboard } from '@/types'
import { useProjectStore } from '@/stores/projectStore'
import { projectsApi } from '@/api'
import {
  ImageIcon, Film, Mic, MoreHorizontal, Edit3, Plus,
  ChevronLeft, ChevronRight, Grid3X3, List
} from 'lucide-react'
import toast from 'react-hot-toast'

interface ShotCardProps {
  shot: Shot
  index: number
  isSelected: boolean
  onClick: () => void
}

function ShotCard({ shot, index, isSelected, onClick }: ShotCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.03 }}
      onClick={onClick}
      className={clsx(
        'group relative rounded-xl border-2 cursor-pointer overflow-hidden transition-all',
        isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/30'
          : 'border-canvas-border hover:border-white/30'
      )}
    >
      {/* Image Preview */}
      <div className="aspect-video bg-canvas-bg relative">
        {shot.image_url ? (
          <img
            src={shot.image_url}
            alt={shot.description}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/20">
            <ImageIcon className="w-8 h-8" />
            <span className="text-xs">未生成</span>
          </div>
        )}

        {/* Shot number badge */}
        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md font-mono">
          #{index + 1}
        </div>

        {/* Shot type badge */}
        <div className="absolute top-2 right-2 bg-primary-500/80 text-white text-[10px] px-1.5 py-0.5 rounded-md">
          {shot.shot_type}
        </div>

        {/* Media status */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          {shot.video_url && (
            <div className="bg-green-500/80 p-1 rounded" title="视频已生成">
              <Film className="w-3 h-3 text-white" />
            </div>
          )}
          {shot.audio_url && (
            <div className="bg-blue-500/80 p-1 rounded" title="配音已生成">
              <Mic className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-2 bg-canvas-surface">
        <p className="text-xs text-white/70 line-clamp-2 leading-relaxed">
          {shot.description_zh || shot.description}
        </p>
        {shot.dialogue && (
          <p className="text-xs text-primary-400 mt-1 line-clamp-1 italic">
            「{shot.dialogue}」
          </p>
        )}
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-white/30">{shot.duration_seconds}s</span>
          <span className="text-[10px] text-white/30">{shot.camera_movement || '静止'}</span>
        </div>
      </div>
    </motion.div>
  )
}

export default function StoryboardView() {
  const { storyboards, currentProject } = useProjectStore()
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [currentSbIndex, setCurrentSbIndex] = useState(0)

  const storyboard = storyboards[currentSbIndex]
  const shots = storyboard?.shots || []

  if (!storyboard) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-white/30">
        <Grid3X3 className="w-16 h-16" />
        <div className="text-center">
          <p className="text-lg font-medium text-white/50">暂无分镜</p>
          <p className="text-sm mt-1">请先完成剧本解析，然后生成分镜</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-canvas-border flex-shrink-0">
        {/* Storyboard selector */}
        {storyboards.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentSbIndex(Math.max(0, currentSbIndex - 1))}
              disabled={currentSbIndex === 0}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-white/60">
              {currentSbIndex + 1} / {storyboards.length}
            </span>
            <button
              onClick={() => setCurrentSbIndex(Math.min(storyboards.length - 1, currentSbIndex + 1))}
              disabled={currentSbIndex === storyboards.length - 1}
              className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex-1">
          <h3 className="text-sm font-medium">{storyboard.title || '分镜板'}</h3>
          <p className="text-xs text-white/40">{shots.length} 个镜头 · {storyboard.timing_data?.total_duration?.toFixed(1)}s</p>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 bg-canvas-bg rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('grid')}
            className={clsx('p-1.5 rounded', viewMode === 'grid' ? 'bg-primary-500 text-white' : 'text-white/40 hover:text-white')}
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx('p-1.5 rounded', viewMode === 'list' ? 'bg-primary-500 text-white' : 'text-white/40 hover:text-white')}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Shots grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence>
          <div className={clsx(
            viewMode === 'grid'
              ? 'grid grid-cols-2 xl:grid-cols-3 gap-3'
              : 'flex flex-col gap-2'
          )}>
            {shots.map((shot, i) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                index={i}
                isSelected={selectedShotId === shot.id}
                onClick={() => setSelectedShotId(shot.id === selectedShotId ? null : shot.id)}
              />
            ))}
          </div>
        </AnimatePresence>
      </div>
    </div>
  )
}
