"""
Generation Tasks: AI 生成类异步任务。
"""
import json
from celery import shared_task
from loguru import logger

from app.tasks.worker import celery_app, run_async


@celery_app.task(bind=True, name="app.tasks.generation_tasks.parse_script_task")
def parse_script_task(self, task_id: str, project_id: str, script_content: str):
    """解析剧本任务"""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask, Script
        from app.services.ai.script_parser import ScriptParser
        from sqlalchemy import select

        async with AsyncSessionLocal() as db:
            # Update task status to running
            task = await db.get(GenerationTask, task_id)
            if task:
                task.status = "running"
                task.progress = 10
                task.celery_task_id = self.request.id
                await db.commit()

            try:
                self.update_state(state="PROGRESS", meta={"progress": 20, "step": "parsing"})

                parser = ScriptParser()
                parsed_data = await parser.parse_script(script_content)

                self.update_state(state="PROGRESS", meta={"progress": 80, "step": "saving"})

                # Save parsed data to script
                result = await db.execute(
                    select(Script).where(
                        Script.project_id == project_id,
                        Script.content == script_content
                    )
                )
                script = result.scalar_one_or_none()
                if script:
                    script.parsed_data = parsed_data
                    await db.commit()

                # Update task
                if task:
                    task.status = "completed"
                    task.progress = 100
                    task.output_urls = []
                    await db.commit()

                logger.info(f"Script parse task {task_id} completed")
                return {"status": "completed", "parsed_data": parsed_data}

            except Exception as e:
                logger.error(f"Script parse task {task_id} failed: {e}")
                if task:
                    task.status = "failed"
                    task.error_message = str(e)
                    await db.commit()
                raise

    return run_async(_run())


@celery_app.task(bind=True, name="app.tasks.generation_tasks.generate_storyboard_task")
def generate_storyboard_task(self, task_id: str, project_id: str, script_id: str, visual_style: str = "manga"):
    """生成分镜任务"""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask, Script, Storyboard
        from app.services.ai.storyboard_generator import StoryboardGenerator

        async with AsyncSessionLocal() as db:
            task = await db.get(GenerationTask, task_id)
            script = await db.get(Script, script_id)

            if not script or not script.parsed_data:
                raise ValueError("Script not found or not parsed yet")

            if task:
                task.status = "running"
                task.progress = 10
                task.celery_task_id = self.request.id
                await db.commit()

            try:
                self.update_state(state="PROGRESS", meta={"progress": 30, "step": "generating_shots"})

                generator = StoryboardGenerator()
                storyboard_data = await generator.generate_storyboard(
                    script.parsed_data,
                    visual_style=visual_style
                )

                self.update_state(state="PROGRESS", meta={"progress": 80, "step": "saving"})

                # Save storyboard
                storyboard = Storyboard(
                    project_id=project_id,
                    script_id=script_id,
                    title=f"分镜 - {script.title or '未命名'}",
                    shots=storyboard_data["shots"],
                    timing_data={"total_duration": storyboard_data["total_duration"]},
                    visual_style={"style": visual_style, "notes": storyboard_data.get("style_notes", "")}
                )
                db.add(storyboard)

                if task:
                    task.status = "completed"
                    task.progress = 100
                    await db.commit()

                logger.info(f"Storyboard task {task_id} completed: {storyboard.id}")
                return {"status": "completed", "storyboard_id": storyboard.id}

            except Exception as e:
                logger.error(f"Storyboard task {task_id} failed: {e}")
                if task:
                    task.status = "failed"
                    task.error_message = str(e)
                    await db.commit()
                raise

    return run_async(_run())


@celery_app.task(bind=True, name="app.tasks.generation_tasks.generate_images_task")
def generate_images_task(self, task_id: str, project_id: str, storyboard_id: str, style: str = "manga"):
    """批量生成分镜图像任务"""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask, Storyboard, Asset
        from app.services.generation.image_service import ImageGenerationService
        import uuid

        async with AsyncSessionLocal() as db:
            task = await db.get(GenerationTask, task_id)
            storyboard = await db.get(Storyboard, storyboard_id)

            if not storyboard:
                raise ValueError("Storyboard not found")

            shots = storyboard.shots
            total = len(shots)

            if task:
                task.status = "running"
                task.celery_task_id = self.request.id
                await db.commit()

            image_service = ImageGenerationService()
            generated_urls = []

            for i, shot in enumerate(shots):
                progress = int((i / total) * 90) + 5
                self.update_state(
                    state="PROGRESS",
                    meta={"progress": progress, "step": f"generating_image_{i+1}_of_{total}"}
                )

                try:
                    prompt = shot.get("image_prompt", shot.get("description", ""))
                    result = await image_service.generate_image(
                        prompt=prompt,
                        style=style,
                        project_id=project_id
                    )

                    image_url = result.get("url")
                    if image_url:
                        # Update shot with image URL
                        shot["image_url"] = image_url
                        generated_urls.append(image_url)

                        # Save as asset
                        asset = Asset(
                            project_id=project_id,
                            asset_type="image",
                            name=f"Shot {shot.get('id', i+1)} image",
                            url=image_url,
                            metadata={
                                "shot_id": shot.get("id"),
                                "prompt": prompt,
                                "style": style
                            },
                            used_in_shots=[shot.get("id")]
                        )
                        db.add(asset)

                except Exception as e:
                    logger.warning(f"Image generation failed for shot {i}: {e}")
                    shot["image_url"] = None

            # Update storyboard with image URLs
            storyboard.shots = shots
            await db.commit()

            if task:
                task.status = "completed"
                task.progress = 100
                task.output_urls = generated_urls
                await db.commit()

            return {"status": "completed", "generated_count": len(generated_urls)}

    return run_async(_run())


@celery_app.task(bind=True, name="app.tasks.generation_tasks.generate_tts_task")
def generate_tts_task(self, task_id: str, project_id: str, storyboard_id: str, voice_config: dict):
    """为所有对白生成配音"""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask, Storyboard, Asset
        from app.services.generation.tts_service import TTSService

        async with AsyncSessionLocal() as db:
            task = await db.get(GenerationTask, task_id)
            storyboard = await db.get(Storyboard, storyboard_id)

            if not storyboard:
                raise ValueError("Storyboard not found")

            shots_with_dialogue = [s for s in storyboard.shots if s.get("dialogue")]
            total = len(shots_with_dialogue)

            if task:
                task.status = "running"
                task.celery_task_id = self.request.id
                await db.commit()

            tts_service = TTSService()
            audio_urls = []
            shots = list(storyboard.shots)

            for i, shot in enumerate(shots):
                dialogue = shot.get("dialogue", "")
                if not dialogue:
                    continue

                progress = int((i / max(total, 1)) * 90) + 5
                self.update_state(state="PROGRESS", meta={"progress": progress})

                try:
                    result = await tts_service.synthesize_speech(
                        text=dialogue,
                        voice_id=voice_config.get("voice_id", "zh_female_gentle"),
                        emotion=shot.get("emotion", "neutral"),
                        project_id=project_id
                    )

                    audio_url = result.get("audio_url")
                    if audio_url:
                        shot["audio_url"] = audio_url
                        audio_urls.append(audio_url)

                        asset = Asset(
                            project_id=project_id,
                            asset_type="voice",
                            name=f"Voice - {dialogue[:30]}",
                            url=audio_url,
                            metadata={
                                "shot_id": shot.get("id"),
                                "text": dialogue,
                                "emotion": shot.get("emotion", "neutral")
                            },
                            used_in_shots=[shot.get("id")]
                        )
                        db.add(asset)

                except Exception as e:
                    logger.warning(f"TTS failed for shot {i}: {e}")

            storyboard.shots = shots
            await db.commit()

            if task:
                task.status = "completed"
                task.progress = 100
                task.output_urls = audio_urls
                await db.commit()

            return {"status": "completed", "audio_count": len(audio_urls)}

    return run_async(_run())


@celery_app.task(bind=True, name="app.tasks.generation_tasks.auto_edit_task")
def auto_edit_task(self, task_id: str, project_id: str, storyboard_id: str, edit_config: dict):
    """自动剪辑任务"""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask, Storyboard
        from app.services.ai.editing_engine import AIEditingEngine

        async with AsyncSessionLocal() as db:
            task = await db.get(GenerationTask, task_id)
            storyboard = await db.get(Storyboard, storyboard_id)

            if not storyboard:
                raise ValueError("Storyboard not found")

            if task:
                task.status = "running"
                task.celery_task_id = self.request.id
                await db.commit()

            self.update_state(state="PROGRESS", meta={"progress": 20, "step": "building_assets_map"})

            # Build assets map from shots
            assets = {}
            for shot in storyboard.shots:
                shot_id = shot.get("id")
                if shot_id:
                    assets[shot_id] = {
                        "image_url": shot.get("image_url"),
                        "video_url": shot.get("video_url"),
                        "audio_url": shot.get("audio_url"),
                    }

            self.update_state(state="PROGRESS", meta={"progress": 50, "step": "generating_timeline"})

            engine = AIEditingEngine()
            timeline = await engine.auto_edit(
                storyboard={"shots": storyboard.shots},
                assets=assets,
                style=edit_config.get("style", "dynamic"),
                bgm_mood=edit_config.get("bgm_mood", "auto")
            )

            # Save timeline to storyboard timing_data
            storyboard.timing_data = {
                **storyboard.timing_data,
                "timeline": timeline
            }
            await db.commit()

            if task:
                task.status = "completed"
                task.progress = 100
                await db.commit()

            return {"status": "completed", "total_duration": timeline.get("total_duration")}

    return run_async(_run())


@celery_app.task(name="app.tasks.generation_tasks.cleanup_expired_tasks")
def cleanup_expired_tasks():
    """清理过期任务记录"""
    async def _run():
        from app.core.database import AsyncSessionLocal
        from app.models.project import GenerationTask
        from sqlalchemy import select, delete
        from datetime import datetime, timedelta, timezone

        async with AsyncSessionLocal() as db:
            cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            await db.execute(
                delete(GenerationTask).where(
                    GenerationTask.created_at < cutoff,
                    GenerationTask.status.in_(["completed", "failed", "cancelled"])
                )
            )
            await db.commit()
            logger.info("Expired tasks cleaned up")

    run_async(_run())
