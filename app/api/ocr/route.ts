/**
 * OCR API Route - Calls PaddleOCR API
 * Runs as Vercel Edge Function for faster cold starts
 */

import { NextRequest, NextResponse } from 'next/server';

// Use Edge Runtime for faster cold starts and global deployment
export const runtime = 'edge';

const OCR_API_URL = process.env.OCR_API_URL || 'https://ddq659q3sbt2h5h6.aistudio-app.com/ocr';
const OCR_API_TOKEN = process.env.OCR_API_TOKEN;

// Helper function to convert ArrayBuffer to base64 (Edge-compatible, no Buffer)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// PaddleOCR response can have various formats
interface PaddleOCRResult {
  prunedResult: unknown; // Can be string, object, or array
  ocrImage?: string;
  rec_texts?: string[];
  rec_scores?: number[];
  det_polygons?: number[][][];
}

interface PaddleOCRResponse {
  result: {
    ocrResults: PaddleOCRResult[];
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!OCR_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'OCR API token not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json(
        { success: false, error: 'No image provided' },
        { status: 400 }
      );
    }

    // Convert file to base64 (Edge-compatible)
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Data = arrayBufferToBase64(arrayBuffer);

    // Determine file type (0 for PDF, 1 for image)
    const isPdf = imageFile.type === 'application/pdf';
    const fileType = isPdf ? 0 : 1;

    // Call PaddleOCR API
    const ocrResponse = await fetch(OCR_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `token ${OCR_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: base64Data,
        fileType: fileType,
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useTextlineOrientation: false,
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('PaddleOCR API error:', errorText);
      return NextResponse.json(
        { success: false, error: `OCR API error: ${ocrResponse.status}` },
        { status: ocrResponse.status }
      );
    }

    const ocrData: PaddleOCRResponse = await ocrResponse.json();

    // Transform PaddleOCR response to our format
    const detections = parseOCRResult(ocrData);

    // Debug: log the raw response structure
    console.log('PaddleOCR raw response:', JSON.stringify(ocrData.result, null, 2));

    return NextResponse.json({
      success: true,
      detections,
      count: detections.length,
      rawResult: ocrData.result, // Include raw result for debugging
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    return NextResponse.json(
      { success: false, error: 'OCR processing failed' },
      { status: 500 }
    );
  }
}

function parseOCRResult(ocrData: PaddleOCRResponse) {
  const detections: Array<{
    index: number;
    bbox: number[][];
    text: string;
    confidence: number;
    textColor: { r: number; g: number; b: number };
    bgColor: { r: number; g: number; b: number };
    fontSize: number;
    bounds: { x: number; y: number; width: number; height: number };
  }> = [];

  if (!ocrData.result?.ocrResults) {
    return detections;
  }

  let globalIndex = 0;

  for (const result of ocrData.result.ocrResults) {
    const prunedResult = result.prunedResult;

    // Handle prunedResult as object with rec_texts, rec_scores, rec_polys
    if (prunedResult && typeof prunedResult === 'object' && !Array.isArray(prunedResult)) {
      const resultObj = prunedResult as Record<string, unknown>;

      const recTexts = resultObj.rec_texts as string[] | undefined;
      const recScores = resultObj.rec_scores as number[] | undefined;
      const recPolys = (resultObj.rec_polys || resultObj.dt_polys) as number[][][] | undefined;
      const recBoxes = resultObj.rec_boxes as number[][] | undefined;

      if (recTexts && recScores) {
        for (let i = 0; i < recTexts.length; i++) {
          const text = recTexts[i];
          const confidence = recScores[i] || 0.9;

          // Use rec_polys for bbox (4 corner points)
          let bbox: number[][];
          let bounds: { x: number; y: number; width: number; height: number };

          if (recPolys && recPolys[i]) {
            bbox = recPolys[i];
            bounds = calculateBounds(bbox);
          } else if (recBoxes && recBoxes[i]) {
            // rec_boxes format: [x1, y1, x2, y2]
            const box = recBoxes[i];
            bbox = [
              [box[0], box[1]],
              [box[2], box[1]],
              [box[2], box[3]],
              [box[0], box[3]],
            ];
            bounds = {
              x: box[0],
              y: box[1],
              width: box[2] - box[0],
              height: box[3] - box[1],
            };
          } else {
            bbox = [[0, 0], [100, 0], [100, 20], [0, 20]];
            bounds = { x: 0, y: globalIndex * 25, width: 100, height: 20 };
          }

          if (text) {
            detections.push({
              index: globalIndex++,
              bbox,
              text,
              confidence,
              textColor: { r: 0, g: 0, b: 0 },
              bgColor: { r: 255, g: 255, b: 255 },
              fontSize: estimateFontSize(bounds.height),
              bounds,
            });
          }
        }
      }
    } else if (typeof prunedResult === 'string') {
      // Fallback: prunedResult is a string
      const textLines = prunedResult.split('\n').filter(line => line.trim());
      for (const line of textLines) {
        detections.push({
          index: globalIndex++,
          bbox: [[0, 0], [100, 0], [100, 20], [0, 20]],
          text: line,
          confidence: 0.9,
          textColor: { r: 0, g: 0, b: 0 },
          bgColor: { r: 255, g: 255, b: 255 },
          fontSize: 16,
          bounds: { x: 0, y: globalIndex * 25, width: 100, height: 20 },
        });
      }
    }

    // Also check result-level fields as fallback
    if (detections.length === 0 && result.det_polygons && result.rec_texts && result.rec_scores) {
      for (let i = 0; i < result.rec_texts.length; i++) {
        const polygon = result.det_polygons[i];
        const text = result.rec_texts[i];
        const confidence = result.rec_scores[i];

        if (polygon && text) {
          const bbox = polygon.map(point => [point[0], point[1]]);
          const bounds = calculateBounds(bbox);

          detections.push({
            index: globalIndex++,
            bbox,
            text,
            confidence,
            textColor: { r: 0, g: 0, b: 0 },
            bgColor: { r: 255, g: 255, b: 255 },
            fontSize: estimateFontSize(bounds.height),
            bounds,
          });
        }
      }
    }
  }

  return detections;
}

function calculateBounds(bbox: number[][]) {
  if (!bbox || bbox.length < 4) {
    return { x: 0, y: 0, width: 100, height: 20 };
  }

  const xs = bbox.map(p => p[0]);
  const ys = bbox.map(p => p[1]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function estimateFontSize(height: number): number {
  // Approximate font size based on bounding box height
  return Math.max(12, Math.round(height * 0.8));
}
