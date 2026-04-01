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
