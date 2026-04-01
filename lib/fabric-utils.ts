/**
 * Fabric.js canvas utilities for the model-driven editor.
 */

import { BoundingBox, RGBColor } from '@/types/ocr';
import { TEXTBOX_LINE_HEIGHT } from '@/lib/text-layout';
import type { TextElement } from '@/types/canvas';
import type { Canvas, Rect, Textbox } from 'fabric';

export const BACKGROUND_EXPAND_FACTOR = 0.1;

export function rgbToString(color: RGBColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function rgbToHex(color: RGBColor): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function hexToRgb(hex: string): RGBColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

export function scaleBoundingBox(bounds: BoundingBox, scale: number): BoundingBox {
  return {
    x: bounds.x * scale,
    y: bounds.y * scale,
    width: bounds.width * scale,
    height: bounds.height * scale,
  };
}

export function expandBoundingBox(bounds: BoundingBox): BoundingBox {
  const expandX = bounds.width * BACKGROUND_EXPAND_FACTOR;
  const expandY = bounds.height * BACKGROUND_EXPAND_FACTOR;

  return {
    x: bounds.x - expandX,
    y: bounds.y - expandY,
    width: bounds.width + expandX * 2,
    height: bounds.height + expandY * 2,
  };
}

function refreshTextboxLayout(textObj: Textbox): void {
  (textObj as any).dirty = true;
  if (typeof (textObj as any)._clearCache === 'function') {
    (textObj as any)._clearCache();
  }
  if (typeof (textObj as any).initDimensions === 'function') {
    (textObj as any).initDimensions();
  }
  textObj.setCoords();
}

export function createTextObject(
  fabric: typeof import('fabric'),
  region: TextElement,
  scale: number,
): Textbox {
  const textObj = new fabric.Textbox(region.text, {
    selectable: true,
    hasControls: true,
    hasBorders: true,
    lockRotation: true,
    splitByGrapheme: true,
  });

  textObj.set('data', {
    elementId: region.id,
  });

  syncTextObject(textObj, region, scale);
  return textObj;
}

export function createBackgroundRect(
  fabric: typeof import('fabric'),
  region: TextElement,
  scale: number,
): Rect {
  const rect = new fabric.Rect({
    selectable: false,
    evented: false,
  });

  syncBackgroundRect(rect, region, scale);
  return rect;
}

export function syncTextObject(textObj: Textbox, region: TextElement, scale: number): void {
  const bounds = scaleBoundingBox(region.bbox, scale);

  textObj.set({
    left: bounds.x,
    top: bounds.y,
    width: Math.max(1, bounds.width),
    text: region.text,
    fontFamily: region.fontFamily,
    fontWeight: region.fontWeight,
    textAlign: region.textAlign,
    fontSize: Math.max(1, region.fontSize * scale),
    lineHeight: TEXTBOX_LINE_HEIGHT,
    fill: rgbToString(region.fontColor),
    visible: region.showText,
    scaleX: 1,
    scaleY: 1,
    angle: 0,
  });

  refreshTextboxLayout(textObj);
}

export function syncBackgroundRect(rect: Rect, region: TextElement, scale: number): void {
  const fillColor = region.bgColor ?? { r: 255, g: 255, b: 255 };
  const bounds = scaleBoundingBox(expandBoundingBox(region.original.bbox), scale);

  rect.set({
    left: bounds.x,
    top: bounds.y,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
    fill: rgbToString(fillColor),
    visible: region.showBackground,
  });
  rect.setCoords();
}

export function exportCanvasAsPNG(
  canvas: Canvas,
  scale: number = 1,
  filename: string = 'edited-image.png'
): void {
  if (!canvas) {
    throw new Error('Canvas is not initialized');
  }

  const multiplier = scale > 0 ? 1 / scale : 1;

  const dataURL = canvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: multiplier,
  });

  const link = document.createElement('a');
  link.download = filename;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
