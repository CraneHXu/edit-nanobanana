"use client";

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'en' | 'zh';

const translations = {
  en: {
    // Toolbar
    'app.title': 'NanoBanana Image Text Editor',
    'app.subtitle': 'Edit text directly on your images',
    'toolbar.startOver': 'Start Over',
    'toolbar.restoreAll': 'Restore All',
    'toolbar.exportPng': 'Export PNG',
    'toolbar.confirmReset': 'Are you sure you want to start over? All changes will be lost.',
    'toolbar.noImage': 'No image to export',
    'toolbar.selectMode': 'Select mode',
    'toolbar.eraserMode': 'Eraser mode',
    'toolbar.eraserSize': 'Size',
    'toolbar.compare': 'Compare',
    'toolbar.compareHint': 'Hold to compare with original',
    'toolbar.zoomIn': 'Zoom in',
    'toolbar.zoomOut': 'Zoom out',
    'toolbar.resetZoom': 'Reset zoom (fit to view)',
    'toolbar.zoomHint': 'Ctrl+scroll to zoom, scroll to pan',

    // ImageUploader
    'uploader.dropHere': 'Drop image here...',
    'uploader.dropOrClick': 'Drop an image here, or click to select',
    'uploader.formats': 'PNG, JPG, JPEG, WEBP (max 10MB)',
    'uploader.failed': 'Failed to detect text in image',

    // Sidebar
    'sidebar.noText': 'No text detected yet',
    'sidebar.uploadHint': 'Upload an image to get started',
    'sidebar.detectedText': 'Detected Text',
    'sidebar.empty': '(empty)',

    // TextControls
    'controls.editText': 'Edit Text',
    'controls.selectHint': 'Select a text element to edit',
    'controls.visibility': 'Visibility',
    'controls.showBackground': 'Background',
    'controls.showText': 'Text',
    'controls.textContent': 'Text Content',
    'controls.enterText': 'Enter text',
    'controls.fontFamily': 'Font Family',
    'controls.selectFont': 'Select font...',
    'controls.fontSize': 'Font Size',
    'controls.fontColor': 'Font Color',
    'controls.bgColor': 'Background Color',
    'controls.detectedColors': 'Detected Colors',
    'controls.text': 'Text',
    'controls.background': 'Background',
    'controls.resetToOriginal': 'Reset to Original',

    // Font categories
    'font.sansSerif': 'Sans-serif',
    'font.serif': 'Serif',
    'font.monospace': 'Monospace',
    'font.handwriting': 'Handwriting',
    'font.chinese': 'Chinese (CJK)',

    // Language
    'language': 'Language',
    'language.en': 'English',
    'language.zh': '中文',

    // Canvas
    'canvas.comparing': 'Comparing with original',
    'toolbar.eraserHint': 'Select a text element first to use eraser',
  },
  zh: {
    // Toolbar
    'app.title': 'NanoBanana图片文字编辑器',
    'app.subtitle': '直接在图片上修改文字',
    'toolbar.startOver': '重新开始',
    'toolbar.restoreAll': '恢复全部',
    'toolbar.exportPng': '导出 PNG',
    'toolbar.confirmReset': '确定要重新开始吗？所有更改都将丢失。',
    'toolbar.noImage': '没有可导出的图片',
    'toolbar.selectMode': '选择模式',
    'toolbar.eraserMode': '橡皮擦模式',
    'toolbar.eraserSize': '大小',
    'toolbar.compare': '对比',
    'toolbar.compareHint': '按住对比原图',
    'toolbar.zoomIn': '放大',
    'toolbar.zoomOut': '缩小',
    'toolbar.resetZoom': '重置缩放（适应视图）',
    'toolbar.zoomHint': 'Ctrl+滚轮缩放，滚动平移',

    // ImageUploader
    'uploader.dropHere': '将图片拖放到这里...',
    'uploader.dropOrClick': '拖放图片到这里，或点击选择',
    'uploader.formats': 'PNG, JPG, JPEG, WEBP (最大 10MB)',
    'uploader.failed': '检测图片文字失败',

    // Sidebar
    'sidebar.noText': '尚未检测到文字',
    'sidebar.uploadHint': '上传图片开始使用',
    'sidebar.detectedText': '检测到的文字',
    'sidebar.empty': '（空）',

    // TextControls
    'controls.editText': '编辑文字',
    'controls.selectHint': '选择一个文字元素进行编辑',
    'controls.visibility': '显示控制',
    'controls.showBackground': '背景',
    'controls.showText': '文字',
    'controls.textContent': '文字内容',
    'controls.enterText': '输入文字',
    'controls.fontFamily': '字体',
    'controls.selectFont': '选择字体...',
    'controls.fontSize': '字号',
    'controls.fontColor': '字体颜色',
    'controls.bgColor': '背景颜色',
    'controls.detectedColors': '检测到的颜色',
    'controls.text': '文字',
    'controls.background': '背景',
    'controls.resetToOriginal': '重置为原始值',

    // Font categories
    'font.sansSerif': '无衬线',
    'font.serif': '衬线',
    'font.monospace': '等宽',
    'font.handwriting': '手写',
    'font.chinese': '中文 (CJK)',

    // Language
    'language': '语言',
    'language.en': 'English',
    'language.zh': '中文',

    // Canvas
    'canvas.comparing': '正在对比原图',
    'toolbar.eraserHint': '请先选择一个文字元素才能使用橡皮擦',
  },
} as const;

type TranslationKey = keyof typeof translations.en;

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
      t: (key) => {
        const { locale } = get();
        return translations[locale][key] || translations.en[key] || key;
      },
    }),
    {
      name: 'i18n-storage',
    }
  )
);
