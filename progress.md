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

## 2026-04-01 cleanLayer 逻辑继续收敛

本轮范围限定在：

- 清理旧背景矩形 fallback 的运行时依赖
- 明确最终渲染语义为 `cleanLayer + 文字框`
- 保留最小必要的数据兼容，避免旧会话直接失效

### 已完成

- `components/editor/CanvasEditor.tsx`
  - 移除运行时 `bgRect` 渲染与同步分支，画布不再额外绘制旧纯色背景矩形。
  - 最终预览现在只依赖：
    - 背景图：`cleanLayer`
    - 前景：文字框
  - 橡皮擦命中与 clean layer 重算链路保持不变，继续直接作用在 `cleanLayer patch`。

- `lib/fabric-utils.ts`
  - 删除 `createBackgroundRect()`、`syncBackgroundRect()` 和导出时隐藏 `bgRect` 的兼容逻辑。
  - 导出逻辑收敛为直接以 `cleanLayer` 作为背景图导出。

- `components/editor/Toolbar.tsx`
  - 导出时不再传递 `hideBackgroundRects` 兼容参数。

### 验证结果

- 已执行：`npm run build`
- 结果：待本轮提交后再次验证

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

## 2026-04-01 橡皮擦切到 cleanLayer patch

触发原因：

- 旧实现里，橡皮擦本质上是在纯色背景矩形上挖洞，露出原图。
- 主链路收敛为 `cleanLayer + 文字框` 后，这种做法已经不再正确。

本轮范围限定在：

- 橡皮擦命中检测不再依赖旧 `bgRect`
- 橡皮擦笔迹不再清空 `cleanLayer`
- 抬笔后直接把橡皮擦结果写回新的 `cleanLayer`

### 已完成

- `components/editor/CanvasEditor.tsx`
  - 橡皮擦命中改为基于区域几何：
    - `expandBoundingBox(sourceBounds)`
    - 不再依赖运行时背景矩形对象
  - 抬笔后会基于最新 `eraserPaths` 触发一次 `cleanLayer` 重算。

- `store/editorStore.ts`
  - `eraserPaths` 更新不再让 `cleanLayer` 直接失效。
  - 避免绘制过程中背景瞬间退回原图。

- `lib/clean-background.ts`
  - clean worker 请求现在会携带每个区域的 `eraserPaths`。

- `lib/clean-background.worker.ts`
  - `local_fill` 完成后，会根据 `eraserPaths` 把对应笔刷圆形区域回退到原图像素。
  - 这意味着橡皮擦现在真正作用于 `cleanLayer patch`，而不是旧的纯色遮盖层。

### 当前行为

- 进入橡皮擦模式后，用户仍然是在文字原区域附近刷。
- 刷动过程中继续记录 `eraserPaths`。
- 抬笔后刷新 `cleanLayer`：
  - 未擦区域保留 clean 结果
  - 擦过区域回退到原图像素

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些仍是现有工程告警，不是本轮改动引入的构建失败。

## 2026-04-01 合成链路语义收敛

触发原因：

- 当前主链路已经变成 `cleanLayer + 文字框 = 最终合成图`。
- 但 UI 里仍残留“背景显示/隐藏”和单区域背景色编辑，这些都属于旧的 `fill + eraser` 时代语义。
- 这些旧入口会和 `cleanLayer` 打架，造成“点一下背景，干净层就失效”这类错误体验。

本轮范围限定在：

- 去掉用户可见的单区域背景开关
- 去掉单区域背景色手动编辑入口
- 让 `cleanLayer` 默认覆盖所有未删除文字区域

### 已完成

- `components/editor/Sidebar.tsx`
  - 左侧列表移除“背景显示/隐藏”按钮。
  - 仅保留：
    - 删除误识别区域
    - 显示/隐藏文字

- `components/editor/TextControls.tsx`
  - 右侧面板移除“背景显示/隐藏”控制。
  - 移除单区域背景色手动编辑入口。
  - 保留：
    - 文字显隐
    - 字体、字号、字重、对齐、颜色
    - 删除误识别区域

- `lib/clean-background.ts`
  - 生成 `cleanLayer` 时不再依赖 `showBackground/bgMode` 旧开关。
  - 所有未删除区域默认都参与 clean。

- `store/editorStore.ts`
  - `showBackground` 归一为内部恒真状态，不再作为主交互语义。
  - `bgColor/bgMode` 不再导致 `cleanLayer` 失效，避免文字颜色重采样等操作误伤 clean 结果。
  - 旧会话里残留的 `showBackground=false` 会被自动收敛回新逻辑。

### 当前语义

- 真实文字区域：
  - 默认参与 `cleanLayer`
  - 最终合成只看 `cleanLayer + 文字框`

- 误识别区域：
  - 直接删除
  - 视作背景

- 旧的矩形背景层：
  - 仍作为内部 fallback 保留
  - 主要服务于 `cleanLayer` 缺失或局部修边这类兼容路径
  - 不再作为普通用户的主控制对象

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

## 2026-04-01 第四阶段继续推进

参考文档：`reference/image-editor-web-upgrade.md`

本轮范围限定在：

- 把背景修复从 `fill + eraser` 升级为正式 `cleanLayer`
- 用浏览器 Worker 落地最小 `local_fill`
- 让预览和导出都能正式消费 `cleanLayer`

### 已完成

- `lib/clean-background.ts`
  - 新增前端 `generateCleanBackground()`，负责把当前页面模型里可清理区域提交给浏览器 Worker。
  - 只基于 `showBackground !== false` 且 `bgMode !== none` 的区域生成 clean mask，避免无关区域被误清理。

- `lib/clean-background.worker.ts`
  - 新增浏览器 Worker，本地完成：
    - 局部 crop
    - polygon / rect mask 栅格化
    - 邻域背景主色估计
    - 基于 mask alpha 的 `local_fill`
  - 输出整页 `cleanLayer` PNG，不走服务端。

- `store/editorStore.ts`
  - 新增 `previewMode` 与 `isCleaningBackground` 状态。
  - `pageModel.cleanLayer` 现在有正式写入入口。
  - 当用户修改会使 clean 结果失效的背景相关状态时，会自动清空旧 `cleanLayer`，避免继续拿过期干净层导出。

- `components/editor/Toolbar.tsx`
  - 新增“生成干净背景”动作。
  - 新增预览模式切换：
    - 原图
    - 干净层
    - 最终合成
  - 导出 PNG 时会优先使用 `cleanLayer` 作为底图。

- `components/editor/CanvasEditor.tsx`
  - 画布底图会按当前预览模式在 `originalImage / cleanLayer` 之间切换。
  - 当存在 `cleanLayer` 且处于最终合成视图时，会隐藏旧的矩形遮盖层，避免再次把结果变回色块盖字。

- `lib/fabric-utils.ts`
  - 导出逻辑升级为异步流程，支持临时替换底图并按需隐藏背景矩形，再恢复当前编辑画布状态。

- `lib/i18n.ts`
  - 补齐第四阶段新增操作的中英文文案。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些仍是现有工程告警，不是第四阶段本轮改动引入的构建失败。

### 当前仍未完成

- `local_fill` 目前是“主背景色估计 + mask 平滑填充”的最小实现，还没有引入复杂度判断。
- 当前 `cleanLayer` 生成后，如果继续做背景类手工修边，会直接使 `cleanLayer` 失效并回退到普通遮盖流程；还没有把手工修边直接写回 clean layer。
- 复杂纹理、照片、表格线穿字等场景仍未接入 `remote inpaint` 或线条保护。

### 现存风险

- 目前没有 `edge_density / texture / color_std` 分流，复杂背景上仍可能生成“看起来更平，但不够真”的 clean 结果。
- `cleanLayer` 作为 data URL 持久化到本地会话，图片很大时依然可能触发浏览器存储配额。

## 2026-04-01 误识别区域删除重构

触发原因：

- OCR 会把部分“像文字的图案”误识别成文字区域。
- 旧流程里，这类误识别通常依赖“隐藏文字 + 保留背景层”来处理。
- 引入 `cleanLayer` 后，这条路径和新的背景链路语义开始打架，不再适合作为主方案。

本轮范围限定在：

- 把误识别区域改成“可删除，视作背景”
- 删除后不再参与画布渲染、clean 生成和导出
- 保留 `restoreAll` 作为整体恢复入口

### 已完成

- `types/canvas.ts`
  - 区域模型新增 `removed` 字段，用于表达“该 OCR 区域被用户判定为误识别，应视作背景”。

- `store/editorStore.ts`
  - 新增 `deleteElement()`。
  - 删除采用软删除而不是直接从会话里硬删：
    - 区域仍保留在模型中
    - 但会被标记为 `removed`
    - 并立即使 `cleanLayer` 失效
  - `restoreAll()` 会把已删除区域一并恢复，避免删错后只能重跑整张图。

- `components/editor/CanvasEditor.tsx`
  - 渲染层只消费未删除区域。
  - 已删除区域不会再生成背景遮盖或文字框。

- `lib/clean-background.ts`
  - 生成 `cleanLayer` 时会跳过已删除区域。
  - 这意味着误识别区域会被当作背景保留，而不是继续参与去字。

- `components/editor/Sidebar.tsx`
  - 左侧列表新增删除按钮，允许快速把误识别区域移出编辑链路。

- `components/editor/TextControls.tsx`
  - 右侧面板新增“删除此项”动作，并补充提示文案：
    - 如果这是 OCR 误识别，直接删除即可，系统会把它当作背景处理。

- `lib/i18n.ts`
  - 补齐删除误识别区域的中英文文案。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些仍是现有工程告警，不是本轮重构引入的构建失败。

### 当前行为约束

- 对真实文字区域，默认仍然是“干净背景 + 文字框”。
- 对误识别区域，推荐动作不再是“隐藏文字 / 保留背景”，而是直接删除并视作背景。
- 单项删除目前只支持通过 `restoreAll` 整体恢复，不支持单独撤销。

## 2026-04-01 初始干净层自动生成

触发原因：

- 当前实现虽然已经有 `cleanLayer`，但首次上传后必须手动点击“生成干净背景”才会真正产出 clean layer。
- 这会导致“最终合成图”和“已有干净层”语义不一致。

本轮范围限定在：

- OCR 初始化完成后自动生成初始 `cleanLayer`
- “最终合成”默认直接消费该 `cleanLayer`
- 工具栏按钮改成“重新生成干净背景”，只承担手动重算职责

### 已完成

- `components/editor/ImageUploader.tsx`
  - OCR + 浏览器侧样式推断完成后，会立即触发一次初始 `cleanLayer` 生成。
  - 初始 clean 生成成功后，默认预览仍停留在“最终合成”，不再切去单独的 clean 视图。

- `components/editor/Toolbar.tsx`
  - 原“生成干净背景”改成“重新生成干净背景”。
  - 语义从“首次生成”改成“手动刷新当前 clean 结果”。

- `lib/i18n.ts`
  - 同步更新中英文文案。

### 验证结果

- 已执行：`npm run build`
- 结果：通过

构建警告：

- Next.js 推断 workspace root 时发现多个 `package-lock.json`
- 本地 `@next/swc` 版本仍是 `15.5.7`，而 Next.js 是 `15.5.11`
- `/api/ocr` 使用 edge runtime，因此对应页面不会走静态生成

这些仍是现有工程告警，不是本轮改动引入的构建失败。
