import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAiEnabled } from '@/lib/deploy-target';

export const runtime = 'nodejs';

interface InpaintRequest {
  image: string;
  mask: string;
  crop: { x: number; y: number; width: number; height: number };
  pageSize: { width: number; height: number };
  source: 'original' | 'cleanLayer';
  reason: 'complex_background' | 'manual_request';
}

interface InpaintResponse {
  patch: string;
  crop: { x: number; y: number; width: number; height: number };
  provider: string;
  latencyMs: number;
}

const INPAINT_API_URL = process.env.INPAINT_API_URL;
const INPAINT_API_TOKEN = process.env.INPAINT_API_TOKEN;
const INPAINT_PROVIDER = (process.env.INPAINT_PROVIDER || 'json').trim().toLowerCase();
const inFlightRequests = new Map<string, Promise<InpaintResponse>>();

function buildSignature(payload: InpaintRequest): string {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex');
}

async function forwardInpaintRequest(payload: InpaintRequest): Promise<InpaintResponse> {
  if (!INPAINT_API_URL) {
    throw new Error('INPAINT_API_URL is not configured');
  }

  if (INPAINT_PROVIDER === 'iopaint') {
    return forwardIopaintRequest(payload);
  }

  const startedAt = Date.now();
  const response = await fetch(INPAINT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(INPAINT_API_TOKEN ? { Authorization: `Bearer ${INPAINT_API_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error || `Inpaint provider failed: ${response.status}`);
  }

  const patch = typeof json?.patch === 'string' ? json.patch : null;
  if (!patch) {
    throw new Error('Inpaint provider returned no patch');
  }

  return {
    patch,
    crop: json?.crop ?? payload.crop,
    provider: typeof json?.provider === 'string' ? json.provider : 'remote',
    latencyMs: typeof json?.latencyMs === 'number' ? json.latencyMs : Date.now() - startedAt,
  };
}

function stripDataUrlPrefix(value: string, fieldName: string): string {
  const match = value.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    throw new Error(`${fieldName} must be a base64 data URL`);
  }

  return match[1];
}

async function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function forwardIopaintRequest(payload: InpaintRequest): Promise<InpaintResponse> {
  const startedAt = Date.now();
  const response = await fetch(INPAINT_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(INPAINT_API_TOKEN ? { Authorization: `Bearer ${INPAINT_API_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      image: stripDataUrlPrefix(payload.image, 'image'),
      mask: stripDataUrlPrefix(payload.mask, 'mask'),
      ldm_steps: 30,
      hd_strategy: 'Original',
      sd_sampler: 'UniPC',
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`IOPaint provider failed: ${response.status}${errorText ? ` ${errorText.slice(0, 200)}` : ''}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  if (contentType.includes('application/json')) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error || 'IOPaint returned JSON instead of image data');
  }

  const patchBuffer = await response.arrayBuffer();
  const patch = await arrayBufferToDataUrl(patchBuffer, contentType.split(';')[0] || 'image/png');

  return {
    patch,
    crop: payload.crop,
    provider: 'iopaint',
    latencyMs: Date.now() - startedAt,
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!isAiEnabled()) {
      return NextResponse.json({ error: 'AI is disabled for this deploy target' }, { status: 403 });
    }

    const payload = await request.json() as InpaintRequest;

    if (!payload?.image || !payload?.mask || !payload?.crop || !payload?.pageSize) {
      return NextResponse.json({ error: 'Invalid inpaint request payload' }, { status: 400 });
    }

    const signature = buildSignature(payload);
    const current = inFlightRequests.get(signature);
    if (current) {
      const result = await current;
      return NextResponse.json(result);
    }

    const pending = forwardInpaintRequest(payload)
      .finally(() => {
        inFlightRequests.delete(signature);
      });

    inFlightRequests.set(signature, pending);
    const result = await pending;
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Inpaint request failed' },
      { status: 500 },
    );
  }
}
