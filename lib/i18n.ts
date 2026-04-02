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
    'toolbar.exportFailed': 'Export failed',
    'toolbar.confirmReset': 'Are you sure you want to start over? All changes will be lost.',
    'toolbar.noImage': 'No image to export',
    'toolbar.refreshCleanBackground': 'Refresh Clean BG',
    'toolbar.refreshingCleanBackground': 'Refreshing...',
    'toolbar.previewOriginal': 'Original',
    'toolbar.previewAuto': 'Auto',
    'toolbar.previewCurrent': 'Current',
    'toolbar.selectMode': 'Select mode',
    'toolbar.eraserMode': 'Eraser mode',
    'toolbar.eraserSize': 'Size',
    'toolbar.addTextMode': 'Add text mode',
    'toolbar.compare': 'Compare',
    'toolbar.compareHint': 'Hold to compare with original',
    'toolbar.zoomIn': 'Zoom in',
    'toolbar.zoomOut': 'Zoom out',
    'toolbar.resetZoom': 'Reset zoom (fit to view)',
    'toolbar.zoomHint': 'Ctrl+scroll to zoom, scroll to pan',
    'toolbar.autoChanges': 'Auto changes',
    'toolbar.autoChangesSummary': '{count} recent changes',
    'toolbar.autoChangesEmpty': 'No automatic changes yet',
    'toolbar.autoChangesFallback': 'Automatic change',
    'toolbar.autoChangesRegions': '{count} regions',
    'toolbar.autoChangeStatus.new': 'New',
    'toolbar.autoChangeStatus.seen': 'Seen',
    'toolbar.autoChangeStatus.reverted': 'Reverted',
    'toolbar.markSeen': 'Mark seen',
    'toolbar.revertAutoChange': 'Revert',

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
    'sidebar.badgeOcr': 'OCR',
    'sidebar.badgeRoiOcr': 'ROI OCR',
    'sidebar.badgeManual': 'Manual',
    'sidebar.badgeExcluded': 'Excluded',
    'sidebar.badgeLowConfidence': 'Low confidence',

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
    'controls.fontWeight': 'Weight',
    'controls.bold': 'Bold',
    'controls.textAlign': 'Alignment',
    'controls.alignLeft': 'Left',
    'controls.alignCenter': 'Center',
    'controls.alignRight': 'Right',
    'controls.fontSize': 'Font Size',
    'controls.fontColor': 'Font Color',
    'controls.refreshAutoColor': 'Refresh Auto Color',
    'controls.useAutoColor': 'Use Auto Color',
    'controls.resampling': 'Resampling...',
    'controls.autoColorMode': 'Auto color mode: refresh can overwrite the current text color.',
    'controls.manualColorMode': 'Manual color mode: auto refresh is locked until you switch back.',
    'controls.bgColor': 'Background Color',
    'controls.detectedColors': 'Detected Colors',
    'controls.text': 'Text',
    'controls.background': 'Background',
    'controls.detectedTextRaw': 'Text Raw',
    'controls.detectedTextQuantized': 'Text Quantized',
    'controls.detectedBackground': 'Background',
    'controls.deleteRegion': 'Delete Region',
    'controls.deleteRegionHint': 'If this is a false OCR hit, delete it and treat it as background.',
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
    'canvas.autoChange': 'Auto',
    'toolbar.eraserHint': 'Select a text element first to use eraser',
  },
  zh: {
    // Toolbar
    'app.title': 'NanoBanana图片文字编辑器',
    'app.subtitle': '直接在图片上修改文字',
    'toolbar.startOver': '重新开始',
    'toolbar.restoreAll': '恢复全部',
    'toolbar.exportPng': '导出 PNG',
    'toolbar.exportFailed': '导出失败',
    'toolbar.confirmReset': '确定要重新开始吗？所有更改都将丢失。',
    'toolbar.noImage': '没有可导出的图片',
    'toolbar.refreshCleanBackground': '重新生成干净背景',
    'toolbar.refreshingCleanBackground': '重新生成中...',
    'toolbar.previewOriginal': '原图',
    'toolbar.previewAuto': '自动层',
    'toolbar.previewCurrent': '当前',
    'toolbar.selectMode': '选择模式',
    'toolbar.eraserMode': '橡皮擦模式',
    'toolbar.eraserSize': '大小',
    'toolbar.addTextMode': '手工加字',
    'toolbar.compare': '对比',
    'toolbar.compareHint': '按住对比原图',
    'toolbar.zoomIn': '放大',
    'toolbar.zoomOut': '缩小',
    'toolbar.resetZoom': '重置缩放（适应视图）',
    'toolbar.zoomHint': 'Ctrl+滚轮缩放，滚动平移',
    'toolbar.autoChanges': '自动改动',
    'toolbar.autoChangesSummary': '最近 {count} 条改动',
    'toolbar.autoChangesEmpty': '还没有自动改动',
    'toolbar.autoChangesFallback': '自动改动',
    'toolbar.autoChangesRegions': '{count} 个区域',
    'toolbar.autoChangeStatus.new': '新改动',
    'toolbar.autoChangeStatus.seen': '已查看',
    'toolbar.autoChangeStatus.reverted': '已回退',
    'toolbar.markSeen': '标为已看',
    'toolbar.revertAutoChange': '回退',

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
    'sidebar.badgeOcr': 'OCR',
    'sidebar.badgeRoiOcr': '框选 OCR',
    'sidebar.badgeManual': '手工',
    'sidebar.badgeExcluded': '排除清底',
    'sidebar.badgeLowConfidence': '低置信度',

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
    'controls.fontWeight': '字重',
    'controls.bold': '粗体',
    'controls.textAlign': '对齐',
    'controls.alignLeft': '左对齐',
    'controls.alignCenter': '居中',
    'controls.alignRight': '右对齐',
    'controls.fontSize': '字号',
    'controls.fontColor': '字体颜色',
    'controls.refreshAutoColor': '重新自动取色',
    'controls.useAutoColor': '使用自动色',
    'controls.resampling': '重新取色中...',
    'controls.autoColorMode': '当前为自动颜色模式，重新取色会覆盖当前文字色。',
    'controls.manualColorMode': '当前为手动颜色模式，切回自动色前不会被自动刷新覆盖。',
    'controls.bgColor': '背景颜色',
    'controls.detectedColors': '检测到的颜色',
    'controls.text': '文字',
    'controls.background': '背景',
    'controls.detectedTextRaw': '文字原始色',
    'controls.detectedTextQuantized': '文字量化色',
    'controls.detectedBackground': '背景色',
    'controls.deleteRegion': '删除此项',
    'controls.deleteRegionHint': '如果这是 OCR 误识别，直接删除即可，系统会把它当作背景处理。',
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
    'canvas.autoChange': '自动',
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
