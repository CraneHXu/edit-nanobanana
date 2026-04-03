import { describe, expect, it } from 'vitest';
import { createManualTextElement } from '@/lib/editor-mutations';
import { createTextObject, syncTextObject } from '@/lib/fabric-utils';

class FakeFabricTextObject {
  kind: string;
  text: string;
  width = 0;
  height = 0;
  scaleX = 1;
  scaleY = 1;
  angle = 0;
  data: Record<string, unknown> | undefined;

  constructor(kind: string, text: string, options: Record<string, unknown>) {
    this.kind = kind;
    this.text = text;
    Object.assign(this, options);
  }

  set(keyOrObject: string | Record<string, unknown>, value?: unknown) {
    if (typeof keyOrObject === 'string') {
      (this as unknown as Record<string, unknown>)[keyOrObject] = value;
      return;
    }
    Object.assign(this, keyOrObject);
  }

  getScaledWidth() {
    return Number(this.width) * Number(this.scaleX || 1);
  }

  getScaledHeight() {
    return Number(this.height) * Number(this.scaleY || 1);
  }

  initDimensions() {
    if (this.kind === 'textbox') {
      this.height = Math.max(Number(this.height || 0), 10);
      return;
    }

    this.width = Math.max(Number(this.width || 0), Math.max(this.text.length * 8, 1));
    this.height = Math.max(Number(this.height || 0), 10);
  }

  setCoords() {}
}

class FakeTextbox extends FakeFabricTextObject {
  constructor(text: string, options: Record<string, unknown>) {
    super('textbox', text, options);
  }
}

class FakeIText extends FakeFabricTextObject {
  constructor(text: string, options: Record<string, unknown>) {
    super('itext', text, options);
  }
}

const fakeFabric = {
  Textbox: FakeTextbox,
  IText: FakeIText,
} as unknown as typeof import('fabric');

describe('fabric utils manual text', () => {
  it('createTextObject uses a fixed-width Textbox for manual empty text regions', () => {
    const region = createManualTextElement({
      id: 1,
      text: '',
      bbox: { x: 10, y: 12, width: 80, height: 24 },
      sourceBounds: { x: 10, y: 12, width: 80, height: 24 },
      fontSize: 16,
    });

    const textObj = createTextObject(fakeFabric, region, 1) as unknown as FakeFabricTextObject;

    expect(textObj.kind).toBe('textbox');
    expect(textObj.width).toBe(80);
    expect(textObj.data).toMatchObject({ multiline: true });
  });

  it('syncTextObject keeps manual text width pinned to the drawn bbox', () => {
    const region = createManualTextElement({
      id: 1,
      text: 'Manual text',
      bbox: { x: 10, y: 12, width: 80, height: 24 },
      sourceBounds: { x: 10, y: 12, width: 80, height: 24 },
      fontSize: 16,
    });

    const textObj = new FakeTextbox(region.text, {}) as unknown as import('@/lib/fabric-utils').FabricTextObject;
    syncTextObject(textObj, region, 1);

    expect((textObj as unknown as FakeFabricTextObject).width).toBe(80);
  });
});
