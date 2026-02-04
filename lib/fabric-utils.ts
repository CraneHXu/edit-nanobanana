/**
 * Fabric.js Canvas Utility Functions (v6 API)
 * For image text editor - creates text overlays for editing
 */

import { OCRDetection, RGBColor } from '@/types/ocr';
import type { Rect, Group, Canvas, FabricText, Textbox } from 'fabric';

/**
 * Convert RGB color object to CSS string
 */
export function rgbToString(color: RGBColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

/**
 * Convert RGB color to hex string
 */
export function rgbToHex(color: RGBColor): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

/**
 * Convert hex string to RGB color
 */
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

/**
 * Create a text-only object for editing (no background)
 * The text is positioned at the detection location and can be dragged/edited
 * Uses Textbox for multi-line text wrapping support
 */
export function createTextObject(
  fabric: typeof import('fabric'),
  detection: OCRDetection,
  fontFamily: string = 'Arial'
): Textbox {
  const { bounds, text, textColor, fontSize } = detection;

  // Create textbox object with width constraint for text wrapping
  const textObj = new fabric.Textbox(text, {
    fontSize: fontSize,
    fill: rgbToString(textColor),
    fontFamily: fontFamily,
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    selectable: true,
    hasControls: true,
    hasBorders: true,
    splitByGrapheme: true, // Better wrapping for CJK characters
  });

  // Store detection data as metadata
  textObj.set('data', {
    detectionIndex: detection.index,
    originalText: text,
    originalFontSize: fontSize,
    originalBounds: bounds,
    bgColor: detection.bgColor,
    textColor: detection.textColor,
  });

  return textObj;
}

/**
 * Create a background rect to cover original text
 * Used when exporting with "cover original" option
 */
export function createBackgroundRect(
  fabric: typeof import('fabric'),
  bounds: { x: number; y: number; width: number; height: number },
  bgColor: RGBColor
): Rect {
  // Expand bounds slightly to fully cover original text
  const expandFactor = 0.1;
  const expandX = bounds.width * expandFactor;
  const expandY = bounds.height * expandFactor;

  const rect = new fabric.Rect({
    left: bounds.x - expandX,
    top: bounds.y - expandY,
    width: bounds.width + expandX * 2,
    height: bounds.height + expandY * 2,
    fill: rgbToString(bgColor),
    selectable: false,
    evented: false,
  });

  return rect;
}

/**
 * Update background rect color
 */
export function updateBackgroundRectColor(
  rect: Rect,
  color: RGBColor
): void {
  rect.set({ fill: rgbToString(color) });
}

/**
 * Update text content in a fabric text object
 */
export function updateTextContent(
  textObj: FabricText,
  newText: string
): void {
  textObj.set({ text: newText });
  textObj.setCoords();
}

/**
 * Update font family in a fabric text object
 */
export function updateTextFont(
  textObj: FabricText,
  fontFamily: string
): void {
  textObj.set({ fontFamily });
  // Force fabric to recalculate text dimensions with new font
  (textObj as any).dirty = true;
  // Clear any cached rendering
  if (typeof (textObj as any)._clearCache === 'function') {
    (textObj as any)._clearCache();
  }
  if (typeof (textObj as any).initDimensions === 'function') {
    (textObj as any).initDimensions();
  }
  textObj.setCoords();
}

/**
 * Update font size in a fabric text object
 */
export function updateTextFontSize(
  textObj: FabricText,
  fontSize: number
): void {
  textObj.set({ fontSize });
  textObj.setCoords();
}

/**
 * Update text color in a fabric text object
 */
export function updateTextColor(
  textObj: FabricText,
  color: RGBColor
): void {
  textObj.set({ fill: rgbToString(color) });
  textObj.setCoords();
}

/**
 * Update all text properties at once
 */
export function updateTextProperties(
  textObj: FabricText,
  options: {
    text?: string;
    fontFamily?: string;
    fontSize?: number;
    color?: RGBColor;
  }
): void {
  if (options.text !== undefined) textObj.set({ text: options.text });
  if (options.fontFamily !== undefined) textObj.set({ fontFamily: options.fontFamily });
  if (options.fontSize !== undefined) textObj.set({ fontSize: options.fontSize });
  if (options.color !== undefined) textObj.set({ fill: rgbToString(options.color) });
  textObj.setCoords();
}

/**
 * Export canvas as PNG with original resolution
 * Background rects are already on canvas for elements in 'replace' mode
 * @param canvas - The fabric canvas
 * @param scale - The display scale factor (canvas was scaled down by this factor)
 * @param filename - Output filename
 */
export function exportCanvasAsPNG(
  canvas: Canvas,
  scale: number = 1,
  filename: string = 'edited-image.png'
): void {
  if (!canvas) {
    throw new Error('Canvas is not initialized');
  }

  // Use 1/scale as multiplier to restore original resolution
  const multiplier = scale > 0 ? 1 / scale : 1;

  const dataURL = canvas.toDataURL({
    format: 'png',
    quality: 1,
    multiplier: multiplier,
  });

  // Create download link
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
