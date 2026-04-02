import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/inpaint/route';

describe('/api/inpaint route', () => {
  it('存在并且对无效请求返回 400', async () => {
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
});
