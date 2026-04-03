"""
ScriptParser: 将原始剧本文本解析成结构化数据。
支持标准格式 (场景/角色/对白) 和自由格式。
"""
import json
import re
from typing import Optional
from loguru import logger

from app.core.config import settings


class ScriptParser:
    """
    将剧本解析为结构化场景、角色、对白、情绪列表。
    优先使用 LLM 解析，回退到规则解析。
    """

    PARSE_PROMPT = """你是一位专业的漫剧剧本分析师。请将下面的剧本解析为严格的 JSON 格式。

剧本内容：
{script}

请输出如下 JSON（无多余文字）：
{{
  "title": "作品标题（若有）",
  "genre": "类型标签（如：恋爱/奇幻/悬疑）",
  "scenes": [
    {{
      "id": "scene_1",
      "title": "场景标题",
      "description": "场景描述（环境、氛围）",
      "location": "地点",
      "time_of_day": "时间段（白天/夜晚/黄昏...）",
      "mood": "情绪基调",
      "characters_present": ["角色名1", "角色名2"],
      "shots": [
        {{
          "id": "shot_1_1",
          "shot_type": "远景/中景/近景/特写/主观视角",
          "description": "镜头内容描述",
          "duration_seconds": 3.0,
          "characters": ["角色名"],
          "dialogues": [
            {{
              "character": "角色名",
              "text": "台词内容",
              "emotion": "情绪（高兴/悲伤/愤怒/惊讶/平静）",
              "action": "动作描述"
            }}
          ],
          "narration": "旁白（若有）",
          "sfx": "音效描述（若有）"
        }}
      ]
    }}
  ],
  "characters": [
    {{
      "name": "角色名",
      "role": "主角/配角/反派",
      "description": "外貌性格描述",
      "age": "年龄段",
      "traits": ["性格特征1", "性格特征2"]
    }}
  ]
}}"""

    def __init__(self):
        self._llm_client = None

    def _get_llm_client(self):
        if self._llm_client is None:
            if settings.OPENAI_API_KEY:
                import openai
                self._llm_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            elif settings.ANTHROPIC_API_KEY:
                import anthropic
                self._llm_client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._llm_client

    async def parse_script(self, script_content: str) -> dict:
        """
        解析剧本，返回结构化数据。
        返回格式：{title, genre, scenes, characters}
        """
        try:
            client = self._get_llm_client()
            if client is None:
                logger.warning("No LLM API key configured, using rule-based parser")
                return self._rule_based_parse(script_content)

            prompt = self.PARSE_PROMPT.format(script=script_content[:8000])

            if settings.OPENAI_API_KEY:
                result = await self._parse_with_openai(client, prompt)
            else:
                result = await self._parse_with_anthropic(client, prompt)

            logger.info(f"Script parsed: {len(result.get('scenes', []))} scenes, "
                        f"{len(result.get('characters', []))} characters")
            return result

        except Exception as e:
            logger.error(f"LLM parse failed: {e}, falling back to rule-based")
            return self._rule_based_parse(script_content)

    async def _parse_with_openai(self, client, prompt: str) -> dict:
        import openai
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL_TEXT,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        return json.loads(response.choices[0].message.content)

    async def _parse_with_anthropic(self, client, prompt: str) -> dict:
        response = await client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        text = response.content[0].text
        # Extract JSON from response
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            return json.loads(json_match.group())
        raise ValueError("No JSON found in Anthropic response")

    def _rule_based_parse(self, content: str) -> dict:
        """基于规则的降级解析器"""
        lines = content.strip().split('\n')
        scenes = []
        characters = {}
        current_scene = None
        scene_counter = 0
        shot_counter = 0

        scene_pattern = re.compile(r'^(第.+幕|场景\s*\d+|INT\.|EXT\.|\[.+\])', re.IGNORECASE)
        char_dialogue_pattern = re.compile(r'^([A-Z\u4e00-\u9fa5]{1,10})[：:](.+)')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            if scene_pattern.match(line):
                scene_counter += 1
                shot_counter = 0
                current_scene = {
                    "id": f"scene_{scene_counter}",
                    "title": line,
                    "description": "",
                    "location": line,
                    "time_of_day": "白天",
                    "mood": "平静",
                    "characters_present": [],
                    "shots": []
                }
                scenes.append(current_scene)
            elif char_dialogue_pattern.match(line):
                match = char_dialogue_pattern.match(line)
                char_name = match.group(1)
                dialogue_text = match.group(2)

                if char_name not in characters:
                    characters[char_name] = {
                        "name": char_name,
                        "role": "主角" if len(characters) == 0 else "配角",
                        "description": "",
                        "age": "青年",
                        "traits": []
                    }

                if current_scene is None:
                    scene_counter += 1
                    current_scene = {
                        "id": f"scene_{scene_counter}",
                        "title": "场景一",
                        "description": "",
                        "location": "未知地点",
                        "time_of_day": "白天",
                        "mood": "平静",
                        "characters_present": [],
                        "shots": []
                    }
                    scenes.append(current_scene)

                if char_name not in current_scene["characters_present"]:
                    current_scene["characters_present"].append(char_name)

                shot_counter += 1
                current_scene["shots"].append({
                    "id": f"shot_{scene_counter}_{shot_counter}",
                    "shot_type": "中景",
                    "description": f"{char_name}说话",
                    "duration_seconds": max(2.0, len(dialogue_text) * 0.1),
                    "characters": [char_name],
                    "dialogues": [{
                        "character": char_name,
                        "text": dialogue_text,
                        "emotion": "平静",
                        "action": ""
                    }],
                    "narration": "",
                    "sfx": ""
                })
            elif current_scene and line:
                current_scene["description"] += line + " "

        # Ensure at least one scene
        if not scenes:
            scenes = [{
                "id": "scene_1",
                "title": "场景一",
                "description": content[:200],
                "location": "未知地点",
                "time_of_day": "白天",
                "mood": "平静",
                "characters_present": [],
                "shots": [{
                    "id": "shot_1_1",
                    "shot_type": "中景",
                    "description": "画面展示",
                    "duration_seconds": 3.0,
                    "characters": [],
                    "dialogues": [],
                    "narration": content[:100],
                    "sfx": ""
                }]
            }]

        return {
            "title": "",
            "genre": "未分类",
            "scenes": scenes,
            "characters": list(characters.values())
        }
