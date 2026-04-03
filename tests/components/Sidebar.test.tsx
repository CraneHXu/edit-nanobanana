import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Sidebar } from '@/components/editor/Sidebar';
import { useEditorStore } from '@/store/editorStore';
import { useI18n } from '@/lib/i18n';

describe('Sidebar', () => {
  beforeEach(async () => {
    await act(async () => {
      useEditorStore.getState().reset();
      useI18n.setState({ locale: 'en' });
    });
  });

  afterEach(async () => {
    await act(async () => {
      cleanup();
      useEditorStore.getState().reset();
    });
  });

  it('scrolls the selected element into view when selectedElementId changes', async () => {
    await act(async () => {
      useEditorStore.setState({
        canvas: null,
        selectedElementId: null,
        pageModel: {
          imageId: 'test-image',
          originalWidth: 1200,
          originalHeight: 800,
          cleanLayer: 'data:image/png;base64,clean',
          regions: [
            {
              id: 1,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'one',
            },
            {
              id: 2,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'two',
            },
            {
              id: 3,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'three',
            },
          ],
        } as any,
      });

      render(<Sidebar />);
    });

    const target = screen.getByTestId('sidebar-item-2') as HTMLElement;
    const scrollSpy = vi.fn();
    (target as any).scrollIntoView = scrollSpy;

    await act(async () => {
      useEditorStore.getState().setSelectedElement(2);
    });

    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
  });

  it('keeps existing click selection behavior', async () => {
    await act(async () => {
      useEditorStore.setState({
        canvas: null,
        selectedElementId: null,
        pageModel: {
          imageId: 'test-image',
          originalWidth: 1200,
          originalHeight: 800,
          cleanLayer: 'data:image/png;base64,clean',
          regions: [
            {
              id: 1,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'one',
            },
            {
              id: 3,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'three',
            },
          ],
        } as any,
      });

      render(<Sidebar />);
    });

    fireEvent.click(screen.getByTestId('sidebar-item-3'));
    expect(useEditorStore.getState().selectedElementId).toBe(3);
  });

  it('shows repair badges for confirmed local/ai repairs and pending AI repairs', async () => {
    await act(async () => {
      useEditorStore.setState({
        canvas: null,
        selectedElementId: null,
        pageModel: {
          imageId: 'test-image',
          originalWidth: 1200,
          originalHeight: 800,
          cleanLayer: 'data:image/png;base64,clean',
          regions: [
            {
              id: 1,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'one',
            },
            {
              id: 2,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'two',
            },
            {
              id: 3,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'three',
            },
          ],
          patches: [
            {
              id: 'patch-local-1',
              kind: 'local_clean',
              regionIds: [1],
              crop: { x: 0, y: 0, width: 10, height: 10 },
              imageDataUrl: 'data:image/png;base64,patch',
              roiId: 'region-1',
              previewMode: 'current',
              createdAt: 1,
              applied: true,
              reverted: false,
              description: 'Local repair for region 1',
            },
            {
              id: 'patch-ai-2',
              kind: 'auto_ai',
              regionIds: [2],
              crop: { x: 0, y: 0, width: 10, height: 10 },
              imageDataUrl: 'data:image/png;base64,patch',
              roiId: 'region-2',
              previewMode: 'current',
              createdAt: 2,
              applied: true,
              reverted: false,
              description: 'AI repair for region 2',
            },
          ],
          autoChanges: [
            {
              id: 'change-3',
              patchId: 'patch-3',
              patchKind: 'auto_ai',
              previewMode: 'current',
              regionIds: [3],
              createdAt: 3,
              applied: true,
              reverted: false,
              description: 'Pending AI repair for region 3',
              status: 'new',
              patch: {
                id: 'patch-3',
                kind: 'auto_ai',
                regionIds: [3],
                crop: { x: 0, y: 0, width: 10, height: 10 },
                imageDataUrl: 'data:image/png;base64,patch',
                roiId: 'region-3',
                previewMode: 'current',
                createdAt: 3,
                applied: true,
                reverted: false,
                description: 'Pending AI repair for region 3',
              },
            },
          ],
        } as any,
      });

      render(<Sidebar />);
    });

    const item1 = screen.getByTestId('sidebar-item-1');
    expect(within(item1).getByText('Local repair')).toBeInTheDocument();

    const item2 = screen.getByTestId('sidebar-item-2');
    expect(within(item2).getByText('AI repair')).toBeInTheDocument();

    const item3 = screen.getByTestId('sidebar-item-3');
    expect(within(item3).getByText('Pending AI repair')).toBeInTheDocument();
  });

  it('shows Local repair badge for OCR/ROI OCR when clean background exists, unless there is a pending/confirmed AI repair badge', async () => {
    await act(async () => {
      useEditorStore.setState({
        canvas: null,
        selectedElementId: null,
        pageModel: {
          imageId: 'test-image',
          originalWidth: 1200,
          originalHeight: 800,
          cleanLayer: 'data:image/png;base64,clean',
          regions: [
            {
              id: 1,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'plain ocr',
            },
            {
              id: 2,
              removed: false,
              source: 'roi_ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'confirmed ai',
            },
            {
              id: 3,
              removed: false,
              source: 'ocr',
              excludedFromClean: false,
              lowConfidence: false,
              showText: true,
              text: 'pending ai',
            },
          ],
          patches: [
            {
              id: 'patch-ai-2',
              kind: 'auto_ai',
              regionIds: [2],
              crop: { x: 0, y: 0, width: 10, height: 10 },
              imageDataUrl: 'data:image/png;base64,patch',
              roiId: 'region-2',
              previewMode: 'current',
              createdAt: 2,
              applied: true,
              reverted: false,
              description: 'AI repair for region 2',
            },
          ],
          autoChanges: [
            {
              id: 'change-3',
              patchId: 'patch-3',
              patchKind: 'auto_ai',
              previewMode: 'current',
              regionIds: [3],
              createdAt: 3,
              applied: true,
              reverted: false,
              description: 'Pending AI repair for region 3',
              status: 'new',
              patch: {
                id: 'patch-3',
                kind: 'auto_ai',
                regionIds: [3],
                crop: { x: 0, y: 0, width: 10, height: 10 },
                imageDataUrl: 'data:image/png;base64,patch',
                roiId: 'region-3',
                previewMode: 'current',
                createdAt: 3,
                applied: true,
                reverted: false,
                description: 'Pending AI repair for region 3',
              },
            },
          ],
        } as any,
      });

      render(<Sidebar />);
    });

    const plainOcr = screen.getByTestId('sidebar-item-1');
    expect(within(plainOcr).getByText('Local repair')).toBeInTheDocument();

    const confirmedAi = screen.getByTestId('sidebar-item-2');
    expect(within(confirmedAi).getByText('AI repair')).toBeInTheDocument();
    expect(within(confirmedAi).queryByText('Local repair')).not.toBeInTheDocument();

    const pendingAi = screen.getByTestId('sidebar-item-3');
    expect(within(pendingAi).getByText('Pending AI repair')).toBeInTheDocument();
    expect(within(pendingAi).queryByText('Local repair')).not.toBeInTheDocument();
  });
});
