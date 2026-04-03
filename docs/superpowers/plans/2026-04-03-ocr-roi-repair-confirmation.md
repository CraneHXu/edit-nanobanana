# OCR ROI Repair Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OCR 框选择、ROI OCR、局部修复和自动 AI 确认流具有明确边界，避免未确认 AI 污染真实底图与后续局部操作。

**Architecture:** 在现有 Zustand store 和 patch 模型上补充“已确认底图 + 待确认 AI 预览”语义，不做整套重写。UI 层只保留顶部 `ROI OCR` 框选入口，把 `Local repair` / `AI repair` 收敛到选中 OCR 框后的右侧编辑区。

**Tech Stack:** Next.js 15, React 19, Zustand, Vitest, Testing Library, Fabric.js

---

### Task 1: 锁定 store 语义

**Files:**
- Modify: `image-editor-web/types/canvas.ts`
- Modify: `image-editor-web/lib/editor-mutations.ts`
- Modify: `image-editor-web/store/editorStore.ts`
- Test: `image-editor-web/tests/lib/editor-layer.test.ts`

- [ ] Step 1: 写失败测试，覆盖“未确认自动 AI 不进入真实 patch / 真实底图”和“确认后才进入真实底图”。
- [ ] Step 2: 跑 `npm test -- tests/lib/editor-layer.test.ts`，确认按预期失败。
- [ ] Step 3: 最小改动实现待确认自动 AI、单项确认、全部确认、丢弃，以及 `currentLayer` 从已确认底图加待确认预览计算。
- [ ] Step 4: 再跑 `npm test -- tests/lib/editor-layer.test.ts`，确认通过。

### Task 2: 收敛 ROI / 局部修复入口与局部 patch 语义

**Files:**
- Modify: `image-editor-web/components/editor/CanvasEditor.tsx`
- Modify: `image-editor-web/components/editor/Toolbar.tsx`
- Modify: `image-editor-web/components/editor/TextControls.tsx`
- Test: `image-editor-web/tests/components/Toolbar.roi-actions.test.tsx`
- Test: `image-editor-web/tests/lib/editor-layer.test.ts`

- [ ] Step 1: 写失败测试，覆盖“顶部只保留 ROI OCR”“右侧选中 OCR 框后显示 Local repair / AI repair”“局部修复基于已确认底图”。
- [ ] Step 2: 跑相关测试确认失败。
- [ ] Step 3: 最小实现入口调整和局部 patch 替换逻辑。
- [ ] Step 4: 再跑相关测试确认通过。

### Task 3: 修正左侧列表联动与自动 AI 面板

**Files:**
- Modify: `image-editor-web/components/editor/Sidebar.tsx`
- Modify: `image-editor-web/components/editor/AutoChangesPanel.tsx`
- Modify: `image-editor-web/components/editor/CanvasEditor.tsx`
- Test: `image-editor-web/tests/components/AutoChangesPanel.test.tsx`
- Test: `image-editor-web/tests/components/Sidebar.test.tsx`

- [ ] Step 1: 写失败测试，覆盖“点击选中后左侧列表滚动到对应项”“自动 AI 面板固定高度可滚动且支持确认全部”“角标缩小”。
- [ ] Step 2: 跑组件测试确认失败。
- [ ] Step 3: 最小实现滚动联动、面板按钮和视觉细节。
- [ ] Step 4: 再跑组件测试确认通过。

### Task 4: 接入上传自动 AI 队列

**Files:**
- Modify: `image-editor-web/components/editor/ImageUploader.tsx`
- Modify: `image-editor-web/store/editorStore.ts`
- Test: `image-editor-web/tests/lib/editor-layer.test.ts`

- [ ] Step 1: 写失败测试，覆盖“自动 AI 只产生待确认预览，不直接进入真实底图”。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 最小实现上传自动 AI 队列的新接入方式。
- [ ] Step 4: 再跑测试确认通过。

### Task 5: 回归验证

**Files:**
- Modify: `image-editor-web/lib/i18n.ts`
- Test: `image-editor-web/tests/components/Toolbar.roi-actions.test.tsx`
- Test: `image-editor-web/tests/components/AutoChangesPanel.test.tsx`
- Test: `image-editor-web/tests/lib/editor-layer.test.ts`

- [ ] Step 1: 补齐中英文文案。
- [ ] Step 2: 跑 `npm test`。
- [ ] Step 3: 修掉回归。
- [ ] Step 4: 再跑 `npm test` 直到全绿。
