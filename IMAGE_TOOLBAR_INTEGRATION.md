# Image Toolbar API Integration Guide

## Status Summary

✅ COMPLETED:
- Backend endpoint file created: image_toolbar.py
- Router registration added in router.py
- Frontend API client (imageToolbarApi) added to api/index.ts
- 7 request/response interfaces defined

⏳ TODO:
- Frontend: Connect handlers to toolbar buttons in ImageNode.tsx
- Backend: Implement actual image processing logic

## Files Created/Modified

### 1. Backend Endpoint File
File: /backend/app/api/v1/endpoints/image_toolbar.py
Status: ✅ Created with 8 endpoints (stubbed with TODO comments)

Endpoints:
- POST /image-toolbar/multi-angles
- POST /image-toolbar/lighting
- POST /image-toolbar/crop-grid9
- POST /image-toolbar/upscale-hd
- POST /image-toolbar/split-grid
- POST /image-toolbar/optimize
- POST /image-toolbar/regenerate
- GET /image-toolbar/preview

### 2. Router Registration
File: /backend/app/api/v1/router.py
Status: ✅ Updated to include image_toolbar router

### 3. Frontend API Client
File: /frontend/src/api/index.ts
Status: ✅ Added imageToolbarApi with 8 methods

Methods:
- imageToolbarApi.generateMultiAngles(options)
- imageToolbarApi.applyLighting(options)
- imageToolbarApi.cropGrid9(options)
- imageToolbarApi.upscaleHD(options)
- imageToolbarApi.splitGrid(options)
- imageToolbarApi.optimizeImage(options)
- imageToolbarApi.regenerate(options)
- imageToolbarApi.getFullscreenPreview(imageUrl)

## Integration Quick Reference

### ImageNode.tsx Hook Access
```javascript
const updateNode = useProjectStore(s => s.updateNode)
const data = props.data  // Node data with id, imageUrl, etc
```

### Basic Handler Pattern
```javascript
const handleButton = useCallback(async () => {
  if (!displayUrl) return
  try {
    const result = await imageToolbarApi.methodName({ ... })
    const savedUrl = await saveImage(result.image_url, 'generated')
    updateNode(data.id, { imageUrl: savedUrl })
    addLog({ level: 'success', category: 'operation', message: 'Done' })
  } catch (error) {
    addLog({ level: 'error', category: 'operation', message: 'Failed', detail: String(error) })
  }
}, [displayUrl, data.id, updateNode])
```

## Next Steps

1. Implement backend image processing logic
2. Connect frontend handlers to toolbar buttons
3. Test all operations end-to-end
