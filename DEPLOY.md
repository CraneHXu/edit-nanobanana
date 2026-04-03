# Vercel 部署指南

## 结论

Vercel 版本只支持：

- OCR
- 背景层
- Local repair
- ROI OCR

Vercel 版本不提供 AI 功能。

必须设置：

```env
NEXT_PUBLIC_DEPLOY_TARGET=vercel
```

## 一键部署前提

在导入 Vercel 之前，请确认你只需要无 AI 版本。

需要配置的环境变量只有：

| 变量名 | 说明 |
| --- | --- |
| `NEXT_PUBLIC_DEPLOY_TARGET` | 固定填写 `vercel` |
| `OCR_API_URL` | PaddleOCR API 地址 |
| `OCR_API_TOKEN` | PaddleOCR API Token |

不要在 Vercel 上配置 `INPAINT_*`，因为 Vercel 模式下不会启用 AI。

## 手动部署步骤

### 1. 安装 Vercel CLI

```bash
npm i -g vercel
```

### 2. 登录

```bash
vercel login
```

### 3. 进入项目目录

```bash
cd image-editor-web
```

### 4. 配置环境变量

在 Vercel 控制台或命令行中添加：

```bash
vercel env add NEXT_PUBLIC_DEPLOY_TARGET
vercel env add OCR_API_URL
vercel env add OCR_API_TOKEN
```

其中：

- `NEXT_PUBLIC_DEPLOY_TARGET` 填 `vercel`
- `OCR_API_URL` 填你的 OCR 服务地址
- `OCR_API_TOKEN` 填你的 OCR token

### 5. 部署

```bash
vercel
```

生产部署：

```bash
vercel --prod
```

说明：

- `NEXT_PUBLIC_DEPLOY_TARGET` 会影响前端构建结果
- 因此 Vercel 生产构建时必须在构建环境中就设置成 `vercel`
- 只在 `next start` 阶段设置是不够的

## 本地模拟 Vercel 模式

如果你想在本地先验证“无 AI 版本”的行为：

```bash
cd image-editor-web
npm run dev:vercel
```

这会启动一个与 Vercel 模式一致的前端：

- 隐藏 AI repair
- 隐藏自动 AI 面板
- `/api/inpaint` 返回禁用错误

## 常见问题

### 为什么不在 Vercel 上启用 AI？

当前项目里的 AI 功能依赖额外的 inpaint 后端。为了保持 Vercel 部署简单、稳定、低成本，这里明确把 Vercel 版本限制为无 AI 版本。

### 如果我需要 AI 怎么办？

请使用本地模式：

```bash
NEXT_PUBLIC_DEPLOY_TARGET=local
```

并按 [README.md](./README.md) 中的“AI 后端部署教程”启动 IOPaint。
