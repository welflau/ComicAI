"""
Image Toolbar API: 图片工具栏功能端点。
支持多角度生成、打光、裁剪、高清放大、分割等图片处理功能。
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from loguru import logger

from app.core.security import get_current_user
from app.models.user import User
from app.core.config import settings
from app.services.generation.image_processing import ImageProcessingService

router = APIRouter(prefix="/image-toolbar", tags=["image-toolbar"])


# ─── Request/Response Models ────────────────────────────────────────────────

class MultiAnglesRequest(BaseModel):
    """多角度生成请求"""
    image_url: str
    prompt: str  # 对象描述
    angles: List[str] = ["前", "左侧", "右侧", "俯视", "仰视"]  # 默认5个角度
    style: Optional[str] = None  # 风格描述


class LightingRequest(BaseModel):
    """打光效果请求"""
    image_url: str
    lighting_type: str  # "warm" | "cool" | "dramatic" | "soft" | "studio"
    intensity: float = 1.0  # 0.5-2.0


class CropGrid9Request(BaseModel):
    """九宫格裁剪请求"""
    image_url: str
    auto_detect: bool = True  # 自动检测主体


class UpscaleHDRequest(BaseModel):
    """高清放大请求"""
    image_url: str
    scale: int = 2  # 2 | 4
    model: str = "realesrgan"  # "realesrgan" | "upsampler"


class SplitGridRequest(BaseModel):
    """宫格切分请求"""
    image_url: str
    grid_size: int = 3  # 3 | 4 | 6


class OptimizeRequest(BaseModel):
    """图片优化请求"""
    image_url: str
    enhance_type: str  # "colors" | "contrast" | "sharpness" | "auto"
    intensity: float = 1.0


class RegenerateRequest(BaseModel):
    """重新生成请求"""
    image_url: str
    prompt: str
    negative_prompt: Optional[str] = None
    style: Optional[str] = None


class ImageResponse(BaseModel):
    """单图像响应"""
    image_url: str
    description: Optional[str] = None


class MultiImageResponse(BaseModel):
    """多图像响应"""
    images: List[str]
    descriptions: Optional[List[str]] = None


# ─── Endpoints ────────────────────────────────────────────────────────────

@router.post("/multi-angles", response_model=MultiImageResponse)
async def generate_multi_angles(
    request: MultiAnglesRequest,
    current_user: User = Depends(get_current_user)
):
    """Generate multi-angle views of an object."""
    try:
        logger.info(f"Generate multi-angles for image: {request.image_url}")
        
        service = ImageProcessingService()
        images = await service.generate_multi_angles(
            image_url=request.image_url,
            angles=request.angles,
            style=request.style,
            project_id=current_user.id
        )
        
        return MultiImageResponse(
            images=images,
            descriptions=request.angles
        )
    
    except Exception as e:
        logger.error(f"Error generating multi-angles: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/lighting", response_model=ImageResponse)
async def apply_lighting(
    request: LightingRequest,
    current_user: User = Depends(get_current_user)
):
    """Apply lighting effects to image."""
    try:
        logger.info(f"Apply {request.lighting_type} lighting to image: {request.image_url}")
        
        service = ImageProcessingService()
        image_url = await service.apply_lighting(
            image_url=request.image_url,
            lighting_type=request.lighting_type,
            intensity=request.intensity,
            project_id=current_user.id
        )
        
        return ImageResponse(
            image_url=image_url,
            description=f"Applied {request.lighting_type} lighting effect"
        )
    
    except Exception as e:
        logger.error(f"Error applying lighting: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/crop-grid9", response_model=MultiImageResponse)
async def crop_grid_9(
    request: CropGrid9Request,
    current_user: User = Depends(get_current_user)
):
    """Crop image into 9 grid sections (3x3)."""
    try:
        logger.info(f"Crop image to 9-grid: {request.image_url}")
        
        service = ImageProcessingService()
        images = await service.crop_grid_9(
            image_url=request.image_url,
            auto_detect=request.auto_detect,
            project_id=current_user.id
        )
        
        return MultiImageResponse(images=images)
    
    except Exception as e:
        logger.error(f"Error cropping to grid: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upscale-hd", response_model=ImageResponse)
async def upscale_hd(
    request: UpscaleHDRequest,
    current_user: User = Depends(get_current_user)
):
    """Upscale image to HD resolution."""
    try:
        logger.info(f"Upscale image to {request.scale}x: {request.image_url}")
        
        service = ImageProcessingService()
        image_url = await service.upscale_hd(
            image_url=request.image_url,
            scale=request.scale,
            model=request.model,
            project_id=current_user.id
        )
        
        return ImageResponse(
            image_url=image_url,
            description=f"Upscaled {request.scale}x using {request.model}"
        )
    
    except Exception as e:
        logger.error(f"Error upscaling image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/split-grid", response_model=MultiImageResponse)
async def split_grid(
    request: SplitGridRequest,
    current_user: User = Depends(get_current_user)
):
    """Split image into grid sections."""
    try:
        logger.info(f"Split image into {request.grid_size}x{request.grid_size} grid")
        
        service = ImageProcessingService()
        images = await service.split_grid(
            image_url=request.image_url,
            grid_size=request.grid_size,
            project_id=current_user.id
        )
        
        return MultiImageResponse(images=images)
    
    except Exception as e:
        logger.error(f"Error splitting grid: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimize", response_model=ImageResponse)
async def optimize_image(
    request: OptimizeRequest,
    current_user: User = Depends(get_current_user)
):
    """Optimize image quality and enhancement."""
    try:
        logger.info(f"Optimize image with {request.enhance_type}: {request.image_url}")
        
        service = ImageProcessingService()
        image_url = await service.optimize_image(
            image_url=request.image_url,
            enhance_type=request.enhance_type,
            intensity=request.intensity,
            project_id=current_user.id
        )
        
        return ImageResponse(
            image_url=image_url,
            description=f"Optimized with {request.enhance_type} enhancement"
        )
    
    except Exception as e:
        logger.error(f"Error optimizing image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/regenerate", response_model=ImageResponse)
async def regenerate_image(
    request: RegenerateRequest,
    current_user: User = Depends(get_current_user)
):
    """Regenerate image with new prompt."""
    try:
        logger.info(f"Regenerate image with new prompt: {request.prompt}")
        
        # For regeneration, use the ImageGenerationService
        from app.services.generation.image_service import ImageGenerationService
        service = ImageGenerationService()
        result = await service.generate_image(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt or "",
            style=request.style or "manga",
            project_id=current_user.id
        )
        
        return ImageResponse(
            image_url=result.get("url", ""),
            description="Regenerated with new prompt"
        )
    
    except Exception as e:
        logger.error(f"Error regenerating image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview", response_model=ImageResponse)
async def get_fullscreen_preview(
    image_url: str,
    current_user: User = Depends(get_current_user)
):
    """Get fullscreen preview URL."""
    try:
        logger.info(f"Get fullscreen preview: {image_url}")
        
        return ImageResponse(
            image_url=image_url,
            description="Fullscreen preview"
        )
    
    except Exception as e:
        logger.error(f"Error getting preview: {e}")
        raise HTTPException(status_code=500, detail=str(e))
