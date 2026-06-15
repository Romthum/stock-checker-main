import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/auth';
import { tx } from '@/server/db';
import { adjustDevStock, isDevFileStoreEnabled } from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const StockAdjustSchema = z.object({
  productId: z.string().uuid(),
  delta: z.coerce.number().int(),
  reason: z.enum(['RESTOCK', 'SALE', 'ADJUST', 'RETURN', 'VOID']),
  note: z.string().trim().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = StockAdjustSchema.parse(await req.json());
    if (body.delta === 0) {
      return NextResponse.json({ error: 'delta must not be 0' }, { status: 400 });
    }

    if (isDevFileStoreEnabled()) {
      const result = await adjustDevStock({
        productId: body.productId,
        delta: body.delta,
        reason: body.reason,
        note: body.note,
        actorUserId: user.id,
      });
      return NextResponse.json(result);
    }

    const result = await tx(async (client) => {
      const current = await client.query<{ id: string; branch_id: string; qty: number }>(
        `
        select id, branch_id, qty
        from products
        where id = $1 and is_active = true
        for update
        `,
        [body.productId]
      );
      const product = current.rows[0];
      if (!product) {
        const error = new Error('Product not found');
        (error as Error & { status?: number }).status = 404;
        throw error;
      }

      const nextQty = product.qty + body.delta;
      if (nextQty < 0) {
        return { ok: false as const, status: 409, error: 'Insufficient stock' };
      }

      await client.query(
        `
        insert into stock_movements (branch_id, product_id, change, reason, note, created_by)
        values ($1, $2, $3, $4, $5, $6)
        `,
        [product.branch_id, product.id, body.delta, body.reason, body.note ?? null, user.id]
      );
      const updated = await client.query<{ qty: number }>(
        `update products set qty = $2, updated_at = now() where id = $1 returning qty`,
        [product.id, nextQty]
      );
      return { ok: true as const, qty: updated.rows[0].qty };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ qty: result.qty });
  } catch (error) {
    return jsonError(error, 'Failed to adjust stock');
  }
}
