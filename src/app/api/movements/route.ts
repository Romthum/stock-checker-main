import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { query } from '@/server/db';
import { isDevFileStoreEnabled, listDevMovements } from '@/server/devStore';
import { jsonError, parseLimit } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MovementRow = {
  id: string;
  change: number;
  reason: string;
  created_at: string;
  product_id: string;
  product_name: string | null;
  sku: string | null;
};

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get('limit'), 500, 1000);
    const from = url.searchParams.get('from') ?? new Date(Date.now() - 7 * 86400_000).toISOString();
    const to = url.searchParams.get('to') ?? new Date().toISOString();

    if (isDevFileStoreEnabled()) {
      return NextResponse.json({ movements: await listDevMovements(from, to, limit) });
    }

    const result = await query<MovementRow>(
      `
      select
        sm.id::text,
        sm.change,
        sm.reason,
        sm.created_at,
        sm.product_id,
        p.name as product_name,
        p.sku
      from stock_movements sm
      left join products p on p.id = sm.product_id
      where sm.created_at >= $1 and sm.created_at <= $2
      order by sm.created_at desc
      limit $3
      `,
      [from, to, limit]
    );

    return NextResponse.json({
      movements: result.rows.map((row) => ({
        id: row.id,
        change: row.change,
        reason: row.reason,
        created_at: row.created_at,
        product: {
          id: row.product_id,
          name: row.product_name ?? 'Unknown product',
          sku: row.sku,
        },
      })),
    });
  } catch (error) {
    return jsonError(error, 'Failed to load movements');
  }
}
