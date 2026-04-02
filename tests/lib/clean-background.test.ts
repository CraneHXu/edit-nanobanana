import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateRegionComplexity } from '@/lib/clean-background';

const onePixelPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnK1xQAAAAASUVORK5CYII=';

describe('estimateRegionComplexity', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'Worker');
  });

  it('复用 clean background worker 做复杂度分析', async () => {
    const postMessage = vi.fn();
    const terminate = vi.fn();

    class WorkerStub {
      onmessage: ((event: MessageEvent<{ type: string; complexity: number }>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;

      postMessage(message: unknown) {
        postMessage(message);
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              type: 'complexity-success',
              complexity: 0.72,
            },
          } as MessageEvent<{ type: string; complexity: number }>);
        });
      }

      terminate() {
        terminate();
      }
    }

    vi.stubGlobal('Worker', WorkerStub);

    const complexity = await estimateRegionComplexity(onePixelPng, {
      sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
      sourcePolygon: undefined,
    });

    expect(complexity).toBe(0.72);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'analyze-region-complexity',
      imageDataUrl: onePixelPng,
    }));
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
