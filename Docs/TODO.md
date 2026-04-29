# ComicFlow Canvas — TODO

> 记录计划中但尚未实现的功能，按模块分类。

---

## 音频模块

### TODO-1: 音频节点（`libtv_audio`）

**目标**：在画布上添加独立的音频节点，类比 ImageNode / VideoNode。

功能范围：
- 节点卡片显示波形或音频时长
- 支持上传本地音频文件
- 播放预览（内联 `<audio>` 控件）
- 输出字段：`audioUrl: string`

---

### TODO-2: 文生音频（TTS / 音乐生成）

**目标**：音频节点支持从文本生成语音或背景音乐。

功能范围：
- **TTS 配音**：接收上游文本（ScriptNode 输出），调用语音合成 API（如 Azure TTS / 即梦音频），生成角色配音
- **文生音乐**：输入风格描述，生成背景音乐
- 参数面板：语音选择（角色音色）、语速、情感
- 生成后持久化到 `backend/uploads/audio/`（参考 VideoNode 的 CDN 持久化方案）

API 候选：
- 即梦音频（与现有视频生成 API 同一平台）
- Azure TTS（后端 `tts_service.py` 已有框架）

---

### TODO-3: 音视频合成（`libtv_av_compose`）

**目标**：将音频节点和视频节点合并为带音轨的完整视频。

功能范围：
- 新增「音视频合成」节点，接受上游 `libtv_video` / `libtv_video_compose` + `libtv_audio`
- 参数：音频音量、是否静音原视频、时间对齐方式（起点对齐 / 末尾对齐）
- 后端：FFmpeg `-i video.mp4 -i audio.mp3 -c:v copy -c:a aac output.mp4`
- 参考现有 `video_compose.py` 的实现模式

---

## 暂不实现（存档）

以下功能当前不在计划内：

- WorkflowRunner（节点自动级联执行）
- 多视图（故事板视图 / 时间轴视图）
- 实时协作
- 角色一致性跨节点自动引用
