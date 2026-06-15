import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'products');

const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const fullPath = path.join(uploadDir, file);
    const data = await fs.readFile(fullPath);
    const ext = path.extname(file).toLowerCase();
    return new Response(data, {
      headers: {
        'Content-Type': contentTypes[ext] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
