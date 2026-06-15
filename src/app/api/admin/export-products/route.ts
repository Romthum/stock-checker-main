import { requireUser } from '@/server/auth';
import { query } from '@/server/db';
import { allDevProductsForExport, isDevFileStoreEnabled } from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    await requireUser(['OWNER', 'MANAGER', 'INVENTORY_STAFF']);
    const rows = isDevFileStoreEnabled()
      ? await allDevProductsForExport()
      : (await query<{
      name: string;
      sku: string | null;
      category: string | null;
      cost_price: string;
      sale_price: string;
      qty: number;
      image_url: string | null;
    }>(`
      select name, sku, category, cost_price, sale_price, qty, image_url
      from products
      where is_active = true
      order by category asc nulls first, name asc
    `)).rows;

    const header = ['name', 'sku', 'category', 'cost_price', 'sale_price', 'qty', 'image_url'];
    const lines = [
      header.join(','),
      ...rows.map((row) => header.map((key) => csvCell(row[key as keyof typeof row])).join(',')),
    ];

    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="products_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return jsonError(error, 'Failed to export products');
  }
}
