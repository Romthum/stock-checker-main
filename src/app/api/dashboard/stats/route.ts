import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { query } from '@/server/db';
import { getDevStats, isDevFileStoreEnabled } from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type StatsRow = {
  products: string;
  low_stock: string;
  movements_today: string;
};

export async function GET() {
  try {
    await requireUser();
    if (isDevFileStoreEnabled()) {
      return NextResponse.json(await getDevStats());
    }
    const result = await query<StatsRow>(`
      select
        (select count(*) from products where is_active = true) as products,
        (select count(*) from products where is_active = true and qty <= 5) as low_stock,
        (
          select count(*)
          from stock_movements
          where created_at >= date_trunc('day', now())
        ) as movements_today
    `);
    const row = result.rows[0];
    return NextResponse.json({
      products: Number(row.products),
      lowStock: Number(row.low_stock),
      movementsToday: Number(row.movements_today),
    });
  } catch (error) {
    return jsonError(error, 'Failed to load dashboard stats');
  }
}
