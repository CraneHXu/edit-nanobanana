# NanoBanana 图片文字编辑器

一个基于 Web 的图片文字编辑器。上传图片后会直接进入编辑页，自动执行 OCR、生成背景层，并在本地模式下对复杂区域渐进补充 AI 修复，让你直接在最终图层上编辑和导出。

在线演示：<https://edit-nanobanana.vercel.app/>

## 项目模式

项目通过一个环境变量控制运行模式：

- `NEXT_PUBLIC_DEPLOY_TARGET=local`
  - 用于本地开发
  - 启用 AI 功能
  - 显示 `AI repair`、自动 AI、待确认 AI 面板
  - `/api/inpaint` 可用
- `NEXT_PUBLIC_DEPLOY_TARGET=vercel`
  - 用于 Vercel 部署
  - 禁用 AI 功能
  - 隐藏所有 AI 入口
  - `/api/inpaint` 直接返回禁用错误
  - 只保留 OCR + 背景层 + 本地修复

如果未设置，默认按 `local` 处理。

## 功能特点

- 上传即编辑
- OCR + 自动背景层生成
- 文字内容、字体、字号、颜色编辑
- ROI OCR 局部重识别
- Local repair 局部背景修复
- 本地模式下支持 AI repair 与自动 AI
- 背景层预览
- 误识别删除恢复原图
- 橡皮擦恢复原始背景细节
- 原图对比
- 导出 PNG

## 环境要求

- Node.js 18+
- npm 9+
- 可用的 PaddleOCR 服务
- 如果要启用 AI：可运行的 IOPaint 服务

## 快速开始

### 1. 安装依赖

```bash
cd image-editor-web
npm install
cp .env.example .env.local
```

### 2. 配置环境变量

编辑 `.env.local`：

```env
NEXT_PUBLIC_DEPLOY_TARGET=local

OCR_API_URL=https://your-paddleocr-api-url/ocr
OCR_API_TOKEN=your_ocr_token

INPAINT_PROVIDER=iopaint
INPAINT_API_URL=http://127.0.0.1:8080/api/v1/inpaint
INPAINT_API_TOKEN=
```

说明：

- 如果你只想跑本地 OCR + 本地修复，不启用 AI，也可以把 `NEXT_PUBLIC_DEPLOY_TARGET` 设成 `vercel`
- `vercel` 模式下会直接禁用 AI 相关能力，`INPAINT_*` 配置不会被使用

### 3. 启动前端

本地完整模式：

```bash
npm run dev:local
```

模拟 Vercel 无 AI 模式：

```bash
npm run dev:vercel
```

默认开发命令：

```bash
npm run dev
```

浏览器打开 <http://localhost:3000>

## 使用说明

### 基本流程

1. 上传图片
2. 系统自动完成 OCR 和首轮背景层生成
3. 点击 OCR 框，在右侧编辑文字或执行局部修复
4. 用 `ROI OCR` 处理漏检或局部识别不准的区域
5. 本地模式下，可对复杂区域使用 `AI repair`，并对第一次自动 AI 结果做确认/丢弃
6. 导出 PNG

### 工具说明

| 工具 | 说明 |
| --- | --- |
| 选择模式 | 选择已有 OCR 框或手工框 |
| 橡皮擦模式 | 在当前已确认背景层上恢复原图细节，例如印章 |
| ROI OCR | 对框选区域重新 OCR，并局部覆盖结果 |
| Local repair | 只对当前选中区域做本地背景修复 |
| AI repair | 仅本地模式可用，对当前选中区域调用 AI 后端 |
| 背景层 | 查看已确认的背景修复层 |
| Auto changes | 仅本地模式可用，查看待确认 AI 修复 |
| 对比 | 按住查看原图 |

## AI 后端部署教程

本项目默认按 IOPaint 作为本地 AI inpaint 后端接入。

官方参考：

- IOPaint GitHub：<https://github.com/Sanster/IOPaint>
- IOPaint 官网：<https://www.iopaint.com/>

### 方案 A：直接使用 pip 安装

根据 IOPaint 官方 README，最简单的启动方式是：

```bash
pip3 install iopaint
iopaint start --model=lama --device=cpu --port=8080
```

本项目已经提供了一个本地启动脚本：

```bash
npm run ai:start
```

它实际执行的是：

```bash
bash ./scripts/start-iopaint.sh
```

脚本支持这些环境变量：

```bash
IOPAINT_PORT=8080
IOPAINT_MODEL=lama
IOPAINT_DEVICE=cpu
```

例如：

```bash
IOPAINT_DEVICE=cuda IOPAINT_MODEL=lama npm run ai:start
```

### 方案 B：单独部署到另一台机器

如果你想把 AI 后端部署到单独服务器：

1. 在服务器上安装 IOPaint
2. 启动 IOPaint 服务
3. 确认前端机器可以访问该地址
4. 在 `.env.local` 中把 `INPAINT_API_URL` 改成对应地址

例如：

```env
INPAINT_PROVIDER=iopaint
INPAINT_API_URL=http://your-server:8080/api/v1/inpaint
```

### 注意事项

- IOPaint 首次启动会自动下载模型，第一次会比较慢
- CPU 模式可直接跑，但速度慢；有 GPU 时建议按 IOPaint 官方说明先安装对应 PyTorch
- 本项目当前只兼容本地部署模式中的 AI；Vercel 版本不提供 AI 功能

## Vercel 部署

如果你要部署到 Vercel，请直接看：

- [DEPLOY.md](./DEPLOY.md)

Vercel 版本必须设置：

```env
NEXT_PUBLIC_DEPLOY_TARGET=vercel
```

Vercel 版本不提供 AI 功能。

## 生产启动

本地模式：

```bash
npm run build:local
npm run start:local
```

Vercel 模式：

```bash
npm run build:vercel
npm run start:vercel
```
