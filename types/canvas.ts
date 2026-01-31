/**
 * Canvas and Text Element Types
 */

import { OCRDetection, RGBColor } from './ocr';

export interface EraserPath {
  x: number;
  y: number;
  radius: number;
}

export interface TextElement {
  id: number;
  detection: OCRDetection;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontColor: RGBColor;
  bgColor: RGBColor;
  showBackground: boolean; // Whether to show background rect
  showText: boolean; // Whether to show text
  fabricObject?: any; // Text object
  fabricBgRect?: any; // Background rect
  eraserPaths: EraserPath[]; // Eraser strokes on the background rect
  // Store original transform for reset
  originalTransform: {
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
    angle: number;
  };
}

export interface CanvasState {
  width: number;
  height: number;
  backgroundImage?: string;
}
