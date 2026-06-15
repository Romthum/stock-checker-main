'use client';

import { useEffect, useState } from 'react';
import ImageUpload from './ImageUpload';

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  cost_price?: number | null;
  sale_price?: number | null;
  qty?: number | null;
  category?: string | null;
  image_url?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  product: Partial<Product>;
  onSaved: () => void;
};

export default function EditProductModal({ open, onClose, product, onSaved }: Props) {
  const [form, setForm] = useState<Product>({
    id: '',
    name: '',
    sku: '',
    cost_price: 0,
    sale_price: 0,
    qty: 0,
    category: '',
    image_url: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!product.id) return;
    setForm({
      id: product.id,
      name: product.name ?? '',
      sku: product.sku ?? '',
      cost_price: product.cost_price ?? 0,
      sale_price: product.sale_price ?? 0,
      qty: product.qty ?? 0,
      category: product.category ?? '',
      image_url: product.image_url ?? '',
    });
    setError('');
  }, [product]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/products/${form.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          category: form.category,
          cost_price: Number(form.cost_price ?? 0),
          sale_price: Number(form.sale_price ?? 0),
          qty: Number(form.qty ?? 0),
          image_url: form.image_url,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!confirm(`Delete "${form.name}"?`)) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/products/${form.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950 p-5 text-zinc-100 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edit product</h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-400 hover:text-white">
            Close
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <ImageUpload
            value={form.image_url ?? ''}
            onChange={(url) => setForm((prev) => ({ ...prev, image_url: url }))}
          />

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-400">Name</span>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">SKU / Barcode</span>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={form.sku ?? ''}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Category</span>
                <input
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={form.category ?? ''}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Cost</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={form.cost_price ?? 0}
                  onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Price</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={form.sale_price ?? 0}
                  onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">Stock</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={form.qty ?? 0}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                />
              </label>
            </div>
          </div>
        </div>

        {error ? <div className="mt-4 text-sm text-red-400">{error}</div> : null}

        <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-4">
          <button
            onClick={del}
            disabled={busy}
            className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-500 disabled:opacity-60"
          >
            Delete
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
