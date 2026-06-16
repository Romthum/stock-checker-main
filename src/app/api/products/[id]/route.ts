import { NextResponse } from 'next/server';
import { z } from 'zod';
import { canManageCatalog, requireUser } from '@/server/auth';
import { tx } from '@/server/db';
import { deleteDevProduct, isDevFileStoreEnabled, updateDevProduct } from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ProductUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sku: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  cost_price: z.coerce.number().min(0).optional(),
  sale_price: z.coerce.number().min(0).optional(),
  qty: z.coerce.number().int().min(0).optional(),
  image_url: z.string().trim().optional().nullable(),
});

type ProductRow = {
  id: string;
  branch_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  cost_price: string;
  sale_price: string;
  qty: number;
  image_url: string | null;
  updated_at: string;
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canManageCatalog(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;
    const body = ProductUpdateSchema.parse(await req.json());

    if (isDevFileStoreEnabled()) {
      const product = await updateDevProduct(id, body, user.id);
      return NextResponse.json({ product });
    }

    const product = await tx(async (client) => {
      const current = await client.query<ProductRow>(
        `
        select id, branch_id, name, sku, category, cost_price, sale_price, qty, image_url, updated_at
        from products
        where id = $1 and is_active = true
        for update
        `,
        [id]
      );
      const row = current.rows[0];
      if (!row) {
        const error = new Error('Product not found');
        (error as Error & { status?: number }).status = 404;
        throw error;
      }

      const nextQty = body.qty ?? row.qty;
      const delta = nextQty - row.qty;
      if (delta !== 0) {
        await client.query(
          `
          insert into stock_movements (branch_id, product_id, change, reason, note, created_by)
          values ($1, $2, $3, 'ADJUST', 'Manual product edit', $4)
          `,
          [row.branch_id, row.id, delta, user.id]
        );
      }

      const updated = await client.query<ProductRow>(
        `
        update products
        set
          name = coalesce($2, name),
          sku = nullif(coalesce($3, sku, ''), ''),
          category = nullif(coalesce($4, category, ''), ''),
          cost_price = coalesce($5, cost_price),
          sale_price = coalesce($6, sale_price),
          qty = $7,
          image_url = nullif(coalesce($8, image_url, ''), ''),
          updated_at = now()
        where id = $1
        returning id, branch_id, name, sku, category, cost_price, sale_price, qty, image_url, updated_at
        `,
        [
          row.id,
          body.name ?? null,
          body.sku ?? null,
          body.category ?? null,
          body.cost_price ?? null,
          body.sale_price ?? null,
          nextQty,
          body.image_url ?? null,
        ]
      );
      await client.query(
        `
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, 'PRODUCT_UPDATE', 'product', $2, $3::jsonb)
        `,
        [
          user.id,
          row.id,
          JSON.stringify({
            name: updated.rows[0].name,
            sku: updated.rows[0].sku,
            before: {
              name: row.name,
              sku: row.sku,
              category: row.category,
              cost_price: Number(row.cost_price),
              sale_price: Number(row.sale_price),
              qty: row.qty,
            },
            after: {
              name: updated.rows[0].name,
              sku: updated.rows[0].sku,
              category: updated.rows[0].category,
              cost_price: Number(updated.rows[0].cost_price),
              sale_price: Number(updated.rows[0].sale_price),
              qty: updated.rows[0].qty,
            },
          }),
        ]
      );
      return updated.rows[0];
    });

    return NextResponse.json({
      product: {
        ...product,
        cost_price: Number(product.cost_price),
        sale_price: Number(product.sale_price),
      },
    });
  } catch (error) {
    return jsonError(error, 'Failed to update product');
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!canManageCatalog(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    const { id } = await params;
    if (isDevFileStoreEnabled()) {
      await deleteDevProduct(id, user.id);
      return NextResponse.json({ ok: true });
    }

    await tx(async (client) => {
      const updated = await client.query(
        `
        update products
        set is_active = false, updated_at = now()
        where id = $1 and is_active = true
        returning id
        `,
        [id]
      );
      if (!updated.rowCount) {
        const error = new Error('Product not found');
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
      await client.query(
        `
        insert into audit_logs (actor_user_id, action, entity_type, entity_id)
        values ($1, 'PRODUCT_DEACTIVATE', 'product', $2)
        `,
        [user.id, id]
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, 'Failed to delete product');
  }
}
