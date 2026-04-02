# image-editor-web 当前问题台账

日期：2026-04-02

范围：
- 当前项目：`image-editor-web`
- 对照材料：`reference/image-editor-web-upgrade.md`、`reference/docs/image-to-editable-ppt.md`
- 本文只记录问题、影响和证据，不写解决方案

## 1. 总结

当前实现已经完成了“单页图片文字覆盖编辑器”的主链路：
- 上传
- OCR
- 文本框编辑
- cleanLayer 生成
- ROI 本地修复 / AI 修复
- 导出 PNG

但它还不适合作为“面向真实用户、能稳定容忍 OCR 不稳定”的产品版本。最核心的问题不是单点 bug，而是整条链路的默认行为：

- OCR 一结束就立即进入 `cleanLayer`
- 用户很难在 clean 之前低成本排除误检 / 漏检
- AI 修复继续依赖 OCR 或已被启发式处理过的底图
- 多个工具的语义边界不清，用户操作容易互相覆盖

因此当前产品对“简单背景 + OCR 较准 + 只导出 PNG”场景可用，但对以下场景不稳：
- OCR 误识别较多
- 背景复杂
- 用户需要多轮修正
- 用户希望工具行为可预测、可回滚

## 2. 严重级别定义

- `P0`：会直接让主流程错误、让错误结果被放大、或让用户很难纠正
- `P1`：不一定立刻失败，但会明显伤害可用性、稳定性或结果一致性
- `P2`：能力缺口、体验缺口、或已知风险，短期可绕过但不应长期保留

## 3. 确认问题

### 3.1 OCR 与识别入口

#### ISSUE-001 `P0`
上传后立即 OCR 并立即生成 `cleanLayer`，错误识别会直接进入去字层。

影响：
- 用户还没确认 OCR 结果，背景就已经被“清理”
- 误检会直接抹掉原图细节
- 后续纠错成本被放大

证据：
- `components/editor/ImageUploader.tsx:56-67`
- `lib/clean-background.ts:134-153`

#### ISSUE-002 `P0`
OCR 只在首次上传时触发，缺少 ROI 重识别和手工新增文本框入口。

影响：
- OCR 一旦漏字或错字，用户只能硬改现有框、删除框、或重新上传整张图
- 小字、细字、局部错误几乎没有低成本补救路径

证据：
- `components/editor/ImageUploader.tsx:23-80`
- `lib/api-client.ts:83-129`
- `progress.md:320-383`

#### ISSUE-003 `P0`
OCR 解析在缺少 box/polygon 时会制造默认 bbox，可能生成假的文字区域。

影响：
- 会出现凭空的文本框
- 假框会继续参与 cleanLayer、mask、AI 修复
- OCR 不稳定时错误会被二次放大

证据：
- `app/api/ocr/route.ts:197-200`

#### ISSUE-004 `P1`
没有把 OCR 置信度、异常框、fallback 框暴露给用户，也没有“待确认”状态。

影响：
- 用户不知道哪些框可靠、哪些框可疑
- 只能等结果出问题后再被动修

证据：
- `app/api/ocr/route.ts:140-259`
- `components/editor/Sidebar.tsx:55-120`
- `components/editor/TextControls.tsx:196-409`

#### ISSUE-005 `P1`
OCR 预处理固定按目标高度缩放，首轮识别质量决定后续全部流程，但没有提供二次识别入口。

影响：
- 小字、密集字、细线字的精度完全取决于第一次识别
- 编辑阶段无法局部补救

证据：
- `lib/api-client.ts:12-77`
- `lib/api-client.ts:83-129`

### 3.2 编辑模型与文本能力

#### ISSUE-006 `P1`
“隐藏文字”只影响前景文字显示，不影响 clean mask。

影响：
- 用户隐藏了误识别文字，但背景仍会继续被抹掉
- “隐藏”与“排除去字”的语义错位

证据：
- `store/editorStore.ts:435-445`
- `lib/clean-background.ts:71-79`

#### ISSUE-007 `P1`
当前没有真正的“排除该区域参与 cleanLayer”交互语义。

影响：
- 用户只能删框或隐藏字，不能表达“这个 OCR 框存在，但不要去字”
- 对误识别的处理手段过于粗糙

证据：
- `types/canvas.ts:30-64`
- `store/editorStore.ts:383-445`
- `lib/clean-background.ts:71-79`

#### ISSUE-008 `P2`
当前仍然是“单区域单主色”，不支持 run/segment 级多色文本。

影响：
- 渐变字、描边字、多色字会被压成单色
- 与原图视觉差异大

证据：
- `types/canvas.ts:40-60`
- `lib/color-sampler.ts:205-245`
- `progress.md:218-226`

#### ISSUE-009 `P2`
`fontWeight` / `textAlign` 只有手动编辑，没有自动识别。

影响：
- 预设排版接近度仍有限
- 用户需要更多人工调节

证据：
- `components/editor/TextControls.tsx:117-137`
- `progress.md:158-164`

#### ISSUE-010 `P2`
自动颜色重采样只有单区域入口，没有批量刷新 auto 区域的工具。

影响：
- 多文本图片的维护成本高
- 用户容易遗漏部分区域

证据：
- `components/editor/TextControls.tsx:139-176`
- `progress.md:218-226`

### 3.3 cleanLayer 生成与本地修复

#### ISSUE-011 `P0`
当前产品默认在 OCR 后立刻生成 cleanLayer，而不是先进入“识别结果确认”阶段。

影响：
- 错误识别直接污染底图
- 用户看到的“最终态”很早就已经偏离原图

证据：
- `components/editor/ImageUploader.tsx:56-67`
- `components/editor/Toolbar.tsx:412-423`

#### ISSUE-012 `P0`
橡皮擦的真实行为是把原图像素贴回 cleanLayer，不是“擦掉修复结果”。

影响：
- 用户以为自己在修边，实际上可能把原始文字也恢复回来
- 工具名称和行为不一致

证据：
- `lib/clean-background.worker.ts:423-450`
- `lib/clean-background.worker.ts:504-520`
- `components/editor/Toolbar.tsx:285-325`

#### ISSUE-013 `P1`
cleanLayer 生成是顺序相关的，后面的区域会基于前面已修改过的结果继续估色。

影响：
- 相邻文本区域会互相污染
- 同图不同 region 顺序可能得到不同结果

证据：
- `lib/clean-background.worker.ts:489-502`

#### ISSUE-014 `P1`
本地 ROI 修复 `local_fill` 仍然只是规则填色，不适合复杂纹理、照片、表格线。

影响：
- 看起来“修了”，但背景常不真实
- 用户必须依赖 AI 修复兜底

证据：
- `components/editor/Toolbar.tsx:144-185`
- `lib/clean-background.worker.ts:375-458`
- `progress.md:324-325`

#### ISSUE-015 `P1`
ROI 复杂度分析并没有真正按“待修区域之外的背景”计算，结果会被文字本身干扰。

影响：
- `simple / complex` 提示不可信
- 用户被错误引导去选本地修复或 AI 修复

证据：
- `lib/clean-background.ts:177-192`
- `lib/clean-background.worker.ts:278-372`
- `lib/clean-background.worker.ts:558-594`

#### ISSUE-016 `P1`
`generateCleanPatch()` 的 `analysis` 不是基于真实原始背景难度，参考价值有限。

影响：
- patch 分析结果不能可靠支撑后续判断
- UI 若继续依赖它，会放大误导

证据：
- `lib/clean-background.worker.ts:526-555`

#### ISSUE-017 `P1`
手工修边 / 再次 refresh clean background 可能覆盖之前的 AI 修复结果，因为系统没有 patch 级持久状态。

影响：
- 用户接受 AI 结果后，后续操作可能把结果冲掉
- 背景修复缺少稳定版本语义

证据：
- `components/editor/Toolbar.tsx:255-272`
- `store/editorStore.ts:512-524`
- `components/editor/CanvasEditor.tsx:243-258`

### 3.4 AI 修复

#### ISSUE-018 `P0`
AI 修复默认通常拿 `cleanLayer || originalImage` 做输入，很多时候给 AI 的不是原始上下文，而是已经启发式填过色的底图。

影响：
- AI 修复质量会被上一步 local fill 限制
- 错误上下文会继续传播

证据：
- `components/editor/Toolbar.tsx:197-228`

#### ISSUE-019 `P0`
AI 修复的 mask 仍然依赖 OCR region；OCR 漏检时，AI 也会漏修。

影响：
- 漏字不会被 AI 去掉
- 用户会觉得 AI 修复“不知道自己该修什么”

证据：
- `lib/clean-background.ts:194-200`
- `lib/repair-utils.ts:117-163`
- `components/editor/Toolbar.tsx:207-221`

#### ISSUE-020 `P1`
AI 修复虽然有预览态，但 `repairJob.status` 在预览生成后就记为 `succeeded`，语义混淆。

影响：
- “修复成功”到底是“预览生成成功”还是“已应用成功”不清楚
- 后续交互状态不好解释

证据：
- `components/editor/Toolbar.tsx:229-242`
- `components/editor/Toolbar.tsx:255-272`

#### ISSUE-021 `P1`
项目没有默认可用的 AI provider 配置，AI 修复链路默认不可直接用。

影响：
- 用户会看到功能入口，但点下去可能直接失败
- 上线前配置成本高，且协议适配不稳定

证据：
- `app/api/inpaint/route.ts:22-39`
- `README.md:77-123`
- `progress.md:315-325`

#### ISSUE-022 `P1`
`/api/inpaint` 使用无上限内存缓存和去重表，长时间使用有内存增长风险。

影响：
- 高频修复场景下服务实例可能越来越重
- 签名里包含大块 base64，请求体本身也偏重

证据：
- `app/api/inpaint/route.ts:25-30`
- `app/api/inpaint/route.ts:131-153`

### 3.5 交互与用户心智

#### ISSUE-023 `P0`
当前整体流程缺少“识别结果确认”这一层，直接把用户送进“最终编辑态”。

影响：
- 用户很难理解哪些是 OCR 自动结果、哪些是自己确认过的结果
- 一旦错，就要在已经被 clean 的画面上反向修复

证据：
- `components/editor/ImageUploader.tsx:42-67`
- `components/editor/Toolbar.tsx:412-423`

#### ISSUE-024 `P1`
没有低置信度提示、没有异常大框提示、没有“这不是文字”快速处理路径。

影响：
- OCR 把图案识别成文字时，用户只能删
- 系统不会主动提醒风险

证据：
- `app/api/ocr/route.ts:140-259`
- `components/editor/Sidebar.tsx:55-120`

#### ISSUE-025 `P1`
误删文本区域后缺少单项撤销 / 单项恢复，只能依赖全局 restore。

影响：
- 用户修错一个框，可能要牺牲整张图的其他修改
- 很容易不敢操作

证据：
- `store/editorStore.ts:413-433`
- `store/editorStore.ts:447-499`
- `components/editor/TextControls.tsx:190-194`

#### ISSUE-026 `P1`
部分后台失败只记 `console.error`，没有明确 UI 反馈。

影响：
- 用户以为按钮无效或系统卡住
- 很难区分“处理中”“失败”“没触发”

证据：
- `components/editor/CanvasEditor.tsx:243-258`
- `components/editor/Toolbar.tsx:79-83`

#### ISSUE-027 `P2`
当前没有 undo / redo。

影响：
- 在 OCR 不稳、AI 修复不稳的场景下，用户回退成本过高

证据：
- `README.md:58-65`
- `README.md:66-72`

### 3.6 持久化与运行时

#### ISSUE-028 `P1`
会话持久化把原图和 `pageModel` 整包写进 `localStorage`，大图容易撞配额。

影响：
- 刷新后会话可能直接丢失
- 用户无感知地失去工作进度

证据：
- `app/page.tsx:41-63`
- `app/page.tsx:49-61`
- `progress.md:96-97`

#### ISSUE-029 `P1`
`cleanLayer` 同样以 data URL 放在会话状态里，会进一步放大存储压力。

影响：
- 原图越大，cleanLayer 越占空间
- 浏览器存储上限更快被打满

证据：
- `store/editorStore.ts:512-524`
- `app/page.tsx:55-61`

#### ISSUE-030 `P1`
clean background 与 repair 链路强依赖 Worker / OffscreenCanvas / createImageBitmap，没有明确降级产品语义。

影响：
- 某些浏览器环境里链路会直接失败
- 失败后用户不知道还能不能继续编辑

证据：
- `lib/clean-background.ts:101-132`
- `lib/clean-background.worker.ts:467-483`

#### ISSUE-031 `P2`
Worker 对未知 type 直接 `return`，主线程 Promise 会一直挂着。

影响：
- 低频但致命
- 一旦主从版本不一致，任务会假死

证据：
- `lib/clean-background.worker.ts:596-604`
- `lib/clean-background.ts:101-132`

### 3.7 导出与产品边界

#### ISSUE-032 `P1`
当前导出物只有 PNG，没有中间模型导出或真正可编辑格式导出。

影响：
- 与参考项目“可编辑 PPTX”路线存在本质边界差距
- 如果目标变成“可编辑化输出”，现有导出层不够

证据：
- `components/editor/Toolbar.tsx:96-111`
- `lib/fabric-utils.ts:180-219`

#### ISSUE-033 `P2`
导出链路没有结构化 warnings / 任务状态 / 半成品语义，失败主要靠 alert。

影响：
- 复杂导出失败时，用户拿不到足够解释
- 不利于后续扩展到异步导出和更复杂格式

证据：
- `components/editor/Toolbar.tsx:96-111`
- `app/api/ocr/route.ts:42-49`

## 4. 与参考实现的关键差距

### 4.1 当前项目更像“图片文字覆盖编辑器”，不是“可编辑重建器”

差距：
- 当前项目的真相模型是 `PageModel.regions: TextElement[]`
- 参考项目会把页面转成更正式的中间表示，再驱动导出

影响：
- 当前项目更适合 PNG 合成
- 不适合直接扩展成结构化导出

证据：
- `types/canvas.ts:95-100`
- `reference/docs/image-to-editable-ppt.md`
- `reference/banana-slides/docs/zh/features/editable-pptx-internals.mdx`

### 4.2 参考项目更重视“错误可解释、流程可回退”

差距：
- 参考项目有 task / warnings / allow partial 语义
- 当前项目大多是前端同步状态 + alert

影响：
- 当前项目在复杂流程下不容易让用户理解发生了什么

证据：
- `reference/banana-slides/backend/services/task_manager.py`
- `reference/banana-slides/backend/services/export_service.py`

### 4.3 参考项目把 clean background 当成正式产物

差距：
- 参考项目的 clean background 是导出链路的一部分
- 当前项目里 cleanLayer 更像前端运行时状态

影响：
- 当前项目后续操作很容易把 clean 结果覆盖掉

证据：
- `components/editor/Toolbar.tsx:255-272`
- `store/editorStore.ts:512-524`
- `reference/docs/image-to-editable-ppt.md`

## 5. 后续 brainstorm 必须解决的决策

这些不是解决方案，只是必须拍板的问题：

- 新流程里，`cleanLayer` 应该在什么时机生成：
  - 上传后立即生成
  - 用户确认 OCR 后再生成
  - 用户按需生成

- OCR 纠错入口要放在哪里：
  - ROI 重识别
  - 手工新增文本框
  - 两者都要

- “隐藏文字”“删除区域”“排除 clean mask”是否要拆成三个独立动作

- AI 修复默认应该用什么输入：
  - `original`
  - `cleanLayer`
  - 由用户显式选择

- AI 修复的 mask 默认应该来自哪里：
  - OCR region
  - 整块 ROI
  - 两者可切换

- 本地修复与 AI 修复的推荐关系怎么定义：
  - 默认本地，复杂时建议 AI
  - 默认 AI
  - 让用户自己选，不做推荐

- 接受 AI 结果后，系统要保存什么：
  - 只保存新的 `cleanLayer`
  - 保存 patch / revision，保证后续 refresh 不覆盖

---

这份文档的目标是给后续 brainstorm 和代码修改提供统一事实基线。后续若发现新问题，再增补到这里。
