import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { query } from '@/server/db';
import { isDevFileStoreEnabled, listDevCategories } from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CategoryRow = { category: string };

export async function GET() {
  try {
    await requireUser();
    if (isDevFileStoreEnabled()) {
      return NextResponse.json({ categories: await listDevCategories() });
    }
    const result = await query<CategoryRow>(`
      select distinct category
      from products
      where is_active = true and category is not null and btrim(category) <> ''
      order by category asc
    `);
    return NextResponse.json({ categories: result.rows.map((row) => row.category) });
  } catch (error) {
    return jsonError(error, 'Failed to load categories');
  }
}
