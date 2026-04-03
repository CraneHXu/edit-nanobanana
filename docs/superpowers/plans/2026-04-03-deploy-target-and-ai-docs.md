# Deploy Target And AI Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个环境变量区分本地含 AI 与 Vercel 无 AI 两种模式，并补齐中文 README、Vercel 部署说明和 AI 后端启动脚本。

**Architecture:** 新增一个轻量 deploy-target helper，客户端和服务端都从 `NEXT_PUBLIC_DEPLOY_TARGET` 读取模式。`local` 模式启用 AI，`vercel` 模式隐藏 AI UI 并禁用 `/api/inpaint`，文档统一改成中文并加入 IOPaint 本地部署说明。

**Tech Stack:** Next.js 15, React 19, App Router API Routes, Vitest, shell script

---

### Task 1: 锁定部署模式行为

**Files:**
- Create: `image-editor-web/lib/deploy-target.ts`
- Modify: `image-editor-web/app/api/inpaint/route.ts`
- Modify: `image-editor-web/components/editor/ImageUploader.tsx`
- Modify: `image-editor-web/components/editor/TextControls.tsx`
- Modify: `image-editor-web/components/editor/Toolbar.tsx`
- Modify: `image-editor-web/components/editor/Sidebar.tsx`
- Modify: `image-editor-web/components/editor/CanvasEditor.tsx`
- Test: `image-editor-web/tests/app/api/inpaint-route.test.ts`
- Test: `image-editor-web/tests/components/Toolbar.roi-actions.test.tsx`

- [ ] 写失败测试，覆盖 `vercel` 模式禁用 `/api/inpaint`、前端隐藏 AI 入口、`local` 模式保留 AI。
- [ ] 跑相关测试确认失败。
- [ ] 实现最小 deploy-target gating。
- [ ] 再跑相关测试确认通过。

### Task 2: 补齐中文文档与脚本

**Files:**
- Modify: `image-editor-web/README.md`
- Modify: `image-editor-web/DEPLOY.md`
- Modify: `image-editor-web/.env.example`
- Modify: `image-editor-web/package.json`
- Create: `image-editor-web/scripts/start-iopaint.sh`

- [ ] 把 README 改成仅中文，并加入使用说明、`NEXT_PUBLIC_DEPLOY_TARGET` 模式说明、AI 后端部署教程。
- [ ] 把 DEPLOY 改成 Vercel 无 AI 部署说明。
- [ ] 增加 `.env.example` 和脚本入口。
- [ ] 自查文档与脚本是否一致。

### Task 3: 回归验证

**Files:**
- Test: `image-editor-web/tests/app/api/inpaint-route.test.ts`
- Test: `image-editor-web/tests/components/Toolbar.roi-actions.test.tsx`

- [ ] 跑 `npm test`。
- [ ] 跑 `npm run build`。
- [ ] 修掉回归直到全绿。
