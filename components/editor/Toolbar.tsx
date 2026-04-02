"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, RotateCcw, Globe, RefreshCw, MousePointer, Eraser, Eye, ZoomIn, ZoomOut, Maximize2, Sparkles, Layers3 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { useEditorStore, EditorMode, RoiAction } from '@/store/editorStore';
import { exportCanvasAsPNG } from '@/lib/fabric-utils';
import { useI18n, Locale } from '@/lib/i18n';
import { generateCleanBackground } from '@/lib/clean-background';
import { AutoChangesPanel } from '@/components/editor/AutoChangesPanel';
import type { AutoChange, PageModel } from '@/types/canvas';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function resolveAutoChangeStatus(change: AutoChange): 'new' | 'seen' | 'reverted' {
  if (change.status) {
    return change.status;
  }
  if (change.reverted) {
    return 'reverted';
  }
  return change.applied ? 'new' : 'seen';
}

function updatePageModelAutoChanges(
  pageModel: PageModel,
  changeId: string,
  updater: (change: AutoChange) => AutoChange,
): PageModel {
  const nextAutoChanges = pageModel.autoChanges?.map((change) => (
    change.id === changeId ? updater(change) : change
  ));

  const targetChange = pageModel.autoChanges?.find((change) => change.id === changeId);
  const nextPatches = targetChange
    ? pageModel.patches?.map((patch) => (
        patch.id === targetChange.patchId
          ? { ...patch, applied: false, reverted: true }
          : patch
      ))
    : pageModel.patches;

  return {
    ...pageModel,
    autoChanges: nextAutoChanges,
    patches: nextPatches,
  };
}

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
    editorMode,
    pendingRoiAction,
    setEditorMode,
    setPendingRoiAction,
    previewMode,
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
  const autoChanges = pageModel?.autoChanges ?? [];
  const unseenAutoChanges = autoChanges.filter((change) => resolveAutoChangeStatus(change) === 'new');

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
        backgroundImageUrl: pageModel?.cleanLayer || originalImage,
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

  const handleMarkSeen = (changeId: string) => {
    useEditorStore.setState((state) => {
      if (!state.pageModel) {
        return state;
      }

      return {
        pageModel: {
          ...state.pageModel,
          autoChanges: state.pageModel.autoChanges?.map((change) => (
            change.id === changeId && resolveAutoChangeStatus(change) === 'new'
              ? { ...change, status: 'seen' }
              : change
          )),
        },
      };
    });
  };

  const handleRevertAutoChange = (changeId: string) => {
    useEditorStore.setState((state) => {
      if (!state.pageModel) {
        return state;
      }

      return {
        pageModel: updatePageModelAutoChanges(state.pageModel, changeId, (change) => ({
          ...change,
          applied: false,
          reverted: true,
          status: 'reverted',
        })),
      };
    });
  };

  return (
    <div className="relative flex items-center justify-between border-b bg-white px-6 py-4">
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
              <Button
                variant={editorMode === 'roi' && pendingRoiAction === 'local-repair' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleRoiAction('local-repair')}
                disabled={!pageModel}
              >
                Local repair
              </Button>
              <Button
                variant={editorMode === 'roi' && pendingRoiAction === 'ai-repair' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleRoiAction('ai-repair')}
                disabled={!pageModel}
              >
                AI repair
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
                  <SelectItem value="auto" disabled={!pageModel?.cleanLayer}>{t('toolbar.previewAuto')}</SelectItem>
                  <SelectItem value="current">{t('toolbar.previewCurrent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div ref={autoChangesRef} className="relative">
              <Button
                variant={isAutoChangesOpen ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsAutoChangesOpen((open) => !open)}
                disabled={autoChanges.length === 0}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                {t('toolbar.autoChanges')}
                {unseenAutoChanges.length > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {unseenAutoChanges.length}
                  </span>
                )}
              </Button>

              {isAutoChangesOpen && (
                <div className="absolute right-0 top-full z-20 mt-2">
                  <AutoChangesPanel
                    autoChanges={autoChanges}
                    onRevert={handleRevertAutoChange}
                    onMarkSeen={handleMarkSeen}
                  />
                </div>
              )}
            </div>

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
