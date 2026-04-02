import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Toolbar } from '@/components/editor/Toolbar';
import { useEditorStore } from '@/store/editorStore';
import { useI18n } from '@/lib/i18n';
import type { PageModel } from '@/types/canvas';

function createPageModel(): PageModel {
  return {
    imageId: 'test-image',
    originalWidth: 1200,
    originalHeight: 800,
    cleanLayer: 'data:image/png;base64,clean',
    regions: [
      {
        id: 1,
        source: 'roi_ocr',
        removed: false,
        excludedFromClean: false,
        confirmed: true,
        lowConfidence: false,
        sourceBounds: { x: 100, y: 120, width: 200, height: 80 },
        bbox: { x: 100, y: 120, width: 200, height: 80 },
        sourcePolygon: [
          [100, 120],
          [300, 120],
          [300, 200],
          [100, 200],
        ],
        rotation: 0,
        layoutOffsetY: 0,
        text: 'roi text',
        confidence: 0.98,
        fontFamily: 'Noto Sans SC',
        fontSize: 24,
        fontWeight: 'normal',
        textAlign: 'left',
        fontColor: { r: 0, g: 0, b: 0 },
        textColorRaw: { r: 0, g: 0, b: 0 },
        textColorMode: 'auto',
        textColorQuantized: { r: 0, g: 0, b: 0 },
        bgColor: { r: 255, g: 255, b: 255 },
        bgMode: 'fill',
        showBackground: true,
        showText: true,
        eraserPaths: [],
        original: {
          bbox: { x: 100, y: 120, width: 200, height: 80 },
          text: 'roi text',
          fontFamily: 'Noto Sans SC',
          fontSize: 24,
          layoutOffsetY: 0,
          fontWeight: 'normal',
          textAlign: 'left',
          fontColor: { r: 0, g: 0, b: 0 },
          textColorRaw: { r: 0, g: 0, b: 0 },
          textColorMode: 'auto',
          bgColor: { r: 255, g: 255, b: 255 },
          bgMode: 'fill',
          showBackground: true,
          showText: true,
        },
      },
    ],
  };
}

describe('Toolbar ROI actions', () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useI18n.setState({ locale: 'en' });
  });

  afterEach(() => {
    useEditorStore.getState().reset();
  });

  it('shows ROI correction actions and add text entry when image and ROI exist', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: createPageModel(),
      });

      render(<Toolbar />);
    });

    expect(screen.getByRole('button', { name: 'ROI OCR' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Local repair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI repair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add text mode' })).toBeInTheDocument();
  });
});
