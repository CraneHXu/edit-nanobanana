"use client";

import React, { useEffect, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { FontSelector } from './FontSelector';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RotateCcw, Eye, EyeOff, Square, Type } from 'lucide-react';
import { updateTextContent, updateTextFont, updateTextFontSize, updateTextColor, rgbToHex, hexToRgb } from '@/lib/fabric-utils';
import { RGBColor } from '@/types/ocr';
import { useI18n } from '@/lib/i18n';

export function TextControls() {
  const {
    selectedElementId,
    textElements,
    canvas,
    updateElement,
    toggleShowBackground,
    toggleShowText,
    resetElement,
  } = useEditorStore();
  const { t } = useI18n();

  const selectedElement = selectedElementId !== null
    ? textElements.get(selectedElementId)
    : null;

  const [localText, setLocalText] = useState('');
  const [localFontSize, setLocalFontSize] = useState(20);
  const [localFontSizeInput, setLocalFontSizeInput] = useState('20');
  const [localFontFamily, setLocalFontFamily] = useState('Noto Sans SC');
  const [localFontColor, setLocalFontColor] = useState<RGBColor>({ r: 0, g: 0, b: 0 });
  const [localBgColor, setLocalBgColor] = useState<RGBColor>({ r: 255, g: 255, b: 255 });

  // Sync local state with selected element
  useEffect(() => {
    if (selectedElement) {
      setLocalText(selectedElement.text);
      setLocalFontSize(selectedElement.fontSize);
      setLocalFontSizeInput(String(Math.round(selectedElement.fontSize)));
      setLocalFontFamily(selectedElement.fontFamily);
      setLocalFontColor(selectedElement.fontColor || selectedElement.detection.textColor);
      setLocalBgColor(selectedElement.bgColor || selectedElement.detection.bgColor);
    }
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
    if (selectedElement.fabricObject && canvas) {
      updateTextContent(selectedElement.fabricObject as any, newText);
      updateElement(selectedElement.id, { text: newText });
      canvas.renderAll();
    }
  };

  const handleFontChange = (newFont: string) => {
    setLocalFontFamily(newFont);
    if (selectedElement.fabricObject && canvas) {
      updateTextFont(selectedElement.fabricObject as any, newFont);
      updateElement(selectedElement.id, { fontFamily: newFont });
      canvas.renderAll();
      // Force re-render after next frame to ensure font is applied on canvas
      requestAnimationFrame(() => {
        canvas.renderAll();
      });
    }
  };

  const handleFontSizeChange = (value: number[]) => {
    const newSize = value[0];
    setLocalFontSize(newSize);
    setLocalFontSizeInput(String(Math.round(newSize)));
    if (selectedElement.fabricObject && canvas) {
      updateTextFontSize(selectedElement.fabricObject as any, newSize);
      updateElement(selectedElement.id, { fontSize: newSize });
      canvas.renderAll();
    }
  };

  const handleFontSizeInputChange = (value: string) => {
    setLocalFontSizeInput(value);
  };

  const handleFontSizeInputBlur = () => {
    const parsed = parseInt(localFontSizeInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 500) {
      handleFontSizeChange([parsed]);
    } else {
      setLocalFontSizeInput(String(Math.round(localFontSize)));
    }
  };

  const handleFontSizeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFontSizeInputBlur();
    }
  };

  const handleFontColorChange = (hexColor: string) => {
    const newColor = hexToRgb(hexColor);
    setLocalFontColor(newColor);
    if (selectedElement.fabricObject && canvas) {
      updateTextColor(selectedElement.fabricObject as any, newColor);
      updateElement(selectedElement.id, { fontColor: newColor });
      canvas.renderAll();
    }
  };

  const handleBgColorChange = (hexColor: string) => {
    const newColor = hexToRgb(hexColor);
    setLocalBgColor(newColor);
    if (canvas) {
      updateElement(selectedElement.id, { bgColor: newColor });
      canvas.renderAll();
    }
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

      {/* Visibility Toggles */}
      <div className="space-y-2">
        <Label>{t('controls.visibility')}</Label>
        <div className="flex gap-2">
          <Button
            variant={selectedElement.showBackground ? "default" : "outline"}
            className="flex-1"
            onClick={handleToggleShowBackground}
          >
            <Square className="w-4 h-4 mr-2" />
            {t('controls.showBackground')}
          </Button>
          <Button
            variant={selectedElement.showText ? "default" : "outline"}
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

      {/* Text Input */}
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

      {/* Font Family */}
      <FontSelector
        value={localFontFamily}
        onValueChange={handleFontChange}
        disabled={!selectedElement.showText}
      />

      {/* Font Size */}
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

      {/* Font Color */}
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
      </div>

      {/* Background Color */}
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

      {/* Detected Colors Info */}
      <div className="space-y-2 pt-2 border-t">
        <Label className="text-xs text-gray-500">{t('controls.detectedColors')}</Label>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: rgbToHex(selectedElement.detection.textColor) }}
            />
            <span>{t('controls.text')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded border"
              style={{ backgroundColor: rgbToHex(selectedElement.detection.bgColor) }}
            />
            <span>{t('controls.background')}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
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
