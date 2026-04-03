/**
 * Fabric.js canvas utilities for the model-driven editor.
 */

import { BoundingBox, RGBColor } from '@/types/ocr';
import { shouldUseTextbox, TEXTBOX_LINE_HEIGHT } from '@/lib/text-layout';
import type { TextElement } from '@/types/canvas';
import type { Canvas, IText, Textbox } from 'fabric';

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

export function degreesToRadians(angle: number): number {
  return angle * (Math.PI / 180);
}

export function projectLocalOffset(offsetX: number, offsetY: number, angle: number): { x: number; y: number } {
  const radians = degreesToRadians(angle);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: offsetX * cos - offsetY * sin,
    y: offsetX * sin + offsetY * cos,
  };
}

export function getTextAnchorPoint(region: TextElement, scale: number): { left: number; top: number } {
  const bounds = scaleBoundingBox(region.bbox, scale);
  const offset = projectLocalOffset(0, region.layoutOffsetY * scale, region.rotation);

  return {
    left: bounds.x + offset.x,
    top: bounds.y + offset.y,
  };
}

export type FabricTextObject = Textbox | IText;

function refreshTextboxLayout(textObj: FabricTextObject): void {
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
): FabricTextObject {
  const multiline = region.source === 'manual' || shouldUseTextbox(region.text);
  const textObj = multiline
    ? new fabric.Textbox(region.text, {
        selectable: true,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        splitByGrapheme: true,
        originX: 'left',
        originY: 'top',
        centeredRotation: false,
        padding: 0,
      })
    : new fabric.IText(region.text, {
        selectable: true,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        originX: 'left',
        originY: 'top',
        centeredRotation: false,
      });

  textObj.set('data', {
    elementId: region.id,
    multiline,
  });

  syncTextObject(textObj, region, scale);
  return textObj;
}

export function syncTextObject(textObj: FabricTextObject, region: TextElement, scale: number): void {
  const bounds = scaleBoundingBox(region.bbox, scale);
  const anchor = getTextAnchorPoint(region, scale);
  const multiline = region.source === 'manual' || shouldUseTextbox(region.text);
  const fixedManualBox = region.source === 'manual';

  textObj.set({
    left: anchor.left,
    top: anchor.top,
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
    angle: region.rotation,
    originX: 'left',
    originY: 'top',
    centeredRotation: false,
  });

  if (multiline) {
    textObj.set({
      width: Math.max(1, bounds.width),
      padding: 0,
    });
  }

  refreshTextboxLayout(textObj);

  if (fixedManualBox) {
    textObj.set({
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height),
    });
    textObj.setCoords();
  }
}

interface ExportCanvasOptions {
  filename?: string;
  backgroundImageUrl?: string | null;
}

function getAlignedBackgroundProps(referenceImage: any, fallbackScale: number) {
  return {
    scaleX: typeof referenceImage?.scaleX === 'number' ? referenceImage.scaleX : fallbackScale,
    scaleY: typeof referenceImage?.scaleY === 'number' ? referenceImage.scaleY : fallbackScale,
    left: typeof referenceImage?.left === 'number' ? referenceImage.left : 0,
    top: typeof referenceImage?.top === 'number' ? referenceImage.top : 0,
    angle: typeof referenceImage?.angle === 'number' ? referenceImage.angle : 0,
    originX: referenceImage?.originX ?? 'left',
    originY: referenceImage?.originY ?? 'top',
    flipX: referenceImage?.flipX ?? false,
    flipY: referenceImage?.flipY ?? false,
    skewX: typeof referenceImage?.skewX === 'number' ? referenceImage.skewX : 0,
    skewY: typeof referenceImage?.skewY === 'number' ? referenceImage.skewY : 0,
  };
}

async function loadBackgroundImage(imageUrl: string, scale: number, referenceImage?: any): Promise<any> {
  const fabric = await import('fabric');
  const image = await fabric.FabricImage.fromURL(imageUrl);
  image.set(getAlignedBackgroundProps(referenceImage, scale));
  return image;
}

export async function exportCanvasAsPNG(
  canvas: Canvas,
  scale: number = 1,
  options: ExportCanvasOptions = {},
): Promise<void> {
  if (!canvas) {
    throw new Error('Canvas is not initialized');
  }

  const {
    filename = 'edited-image.png',
    backgroundImageUrl = null,
  } = options;

  const multiplier = scale > 0 ? 1 / scale : 1;
  const originalBackgroundImage = canvas.backgroundImage;

  try {
    if (backgroundImageUrl) {
      canvas.backgroundImage = await loadBackgroundImage(backgroundImageUrl, scale, originalBackgroundImage);
    }

    canvas.renderAll();

    const dataURL = canvas.toDataURL({
      format: 'png',
      quality: 1,
      multiplier,
    });

    const link = document.createElement('a');
    link.download = filename;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    canvas.backgroundImage = originalBackgroundImage;
    canvas.renderAll();
  }
}
