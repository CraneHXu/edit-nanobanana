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
export type RegionSource = 'ocr' | 'roi_ocr' | 'manual';
export type PreviewMode = 'original' | 'auto' | 'current';
export type PatchKind = 'local_clean' | 'auto_ai' | 'manual_ai' | 'restore_original';

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
  source?: RegionSource;
  removed: boolean;
  excludedFromClean?: boolean;
  confirmed?: boolean;
  lowConfidence?: boolean;
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

export interface ImagePatch {
  id: string;
  kind: PatchKind;
  regionIds: number[];
  roiId?: string;
  previewMode?: PreviewMode;
  createdAt: number;
  applied: boolean;
  reverted: boolean;
  description?: string;
}

export interface AutoChange {
  id: string;
  patchId: string;
  patchKind: PatchKind;
  previewMode?: PreviewMode;
  regionIds: number[];
  createdAt: number;
  applied: boolean;
  reverted: boolean;
  description?: string;
}

export interface PageModel {
  imageId: string;
  originalWidth: number;
  originalHeight: number;
  regions: TextElement[];
  previewMode?: PreviewMode;
  patches?: ImagePatch[];
  autoChanges?: AutoChange[];
  cleanLayer?: string | null;
}
