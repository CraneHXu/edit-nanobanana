import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Toolbar } from '@/components/editor/Toolbar';
import { TextControls } from '@/components/editor/TextControls';
import { CanvasEditor } from '@/components/editor/CanvasEditor';
import { useEditorStore } from '@/store/editorStore';
import { useI18n } from '@/lib/i18n';
import type { PageModel } from '@/types/canvas';

// Radix `use-size` relies on ResizeObserver which is not provided by jsdom by default.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

vi.mock('@/components/ui/select', () => {
  const Select = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const SelectTrigger = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  const SelectValue = () => null;
  const SelectContent = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;
  const SelectItem = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
  };
});

vi.mock('fabric', () => {
  throw new Error('Skip fabric import in unit tests');
});

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

function createManualPageModel(): PageModel {
  return {
    ...createPageModel(),
    regions: [
      {
        ...createPageModel().regions[0],
        id: 1,
        source: 'manual',
      },
    ],
  };
}

function createImplicitOcrPageModel(): PageModel {
  const base = createPageModel();
  return {
    ...base,
    regions: [
      {
        ...base.regions[0],
        id: 1,
        // Some OCR imports omit the `source`; sidebar treats it as OCR, so TextControls should too.
        source: undefined,
      } as any,
    ],
  };
}

describe('Toolbar ROI actions', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalDeployTarget = process.env.NEXT_PUBLIC_DEPLOY_TARGET;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  beforeEach(async () => {
    process.env.NEXT_PUBLIC_DEPLOY_TARGET = 'local';
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
    if (originalDeployTarget == null) {
      delete process.env.NEXT_PUBLIC_DEPLOY_TARGET;
    } else {
      process.env.NEXT_PUBLIC_DEPLOY_TARGET = originalDeployTarget;
    }
    consoleErrorSpy.mockRestore();
  });

  it('shows ROI OCR entry and add text entry; hides Local/AI repair from the top toolbar', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: createPageModel(),
      });

      render(<Toolbar />);
    });

    expect(screen.getByRole('button', { name: 'ROI OCR' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Local repair' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AI repair' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add text mode' })).toBeInTheDocument();
    expect(consoleErrorSpy.mock.calls.map((args) => args.join(' ')).join('\n')).not.toContain('not wrapped in act');
  });

  it('shows Local/AI repair entry in TextControls only when selecting OCR/ROI OCR regions', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: createPageModel(),
        selectedElementId: 1,
      });

      render(<TextControls />);
    });

    const localRepair = screen.getByRole('button', { name: 'Local repair' });
    const aiRepair = screen.getByRole('button', { name: 'AI repair' });
    expect(localRepair).toBeInTheDocument();
    expect(aiRepair).toBeInTheDocument();

    const textInput = screen.getByLabelText('Text Content');
    expect((localRepair.compareDocumentPosition(textInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((aiRepair.compareDocumentPosition(textInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);

    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: createManualPageModel(),
        selectedElementId: 1,
      });

      cleanup();
      render(<TextControls />);
    });

    expect(screen.queryByRole('button', { name: 'Local repair' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AI repair' })).not.toBeInTheDocument();
  });

  it('shows Local/AI repair entry in TextControls for implicit OCR regions (missing source)', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: createImplicitOcrPageModel(),
        selectedElementId: 1,
      });

      render(<TextControls />);
    });

    expect(screen.getByRole('button', { name: 'Local repair' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AI repair' })).toBeInTheDocument();
    const localRepair = screen.getByRole('button', { name: 'Local repair' });
    const aiRepair = screen.getByRole('button', { name: 'AI repair' });
    const textInput = screen.getByLabelText('Text Content');
    expect((localRepair.compareDocumentPosition(textInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((aiRepair.compareDocumentPosition(textInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('shows Confirm/Discard entry in TextControls when the selected region has a pending auto AI repair', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: {
          ...createPageModel(),
          autoChanges: [
            {
              id: 'change-1',
              patchId: 'patch-1',
              patchKind: 'auto_ai',
              previewMode: 'current',
              regionIds: [1],
              createdAt: 123,
              applied: true,
              reverted: false,
              description: 'Auto AI repair',
              status: 'new',
              patch: {
                id: 'patch-1',
                kind: 'auto_ai',
                regionIds: [1],
                roiId: 'region-1',
                crop: { x: 0, y: 0, width: 10, height: 10 },
                imageDataUrl: 'data:image/png;base64,patch',
                previewMode: 'current',
                createdAt: 123,
                applied: true,
                reverted: false,
                description: 'Auto AI repair',
              },
            },
          ],
        } as any,
        selectedElementId: 1,
      });

      render(<TextControls />);
    });

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    const discard = screen.getByRole('button', { name: 'Discard' });
    expect(confirm).toBeInTheDocument();
    expect(discard).toBeInTheDocument();

    const textInput = screen.getByLabelText('Text Content');
    expect((confirm.compareDocumentPosition(textInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect((discard.compareDocumentPosition(textInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('does not render auto-change overlay text label on the canvas', async () => {
    let container: HTMLElement | null = null;
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        canvasScale: 1,
        pageModel: {
          ...createPageModel(),
          regions: [
            {
              ...createPageModel().regions[0],
              id: 1,
              source: 'ocr',
              sourceBounds: { x: 10, y: 10, width: 20, height: 10 },
              bbox: { x: 10, y: 10, width: 20, height: 10 },
            },
          ],
          autoChanges: [
            {
              id: 'change-1',
              patchId: 'patch-1',
              patchKind: 'auto_ai',
              previewMode: 'current',
              regionIds: [1],
              createdAt: 123,
              applied: true,
              reverted: false,
              description: 'Auto AI repair',
              status: 'new',
            },
          ],
        } as any,
      });

      container = render(<CanvasEditor />).container;
    });

    expect(container?.querySelector('.border-emerald-500')).toBeTruthy();
    expect(screen.queryByText('Auto')).not.toBeInTheDocument();
  });

  it('counts unseen auto changes from explicit new status only', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: {
          ...createPageModel(),
          autoChanges: [
            {
              id: 'change-new',
              patchId: 'patch-new',
              patchKind: 'auto_ai',
              regionIds: [1],
              createdAt: 1,
              applied: true,
              reverted: false,
              status: 'new',
              description: 'New change',
            },
            {
              id: 'change-implicit',
              patchId: 'patch-implicit',
              patchKind: 'auto_ai',
              regionIds: [1],
              createdAt: 2,
              applied: true,
              reverted: false,
              description: 'Implicit change',
            },
          ],
        },
      });

      render(<Toolbar />);
    });

    expect(screen.getByRole('button', { name: /Auto changes/ })).toHaveTextContent('Auto changes1');
  });

  it('renames the auto preview option to background layer', async () => {
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        baseAutoLayer: 'data:image/png;base64,background',
        pageModel: createPageModel(),
      });

      render(<Toolbar />);
    });

    expect(screen.getByText('Background layer')).toBeInTheDocument();
    expect(screen.queryByText('Auto')).not.toBeInTheDocument();
  });

  it('hides AI entrypoints in vercel mode', async () => {
    process.env.NEXT_PUBLIC_DEPLOY_TARGET = 'vercel';

    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: {
          ...createPageModel(),
          autoChanges: [
            {
              id: 'change-1',
              patchId: 'patch-1',
              patchKind: 'auto_ai',
              previewMode: 'current',
              regionIds: [1],
              createdAt: 123,
              applied: true,
              reverted: false,
              description: 'Auto AI repair',
              status: 'new',
            },
          ],
        } as any,
        selectedElementId: 1,
      });

      render(
        <>
          <Toolbar />
          <TextControls />
        </>,
      );
    });

    expect(screen.queryByRole('button', { name: 'AI repair' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auto changes/ })).not.toBeInTheDocument();
  });

  it('allows toolbar controls to wrap instead of forcing horizontal overflow', async () => {
    let container: HTMLElement | null = null;
    await act(async () => {
      useEditorStore.setState({
        originalImage: 'data:image/png;base64,original',
        pageModel: createPageModel(),
      });

      container = render(<Toolbar />).container;
    });

    const root = container?.firstElementChild as HTMLElement | null;
    expect(root?.className).toContain('flex-wrap');

    const rightControls = root?.querySelector('.flex.items-center.gap-2') as HTMLElement | null;
    expect(rightControls?.className).toContain('flex-wrap');
  });
});
