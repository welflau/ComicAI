# img2prompt AI 图片传递修复

**日期：** 2026-04-14  
**涉及文件：**
- `frontend/src/stores/imageStore.ts`

---

## 功能背景

img2prompt 流程：
1. 点击 ScriptNode 快捷操作"图片反推提示词"
2. 左侧自动创建 ImageNode（带默认占位图 `DEFAULT_IMAGE_URL = 'default://placeholder'`）
3. ScriptNode 提示词自动填入固定文案，点发送后 AI 对图片进行视觉分析，反推结构化提示词

---

## 问题现象

点击发送后，AI 回复："您好！您提到了'根据图片'，但我没有收到任何图片附件。"

DevTools 日志中 **`已附加上游图片`** 条目缺失，说明 `imageDataUrl` 在调用 `streamAI` 时为 `null`。

---

## 根因分析

`imageStore.ts` 中的 `resolveImageToDataUrl` 对 `default://` 前缀直接返回 `null`：

```ts
// 修复前 — 误判为"SVG 占位，不适合视觉分析"
if (ref.startsWith(DEFAULT_PREFIX)) return null  // SVG placeholder — not suitable for vision
```

**问题在于注释描述错误**：`DEFAULT_IMAGE_URL` 对应的资源实际上是 `placeholder-image.webp`（一张真实的狐狸/浣熊 webp 图片），完全可以发给 AI 做视觉分析。这个早期返回导致：

```
sourceImageRef = 'default://placeholder'
  ↓
resolveImageToDataUrl('default://placeholder') → null
  ↓
imageDataUrl = null
  ↓
streamAI({ imageDataUrl: null })  ← AI 收不到图片
```

`ScriptNode.startGenerate()` 中的日志守卫：
```ts
if (imageDataUrl) {
  addLog({ level: 'info', category: 'ai', message: '已附加上游图片', ... })
}
```
该日志缺失即可确认根因。

---

## 修复方案

将 `default://placeholder` 的处理从"直接返回 null"改为"fetch webp 资源并转 base64"：

```ts
// 修复后
if (ref.startsWith(DEFAULT_PREFIX)) {
  // The placeholder is a real .webp asset — fetch it and convert to base64 for AI vision
  try {
    const response = await fetch(placeholderImageUrl)
    const blob = await response.blob()
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
```

`placeholderImageUrl` 是 Vite 导入的 webp 资源 URL（已在文件顶部 import），`fetch` 后通过 `FileReader.readAsDataURL` 转为 base64 data URL，再传入 `streamAI({ imageDataUrl })`。

---

## 验证结果

修复后点击发送，DevTools 出现 `已附加上游图片` 日志，AI 正确对图片进行了视觉分析，返回结构化中文提示词：

- **主体描述**：猪头人身妖怪角色，猪鼻宽阔、小眼深邃凶狠，手持龙纹九齿钉耙…
- **环境**：纯黑深邃背景，虚空无界…

---

## 完整修复流程（本次 session）

| 问题 | 文件 | 状态 |
|------|------|------|
| ImageNode 刷新尺寸跳变 | `ImageNode.tsx`, `projectStore.ts`, `types/index.ts` | ✅ 已修复（4-13） |
| img2prompt 节点显示空态 | `ImageNode.tsx` | ✅ 已修复（4-14） |
| img2prompt 图片比例变形 | `ImageNode.tsx` | ✅ 已修复（4-14） |
| AI 未收到图片 | `imageStore.ts` | ✅ 已修复（4-14） |
