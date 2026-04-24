"""
Video Compose API: 将多段视频合并为一段。
使用 FFmpeg concat demuxer 合并（直切 / 淡入淡出 / 叠化）。
"""
import asyncio
import uuid
import tempfile
import os
import httpx
from pathlib import Path
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from loguru import logger

from app.core.security import get_current_user
from app.models.user import User
from app.services.storage import StorageService, UPLOAD_ROOT

router = APIRouter(prefix="/video", tags=["video"])


# ─── Request / Response ────────────────────────────────────────────────────────

class ComposeRequest(BaseModel):
    video_urls: List[str]
    transition: Literal["none", "fade", "dissolve"] = "none"
    # fade / dissolve duration in seconds
    transition_duration: float = 0.5


class ComposeResponse(BaseModel):
    output_url: str


class PersistRequest(BaseModel):
    # Remote video URL (Kling/Jimeng CDN link, or any http(s) mp4)
    url: str


class PersistResponse(BaseModel):
    # Local URL suitable for the frontend to store, e.g. /uploads/videos/xxx.mp4
    url: str
    # Original remote URL (for debugging / reference)
    source_url: str
    # Size of the saved file in bytes
    size: int


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _is_remote(url: str) -> bool:
    return url.startswith("http://") or url.startswith("https://")


def _resolve_local_path(url: str) -> Path:
    """
    Turn a local URL like /uploads/videos/foo.mp4 into an absolute filesystem path.
    Also accepts absolute filesystem paths (for test / local dev use).
    """
    if url.startswith("/uploads/"):
        return UPLOAD_ROOT / url[len("/uploads/"):]
    if os.path.isabs(url):
        return Path(url)
    # Relative path — relative to UPLOAD_ROOT
    return UPLOAD_ROOT / url


async def _download_to_temp(url: str, tmp_dir: str) -> Path:
    """Download a remote video URL to a temp file. Returns the temp file path."""
    suffix = ".mp4"
    # Try to preserve extension from URL path
    url_path = url.split("?")[0]
    if "." in url_path.rsplit("/", 1)[-1]:
        suffix = "." + url_path.rsplit(".", 1)[-1].lower()[:4]

    tmp_path = Path(tmp_dir) / f"dl_{uuid.uuid4().hex[:10]}{suffix}"
    logger.debug(f"Downloading remote video: {url[:80]} → {tmp_path}")

    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        async with client.stream("GET", url) as resp:
            if resp.status_code != 200:
                raise RuntimeError(f"Failed to download {url!r}: HTTP {resp.status_code}")
            with open(tmp_path, "wb") as f:
                async for chunk in resp.aiter_bytes(chunk_size=1024 * 256):
                    f.write(chunk)

    logger.debug(f"Downloaded {tmp_path.stat().st_size} bytes")
    return tmp_path


async def _resolve_path(url: str, tmp_dir: str) -> Path:
    """
    Resolve a video URL to a local filesystem path.
    - Remote URLs (http/https) are downloaded to tmp_dir.
    - Local /uploads/ paths are resolved against UPLOAD_ROOT.
    """
    if _is_remote(url):
        return await _download_to_temp(url, tmp_dir)
    return _resolve_local_path(url)


async def _run_ffmpeg(*args: str) -> None:
    """Run ffmpeg with the given arguments; raise on non-zero exit."""
    # Allow overriding the ffmpeg binary via env var FFMPEG_BIN.
    # Falls back to "ffmpeg" on PATH.
    ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")
    cmd = [ffmpeg_bin, "-y", *args]
    logger.debug(f"FFmpeg cmd: {' '.join(cmd)}")
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode(errors="replace").strip()
        logger.error(f"FFmpeg failed (rc={proc.returncode}): {err[-1000:]}")
        raise RuntimeError(f"FFmpeg error: {err[-400:]}")


async def _compose_concat(video_paths: List[Path], output_path: Path) -> None:
    """Simple concat — no re-encode (fast, requires compatible streams)."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        list_file = f.name
        for p in video_paths:
            # ffmpeg concat list: paths must use forward slashes and be properly escaped
            safe = str(p.resolve()).replace("\\", "/").replace("'", "\\'")
            f.write(f"file '{safe}'\n")

    try:
        await _run_ffmpeg(
            "-f", "concat", "-safe", "0",
            "-i", list_file,
            "-c", "copy",
            str(output_path),
        )
    finally:
        try:
            os.unlink(list_file)
        except OSError:
            pass


async def _compose_with_transition(
    video_paths: List[Path],
    output_path: Path,
    transition: str,
    duration: float,
) -> None:
    """
    Merge videos with fade/dissolve transitions via xfade filter.
    Re-encodes to H.264 + AAC so stream parameters are uniform.
    """
    if len(video_paths) == 2:
        # Simple two-clip xfade
        await _run_ffmpeg(
            "-i", str(video_paths[0]),
            "-i", str(video_paths[1]),
            "-filter_complex",
            (
                f"[0:v][1:v]xfade=transition={transition}:duration={duration}:offset=0[v];"
                f"[0:a][1:a]acrossfade=d={duration}[a]"
            ),
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            str(output_path),
        )
    else:
        # For N clips: chain xfade filters progressively.
        inputs: List[str] = []
        for p in video_paths:
            inputs += ["-i", str(p)]

        n = len(video_paths)
        filters: List[str] = []
        audio_filters: List[str] = []
        prev_v = "[0:v]"
        prev_a = "[0:a]"
        for i in range(1, n):
            out_v = f"[v{i}]" if i < n - 1 else "[vout]"
            out_a = f"[a{i}]" if i < n - 1 else "[aout]"
            filters.append(
                f"{prev_v}[{i}:v]xfade=transition={transition}:duration={duration}:offset=0{out_v}"
            )
            audio_filters.append(
                f"{prev_a}[{i}:a]acrossfade=d={duration}{out_a}"
            )
            prev_v = out_v
            prev_a = out_a

        filter_complex = ";".join(filters + audio_filters)

        await _run_ffmpeg(
            *inputs,
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            str(output_path),
        )


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/compose", response_model=ComposeResponse)
async def compose_videos(
    req: ComposeRequest,
    current_user: User = Depends(get_current_user),
):
    """Merge multiple video clips into one using FFmpeg."""
    if len(req.video_urls) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 video URLs")
    if len(req.video_urls) > 20:
        raise HTTPException(status_code=400, detail="Too many videos (max 20)")

    # Use a temp directory for any downloaded remote clips; cleaned up after compose
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Resolve URL → filesystem path (downloading remote URLs as needed)
        video_paths: List[Path] = []
        for url in req.video_urls:
            try:
                p = await _resolve_path(url, tmp_dir)
            except RuntimeError as e:
                raise HTTPException(status_code=400, detail=str(e))

            if not p.exists():
                raise HTTPException(
                    status_code=404,
                    detail=f"Video file not found: {url} (resolved to {p})"
                )
            video_paths.append(p)

        # Prepare output path
        out_name = f"compose_{uuid.uuid4().hex[:12]}.mp4"
        out_dir  = UPLOAD_ROOT / "videos"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / out_name

        try:
            if req.transition == "none":
                await _compose_concat(video_paths, out_path)
            else:
                await _compose_with_transition(
                    video_paths, out_path,
                    transition=req.transition,
                    duration=req.transition_duration,
                )
        except RuntimeError as e:
            raise HTTPException(status_code=500, detail=str(e))
        except FileNotFoundError:
            raise HTTPException(
                status_code=500,
                detail="FFmpeg is not installed or not on PATH"
            )

    output_url = f"/uploads/videos/{out_name}"
    logger.info(f"[VideoCompose] Done → {output_url} (user={current_user.id})")
    return ComposeResponse(output_url=output_url)


# ─── Persist remote video to local storage ───────────────────────────────────

@router.post("/persist", response_model=PersistResponse)
async def persist_video(
    req: PersistRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Download a remote video URL (e.g. Kling / Jimeng CDN link) and save it
    into backend/uploads/videos/. Returns a stable local URL the frontend can
    store in node.videoUrl — so the video survives CDN expiration.

    If the URL is already a local /uploads/ path, returns it as-is.
    """
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Empty url")

    # Already local — nothing to do
    if not _is_remote(url):
        if url.startswith("/uploads/"):
            local = UPLOAD_ROOT / url[len("/uploads/"):]
            size = local.stat().st_size if local.exists() else 0
            return PersistResponse(url=url, source_url=url, size=size)
        raise HTTPException(status_code=400, detail="Not an http(s) URL")

    # Decide output extension from the URL path
    url_path = url.split("?")[0]
    last = url_path.rsplit("/", 1)[-1]
    ext = "mp4"
    if "." in last:
        candidate = last.rsplit(".", 1)[-1].lower()
        if candidate in {"mp4", "mov", "webm", "m4v"}:
            ext = candidate

    out_name = f"gen_{uuid.uuid4().hex[:12]}.{ext}"
    out_dir  = UPLOAD_ROOT / "videos"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / out_name

    # Stream the download directly to the destination file
    try:
        async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=502,
                        detail=f"Source returned HTTP {resp.status_code}",
                    )
                with open(out_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=1024 * 256):
                        f.write(chunk)
    except httpx.HTTPError as e:
        # Clean partial file on error
        try: out_path.unlink()
        except OSError: pass
        raise HTTPException(status_code=502, detail=f"Download failed: {e}")

    size = out_path.stat().st_size
    if size == 0:
        try: out_path.unlink()
        except OSError: pass
        raise HTTPException(status_code=502, detail="Downloaded file is empty")

    local_url = f"/uploads/videos/{out_name}"
    logger.info(
        f"[VideoPersist] {url[:80]} → {local_url} ({size} bytes, user={current_user.id})"
    )
    return PersistResponse(url=local_url, source_url=url, size=size)


# ─── Reveal file in OS file manager ──────────────────────────────────────────

class RevealRequest(BaseModel):
    # Local URL like /uploads/videos/gen_abc.mp4
    url: str


class RevealResponse(BaseModel):
    ok: bool
    path: str


@router.post("/reveal", response_model=RevealResponse)
async def reveal_in_folder(
    req: RevealRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Open the OS file manager and highlight the given /uploads/... file.
    Windows: explorer.exe /select,<path>
    macOS:   open -R <path>
    Linux:   xdg-open <parent-dir>  (most DEs don't support selecting a file)

    This relies on the user running the backend on the same machine as the
    file manager they want to use — only practical for local desktop dev /
    single-user deployments, not server deployments.
    """
    url = req.url.strip()
    if not url.startswith("/uploads/"):
        raise HTTPException(status_code=400, detail="Only /uploads/ URLs are supported")

    local = (UPLOAD_ROOT / url[len("/uploads/"):]).resolve()
    # Safety: must stay within UPLOAD_ROOT
    root_abs = UPLOAD_ROOT.resolve()
    try:
        local.relative_to(root_abs)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path escapes uploads root")

    if not local.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {local}")

    import sys, subprocess
    try:
        if sys.platform == "win32":
            # /select, highlights the file inside the folder
            subprocess.Popen(["explorer.exe", f"/select,{local}"])
        elif sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(local)])
        else:
            # Linux / other: open parent folder
            subprocess.Popen(["xdg-open", str(local.parent)])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to open file manager: {e}")

    logger.info(f"[VideoReveal] Opened folder for {local} (user={current_user.id})")
    return RevealResponse(ok=True, path=str(local))
