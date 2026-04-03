"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, RotateCcw, Globe, RefreshCw, MousePointer, Eraser, Eye, ZoomIn, ZoomOut, Maximize2, Sparkles, Layers3 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useEditorStore, EditorMode, RoiAction } from '@/store/editorStore';
import { exportCanvasAsPNG } from '@/lib/fabric-utils';
import { useI18n, Locale } from '@/lib/i18n';
import { generateCleanBackground } from '@/lib/clean-background';
import { isAiEnabled } from '@/lib/deploy-target';
import { AutoChangesPanel } from '@/components/editor/AutoChangesPanel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Toolbar() {
  const [isAutoChangesOpen, setIsAutoChangesOpen] = useState(false);
  const autoChangesRef = useRef<HTMLDivElement>(null);
  const {
    canvas,
    canvasScale,
    reset,
    restoreAll,
    originalImage,
    pageModel,
    baseAutoLayer,
    editorMode,
    pendingRoiAction,
    setEditorMode,
    setPendingRoiAction,
    previewMode,
    confirmAutoChange,
    confirmAllAutoChanges,
    discardAutoChange,
    setPreviewMode,
    eraserSize,
    setEraserSize,
    isComparing,
    setIsComparing,
    viewportZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    isCleaningBackground,
    setIsCleaningBackground,
    setCleanLayer,
  } = useEditorStore();
  const { t, locale, setLocale } = useI18n();
  const aiEnabled = isAiEnabled();
  const autoChanges = pageModel?.autoChanges ?? [];
  const pendingAutoChanges = autoChanges.filter((change) => change.status === 'new');

  useEffect(() => {
    if (!isAutoChangesOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!autoChangesRef.current?.contains(event.target as Node)) {
        setIsAutoChangesOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isAutoChangesOpen]);

  const handleExport = async () => {
    if (!canvas || !originalImage) {
      alert(t('toolbar.noImage'));
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      await exportCanvasAsPNG(canvas, canvasScale, {
        filename: `edited-${timestamp}.png`,
        backgroundImageUrl: baseAutoLayer ?? originalImage,
      });
    } catch (error) {
      alert(`${t('toolbar.exportFailed')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleRefreshCleanBackground = async () => {
    if (!originalImage || !pageModel) {
      return;
    }

    setIsCleaningBackground(true);
    try {
      const cleanLayer = await generateCleanBackground(originalImage, pageModel);
      setCleanLayer(cleanLayer);
      setPreviewMode('current');
    } catch (error) {
      alert(`${t('toolbar.refreshCleanBackground')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCleaningBackground(false);
    }
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

  const handleAddTextMode = () => {
    if (editorMode === 'add-text') {
      setEditorMode('select');
      return;
    }

    setPendingRoiAction(null);
    setEditorMode('add-text');
  };

  const handleRoiAction = (action: RoiAction) => {
    if (editorMode === 'roi' && pendingRoiAction === action) {
      setPendingRoiAction(null);
      setEditorMode('select');
      return;
    }

    setPendingRoiAction(action);
    setEditorMode('roi');
  };

  const handleConfirmAutoChange = async (changeId: string) => {
    try {
      await confirmAutoChange(changeId);
    } catch (error) {
      console.error('Failed to confirm auto change:', error);
      alert(`${t('toolbar.confirmAutoChange')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleConfirmAllAutoChanges = async () => {
    try {
      await confirmAllAutoChanges();
    } catch (error) {
      console.error('Failed to confirm all auto changes:', error);
      alert(`${t('toolbar.confirmAllAutoChanges')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDiscardAutoChange = async (changeId: string) => {
    try {
      await discardAutoChange(changeId);
    } catch (error) {
      console.error('Failed to discard auto change:', error);
      alert(`${t('toolbar.discardAutoChange')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="relative flex flex-wrap items-start gap-4 border-b bg-white px-6 py-4 xl:flex-nowrap xl:items-center xl:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{t('app.title')}</h1>
        <p className="text-sm text-gray-600">{t('app.subtitle')}</p>
      </div>

      <div className="flex max-w-full flex-wrap items-center gap-2 xl:justify-end">
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
              <Button
                variant={editorMode === 'add-text' ? 'default' : 'ghost'}
                size="sm"
                onClick={handleAddTextMode}
                disabled={!pageModel}
              >
                {t('toolbar.addTextMode')}
              </Button>
            </div>

            <div className="flex items-center gap-1 border rounded-md p-1">
              <Button
                variant={editorMode === 'roi' && pendingRoiAction === 'ocr' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleRoiAction('ocr')}
                disabled={!pageModel}
              >
                ROI OCR
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void handleRefreshCleanBackground();
              }}
              disabled={isCleaningBackground}
            >
              <Sparkles className="w-4 h-4 mr-1" />
              {isCleaningBackground ? t('toolbar.refreshingCleanBackground') : t('toolbar.refreshCleanBackground')}
            </Button>

            <div className="flex items-center gap-2">
              <Layers3 className="w-4 h-4 text-gray-500" />
              <Select value={previewMode} onValueChange={(value) => setPreviewMode(value as typeof previewMode)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="original">{t('toolbar.previewOriginal')}</SelectItem>
                  <SelectItem value="auto" disabled={!baseAutoLayer && !pageModel?.cleanLayer}>{t('toolbar.previewAuto')}</SelectItem>
                  <SelectItem value="current">{t('toolbar.previewCurrent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {aiEnabled && (
              <div ref={autoChangesRef} className="relative">
                <Button
                  variant={isAutoChangesOpen ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsAutoChangesOpen((open) => !open)}
                  disabled={autoChanges.length === 0}
                >
                  <Sparkles className="w-4 h-4 mr-1" />
                  {t('toolbar.autoChanges')}
                  {pendingAutoChanges.length > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                      {pendingAutoChanges.length}
                    </span>
                  )}
                </Button>

                {isAutoChangesOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2">
                    <AutoChangesPanel
                      autoChanges={autoChanges}
                      onRevert={(changeId) => {
                        void handleDiscardAutoChange(changeId);
                      }}
                      onMarkSeen={(changeId) => {
                        void handleConfirmAutoChange(changeId);
                      }}
                      onConfirmAll={() => {
                        void handleConfirmAllAutoChanges();
                      }}
                    />
                  </div>
                )}
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
          onClick={() => {
            void handleExport();
          }}
          disabled={!canvas}
        >
          <Download className="w-4 h-4 mr-2" />
          {t('toolbar.exportPng')}
        </Button>
      </div>
    </div>
  );
}
