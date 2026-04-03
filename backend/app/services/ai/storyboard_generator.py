"""
StoryboardGenerator: 根据解析好的剧本数据，生成分镜脚本。
为每个镜头确定：画面构图、镜头类型、时长、过渡效果、视觉描述。
"""
import json
import uuid
from typing import Optional
from loguru import logger

from app.core.config import settings


class StoryboardGenerator:

    STORYBOARD_PROMPT = """你是专业的漫画分镜师。根据以下场景数据，生成详细的分镜脚本。

场景数据：
{scene_data}

视觉风格：{visual_style}

请为每个镜头生成详细的分镜描述，输出 JSON 格式（无多余文字）：
{{
  "shots": [
    {{
      "id": "shot_id",
      "scene_id": "scene_id",
      "sequence": 1,
      "shot_type": "远景/全景/中景/近景/特写/极近特写",
      "angle": "平视/仰视/俯视/鸟瞰/斜角",
      "composition": "构图描述（三分法/对称/引导线等）",
      "description": "详细画面内容描述（英文，用于AI绘图）",
      "description_zh": "中文描述",
      "characters_positions": [{{"name":"角色名","position":"left/center/right","action":"动作"}}],
      "background_description": "背景场景描述（英文）",
      "lighting": "光线描述（soft natural light/dramatic shadow等）",
      "color_mood": "色调情绪（warm/cool/neutral/dramatic）",
      "duration_seconds": 3.0,
      "transition_in": "cut/fade/dissolve/wipe",
      "transition_out": "cut/fade/dissolve/wipe",
      "camera_movement": "static/pan_left/pan_right/zoom_in/zoom_out/tilt_up/tilt_down",
      "dialogue": "台词（若有）",
      "narration": "旁白（若有）",
      "sfx": "音效",
      "image_prompt": "完整的AI绘图提示词（英文，包含风格、构图、光线等）"
    }}
  ],
  "total_duration": 60.0,
  "style_notes": "整体风格备注"
}}"""

    def __init__(self):
        self._llm_client = None

    def _get_llm_client(self):
        if self._llm_client is None:
            if settings.OPENAI_API_KEY:
                import openai
                self._llm_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        return self._llm_client

    async def generate_storyboard(
        self,
        parsed_script: dict,
        visual_style: str = "manga",
        style_config: Optional[dict] = None
    ) -> dict:
        """
        从解析好的剧本生成分镜。
        返回: {shots: [...], total_duration, style_notes}
        """
        try:
            client = self._get_llm_client()
            if client is None:
                logger.warning("No LLM configured, generating basic storyboard")
                return self._generate_basic_storyboard(parsed_script, visual_style)

            # Process scenes in batches to avoid token limits
            all_shots = []
            scenes = parsed_script.get("scenes", [])

            for scene in scenes:
                scene_shots = await self._generate_scene_shots(client, scene, visual_style)
                all_shots.extend(scene_shots)

            total_duration = sum(s.get("duration_seconds", 3.0) for s in all_shots)

            return {
                "shots": all_shots,
                "total_duration": total_duration,
                "style_notes": f"Visual style: {visual_style}",
                "scene_count": len(scenes),
                "shot_count": len(all_shots)
            }

        except Exception as e:
            logger.error(f"Storyboard generation failed: {e}")
            return self._generate_basic_storyboard(parsed_script, visual_style)

    async def _generate_scene_shots(self, client, scene: dict, visual_style: str) -> list:
        import openai
        prompt = self.STORYBOARD_PROMPT.format(
            scene_data=json.dumps(scene, ensure_ascii=False),
            visual_style=visual_style
        )
        try:
            response = await client.chat.completions.create(
                model=settings.OPENAI_MODEL_TEXT,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.5,
            )
            data = json.loads(response.choices[0].message.content)
            return data.get("shots", [])
        except Exception as e:
            logger.error(f"Scene shot generation failed: {e}")
            return self._basic_shots_for_scene(scene)

    def _generate_basic_storyboard(self, parsed_script: dict, visual_style: str) -> dict:
        """无 LLM 时的基础分镜生成"""
        all_shots = []
        for scene in parsed_script.get("scenes", []):
            all_shots.extend(self._basic_shots_for_scene(scene))

        total_duration = sum(s.get("duration_seconds", 3.0) for s in all_shots)
        return {
            "shots": all_shots,
            "total_duration": total_duration,
            "style_notes": f"Basic storyboard, style: {visual_style}",
            "scene_count": len(parsed_script.get("scenes", [])),
            "shot_count": len(all_shots)
        }

    def _basic_shots_for_scene(self, scene: dict) -> list:
        shots = []
        scene_shots = scene.get("shots", [])

        # If no shots in scene, create default establishing + close shots
        if not scene_shots:
            scene_shots = [
                {"id": f"{scene['id']}_s1", "shot_type": "远景", "description": scene.get("description", ""), "duration_seconds": 3.0, "dialogues": []},
                {"id": f"{scene['id']}_s2", "shot_type": "中景", "description": scene.get("description", ""), "duration_seconds": 3.0, "dialogues": []},
            ]

        shot_type_map = {
            "远景": "wide shot", "全景": "full shot", "中景": "medium shot",
            "近景": "medium close-up", "特写": "close-up", "极近特写": "extreme close-up"
        }

        for i, shot in enumerate(scene_shots):
            shot_type = shot.get("shot_type", "中景")
            description = shot.get("description", scene.get("description", ""))
            dialogues = shot.get("dialogues", [])

            image_prompt = (
                f"{shot_type_map.get(shot_type, 'medium shot')}, "
                f"manga style comic panel, "
                f"{description}, "
                f"location: {scene.get('location', 'unknown')}, "
                f"mood: {scene.get('mood', 'neutral')}, "
                f"high quality illustration, detailed"
            )

            shots.append({
                "id": shot.get("id", f"{scene['id']}_shot_{i+1}"),
                "scene_id": scene["id"],
                "sequence": len(shots) + 1,
                "shot_type": shot_type,
                "angle": "平视",
                "composition": "三分法",
                "description": description,
                "description_zh": description,
                "characters_positions": [],
                "background_description": scene.get("description", ""),
                "lighting": "soft natural light",
                "color_mood": "neutral",
                "duration_seconds": shot.get("duration_seconds", 3.0),
                "transition_in": "cut",
                "transition_out": "cut",
                "camera_movement": "static",
                "dialogue": dialogues[0]["text"] if dialogues else "",
                "narration": shot.get("narration", ""),
                "sfx": shot.get("sfx", ""),
                "image_prompt": image_prompt
            })
        return shots
