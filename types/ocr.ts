/**
 * OCR Detection Types
 * Matches backend Python response structure
 */

export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OCRDetection {
  index: number;
  bbox: [number, number][];  // Array of [x, y] points
  text: string;
  confidence: number;
  textColor: RGBColor;
  bgColor: RGBColor;
  fontSize: number;
  bounds: BoundingBox;
}

export interface DetectionResponse {
  success: boolean;
  detections: OCRDetection[];
  count: number;
}
