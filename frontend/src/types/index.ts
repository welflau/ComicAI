// Core domain types for ComicFlow AI

export interface User {
  id: string
  email: string
  username: string
  full_name?: string
  avatar_url?: string
  plan: 'free' | 'pro' | 'team' | 'enterprise'
  credits: number
  created_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  user_id: string
  status: 'draft' | 'processing' | 'completed' | 'archived'
  workflow_config: WorkflowConfig
  thumbnail_url?: string
  tags: string[]
  created_at: string
  updated_at: string
}

export interface WorkflowConfig {
  nodes?: NodeData[]
  edges?: EdgeData[]
  viewport?: { x: number; y: number; zoom: number }
  visual_style?: string
}

export interface Script {
  id: string
  project_id: string
  title?: string
  content: string
  parsed_data: ParsedScript
  version: number
  created_at: string
  updated_at: string
}

export interface ParsedScript {
  title?: string
  genre?: string
  scenes: Scene[]
  characters: CharacterInfo[]
}

export interface Scene {
  id: string
  title: string
  description: string
  location: string
  time_of_day: string
  mood: string
  characters_present: string[]
  shots: Shot[]
}

export interface Shot {
  id: string
  scene_id?: string
  sequence?: number
  shot_type: string
  angle?: string
  composition?: string
  description: string
  description_zh?: string
  duration_seconds: number
  transition_in?: string
  transition_out?: string
  camera_movement?: string
  dialogue?: string
  narration?: string
  sfx?: string
  image_prompt?: string
  image_url?: string
  video_url?: string
  audio_url?: string
  emotion?: string
  characters_positions?: CharacterPosition[]
  lighting?: string
  color_mood?: string
}

export interface CharacterPosition {
  name: string
  position: 'left' | 'center' | 'right'
  action: string
}

export interface CharacterInfo {
  name: string
  role: string
  description: string
  age: string
  traits: string[]
}

export interface Storyboard {
  id: string
  project_id: string
  script_id?: string
  title?: string
  shots: Shot[]
  timing_data: TimingData
  visual_style: VisualStyle
  created_at: string
  updated_at: string
}

export interface TimingData {
  total_duration?: number
  timeline?: Timeline
}

export interface VisualStyle {
  style?: string
  notes?: string
}

export interface Timeline {
  timeline: TimelineClip[]
  audio_tracks: AudioTrack[]
  subtitles: Subtitle[]
  total_duration: number
  fps: number
  resolution: string
}

export interface TimelineClip {
  track: string
  clip_id: string
  shot_id: string
  start_time: number
  end_time: number
  in_point: number
  out_point: number
  video_url?: string
  image_url?: string
  transition_in: { type: string; duration: number }
  transition_out: { type: string; duration: number }
  effects: Effect[]
  color_grade: ColorGrade
}

export interface Effect {
  type: string
  params: Record<string, unknown>
}

export interface ColorGrade {
  brightness: number
  contrast: number
  saturation: number
}

export interface AudioTrack {
  track: string
  clips: AudioClip[]
}

export interface AudioClip {
  clip_id?: string
  shot_id?: string
  url?: string
  start_time: number
  duration: number
  volume: number
  fade_in?: number
  fade_out?: number
  mood?: string
  source?: string
}

export interface Subtitle {
  shot_id: string
  text: string
  start_time: number
  end_time: number
  style: SubtitleStyle
}

export interface SubtitleStyle {
  font_size: number
  color: string
  outline_color?: string
  outline_width?: number
  position: 'top' | 'center' | 'bottom'
  margin_bottom?: number
}

export interface Character {
  id: string
  project_id: string
  name: string
  description?: string
  style_prompt?: string
  style_images: string[]
  traits: Record<string, string>
  color_palette: string[]
  created_at: string
  updated_at: string
}

export interface GenerationTask {
  id: string
  project_id: string
  celery_task_id?: string
  task_type: TaskType
  input_params: Record<string, unknown>
  output_urls: string[]
  status: TaskStatus
  progress: number
  error_message?: string
  credits_used: number
  created_at: string
  updated_at: string
}

export type TaskType =
  | 'script_parse'
  | 'storyboard_gen'
  | 'image_gen'
  | 'video_gen'
  | 'tts'
  | 'music_gen'
  | 'auto_edit'
  | 'export'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Asset {
  id: string
  project_id: string
  asset_type: 'image' | 'video' | 'audio' | 'voice' | 'music' | 'font' | 'template'
  name?: string
  url: string
  thumbnail_url?: string
  file_size?: number
  mime_type?: string
  metadata: Record<string, unknown>
  used_in_shots: string[]
  created_at: string
}

// ─── Node Workflow Types ────────────────────────────────────────────────────

export type NodeType =
  | 'script_input'
  | 'script_parse'
  | 'storyboard_gen'
  | 'character_design'
  | 'scene_design'
  | 'image_gen'
  | 'video_gen'
  | 'tts'
  | 'music_gen'
  | 'auto_edit'
  | 'preview'
  | 'export'
  // LibTV-style node types
  | 'libtv_script'
  | 'libtv_script_gen'
  | 'libtv_storyboard'
  | 'libtv_image'

export type NodeCategory = 'input' | 'process' | 'output' | 'control'

export interface NodeData {
  id: string
  type: NodeType
  label: string
  category: NodeCategory
  position: { x: number; y: number }
  config: Record<string, unknown>
  status?: 'idle' | 'running' | 'completed' | 'error'
  progress?: number
  output?: unknown
  // ScriptNode extra fields
  title?: string
  content?: string
  initialMode?: 'idle' | 'write' | 'generating' | 'content'
  initialPrompt?: string
  hideQuickActions?: boolean
  // StoryboardTableNode extra fields
  shots?: Shot[]
  // ImageNode extra fields
  imageUrl?: string
  nodeIndex?: number
  imageSource?: 'uploaded' | 'generated'   // how the image was set
  imagePrompt?: string                      // prompt used to generate the image
}

export interface EdgeData {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

// ─── Collaboration ──────────────────────────────────────────────────────────

export interface CollabUser {
  user_id: string
  username: string
  avatar_url?: string
  color: string
  cursor?: { x: number; y: number }
}

export interface CollabOperation {
  id: string
  type: 'node_add' | 'node_update' | 'node_delete' | 'edge_add' | 'edge_delete' | 'shot_update'
  payload: unknown
  user_id: string
  server_version: number
}
