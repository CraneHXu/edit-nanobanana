import { describe, expect, it } from 'vitest';
import { expandInpaintCrop } from '@/lib/api-client';

describe('expandInpaintCrop', () => {
  it('adds padding around the requested bounds', () => {
    const crop = expandInpaintCrop(
      { x: 20, y: 30, width: 40, height: 10 },
      { width: 200, height: 120 },
    );

    expect(crop.x).toBeLessThan(20);
    expect(crop.y).toBeLessThan(30);
    expect(crop.width).toBeGreaterThan(40);
    expect(crop.height).toBeGreaterThan(10);
  });

  it('clamps padded crops to page edges', () => {
    const crop = expandInpaintCrop(
      { x: 1, y: 2, width: 10, height: 8 },
      { width: 20, height: 16 },
    );

    expect(crop.x).toBe(0);
    expect(crop.y).toBe(0);
    expect(crop.x + crop.width).toBeLessThanOrEqual(20);
    expect(crop.y + crop.height).toBeLessThanOrEqual(16);
  });

  it('throws when the requested crop does not intersect the page at all', () => {
    expect(() => expandInpaintCrop(
      { x: 120, y: 30, width: 10, height: 8 },
      { width: 100, height: 80 },
    )).toThrow('Inpaint crop does not intersect page bounds');
  });
});
