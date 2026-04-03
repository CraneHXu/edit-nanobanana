import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/inpaint/route';

describe('/api/inpaint route', () => {
  const originalDeployTarget = process.env.NEXT_PUBLIC_DEPLOY_TARGET;

  afterEach(() => {
    if (originalDeployTarget == null) {
      delete process.env.NEXT_PUBLIC_DEPLOY_TARGET;
      return;
    }
    process.env.NEXT_PUBLIC_DEPLOY_TARGET = originalDeployTarget;
  });

  it('存在并且对无效请求返回 400', async () => {
    process.env.NEXT_PUBLIC_DEPLOY_TARGET = 'local';
    const request = new NextRequest('http://localhost/api/inpaint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: 'Invalid inpaint request payload' });
  });

  it('在 vercel 模式下直接禁用 AI inpaint 接口', async () => {
    process.env.NEXT_PUBLIC_DEPLOY_TARGET = 'vercel';
    const request = new NextRequest('http://localhost/api/inpaint', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: 'data:image/png;base64,image',
        mask: 'data:image/png;base64,mask',
        crop: { x: 0, y: 0, width: 10, height: 10 },
        pageSize: { width: 100, height: 100 },
        source: 'original',
        reason: 'manual_request',
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'AI is disabled for this deploy target' });
  });
});
