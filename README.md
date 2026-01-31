[English Version](#English)

一个基于 Web 的图片文字编辑器，使用 OCR 技术自动检测图片中的文字，并允许你直接在图片上编辑和替换文字。

在线demo：https://image-editor-web-tan.vercel.app/

## 功能特点

- **OCR 文字检测**：使用 PaddleOCR 自动检测上传图片中的文字
- **文字编辑**：编辑检测到的文字内容，更改字体、调整字号和颜色
- **背景遮盖**：自动生成背景遮盖层隐藏原始文字
- **橡皮擦工具**：精确擦除部分背景遮盖，露出原始图片
- **对比模式**：按住对比按钮查看原图
- **多语言支持**：中英文界面切换
- **丰富字体库**：支持 Google Fonts，包括中日韩（CJK）字体
- **导出功能**：以原始分辨率导出编辑后的 PNG 图片

## 技术栈

- **框架**：Next.js 15 (App Router)
- **UI**：React 19 + Tailwind CSS + Radix UI
- **画布**：Fabric.js 6
- **状态管理**：Zustand
- **OCR**：PaddleOCR（通过 API 调用）

## 使用指南

### 基本流程

1. **上传图片**：拖放或点击上传图片（支持 PNG、JPG、JPEG、WEBP，最大 10MB）
2. **等待 OCR**：系统会自动检测图片中的文字
3. **编辑文字**：点击检测到的文字进行选择和编辑
4. **调整样式**：使用侧边栏控件更改字体、大小、颜色
5. **使用橡皮擦**：切换到橡皮擦模式，在遮盖层上涂抹以露出原始背景
6. **对比原图**：按住"对比"按钮查看原始图片
7. **导出图片**：点击"导出 PNG"下载编辑后的图片

### 工具说明

| 工具 | 说明 |
|------|------|
| 选择模式 | 点击选择文字元素进行编辑 |
| 橡皮擦模式 | 在背景遮盖上涂抹以露出原始图片 |
| 对比 | 按住查看原图 |
| 恢复全部 | 将所有元素重置为原始状态 |
| 重新开始 | 清除所有内容，重新开始 |

### 文字控制

- **显示/隐藏背景**：切换背景遮盖的可见性
- **显示/隐藏文字**：切换文字的可见性
- **字体**：从多种字体中选择，包括中文字体支持
- **字号**：使用滑块或输入框调整
- **字体颜色**：从检测到的颜色中选择或自定义
- **背景颜色**：从检测到的颜色中选择或自定义
- **重置为原始值**：将单个元素重置为原始状态

## 已知限制

- 目前只支持纯色背景遮盖，无法自动匹配复杂纹理或渐变背景

## TODO

- [ ] 支持渐变色背景遮盖
- [ ] 支持纹理/图案背景填充
- [ ] AI 智能背景修复（Inpainting）
- [ ] 批量处理多张图片
- [ ] 支持更多 OCR 引擎（如 Tesseract、Google Vision）
- [ ] 撤销/重做功能
- [ ] 自定义字体上传

## 快速开始

### 环境要求

- Node.js 18+
- PaddleOCR API 访问权限（或自建 PaddleOCR 服务）

### 安装

```bash
# 克隆仓库
git clone https://github.com/yourusername/image-text-editor.git
cd image-text-editor

# 安装依赖
npm install

# 设置环境变量
cp .env.example .env.local
# 编辑 .env.local 并配置你的 OCR API
```

### 环境变量

创建 `.env.local` 文件：

```env
# PaddleOCR API 配置
OCR_API_URL=https://your-paddleocr-api-url/ocr
OCR_API_TOKEN=your_api_token_here
```

你可以自建 PaddleOCR 服务，或使用托管服务如 [百度 AI Studio](https://aistudio.baidu.com/)。

### 开发模式

```bash
npm run dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000)。

### 生产构建

```bash
npm run build
npm start
```

## 贡献

欢迎提交 Issue 和 Pull Request！

如果这个项目对你有帮助，请给个 Star 支持一下！

## 许可证

MIT License

---

# English

# Image Text Editor

A web-based image text editor that allows you to detect, edit, and replace text directly on images using OCR technology.


## Features

- **OCR Text Detection**: Automatically detect text in uploaded images using PaddleOCR
- **Text Editing**: Edit detected text content, change fonts, adjust font size and colors
- **Background Cover**: Automatically generate background covers to hide original text
- **Eraser Tool**: Precisely erase parts of the background cover to reveal the original image
- **Compare Mode**: Hold to compare with the original image
- **Multi-language Support**: English and Chinese interface (i18n)
- **Rich Font Library**: Support for Google Fonts including CJK (Chinese, Japanese, Korean) fonts
- **Export**: Export edited images as PNG at original resolution

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: React 19 + Tailwind CSS + Radix UI
- **Canvas**: Fabric.js 6
- **State Management**: Zustand
- **OCR**: PaddleOCR (via API)

## Getting Started

### Prerequisites

- Node.js 18+
- PaddleOCR API access (or self-hosted PaddleOCR service)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/image-text-editor.git
cd image-text-editor

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local and configure your OCR API
```

### Environment Variables

Create a `.env.local` file with:

```env
# PaddleOCR API Configuration
OCR_API_URL=https://your-paddleocr-api-url/ocr
OCR_API_TOKEN=your_api_token_here
```

You can deploy your own PaddleOCR service or use a hosted one like [Baidu AI Studio](https://aistudio.baidu.com/).

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build

```bash
npm run build
npm start
```

## Usage Guide

### Basic Workflow

1. **Upload Image**: Drag and drop or click to upload an image (PNG, JPG, JPEG, WEBP, max 10MB)
2. **Wait for OCR**: The system will automatically detect text in the image
3. **Edit Text**: Click on detected text to select and edit
4. **Adjust Styling**: Change font, size, color using the sidebar controls
5. **Use Eraser**: Switch to eraser mode to reveal original background through the cover
6. **Compare**: Hold the "Compare" button to see the original image
7. **Export**: Click "Export PNG" to download the edited image

### Tools

| Tool | Description |
|------|-------------|
| Select Mode | Click to select text elements for editing |
| Eraser Mode | Paint on background covers to reveal original image |
| Compare | Hold to view original image |
| Restore All | Reset all elements to original state |
| Start Over | Clear everything and start fresh |

### Text Controls

- **Show/Hide Background**: Toggle the background cover visibility
- **Show/Hide Text**: Toggle the text visibility
- **Font Family**: Choose from various fonts including CJK support
- **Font Size**: Adjust using slider or input field
- **Font Color**: Pick from detected colors or custom color
- **Background Color**: Pick from detected colors or custom color
- **Reset to Original**: Reset individual element to original state

## Project Structure

```
image-editor-web/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   └── ocr/          # OCR endpoint (PaddleOCR)
│   └── page.tsx          # Main page
├── components/
│   ├── editor/           # Editor components
│   │   ├── CanvasEditor.tsx
│   │   ├── Toolbar.tsx
│   │   ├── Sidebar.tsx
│   │   ├── TextControls.tsx
│   │   └── FontSelector.tsx
│   └── ui/               # Reusable UI components
├── lib/
│   ├── fabric-utils.ts   # Fabric.js utilities
│   ├── font-loader.ts    # Google Fonts loader
│   └── i18n.ts           # Internationalization
├── store/
│   └── editorStore.ts    # Zustand store
└── types/                # TypeScript types
```

## Deploy

This project can be deployed to Vercel, Netlify, or any platform that supports Next.js.

```bash
# Deploy to Vercel
npx vercel
```

## Known Limitations

- Currently only supports solid color background covers, cannot automatically match complex textures or gradient backgrounds

## TODO

- [ ] Gradient background cover support
- [ ] Texture/pattern background fill
- [ ] AI-powered background inpainting
- [ ] Batch processing for multiple images
- [ ] Support more OCR engines (Tesseract, Google Vision, etc.)
- [ ] Undo/Redo functionality
- [ ] Custom font upload

## Contributing

Issues and Pull Requests are welcome!

If you find this project helpful, please give it a Star!

## License

MIT License

---
