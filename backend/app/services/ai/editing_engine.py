"""
AIEditingEngine: 智能剪辑引擎。
根据分镜、语音、背景音乐，自动生成完整时间轴。
"""
import json
from typing import Optional
from loguru import logger

from app.core.config import settings


class AIEditingEngine:
    """
    自动剪辑引擎：
    1. 根据分镜和时长，生成时间轴
    2. 计算最优剪切点和转场
    3. 添加字幕、特效、背景音乐
    4. 输出完整的时间轴 JSON（可导入 FFmpeg 渲染）
    """

    EDITING_PROMPT = """你是专业的视频剪辑师。根据以下分镜数据，生成最优的剪辑时间轴。

分镜数据：
{shots_data}

总时长目标：{target_duration}秒
风格：{style}

请输出完整的剪辑时间轴 JSON：
{{
  "timeline": [
    {{
      "track": "video",
      "clip_id": "clip_1",
      "shot_id": "shot_id",
      "start_time": 0.0,
      "end_time": 3.0,
      "in_point": 0.0,
      "out_point": 3.0,
      "transition_in": {{"type": "cut", "duration": 0}},
      "transition_out": {{"type": "dissolve", "duration": 0.5}},
      "effects": [{{"type": "ken_burns", "params": {{"zoom": 1.05, "direction": "in"}}}}],
      "color_grade": {{"brightness": 0, "contrast": 0, "saturation": 0}}
    }}
  ],
  "audio_tracks": [
    {{
      "track": "dialogue",
      "clips": [{{"clip_id": "audio_1", "shot_id": "shot_id", "start_time": 0.0, "duration": 2.5, "fade_in": 0.1, "fade_out": 0.1}}]
    }},
    {{
      "track": "bgm",
      "clips": [{{"source": "auto", "mood": "neutral", "start_time": 0.0, "duration": 60.0, "volume": 0.3}}]
    }}
  ],
  "subtitles": [
    {{
      "shot_id": "shot_id",
      "text": "字幕文字",
      "start_time": 0.5,
      "end_time": 2.5,
      "style": {{"font_size": 32, "color": "#FFFFFF", "position": "bottom"}}
    }}
  ],
  "total_duration": 60.0,
  "fps": 24,
  "resolution": "1920x1080"
}}"""

    def __init__(self):
        self._llm_client = None

    def _get_llm_client(self):
        if self._llm_client is None and settings.OPENAI_API_KEY:
            import openai
            self._llm_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._llm_client

    async def auto_edit(
        self,
        storyboard: dict,
        assets: dict,
        target_duration: Optional[float] = None,
        style: str = "dynamic",
        bgm_mood: str = "auto"
    ) -> dict:
        """
        自动生成剪辑时间轴。
        assets: {shot_id: {image_url, video_url, audio_url}, ...}
        返回: 完整时间轴 + 渲染命令
        """
        shots = storyboard.get("shots", [])

        if not shots:
            return {"timeline": [], "total_duration": 0, "error": "No shots provided"}

        # Calculate total duration from shots
        auto_duration = sum(s.get("duration_seconds", 3.0) for s in shots)
        duration = target_duration or auto_duration

        # Try LLM editing for better results
        client = self._get_llm_client()
        if client:
            try:
                result = await self._llm_edit(client, shots, duration, style)
                # Attach actual asset URLs
                result = self._attach_assets(result, assets)
                return result
            except Exception as e:
                logger.error(f"LLM editing failed: {e}, using rule-based")

        # Fallback to rule-based editing
        return self._rule_based_edit(shots, assets, duration, style, bgm_mood)

    async def _llm_edit(self, client, shots: list, duration: float, style: str) -> dict:
        shots_summary = [
            {
                "id": s["id"],
                "shot_type": s.get("shot_type", "中景"),
                "description": s.get("description_zh", s.get("description", ""))[:100],
                "duration": s.get("duration_seconds", 3.0),
                "transition_out": s.get("transition_out", "cut"),
                "camera_movement": s.get("camera_movement", "static"),
                "dialogue": s.get("dialogue", "")[:50]
            }
            for s in shots[:20]  # Limit to avoid token overflow
        ]

        prompt = self.EDITING_PROMPT.format(
            shots_data=json.dumps(shots_summary, ensure_ascii=False),
            target_duration=duration,
            style=style
        )

        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL_TEXT,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        return json.loads(response.choices[0].message.content)

    def _rule_based_edit(
        self,
        shots: list,
        assets: dict,
        duration: float,
        style: str,
        bgm_mood: str
    ) -> dict:
        """规则驱动的剪辑时间轴生成"""
        timeline = []
        audio_clips = []
        subtitles = []
        current_time = 0.0

        # Transition styles by editing style
        transitions = {
            "dynamic": ["cut", "cut", "cut", "dissolve"],
            "smooth": ["dissolve", "dissolve", "fade", "dissolve"],
            "cinematic": ["cut", "fade", "dissolve", "cut"]
        }
        trans_cycle = transitions.get(style, transitions["dynamic"])

        # Ken Burns effect configs
        kb_effects = [
            {"type": "ken_burns", "params": {"zoom": 1.05, "direction": "in"}},
            {"type": "ken_burns", "params": {"zoom": 1.05, "direction": "out"}},
            {"type": "pan", "params": {"direction": "left", "speed": 0.02}},
        ]

        for i, shot in enumerate(shots):
            shot_duration = shot.get("duration_seconds", 3.0)
            shot_assets = assets.get(shot["id"], {})

            # Video clip
            clip = {
                "track": "video",
                "clip_id": f"clip_{i+1}",
                "shot_id": shot["id"],
                "start_time": round(current_time, 3),
                "end_time": round(current_time + shot_duration, 3),
                "in_point": 0.0,
                "out_point": shot_duration,
                "video_url": shot_assets.get("video_url"),
                "image_url": shot_assets.get("image_url"),
                "transition_in": {
                    "type": trans_cycle[i % len(trans_cycle)],
                    "duration": 0.3 if i > 0 else 0
                },
                "transition_out": {
                    "type": shot.get("transition_out", "cut"),
                    "duration": 0.3
                },
                "effects": [kb_effects[i % len(kb_effects)]],
                "color_grade": {"brightness": 0, "contrast": 5, "saturation": 10}
            }
            timeline.append(clip)

            # Audio clip (dialogue/voice)
            audio_url = shot_assets.get("audio_url")
            if audio_url:
                audio_clips.append({
                    "clip_id": f"audio_{i+1}",
                    "shot_id": shot["id"],
                    "url": audio_url,
                    "start_time": round(current_time + 0.2, 3),
                    "duration": shot_duration - 0.4,
                    "fade_in": 0.1,
                    "fade_out": 0.1,
                    "volume": 1.0
                })

            # Subtitles
            dialogue = shot.get("dialogue", "")
            if dialogue:
                subtitles.append({
                    "shot_id": shot["id"],
                    "text": dialogue,
                    "start_time": round(current_time + 0.3, 3),
                    "end_time": round(current_time + shot_duration - 0.3, 3),
                    "style": {
                        "font_size": 32,
                        "color": "#FFFFFF",
                        "outline_color": "#000000",
                        "outline_width": 2,
                        "position": "bottom",
                        "margin_bottom": 60
                    }
                })

            current_time += shot_duration

        # BGM track
        bgm_track = {
            "track": "bgm",
            "clips": [{
                "source": "auto_generate",
                "mood": bgm_mood,
                "start_time": 0.0,
                "duration": current_time,
                "volume": 0.25,
                "fade_in": 2.0,
                "fade_out": 3.0
            }]
        }

        return {
            "timeline": timeline,
            "audio_tracks": [
                {"track": "dialogue", "clips": audio_clips},
                bgm_track
            ],
            "subtitles": subtitles,
            "total_duration": round(current_time, 3),
            "fps": 24,
            "resolution": "1920x1080",
            "style": style
        }

    def _attach_assets(self, timeline_data: dict, assets: dict) -> dict:
        """将资源 URL 附加到时间轴剪辑"""
        for clip in timeline_data.get("timeline", []):
            shot_id = clip.get("shot_id")
            if shot_id and shot_id in assets:
                shot_assets = assets[shot_id]
                clip["video_url"] = shot_assets.get("video_url")
                clip["image_url"] = shot_assets.get("image_url")
        return timeline_data

    def generate_ffmpeg_commands(self, timeline_data: dict, output_path: str) -> list[str]:
        """
        根据时间轴生成 FFmpeg 渲染命令列表。
        """
        commands = []
        clips = timeline_data.get("timeline", [])

        # Build filter complex for concatenation
        filter_parts = []
        inputs = []
        input_count = 0

        for i, clip in enumerate(clips):
            if clip.get("image_url"):
                inputs.extend(["-loop", "1", "-t", str(clip["end_time"] - clip["start_time"]),
                                "-i", clip["image_url"]])
                # Ken Burns effect
                filter_parts.append(
                    f"[{input_count}:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
                    f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
                    f"zoompan=z='min(zoom+0.0015,1.5)':d={int((clip['end_time']-clip['start_time'])*24)}:"
                    f"s=1920x1080[v{i}]"
                )
                input_count += 1

        if filter_parts:
            concat_inputs = "".join(f"[v{i}]" for i in range(len(clips)))
            filter_complex = (
                ";".join(filter_parts) +
                f";{concat_inputs}concat=n={len(clips)}:v=1:a=0[outv]"
            )

            cmd = ["ffmpeg", "-y"] + inputs + [
                "-filter_complex", filter_complex,
                "-map", "[outv]",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "23",
                "-r", "24",
                output_path
            ]
            commands.append(" ".join(cmd))

        return commands
