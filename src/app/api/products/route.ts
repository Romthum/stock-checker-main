import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canManageCatalog, requireUser } from '@/server/auth';
import { query, tx } from '@/server/db';
import { createDevProduct, isDevFileStoreEnabled, listDevProducts } from '@/server/devStore';
import { jsonError, parseLimit } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProductCreateSchema = z.object({
  name: z.string().trim().min(1),
  sku: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  cost_price: z.coerce.number().min(0).default(0),
  sale_price: z.coerce.number().min(0).default(0),
  qty: z.coerce.number().int().min(0).default(0),
  image_url: z.string().trim().optional().nullable(),
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  cost_price: string;
  sale_price: string;
  qty: number;
  image_url: string | null;
  updated_at: string;
};

function encodeCursor(row: Pick<ProductRow, 'name' | 'id'>) {
  return Buffer.from(JSON.stringify({ name: row.name, id: row.id })).toString('base64url');
}

function decodeCursor(cursor: string | null) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed.name === 'string' && typeof parsed.id === 'string') return parsed;
  } catch {
    return null;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get('limit'), 40, 100);
    const q = url.searchParams.get('q')?.trim() ?? '';
    const category = url.searchParams.get('category')?.trim() ?? '';
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    if (isDevFileStoreEnabled()) {
      const result = await listDevProducts({ q, category, cursor, limit });
      return NextResponse.json({
        items: result.items,
        nextCursor: result.nextRow ? encodeCursor(result.nextRow) : null,
      });
    }

    const where = ['is_active = true'];
    const params: unknown[] = [];

    if (category) {
      if (category === '__uncategorized') {
        where.push('(category is null or btrim(category) = \'\')');
      } else {
        params.push(category);
        where.push(`category = $${params.length}`);
      }
    }

    if (q) {
      params.push(`%${q}%`);
      where.push(`(name ilike $${params.length} or sku ilike $${params.length})`);
    }

    if (cursor) {
      params.push(cursor.name, cursor.id);
      where.push(`(name, id) > ($${params.length - 1}, $${params.length})`);
    }

    params.push(limit + 1);
    const result = await query<ProductRow>(
      `
      select id, name, sku, category, cost_price, sale_price, qty, image_url, updated_at
      from products
      where ${where.join(' and ')}
      order by name asc, id asc
      limit $${params.length}
      `,
      params
    );

    const rows = result.rows;
    const items = rows.slice(0, limit).map((row) => ({
      ...row,
      cost_price: Number(row.cost_price),
      sale_price: Number(row.sale_price),
    }));
    const last = rows.length > limit ? rows[limit - 1] : null;
    return NextResponse.json({ items, nextCursor: last ? encodeCursor(last) : null });
  } catch (error) {
    return jsonError(error, 'Failed to load products');
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!canManageCatalog(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = ProductCreateSchema.parse(await req.json());
    if (isDevFileStoreEnabled()) {
      const product = await createDevProduct({ ...body, created_by: user.id });
      return NextResponse.json({ product });
    }

    const product = await tx(async (client) => {
      const branch = await client.query<{ id: string }>(
        `select id from branches where code = 'MAIN' limit 1`
      );
      const branchId = branch.rows[0].id;
      const inserted = await client.query<ProductRow>(
        `
        insert into products (
          branch_id, name, sku, category, cost_price, sale_price, qty, image_url, created_by
        )
        values ($1, $2, nullif($3, ''), nullif($4, ''), $5, $6, $7, nullif($8, ''), $9)
        returning id, name, sku, category, cost_price, sale_price, qty, image_url, updated_at
        `,
        [
          branchId,
          body.name,
          body.sku ?? '',
          body.category ?? '',
          body.cost_price,
          body.sale_price,
          body.qty,
          body.image_url ?? '',
          user.id,
        ]
      );
      if (body.qty > 0) {
        await client.query(
          `
          insert into stock_movements (branch_id, product_id, change, reason, note, created_by)
          values ($1, $2, $3, 'ADJUST', 'Initial stock', $4)
          `,
          [branchId, inserted.rows[0].id, body.qty, user.id]
        );
      }
      await client.query(
        `
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, 'PRODUCT_CREATE', 'product', $2, $3::jsonb)
        `,
        [
          user.id,
          inserted.rows[0].id,
          JSON.stringify({
            name: body.name,
            sku: body.sku ?? null,
            category: body.category ?? null,
            qty: body.qty,
            sale_price: body.sale_price,
          }),
        ]
      );
      return inserted.rows[0];
    });

    return NextResponse.json({
      product: {
        ...product,
        cost_price: Number(product.cost_price),
        sale_price: Number(product.sale_price),
      },
    });
  } catch (error) {
    return jsonError(error, 'Failed to create product');
  }
}
