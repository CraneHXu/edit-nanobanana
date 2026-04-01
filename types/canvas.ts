/**
 * Canvas and editor model types
 */

import { OCRDetection, RGBColor } from './ocr';

export interface EraserPath {
  // Local coordinates relative to the background rect origin in original image space.
  x: number;
  y: number;
  radius: number;
}

export type TextAlign = 'left' | 'center' | 'right';
export type FontWeight = 'normal' | 'bold';
export type TextColorMode = 'auto' | 'manual';
export type BackgroundMode = 'none' | 'fill' | 'manual' | 'inpaint';
export type PreviewMode = 'original' | 'clean' | 'final';

export interface TextElementSnapshot {
  bbox: OCRDetection['bounds'];
  text: string;
  fontFamily: string;
  fontSize: number;
  layoutOffsetY: number;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  fontColor: RGBColor;
  textColorRaw: RGBColor;
  textColorMode: TextColorMode;
  bgColor: RGBColor | null;
  bgMode: BackgroundMode;
  showBackground: boolean;
  showText: boolean;
}

export interface TextElement {
  id: number;
  removed: boolean;
  sourceBounds: OCRDetection['bounds'];
  bbox: OCRDetection['bounds'];
  sourcePolygon?: [number, number][];
  rotation: number;
  layoutOffsetY: number;
  text: string;
  confidence: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  fontColor: RGBColor;
  textColorRaw: RGBColor;
  textColorMode: TextColorMode;
  textColorQuantized?: RGBColor;
  bgColor: RGBColor | null;
  bgMode: BackgroundMode;
  showBackground: boolean;
  showText: boolean;
  eraserPaths: EraserPath[];
  original: TextElementSnapshot;
}

export interface CanvasState {
  width: number;
  height: number;
  backgroundImage?: string;
}

export interface PageModel {
  imageId: string;
  originalWidth: number;
  originalHeight: number;
  regions: TextElement[];
  cleanLayer?: string | null;
}
