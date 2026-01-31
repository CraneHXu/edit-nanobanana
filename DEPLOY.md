# Vercel 部署指南

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/edit-banana-word&env=OCR_API_TOKEN,OCR_API_URL)

## 手动部署步骤

### 1. 安装 Vercel CLI

```bash
npm i -g vercel
```

### 2. 登录 Vercel

```bash
vercel login
```

### 3. 部署

```bash
cd image-editor-web
vercel
```

### 4. 配置环境变量

在 Vercel 控制台中添加以下环境变量：

| 变量名 | 值 | 说明 |
|--------|------|------|
| `OCR_API_TOKEN` | `your_paddle_ocr_token` | PaddleOCR API Token |
| `OCR_API_URL` | `https://ddq659q3sbt2h5h6.aistudio-app.com/ocr` | PaddleOCR API 地址 |

或者使用命令行：

```bash
vercel env add OCR_API_TOKEN
vercel env add OCR_API_URL
```

### 5. 重新部署（使环境变量生效）

```bash
vercel --prod
```

## 通过 GitHub 自动部署

1. 将代码推送到 GitHub
2. 在 [Vercel 控制台](https://vercel.com/dashboard) 导入项目
3. 选择 `image-editor-web` 目录作为根目录
4. 添加环境变量
5. 点击 Deploy

## 项目结构

```
image-editor-web/
├── app/
│   ├── api/
│   │   ├── ocr/route.ts      # OCR API 路由 (调用 PaddleOCR)
│   │   └── health/route.ts   # 健康检查
│   ├── page.tsx              # 主页面
│   └── layout.tsx            # 布局
├── components/               # React 组件
├── lib/
│   └── api-client.ts         # API 客户端
├── vercel.json               # Vercel 配置
└── .env.example              # 环境变量示例
```

## API 说明

### OCR 接口

**POST** `/api/ocr`

请求：
- Content-Type: `multipart/form-data`
- Body: `image` (File) - 图片文件

响应：
```json
{
  "success": true,
  "detections": [
    {
      "index": 0,
      "text": "识别的文本",
      "confidence": 0.95,
      "bbox": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],
      "bounds": { "x": 0, "y": 0, "width": 100, "height": 20 }
    }
  ],
  "count": 1
}
```

### 健康检查

**GET** `/api/health`

响应：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 注意事项

1. **API Token 安全**: `OCR_API_TOKEN` 存储在服务端环境变量中，不会暴露给前端
2. **CORS**: Next.js API Routes 自动处理同源请求
3. **文件大小限制**: Vercel 默认限制请求体大小为 4.5MB
