"use client";

import React, { useEffect, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Eye, EyeOff, Palette, RotateCcw, Square, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { FontSelector } from './FontSelector';
import { useEditorStore } from '@/store/editorStore';
import { sampleRegionStyle } from '@/lib/color-sampler';
import { rgbToHex, hexToRgb } from '@/lib/fabric-utils';
import { fitTextLayoutToBox } from '@/lib/text-layout';
import { RGBColor } from '@/types/ocr';
import { useI18n } from '@/lib/i18n';

export function TextControls() {
  const {
    selectedElementId,
    pageModel,
    originalImage,
    updateElement,
    toggleShowBackground,
    toggleShowText,
    resetElement,
  } = useEditorStore();
  const { t } = useI18n();

  const selectedElement = selectedElementId !== null
    ? pageModel?.regions.find((region) => region.id === selectedElementId) ?? null
    : null;

  const [localText, setLocalText] = useState('');
  const [localFontSize, setLocalFontSize] = useState(20);
  const [localFontSizeInput, setLocalFontSizeInput] = useState('20');
  const [localFontFamily, setLocalFontFamily] = useState('Noto Sans SC');
  const [localFontColor, setLocalFontColor] = useState<RGBColor>({ r: 0, g: 0, b: 0 });
  const [localBgColor, setLocalBgColor] = useState<RGBColor>({ r: 255, g: 255, b: 255 });
  const [isResamplingColors, setIsResamplingColors] = useState(false);

  useEffect(() => {
    if (!selectedElement) return;

    setLocalText(selectedElement.text);
    setLocalFontSize(selectedElement.fontSize);
    setLocalFontSizeInput(String(Math.round(selectedElement.fontSize)));
    setLocalFontFamily(selectedElement.fontFamily);
    setLocalFontColor(selectedElement.fontColor);
    setLocalBgColor(selectedElement.bgColor ?? { r: 255, g: 255, b: 255 });
  }, [selectedElement]);

  if (!selectedElement) {
    return (
      <div className="p-6 text-center text-gray-500">
        <p>{t('controls.selectHint')}</p>
      </div>
    );
  }

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

  const handleBgColorChange = (hexColor: string) => {
    const newColor = hexToRgb(hexColor);
    setLocalBgColor(newColor);
    updateElement(selectedElement.id, {
      bgColor: newColor,
      bgMode: 'manual',
    });
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

      if (selectedElement.bgMode !== 'manual') {
        updates.bgColor = sampledStyle.bgColor;
        setLocalBgColor(sampledStyle.bgColor);
      }

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

  const handleToggleShowBackground = () => {
    if (selectedElementId !== null) {
      toggleShowBackground(selectedElementId);
    }
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {t('controls.editText')} [{selectedElement.id}]
        </h3>
      </div>

      <div className="space-y-2">
        <Label>{t('controls.visibility')}</Label>
        <div className="flex gap-2">
          <Button
            variant={selectedElement.showBackground ? 'default' : 'outline'}
            className="flex-1"
            onClick={handleToggleShowBackground}
          >
            <Square className="w-4 h-4 mr-2" />
            {t('controls.showBackground')}
          </Button>
          <Button
            variant={selectedElement.showText ? 'default' : 'outline'}
            className="flex-1"
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

      {selectedElement.showBackground && (
        <div className="space-y-2">
          <Label htmlFor="bg-color">{t('controls.bgColor')}</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="bg-color"
              value={rgbToHex(localBgColor)}
              onChange={(e) => handleBgColorChange(e.target.value)}
              className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
            />
            <Input
              value={rgbToHex(localBgColor).toUpperCase()}
              onChange={(e) => handleBgColorChange(e.target.value)}
              className="flex-1 font-mono"
              placeholder="#FFFFFF"
            />
          </div>
        </div>
      )}

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
