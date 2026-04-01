import { BoundingBox } from '@/types/ocr';
import { FontWeight } from '@/types/canvas';

const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 600;
const WIDTH_PADDING = 2;
const HEIGHT_PADDING = 2;
export const TEXTBOX_LINE_HEIGHT = 1.0;

let measureCanvas: HTMLCanvasElement | null = null;
let fabricModule: typeof import('fabric') | null = null;
let fabricPromise: Promise<typeof import('fabric')> | null = null;

export interface FittedTextLayout {
  fontSize: number;
  measuredHeight: number;
  layoutOffsetY: number;
}

export function shouldUseTextbox(text: string): boolean {
  return text.includes('\n');
}

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
  }
  return measureCanvas.getContext('2d');
}

function wrapText(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  const rawLines = text.split('\n');
  const wrapped: string[] = [];

  for (const rawLine of rawLines) {
    if (!rawLine) {
      wrapped.push('');
      continue;
    }

    let currentLine = '';

    for (const char of Array.from(rawLine)) {
      const candidate = `${currentLine}${char}`;
      if (currentLine && ctx.measureText(candidate).width > maxWidth) {
        wrapped.push(currentLine);
        currentLine = char;
      } else {
        currentLine = candidate;
      }
    }

    wrapped.push(currentLine || '');
  }

  return wrapped;
}

function fitsWithinBoxWithCanvas(
  text: string,
  bounds: BoundingBox,
  fontFamily: string,
  fontWeight: FontWeight,
  fontSize: number,
): boolean {
  const ctx = getMeasureContext();
  if (!ctx) return true;

  const availableWidth = Math.max(1, bounds.width - WIDTH_PADDING);
  const availableHeight = Math.max(1, bounds.height - HEIGHT_PADDING);

  ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
  const lines = wrapText(text || ' ', availableWidth, ctx);
  const widestLine = lines.reduce((max, line) => Math.max(max, ctx.measureText(line || ' ').width), 0);
  const lineHeight = fontSize * TEXTBOX_LINE_HEIGHT;
  const totalHeight = Math.max(lineHeight, lines.length * lineHeight);

  return widestLine <= availableWidth && totalHeight <= availableHeight;
}

async function loadFabricModule(): Promise<typeof import('fabric')> {
  if (fabricModule) {
    return fabricModule;
  }
  if (!fabricPromise) {
    fabricPromise = import('fabric')
      .then((module) => {
        fabricModule = module;
        return module;
      })
      .catch((error) => {
        fabricPromise = null;
        throw error;
      });
  }
  return fabricPromise;
}

function measureTextboxHeight(
  textbox: import('fabric').Textbox | import('fabric').IText,
  fontSize: number,
): number {
  textbox.set({
    fontSize,
    lineHeight: TEXTBOX_LINE_HEIGHT,
    dirty: true,
  });

  if (typeof (textbox as any)._clearCache === 'function') {
    (textbox as any)._clearCache();
  }
  if (typeof textbox.initDimensions === 'function') {
    textbox.initDimensions();
  }

  return Math.max(1, Number(textbox.height || textbox.getScaledHeight() || 0));
}

function measureTextboxWidth(
  textbox: import('fabric').Textbox | import('fabric').IText,
  fontSize: number,
): number {
  textbox.set({
    fontSize,
    lineHeight: TEXTBOX_LINE_HEIGHT,
    dirty: true,
  });

  if (typeof (textbox as any)._clearCache === 'function') {
    (textbox as any)._clearCache();
  }
  if (typeof textbox.initDimensions === 'function') {
    textbox.initDimensions();
  }

  return Math.max(1, Number(textbox.width || textbox.getScaledWidth() || 0));
}

export async function fitTextLayoutToBox(
  text: string,
  bounds: BoundingBox,
  fontFamily: string,
  fontWeight: FontWeight = 'normal',
): Promise<FittedTextLayout> {
  if (!text.trim()) {
    return {
      fontSize: DEFAULT_FONT_SIZE,
      measuredHeight: DEFAULT_FONT_SIZE,
      layoutOffsetY: 0,
    };
  }

  const availableWidth = Math.max(1, bounds.width - WIDTH_PADDING);
  const availableHeight = Math.max(1, bounds.height - HEIGHT_PADDING);
  const useTextbox = shouldUseTextbox(text);

  try {
    const fabric = await loadFabricModule();
    const textbox = useTextbox
      ? new fabric.Textbox(text || ' ', {
          width: availableWidth,
          splitByGrapheme: true,
          fontFamily,
          fontWeight,
          lineHeight: TEXTBOX_LINE_HEIGHT,
          originX: 'left',
          originY: 'top',
          editable: false,
          objectCaching: false,
          strokeWidth: 0,
          charSpacing: 0,
          padding: 0,
        })
      : new fabric.IText(text || ' ', {
          fontFamily,
          fontWeight,
          lineHeight: TEXTBOX_LINE_HEIGHT,
          originX: 'left',
          originY: 'top',
          editable: false,
          objectCaching: false,
          strokeWidth: 0,
          charSpacing: 0,
        });

    let low = MIN_FONT_SIZE;
    let high = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.ceil(bounds.height * 3)));
    let best = DEFAULT_FONT_SIZE;
    let bestHeight = DEFAULT_FONT_SIZE;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const measuredHeight = measureTextboxHeight(textbox, mid);
      const measuredWidth = useTextbox ? availableWidth : measureTextboxWidth(textbox, mid);

      if (measuredHeight <= availableHeight && measuredWidth <= availableWidth) {
        best = mid;
        bestHeight = measuredHeight;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    textbox.dispose();

    return {
      fontSize: best,
      measuredHeight: bestHeight,
      layoutOffsetY: 0,
    };
  } catch {
    const fallback = estimateFontSizeToBox(text, bounds, fontFamily, fontWeight);
    return {
      fontSize: fallback,
      measuredHeight: Math.min(bounds.height, fallback * TEXTBOX_LINE_HEIGHT),
      layoutOffsetY: 0,
    };
  }
}

export async function fitFontSizeToBox(
  text: string,
  bounds: BoundingBox,
  fontFamily: string,
  fontWeight: FontWeight = 'normal',
): Promise<number> {
  const layout = await fitTextLayoutToBox(text, bounds, fontFamily, fontWeight);
  return layout.fontSize;
}

export function estimateFontSizeToBox(
  text: string,
  bounds: BoundingBox,
  fontFamily: string,
  fontWeight: FontWeight = 'normal',
): number {
  if (!text.trim()) {
    return DEFAULT_FONT_SIZE;
  }

  let low = MIN_FONT_SIZE;
  let high = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.ceil(bounds.height * 2)));
  let best = DEFAULT_FONT_SIZE;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsWithinBoxWithCanvas(text, bounds, fontFamily, fontWeight, mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}
