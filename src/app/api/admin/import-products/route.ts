import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canManageCatalog, requireUser } from '@/server/auth';
import { tx } from '@/server/db';
import { importDevProducts, isDevFileStoreEnabled } from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ImportRowSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  cost_price: z.coerce.number().min(0).optional().nullable(),
  sale_price: z.coerce.number().min(0).optional().nullable(),
  image_url: z.string().trim().optional().nullable(),
});

const ImportSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(20_000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageCatalog(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const body = ImportSchema.parse(await req.json());

    if (isDevFileStoreEnabled()) {
      const imported = await importDevProducts(body.rows, user.id);
      return NextResponse.json({ imported });
    }

    const imported = await tx(async (client) => {
      const branch = await client.query<{ id: string }>(
        `select id from branches where code = 'MAIN' limit 1`
      );
      const branchId = branch.rows[0].id;
      let count = 0;
      for (const row of body.rows) {
        await client.query(
          `
          insert into products (
            branch_id, name, sku, category, cost_price, sale_price, image_url, created_by
          )
          values ($1, $2, nullif($3, ''), nullif($4, ''), $5, $6, nullif($7, ''), $8)
          on conflict (sku) where sku is not null and is_active = true
          do update set
            name = excluded.name,
            category = excluded.category,
            cost_price = excluded.cost_price,
            sale_price = excluded.sale_price,
            image_url = excluded.image_url,
            updated_at = now()
          `,
          [
            branchId,
            row.name,
            row.sku ?? '',
            row.category ?? '',
            row.cost_price ?? 0,
            row.sale_price ?? 0,
            row.image_url ?? '',
            user.id,
          ]
        );
        count += 1;
      }
      return count;
    });

    return NextResponse.json({ imported });
  } catch (error) {
    return jsonError(error, 'Failed to import products');
  }
}
