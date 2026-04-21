# 2026-04-21_05 ScriptGenNode 全屏模态创意/脚本视图切换

## 背景

上一步（_04）已实现全屏模态窗口，但顶层标签页设计为「分镜基础/分镜补充」。
用户提供截图后，指出正确设计为：

- **右上角下拉切换**「脚本视图 / 创意视图」
- 创意视图：自适应卡片网格（全宽铺满）
- 「分镜基础/分镜补充」仅作为脚本视图内的子标签页

---

## 改动内容

### 类型重构

```ts
// before
type FullscreenTab = 'basic' | 'supplement'

// after
type FullscreenView = 'creative' | 'script'
type ScriptSubTab   = 'basic' | 'supplement'
```

### 顶栏结构（右侧）

```
[ 下载 TXT ] [ 导出 CSV ] │ [ 视图下拉 ▼ ] [ ✕ ]
```

视图下拉选项：

| 选项 | 图标 |
|------|------|
| 脚本视图 | `<List size={12}>` |
| 创意视图 | `<LayoutGrid size={12}>` |

选中项左侧显示 `<Check size={12} color="#7c6af7" />`。
下拉外部点击自动收起（`useRef + useEffect`）。

### 子标签页（仅脚本视图）

```tsx
{view === 'script' && (
  <div style={{ display: 'flex', alignItems: 'stretch', height: 36 }}>
    {subTabBtn('basic',      '分镜基础')}
    {subTabBtn('supplement', '分镜补充')}
  </div>
)}
```

### 创意视图卡片网格

```tsx
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 12,
  padding: '20px 24px',
}}>
```

每张卡片包含：
- 顶部：序号徽标（紫色）+ 时长（右侧）
- 图片占位区（高 108px，灰色背景 + 相机图标）
- 画面描述（2 行截断）
- 标签行：景别（灰色）+ 角色（蓝紫色调）
- 底部：场景地点

### 关闭交互

| 方式 | 行为 |
|------|------|
| `Escape` 键 | 关闭模态 |
| 点击暗色背景 | 关闭模态（`e.target === e.currentTarget`）|
| 点击 ✕ 按钮 | 关闭模态（hover 变红 `#ff4444`） |

---

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `frontend/src/components/nodes/ScriptGenNode.tsx` | refactor: 全屏模态重写为创意/脚本视图切换 |
