"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, RotateCcw, Globe, RefreshCw, MousePointer, Eraser, Eye, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useEditorStore, EditorMode } from '@/store/editorStore';
import { exportCanvasAsPNG } from '@/lib/fabric-utils';
import { useI18n, Locale } from '@/lib/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Toolbar() {
  const {
    canvas,
    canvasScale,
    reset,
    restoreAll,
    originalImage,
    editorMode,
    setEditorMode,
    eraserSize,
    setEraserSize,
    isComparing,
    setIsComparing,
    viewportZoom,
    zoomIn,
    zoomOut,
    resetZoom,
  } = useEditorStore();
  const { t, locale, setLocale } = useI18n();

  const handleExport = () => {
    if (!canvas) {
      alert(t('toolbar.noImage'));
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    exportCanvasAsPNG(canvas, canvasScale, `edited-${timestamp}.png`);
  };

  const handleReset = () => {
    if (confirm(t('toolbar.confirmReset'))) {
      reset();
    }
  };

  const handleRestoreAll = () => {
    restoreAll();
  };

  const handleModeChange = (mode: EditorMode) => {
    setEditorMode(mode);
  };

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
      <div>
        <h1 className="text-2xl font-bold">{t('app.title')}</h1>
        <p className="text-sm text-gray-600">{t('app.subtitle')}</p>
      </div>

      <div className="flex items-center gap-2">
        {/* Editor Mode Tools */}
        {originalImage && (
          <>
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={editorMode === 'select' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('select')}
                title={t('toolbar.selectMode')}
              >
                <MousePointer className="w-4 h-4" />
              </Button>
              <Button
                variant={editorMode === 'eraser' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('eraser')}
                title={t('toolbar.eraserMode')}
              >
                <Eraser className="w-4 h-4" />
              </Button>
            </div>

            {/* Eraser Size Slider */}
            {editorMode === 'eraser' && (
              <div className="flex items-center gap-2 px-2">
                <span className="text-xs text-gray-500">{t('toolbar.eraserSize')}</span>
                <Slider
                  value={[eraserSize]}
                  onValueChange={([value]) => setEraserSize(value)}
                  min={5}
                  max={50}
                  step={1}
                  className="w-24"
                />
                <span className="text-xs text-gray-500 w-6">{eraserSize}</span>
              </div>
            )}

            {/* Compare Button */}
            <Button
              variant={isComparing ? 'default' : 'outline'}
              size="sm"
              onMouseDown={() => setIsComparing(true)}
              onMouseUp={() => setIsComparing(false)}
              onMouseLeave={() => setIsComparing(false)}
              onTouchStart={() => setIsComparing(true)}
              onTouchEnd={() => setIsComparing(false)}
              title={t('toolbar.compareHint')}
            >
              <Eye className="w-4 h-4 mr-1" />
              {t('toolbar.compare')}
            </Button>

            <div className="w-px h-6 bg-gray-300 mx-1" />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={zoomOut}
                title={t('toolbar.zoomOut')}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-xs text-gray-600 w-12 text-center">
                {Math.round(viewportZoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={zoomIn}
                title={t('toolbar.zoomIn')}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetZoom}
                title={t('toolbar.resetZoom')}
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-1" />
          </>
        )}

        <Select value={locale} onValueChange={(value) => setLocale(value as Locale)}>
          <SelectTrigger className="w-32">
            <Globe className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">{t('language.en')}</SelectItem>
            <SelectItem value="zh">{t('language.zh')}</SelectItem>
          </SelectContent>
        </Select>
        {originalImage && (
          <Button
            variant="outline"
            onClick={handleRestoreAll}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('toolbar.restoreAll')}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={handleReset}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {t('toolbar.startOver')}
        </Button>
        <Button
          onClick={handleExport}
          disabled={!canvas}
        >
          <Download className="w-4 h-4 mr-2" />
          {t('toolbar.exportPng')}
        </Button>
      </div>
    </div>
  );
}
