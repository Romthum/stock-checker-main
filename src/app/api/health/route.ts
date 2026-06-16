import { NextResponse } from 'next/server';
import { query } from '@/server/db';
import { isDevFileStoreEnabled } from '@/server/devStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (isDevFileStoreEnabled()) {
      return NextResponse.json({ ok: true, store: 'dev-file-store' });
    }

    await query('select 1');
    return NextResponse.json({ ok: true, store: 'postgres' });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unhealthy' },
      { status: 503 }
    );
  }
}
