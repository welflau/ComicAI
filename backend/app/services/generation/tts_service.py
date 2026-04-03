"""
TTSService: 文字转语音服务。
支持 Azure TTS 和火山引擎 TTS，带情绪控制。
"""
import httpx
import base64
import uuid
import asyncio
from typing import Optional
from loguru import logger

from app.core.config import settings
from app.services.storage import StorageService


VOICE_CONFIGS = {
    "zh_female_gentle": {"azure_name": "zh-CN-XiaoxiaoNeural", "gender": "Female"},
    "zh_female_lively": {"azure_name": "zh-CN-XiaohanNeural", "gender": "Female"},
    "zh_male_calm": {"azure_name": "zh-CN-YunxiNeural", "gender": "Male"},
    "zh_male_deep": {"azure_name": "zh-CN-YunjianNeural", "gender": "Male"},
    "zh_female_sweet": {"azure_name": "zh-CN-XiaomengNeural", "gender": "Female"},
}

EMOTION_SSML_MAP = {
    "happy": 'style="cheerful"',
    "sad": 'style="sad"',
    "angry": 'style="angry"',
    "surprised": 'style="excited"',
    "fearful": 'style="fearful"',
    "neutral": '',
}


class TTSService:

    def __init__(self):
        self.storage = StorageService()

    async def synthesize_speech(
        self,
        text: str,
        voice_id: str = "zh_female_gentle",
        emotion: str = "neutral",
        speed: float = 1.0,
        pitch: float = 0.0,
        project_id: Optional[str] = None
    ) -> dict:
        """
        合成语音。
        返回: {audio_url, duration_estimate, voice_used}
        """
        if settings.AZURE_TTS_KEY:
            return await self._azure_tts(text, voice_id, emotion, speed, pitch, project_id)
        else:
            logger.warning("No TTS provider configured")
            return {
                "audio_url": None,
                "duration_estimate": len(text) * 0.1,
                "voice_used": voice_id,
                "provider": "none"
            }

    async def _azure_tts(
        self,
        text: str,
        voice_id: str,
        emotion: str,
        speed: float,
        pitch: float,
        project_id: Optional[str]
    ) -> dict:
        voice_config = VOICE_CONFIGS.get(voice_id, VOICE_CONFIGS["zh_female_gentle"])
        azure_voice = voice_config["azure_name"]
        emotion_attr = EMOTION_SSML_MAP.get(emotion, "")

        # Build SSML
        rate = f"{int((speed - 1.0) * 100):+d}%"
        pitch_str = f"{int(pitch * 50):+d}Hz"

        if emotion_attr:
            ssml = f"""<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
                xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="zh-CN">
  <voice name="{azure_voice}">
    <mstts:express-as {emotion_attr}>
      <prosody rate="{rate}" pitch="{pitch_str}">{text}</prosody>
    </mstts:express-as>
  </voice>
</speak>"""
        else:
            ssml = f"""<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="{azure_voice}">
    <prosody rate="{rate}" pitch="{pitch_str}">{text}</prosody>
  </voice>
</speak>"""

        # Get token
        token_url = f"https://{settings.AZURE_TTS_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
        tts_url = f"https://{settings.AZURE_TTS_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"

        async with httpx.AsyncClient(timeout=30.0) as client:
            token_resp = await client.post(
                token_url,
                headers={"Ocp-Apim-Subscription-Key": settings.AZURE_TTS_KEY}
            )
            token_resp.raise_for_status()
            access_token = token_resp.text

            audio_resp = await client.post(
                tts_url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3"
                },
                content=ssml.encode("utf-8")
            )
            audio_resp.raise_for_status()
            audio_data = audio_resp.content

        # Upload to storage
        audio_url = None
        if project_id:
            audio_url = await self.storage.upload_audio(
                audio_data,
                f"projects/{project_id}/audio/{uuid.uuid4()}.mp3"
            )

        # Estimate duration (rough: ~150 chars/sec for Chinese)
        duration_estimate = len(text) / 3.5 / speed

        return {
            "audio_url": audio_url,
            "audio_data_b64": base64.b64encode(audio_data).decode() if not audio_url else None,
            "duration_estimate": duration_estimate,
            "voice_used": azure_voice,
            "provider": "azure"
        }
