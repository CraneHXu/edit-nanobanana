# image-editor-web 升级进度

## 2026-04-01 第一阶段完成

参考文档：`reference/image-editor-web-upgrade.md`

本次按第一阶段目标落地，范围限定在：

- 干净的单页编辑模型
- Fabric 运行时对象与 store 主模型分离
- 几何同步与提交式回写
- 会话保存 / 恢复

### 已完成

- `store/editorStore.ts`
  - 统一使用 `pageModel.regions` 作为编辑单一真相源。
  - OCR 结果进入 store 时直接转换成 `TextElement` 模型，不再把 Fabric 对象塞进 Zustand。
  - 上传新图时会重置旧页面模型，避免跨图片残留状态。

- `components/editor/CanvasEditor.tsx`
  - 改成运行时 `Map<id, { textObj, bgRect }>` 绑定，Fabric 引用只保留在组件内部。
  - 文本框拖拽 / 缩放后，在 `modified` / `editing:exited` 时一次性回写 `bbox / fontSize / text`。
  - 背景矩形固定在原 OCR 区域，不再跟随文本移动或缩放；文本对象是独立文本框。
  - 橡皮擦路径改成相对固定背景矩形的原图坐标，刷新和恢复时不会丢。

- `components/editor/TextControls.tsx`
  - 右侧面板改成只写 store，不再直接操作 Fabric 对象。
  - 手动改字体色时会把 `textColorMode` 标记为 `manual`。
  - 手动改背景色时会把 `bgMode` 标记为 `manual`。

- `components/editor/Sidebar.tsx`
  - 左侧列表改为基于 `pageModel.regions` 渲染。
  - 点击条目时通过 Canvas 元数据反查运行时对象并选中。

- `components/editor/ImageUploader.tsx`
  - OCR + 取色后的结果直接初始化为页面模型。

- `app/page.tsx`
  - 增加浏览器本地会话持久化。
  - 页面刷新后会恢复 `originalImage / imageMeta / pageModel`。

- `lib/fabric-utils.ts`
  - 提供模型到 Canvas 的同步函数与背景框扩展规则。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 与本地 `@next/swc` 版本不一致：`15.5.11` vs `15.5.7`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这两个都是现有工程告警，不是本次第一阶段改动引入的编译失败。

### 当前仍未完成

- 第二阶段：统一字号拟合与基础样式补齐
- 第三阶段：更稳的颜色提取与 auto/manual 刷新策略
- 第四阶段：`cleanLayer + local_fill`
- 第五阶段：ROI 局部重识别与局部 clean

### 现存风险

- 会话持久化依赖 `localStorage` 保存原图 data URL，超大图片可能触发浏览器存储配额。
- 当前背景层仍然是 `fill + eraser`，不是 `cleanLayer`，复杂背景场景依旧会失真。

## 2026-04-01 第二阶段继续推进

参考文档：`reference/image-editor-web-upgrade.md`

本轮范围限定在：

- 去掉 OCR route 对字号经验值的主导
- 前端统一字号拟合
- 升级字体颜色/背景颜色判断
- 补最小基础样式入口

### 已完成

- `app/api/ocr/route.ts`
  - OCR 服务端不再返回 `height * 0.8` 这种经验字号，统一改为 `fontSize: null`，明确字号应由前端按 bbox 拟合。

- `lib/text-layout.ts`
  - 统一字号拟合继续保留在前端。
  - 拟合时同时约束宽度和高度，并加入轻量 padding，避免文字贴边。
  - 搜索上限不再被 bbox 高度直接卡死，换字体后更容易得到接近原图的字号。

- `lib/color-sampler.ts`
  - 原 `enhanceDetectionsWithColors()` 升级为 `enhanceDetectionsWithStyles()`。
  - 上传后会在浏览器侧统一推断：
    - `fontSize`
    - `textColor`
    - `textColorRaw`
    - `textColorQuantized`
    - `bgColor`
  - 取色不再只靠单一路径，改成“高对比像素 / 亮暗双路径 / 边缘像素 / 非背景聚合”的组合判断，再选最优候选色。
  - 保留 `raw` 与 `quantized` 双轨颜色结果，真正写入文本对象的是 `raw`。

- `store/editorStore.ts`
  - 初始化区域模型时优先使用浏览器侧推断出的 `fontSize`、`textColorRaw`、`textColorQuantized`。
  - 即使旧数据里 `fontSize` 为空，也会回退到统一拟合函数，不再依赖 OCR route。

- `components/editor/ImageUploader.tsx`
  - OCR 完成后不再只做颜色增强，而是统一做字体大小与颜色属性推断后再进入页面模型。

- `components/editor/TextControls.tsx`
  - 新增 `fontWeight` 与 `textAlign` 的最小编辑入口。
  - 切换字体或字重时，会立即按当前 `text + bbox + font` 重新拟合字号，避免沿用旧字体的尺寸。

- `lib/fabric-utils.ts`
  - Fabric 文本对象的 `lineHeight` 与字号拟合逻辑对齐，减少预览和拟合结果之间的偏差。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些都是现有工程告警，不是本轮改动引入的构建失败。

### 当前仍未完成

- `fontWeight` / `textAlign` 目前只补了模型和手动编辑入口，还没有可靠的自动识别逻辑。
- 第三阶段：更稳的颜色提取与 `auto/manual` 刷新策略
- 多色文字 `segment` 级识别仍未做。
- 背景修复仍然是 `fill + eraser`，还没进入 `cleanLayer` 阶段。

### 现存风险

- 当前字体大小拟合依赖浏览器字体测量；如果目标字体网络加载失败，会退回浏览器 fallback 字体，精度会下降。
- 当前颜色提取虽然比单阈值稳定，但仍然只输出“单区域单主色”；渐变字、强描边字、多色字仍可能被压成单色。

## 2026-04-01 第三阶段继续推进

参考文档：`reference/image-editor-web-upgrade.md`

本轮范围限定在：

- 自动取色结果可回写刷新
- 手动颜色与自动颜色分离
- 保留 `raw / quantized` 双轨颜色信息

### 已完成

- `lib/color-sampler.ts`
  - 新增 `sampleRegionStyle()`，支持对单个文字区域重新采样。
  - 区域重采样会返回：
    - `textColorRaw`
    - `textColorQuantized`
    - `bgColor`
  - 现有上传链路和局部重采样共用同一套浏览器侧颜色判断逻辑，避免两套规则分叉。

- `components/editor/TextControls.tsx`
  - 字体色面板新增“重新自动取色”按钮。
  - 只有 `textColorMode === auto` 时才允许重采样并覆盖当前文字色。
  - 用户手动改色后会进入 `manual` 模式，此时自动刷新按钮禁用，不会再偷偷覆盖人工颜色。
  - 新增“使用自动色”按钮，允许用户显式切回 `auto` 模式，并恢复 `textColorRaw` 作为当前文字色。
  - 面板里展示当前区域的：
    - 文字原始色 `raw`
    - 文字量化色 `quantized`
    - 背景色

- `lib/i18n.ts`
  - 补齐第三阶段新增取色交互的中英文文案。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些仍是现有工程告警，不是第三阶段本轮改动引入的构建失败。

### 当前仍未完成

- 当前自动刷新只支持单区域手动触发，还没有“批量刷新全部 auto 区域”的入口。
- 多色文字 `segment` 级识别仍未做。
- 当前仍然是“单区域单主色”，不能表达同一文本框内的多色 run。
- 背景修复仍然是 `fill + eraser`，还没进入 `cleanLayer` 阶段。

### 现存风险

- 如果用户长时间手动改色后再切回自动色，恢复的是最近一次自动采样得到的 `textColorRaw`，不是历史版本列表。
- 当前背景色刷新会避开 `bgMode === manual` 的区域；这符合“手动优先”原则，但也意味着背景色不会自动跟着后续重采样变化。

## 2026-04-01 位置与大小对齐修复

触发原因：

- 当前实现虽然已经参考 `OCRPDF-TO-PPT` 做了字号拟合和颜色双轨字段，但实际预览仍无法稳定贴近原图的位置与大小。

本轮范围限定在：

- 让字号拟合和 Fabric 实际渲染使用同一套排版引擎
- 利用 OCR polygon 恢复旋转文本的局部框与角度
- 保留原始 OCR 采样框，不再让 Fabric 反向污染原始真相源
- 兼容旧会话模型

### 已完成

- `lib/text-layout.ts`
  - `fitFontSizeToBox()` 升级为基于 `fabric.Textbox` 的真实排版测量，不再用 Canvas 2D 粗测后交给 Fabric 另起一套排版。
  - 新增 `fitTextLayoutToBox()`，统一返回：
    - `fontSize`
    - `measuredHeight`
    - `layoutOffsetY`
  - 同步把字号上限提高到 `600`，避免大标题被旧上限压小。
  - `TEXTBOX_LINE_HEIGHT` 调整为更贴近 OCR 紧框的 `1.0`。

- `store/editorStore.ts`
  - 区域模型新增：
    - `sourceBounds`
    - `sourcePolygon`
    - `rotation`
    - `layoutOffsetY`
  - `sourceBounds` 作为原始 OCR 采样区保留，不再被编辑回写覆盖。
  - 初始文字框不再直接用 axis-aligned `bounds`，而是从 OCR polygon 推导：
    - 局部起点
    - 局部宽高
    - 旋转角
  - 新增旧会话归一化逻辑，刷新页面后旧模型也会补齐新字段。

- `lib/color-sampler.ts`
  - 初始字体大小拟合改为使用 polygon 推导出的局部框，而不是只看 axis-aligned bounds。

- `lib/fabric-utils.ts`
  - Fabric 文本对象新增基于 `rotation` 的同步。
  - 文本锚点改为基于局部文本框同步，而不是永远贴 axis-aligned 左上角。
  - 背景矩形继续使用 `sourceBounds`，避免文字框编辑后把原始遮盖区一起带偏。

- `components/editor/CanvasEditor.tsx`
  - 提交式回写时不再用 `getScaledWidth()/getScaledHeight()` 直接覆盖原始 OCR 语义。
  - 回写的 `bbox` 改为当前局部文本框，保留 `rotation` 和 `layoutOffsetY`。

- `components/editor/TextControls.tsx`
  - 切换字体、切换字重时，重新使用 Fabric 实测布局拟合字号，而不是旧的 Canvas 粗测。
  - 自动颜色重采样改为基于 `sourceBounds`，不会因为用户拖动过文字框而采到错误区域。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些仍是现有工程告警，不是本轮改动引入的构建失败。

### 当前仍未完成

- 还没有“原始字体族识别”，默认仍然只能在候选字体里手动切换。
- 旋转文本已经能按 polygon 角度摆正，但背景遮盖层仍然是 axis-aligned `fill + eraser`，复杂倾斜背景场景还不算完全修好。
- 仍然没有 ROI 级重新 OCR，所以原始框的精度仍取决于第一次 OCR 的质量。

### 现存风险

- OCR 前仍然按文件体积压缩图片，再把坐标逆缩放回来；小字和细字的框精度仍会受这一层影响。
- 如果原图真实字体和候选字体差异很大，即使同引擎拟合已经修好，视觉宽度和字面细节仍不可能完全一致。
