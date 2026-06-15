import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { canManageCatalog, requireUser } from '@/server/auth';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'products');
const allowedTypes: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageCatalog(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }
    const ext = allowedTypes[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 });
    }

    await fs.mkdir(uploadDir, { recursive: true });
    const filename = `${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(uploadDir, filename);
    await fs.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url: `/api/uploads/products/${filename}` });
  } catch (error) {
    return jsonError(error, 'Failed to upload image');
  }
}
