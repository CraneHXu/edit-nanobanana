# image-editor-web OCR / ROI / 修复确认流设计

日期：2026-04-03

关联文档：
- 问题台账：`/Users/oops/Documents/Code/fun/edit-banana-word/image-editor-web/docs/2026-04-02-current-issues.md`
- 旧设计：`/Users/oops/Documents/Code/fun/edit-banana-word/image-editor-web/docs/superpowers/specs/2026-04-02-fast-auto-workflow-design.md`

## 1. 目标

本轮只解决当前用户明确指出的交互与语义问题：

- 点击画布上的 OCR 框后，左侧检测列表必须联动并滚动到对应项。
- 自动 AI 修复的视觉提示不能遮挡观察结果。
- 自动 AI 修复列表需要固定高度、可滚动，并支持一键确认。
- 未确认的 AI 修复不能自动变成真实底图，也不能污染后续 ROI OCR / Local repair / 手工加字 / 导出。
- 去掉顶部单独的 `Local repair` / `AI repair` 入口，只在选中 OCR 框后提供对应操作。
- 保留顶部 `ROI OCR`，但它只负责“框选子图重新 OCR 并局部覆盖”，不要影响其余区域。

## 2. 非目标

本轮不做：

- 全量重写 patch 管线
- 多页文档或结构化导出
- 对已经确认的自动修复提供复杂回退树
- 新增额外依赖或新状态管理框架

## 3. 设计原则

### 3.1 已确认底图和待确认预览分离

后续局部操作、导出、再次修复都必须只基于“已确认底图”。

自动 AI 修复结果先进入“待确认预览”，用于观察，不直接写进已确认底图。确认后才写入真实 patch。

### 3.2 局部工具只改局部

`ROI OCR`、`Local repair`、`AI repair` 都只允许生成局部 patch，并只覆盖其目标区域。

不允许任何工具因为拿错底图而把区域外内容一起改掉。

### 3.3 OCR 框是局部修复入口

顶部工具栏只保留框选式 `ROI OCR`。

`Local repair` / `AI repair` 不再作为全局模式存在，而是绑定到选中的 OCR 框，在右侧编辑区执行。

## 4. 用户可见行为

## 4.1 点击 OCR 框联动

当用户点击画布上的 OCR 框：

- 该框成为当前选中项
- 左侧列表高亮对应条目
- 左侧列表自动滚动到对应条目可见位置
- 右侧编辑区显示该框的文本编辑和局部修复操作

## 4.2 自动 AI 提示

自动 AI 待确认区域仍需要高亮，但标签必须缩小为角标，不覆盖主体区域内容。

## 4.3 自动 AI 列表

自动 AI 面板改为“待确认修复”列表：

- 固定高度
- 内容滚动
- 支持逐项确认
- 支持逐项丢弃
- 支持一键确认全部

已确认项不再留在待确认列表里；丢弃项直接失效。

## 4.4 ROI OCR

保留顶部 `ROI OCR` 按钮。

流程：

1. 用户点击 `ROI OCR`
2. 用户在画布上框选区域
3. 系统只从原图裁出该区域重新 OCR
4. 默认替换 ROI 内重叠的 OCR 检测结果
5. 系统只针对该 ROI 重新生成局部 clean patch 并叠回已确认底图

其余区域不变。

## 4.5 OCR 框上的 Local repair / AI repair

选中 OCR 框后，右侧编辑区新增：

- `Local repair`
- `AI repair`

行为：

- 对当前 OCR 框对应区域执行
- 如果该区域已有同类修复，允许重跑覆盖
- 如果该区域已有另一类修复，允许切换并用新的结果替换旧的结果

## 5. 状态模型

在现有 `pageModel / patches / autoChanges / baseAutoLayer / currentLayer` 基础上新增一层轻量语义：

- `baseAutoLayer`
  - 已确认底图
  - 是后续局部操作和导出的真实输入
- `pageModel.patches`
  - 只存已确认 patch
- `pageModel.autoChanges`
  - 只存待确认自动 AI 候选项，不再表示“已经应用但可回退”
- `currentLayer`
  - 由 `baseAutoLayer` 叠加当前待确认预览计算得到

待确认自动 AI 项需要补充的数据：

- patch 内容本身
- 预览 crop / imageDataUrl
- 目标 regionIds
- 状态：`new` / `accepted` / `discarded` 不再需要长期保留，列表中仅保留待处理项

实现上可以复用现有 `AutoChange` / `ImagePatch` 结构，最小充分改动是：

- `AutoChange` 增加内嵌 `patch` 或额外引用到未确认 patch
- `applyAutoPatch` 改成只注册待确认项并重算 `currentLayer`
- 新增 `confirmAutoChange` / `confirmAllAutoChanges` / `discardAutoChange`

## 6. 关键语义

### 6.1 未确认 AI 不进入真实底图

未确认 AI 结果可以预览，但不能：

- 进入 `baseAutoLayer`
- 进入 `pageModel.patches`
- 参与导出
- 作为 `ROI OCR` / `Local repair` / 手工加字 / 手工刷新背景的输入

### 6.2 手工或局部操作只基于已确认底图

以下操作统一只使用已确认底图作为输入：

- `ROI OCR`
- OCR 框上的 `Local repair`
- OCR 框上的 `AI repair`
- 手工加字
- 删除 OCR 框
- 导出

### 6.3 局部工具互斥替换

同一目标区域再次执行 `Local repair` / `AI repair` 时，旧的同区域已确认 patch 需要先失效，再应用新的 patch。

不允许多次 patch 叠在同一区域上继续污染结果。

## 7. 组件改动

### 7.1 `Sidebar`

- 为每个检测项加 ref
- 当 `selectedElementId` 变化时滚动到对应项

### 7.2 `CanvasEditor`

- 点击 OCR 框时保持现有选中逻辑
- 自动 AI 高亮标签改为更小的角标
- `ROI OCR` 只保留 OCR 行为
- 去掉 ROI 模式下的 `Local repair` / `AI repair`

### 7.3 `Toolbar`

- 删除顶部 `Local repair` / `AI repair` 按钮
- 自动修复面板支持 `确认全部`

### 7.4 `TextControls`

- 仅当选中 OCR / ROI OCR 区域时显示 `Local repair` / `AI repair`
- 手工区域不显示这两个按钮

### 7.5 `ImageUploader`

- 自动 AI 队列改为生成“待确认预览”
- 不直接把 patch 落到真实底图

### 7.6 `editorStore`

- 区分已确认 patch 与待确认 AI 候选
- 提供确认 / 全部确认 / 丢弃接口
- 局部操作基底统一收敛到已确认底图
- ROI OCR 只重建局部 clean patch 并叠回已确认底图

## 8. 测试重点

- 点击 OCR 框后左侧列表会联动滚动
- 自动 AI 新结果只进入待确认列表，不进入已确认 patch
- `confirmAutoChange` 后 patch 才进入真实底图
- `ROI OCR` 只替换重叠 OCR 框，并只重建局部 patch
- `Local repair` / `AI repair` 不影响区域外
- 自动修复面板支持一键确认全部
