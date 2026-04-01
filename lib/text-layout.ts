import { BoundingBox } from '@/types/ocr';
import { FontWeight } from '@/types/canvas';

const DEFAULT_FONT_SIZE = 16;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 200;
const WIDTH_PADDING = 4;
const HEIGHT_PADDING = 2;
export const TEXTBOX_LINE_HEIGHT = 1.2;

let measureCanvas: HTMLCanvasElement | null = null;

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

function fitsWithinBox(
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

export function fitFontSizeToBox(
  text: string,
  bounds: BoundingBox,
  fontFamily: string,
  fontWeight: FontWeight = 'normal',
): number {
  if (!text.trim()) {
    return DEFAULT_FONT_SIZE;
  }

  let low = MIN_FONT_SIZE;
  let high = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.ceil(bounds.height * 1.5)));
  let best = DEFAULT_FONT_SIZE;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fitsWithinBox(text, bounds, fontFamily, fontWeight, mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}
