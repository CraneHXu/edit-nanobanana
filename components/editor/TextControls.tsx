"use client";

import React, { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Eye, EyeOff, Palette, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FontSelector } from './FontSelector';
import { useEditorStore } from '@/store/editorStore';
import { inpaintRegion, mergePatchIntoImage } from '@/lib/api-client';
import { generateCleanBackground } from '@/lib/clean-background';
import { sampleRegionStyle } from '@/lib/color-sampler';
import { isAiEnabled } from '@/lib/deploy-target';
import { rgbToHex, hexToRgb } from '@/lib/fabric-utils';
import { fitTextLayoutToBox } from '@/lib/text-layout';
import { BoundingBox, RGBColor } from '@/types/ocr';
import { useI18n } from '@/lib/i18n';

function clampBounds(bounds: BoundingBox, width: number, height: number): BoundingBox | null {
  const x = Math.max(0, Math.floor(bounds.x));
  const y = Math.max(0, Math.floor(bounds.y));
  const right = Math.min(width, Math.ceil(bounds.x + bounds.width));
  const bottom = Math.min(height, Math.ceil(bounds.y + bounds.height));

  if (right <= x || bottom <= y) {
    return null;
  }

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

async function loadImageElement(imageDataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = imageDataUrl;
  });
}

async function cropImageAsset(
  imageDataUrl: string,
  bounds: BoundingBox,
  fileName: string,
): Promise<{ dataUrl: string; file: File }> {
  const image = await loadImageElement(imageDataUrl);
  const crop = clampBounds(bounds, image.width, image.height);
  if (!crop) {
    throw new Error('Selected region does not intersect the image bounds');
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create crop canvas context');
  }

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  const file = await new Promise<File>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to build crop blob'));
        return;
      }

      resolve(new File([blob], fileName, { type: 'image/png' }));
    }, 'image/png');
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    file,
  };
}

function patchesOverlap(regionIds: number[], patchRegionIds: number[]): boolean {
  return regionIds.some((regionId) => patchRegionIds.includes(regionId));
}

async function composePendingPreviewLayer(
  baseLayer: string,
  pageModel: NonNullable<ReturnType<typeof useEditorStore.getState>['pageModel']>,
  skipRegionIds: number[],
): Promise<string> {
  let nextLayer = baseLayer;
  const pageSize = {
    width: pageModel.originalWidth,
    height: pageModel.originalHeight,
  };

  const pendingPatches = [...(pageModel.autoChanges ?? [])]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((change) => change.patch)
    .filter((patch): patch is NonNullable<typeof patch> => (
      !!patch?.imageDataUrl
      && !!patch.crop
      && !patchesOverlap(skipRegionIds, patch.regionIds)
    ));

  for (const patch of pendingPatches) {
    nextLayer = await mergePatchIntoImage(nextLayer, patch.imageDataUrl!, patch.crop!, pageSize);
  }

  return nextLayer;
}

export function TextControls() {
  const {
    selectedElementId,
    pageModel,
    originalImage,
    baseAutoLayer,
    updateElement,
    deleteElement,
    toggleShowText,
    resetElement,
    applyPatch,
    applyAutoPatch,
    confirmAutoChange,
    discardAutoChange,
    setPreviewMode,
  } = useEditorStore();
  const { t } = useI18n();
  const aiEnabled = isAiEnabled();

  const selectedElement = selectedElementId !== null
    ? pageModel?.regions.find((region) => region.id === selectedElementId && !region.removed) ?? null
    : null;

  const [localText, setLocalText] = useState('');
  const [localFontSize, setLocalFontSize] = useState(20);
  const [localFontSizeInput, setLocalFontSizeInput] = useState('20');
  const [localFontFamily, setLocalFontFamily] = useState('Noto Sans SC');
  const [localFontColor, setLocalFontColor] = useState<RGBColor>({ r: 0, g: 0, b: 0 });
  const [isResamplingColors, setIsResamplingColors] = useState(false);
  const [repairMode, setRepairMode] = useState<'local-repair' | 'ai-repair' | null>(null);
  const [pendingAutoChangeAction, setPendingAutoChangeAction] = useState<'confirm' | 'discard' | null>(null);

  useEffect(() => {
    if (!selectedElement) return;

    setLocalText(selectedElement.text);
    setLocalFontSize(selectedElement.fontSize);
    setLocalFontSizeInput(String(Math.round(selectedElement.fontSize)));
    setLocalFontFamily(selectedElement.fontFamily);
    setLocalFontColor(selectedElement.fontColor);
  }, [selectedElement]);

  if (!selectedElement) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>{t('controls.selectHint')}</p>
      </div>
    );
  }

  // Some OCR imports omit `source`; the sidebar treats that as OCR, so TextControls should too.
  const isOcrRegion = selectedElement.source == null || selectedElement.source === 'ocr' || selectedElement.source === 'roi_ocr';
  const pendingAutoAiChange = aiEnabled ? (pageModel?.autoChanges ?? [])
    .filter((change) => (change.status ?? 'seen') === 'new')
    .filter((change) => change.patchKind === 'auto_ai')
    .filter((change) => change.regionIds.includes(selectedElement.id))
    .sort((left, right) => left.createdAt - right.createdAt)[0] ?? null : null;

  const handleTextChange = (newText: string) => {
    setLocalText(newText);
    updateElement(selectedElement.id, { text: newText });
  };

  const handleFontChange = async (newFont: string) => {
    const layout = await fitTextLayoutToBox(
      selectedElement.text,
      selectedElement.bbox,
      newFont,
      selectedElement.fontWeight,
    );

    setLocalFontFamily(newFont);
    setLocalFontSize(layout.fontSize);
    setLocalFontSizeInput(String(Math.round(layout.fontSize)));
    updateElement(selectedElement.id, {
      fontFamily: newFont,
      fontSize: layout.fontSize,
      layoutOffsetY: layout.layoutOffsetY,
    });
  };

  const handleFontSizeChange = (value: number[]) => {
    const newSize = value[0];
    setLocalFontSize(newSize);
    setLocalFontSizeInput(String(Math.round(newSize)));
    updateElement(selectedElement.id, { fontSize: newSize });
  };

  const handleFontSizeInputChange = (value: string) => {
    setLocalFontSizeInput(value);
  };

  const handleFontSizeInputBlur = () => {
    const parsed = parseInt(localFontSizeInput, 10);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 500) {
      handleFontSizeChange([parsed]);
      return;
    }

    setLocalFontSizeInput(String(Math.round(localFontSize)));
  };

  const handleFontSizeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFontSizeInputBlur();
    }
  };

  const handleFontColorChange = (hexColor: string) => {
    const newColor = hexToRgb(hexColor);
    setLocalFontColor(newColor);
    updateElement(selectedElement.id, {
      fontColor: newColor,
      textColorMode: 'manual',
    });
  };

  const handleFontWeightChange = async () => {
    const nextWeight = selectedElement.fontWeight === 'bold' ? 'normal' : 'bold';
    const layout = await fitTextLayoutToBox(
      selectedElement.text,
      selectedElement.bbox,
      selectedElement.fontFamily,
      nextWeight,
    );

    setLocalFontSize(layout.fontSize);
    setLocalFontSizeInput(String(Math.round(layout.fontSize)));
    updateElement(selectedElement.id, {
      fontWeight: nextWeight,
      fontSize: layout.fontSize,
      layoutOffsetY: layout.layoutOffsetY,
    });
  };

  const handleTextAlignChange = (textAlign: 'left' | 'center' | 'right') => {
    updateElement(selectedElement.id, { textAlign });
  };

  const handleRefreshAutoColors = async () => {
    if (!originalImage || selectedElement.textColorMode !== 'auto') {
      return;
    }

    setIsResamplingColors(true);
    try {
      const sampledStyle = await sampleRegionStyle(originalImage, {
        text: selectedElement.text,
        bounds: selectedElement.sourceBounds,
        fontWeight: selectedElement.fontWeight,
        textAlign: selectedElement.textAlign,
      });
      const updates: Parameters<typeof updateElement>[1] = {
        textColorRaw: sampledStyle.textColorRaw,
        textColorQuantized: sampledStyle.textColorQuantized,
        fontColor: sampledStyle.textColorRaw,
      };

      setLocalFontColor(sampledStyle.textColorRaw);
      updates.bgColor = sampledStyle.bgColor;

      updateElement(selectedElement.id, updates);
    } catch (error) {
      console.error('Failed to resample colors:', error);
      alert(`${t('controls.refreshAutoColor')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsResamplingColors(false);
    }
  };

  const handleUseAutoTextColor = () => {
    setLocalFontColor(selectedElement.textColorRaw);
    updateElement(selectedElement.id, {
      fontColor: selectedElement.textColorRaw,
      textColorMode: 'auto',
    });
  };

  const handleToggleShowText = () => {
    if (selectedElementId !== null) {
      toggleShowText(selectedElementId);
    }
  };

  const handleReset = () => {
    if (selectedElementId !== null) {
      resetElement(selectedElementId);
    }
  };

  const handleDelete = async () => {
    if (selectedElementId !== null) {
      await deleteElement(selectedElementId);
    }
  };

  const handleRepairRegion = async (action: 'local-repair' | 'ai-repair') => {
    if (!selectedElement || !pageModel || !originalImage) {
      return;
    }

    const pageSize = {
      width: pageModel.originalWidth,
      height: pageModel.originalHeight,
    };
    const confirmedBaseLayer = baseAutoLayer ?? pageModel.cleanLayer ?? originalImage;
    const targetBounds = selectedElement.sourceBounds;
    const createdAt = Date.now();

    setRepairMode(action);
    try {
      if (action === 'local-repair') {
        const cleanLayer = await generateCleanBackground(originalImage, pageModel);
        useEditorStore.setState((state) => {
          if (!state.pageModel) {
            return state;
          }

          return {
            pageModel: {
              ...state.pageModel,
              cleanLayer,
            },
          };
        });

        const patchAsset = await cropImageAsset(cleanLayer, targetBounds, `region-${selectedElement.id}-local-repair.png`);
        const nextConfirmedLayer = await mergePatchIntoImage(confirmedBaseLayer, patchAsset.dataUrl, targetBounds, pageSize);
        const nextLayer = await composePendingPreviewLayer(nextConfirmedLayer, pageModel, [selectedElement.id]);

        applyPatch({
          id: `local-clean-${selectedElement.id}-${createdAt}`,
          kind: 'local_clean',
          regionIds: [selectedElement.id],
          roiId: `region-${selectedElement.id}`,
          previewMode: 'current',
          createdAt,
          applied: true,
          reverted: false,
          description: `Local repair for region ${selectedElement.id}`,
          crop: targetBounds,
          imageDataUrl: patchAsset.dataUrl,
        }, nextLayer);
        setPreviewMode('current');
        return;
      }

      const response = await inpaintRegion({
        imageDataUrl: confirmedBaseLayer,
        source: confirmedBaseLayer === originalImage ? 'original' : 'cleanLayer',
        sourceBounds: targetBounds,
        sourcePolygon: selectedElement.sourcePolygon,
        pageSize,
      });
      const patchImage = response.patch ?? response.imageDataUrl;
      const patchCrop = response.crop ?? targetBounds;
      if (!patchImage) {
        throw new Error('AI repair returned no patch image');
      }

      const previewBaseLayer = await composePendingPreviewLayer(confirmedBaseLayer, pageModel, [selectedElement.id]);
      const nextLayer = await mergePatchIntoImage(previewBaseLayer, patchImage, patchCrop, pageSize);
      const patchId = response.patchId ?? `auto-ai-${selectedElement.id}-${createdAt}`;
      const patch = {
        id: patchId,
        kind: 'auto_ai' as const,
        regionIds: [selectedElement.id],
        crop: patchCrop,
        imageDataUrl: patchImage,
        roiId: `region-${selectedElement.id}`,
        previewMode: 'current' as const,
        createdAt,
        applied: true,
        reverted: false,
        description: `AI repair for region ${selectedElement.id}`,
      };

      applyAutoPatch(patch, {
        id: `change-${patchId}`,
        patchId,
        patchKind: patch.kind,
        previewMode: patch.previewMode,
        regionIds: patch.regionIds,
        createdAt,
        applied: true,
        reverted: false,
        description: patch.description,
        status: 'new',
        patch,
      }, nextLayer);
      setPreviewMode('current');
    } catch (error) {
      console.error('Failed to repair selected region:', error);
      alert(`${action === 'ai-repair' ? 'AI repair' : 'Local repair'} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setRepairMode(null);
    }
  };

  const handleConfirmPendingAutoChange = async () => {
    if (!pendingAutoAiChange) return;
    setPendingAutoChangeAction('confirm');
    try {
      await confirmAutoChange(pendingAutoAiChange.id);
    } catch (error) {
      console.error('Failed to confirm auto change:', error);
      alert(`${t('toolbar.confirmAutoChange')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPendingAutoChangeAction(null);
    }
  };

  const handleDiscardPendingAutoChange = async () => {
    if (!pendingAutoAiChange) return;
    setPendingAutoChangeAction('discard');
    try {
      await discardAutoChange(pendingAutoAiChange.id);
    } catch (error) {
      console.error('Failed to discard auto change:', error);
      alert(`${t('toolbar.discardAutoChange')}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setPendingAutoChangeAction(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {t('controls.editText')} [{selectedElement.id}]
        </h3>
        <p className="text-xs text-gray-500">
          {t('controls.deleteRegionHint')}
        </p>
      </div>

      {(pendingAutoAiChange || isOcrRegion) && (
        <div
          className="rounded-lg border bg-slate-50 p-3 space-y-3"
          data-testid="textcontrols-top-actions"
        >
          {aiEnabled && pendingAutoAiChange && (
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">{t('controls.pendingAiRepair')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="default"
                  onClick={() => {
                    void handleConfirmPendingAutoChange();
                  }}
                  disabled={pendingAutoChangeAction !== null}
                >
                  {pendingAutoChangeAction === 'confirm' ? t('toolbar.refreshingCleanBackground') : t('toolbar.confirmAutoChange')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleDiscardPendingAutoChange();
                  }}
                  disabled={pendingAutoChangeAction !== null}
                >
                  {pendingAutoChangeAction === 'discard' ? t('toolbar.refreshingCleanBackground') : t('toolbar.discardAutoChange')}
                </Button>
              </div>
            </div>
          )}

          {isOcrRegion && (
            <div className={`grid gap-2 ${aiEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  void handleRepairRegion('local-repair');
                }}
                disabled={!pageModel || repairMode !== null}
              >
                {repairMode === 'local-repair' ? t('toolbar.refreshingCleanBackground') : t('controls.localRepair')}
              </Button>
              {aiEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void handleRepairRegion('ai-repair');
                  }}
                  disabled={!pageModel || repairMode !== null}
                >
                  {repairMode === 'ai-repair' ? t('toolbar.refreshingCleanBackground') : t('controls.aiRepair')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>{t('controls.visibility')}</Label>
        <div className="flex gap-2">
          <Button
            variant={selectedElement.showText ? 'default' : 'outline'}
            className="w-full"
            onClick={handleToggleShowText}
          >
            {selectedElement.showText ? (
              <Eye className="w-4 h-4 mr-2" />
            ) : (
              <EyeOff className="w-4 h-4 mr-2" />
            )}
            {t('controls.showText')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="text-input">{t('controls.textContent')}</Label>
        <Input
          id="text-input"
          value={localText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={t('controls.enterText')}
          disabled={!selectedElement.showText}
        />
      </div>

      <FontSelector
        value={localFontFamily}
        onValueChange={handleFontChange}
        disabled={!selectedElement.showText}
      />

      <div className="space-y-2">
        <Label>{t('controls.fontWeight')}</Label>
        <Button
          type="button"
          variant={selectedElement.fontWeight === 'bold' ? 'default' : 'outline'}
          className="w-full"
          onClick={handleFontWeightChange}
          disabled={!selectedElement.showText}
        >
          <Bold className="w-4 h-4 mr-2" />
          {t('controls.bold')}
        </Button>
      </div>

      <div className="space-y-2">
        <Label>{t('controls.textAlign')}</Label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant={selectedElement.textAlign === 'left' ? 'default' : 'outline'}
            onClick={() => handleTextAlignChange('left')}
            disabled={!selectedElement.showText}
          >
            <AlignLeft className="w-4 h-4 mr-2" />
            {t('controls.alignLeft')}
          </Button>
          <Button
            type="button"
            variant={selectedElement.textAlign === 'center' ? 'default' : 'outline'}
            onClick={() => handleTextAlignChange('center')}
            disabled={!selectedElement.showText}
          >
            <AlignCenter className="w-4 h-4 mr-2" />
            {t('controls.alignCenter')}
          </Button>
          <Button
            type="button"
            variant={selectedElement.textAlign === 'right' ? 'default' : 'outline'}
            onClick={() => handleTextAlignChange('right')}
            disabled={!selectedElement.showText}
          >
            <AlignRight className="w-4 h-4 mr-2" />
            {t('controls.alignRight')}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t('controls.fontSize')}</Label>
          <div className="flex items-center gap-1">
            <Input
              type="text"
              inputMode="numeric"
              value={localFontSizeInput}
              onChange={(e) => handleFontSizeInputChange(e.target.value)}
              onBlur={handleFontSizeInputBlur}
              onKeyDown={handleFontSizeInputKeyDown}
              className="w-16 h-7 text-sm text-center px-2"
              disabled={!selectedElement.showText}
            />
            <span className="text-sm text-muted-foreground">px</span>
          </div>
        </div>
        <Slider
          value={[localFontSize]}
          onValueChange={handleFontSizeChange}
          min={8}
          max={200}
          step={1}
          disabled={!selectedElement.showText}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="font-color">{t('controls.fontColor')}</Label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            id="font-color"
            value={rgbToHex(localFontColor)}
            onChange={(e) => handleFontColorChange(e.target.value)}
            className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            disabled={!selectedElement.showText}
          />
          <Input
            value={rgbToHex(localFontColor).toUpperCase()}
            onChange={(e) => handleFontColorChange(e.target.value)}
            className="flex-1 font-mono"
            placeholder="#000000"
            disabled={!selectedElement.showText}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleRefreshAutoColors}
            disabled={!selectedElement.showText || selectedElement.textColorMode !== 'auto' || isResamplingColors}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {isResamplingColors ? t('controls.resampling') : t('controls.refreshAutoColor')}
          </Button>
          <Button
            type="button"
            variant={selectedElement.textColorMode === 'auto' ? 'default' : 'outline'}
            onClick={handleUseAutoTextColor}
            disabled={!selectedElement.showText || selectedElement.textColorMode === 'auto'}
          >
            <Palette className="w-4 h-4 mr-2" />
            {t('controls.useAutoColor')}
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          {selectedElement.textColorMode === 'auto'
            ? t('controls.autoColorMode')
            : t('controls.manualColorMode')}
        </p>
      </div>

      <div className="space-y-2 pt-2 border-t">
        <Label className="text-xs text-gray-500">{t('controls.detectedColors')}</Label>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: rgbToHex(selectedElement.textColorRaw) }}
            />
            <span>{t('controls.detectedTextRaw')}</span>
          </div>
          {selectedElement.textColorQuantized && (
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded border"
                style={{ backgroundColor: rgbToHex(selectedElement.textColorQuantized) }}
              />
              <span>{t('controls.detectedTextQuantized')}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded border"
                style={{ backgroundColor: rgbToHex(selectedElement.bgColor ?? { r: 255, g: 255, b: 255 }) }}
              />
              <span>{t('controls.detectedBackground')}</span>
            </div>
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t">
        <Button
          variant="destructive"
          className="w-full"
          onClick={() => {
            void handleDelete();
          }}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {t('controls.deleteRegion')}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleReset}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          {t('controls.resetToOriginal')}
        </Button>
      </div>
    </div>
  );
}
