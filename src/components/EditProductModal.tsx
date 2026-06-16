'use client';

import { useEffect, useState } from 'react';
import ImageUpload from './ImageUpload';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
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
    if (!confirm(t('deleteConfirm'))) return;
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:max-w-2xl sm:rounded-lg">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{t('editProduct')}</h2>
            <p className="truncate text-xs text-zinc-500">{form.sku || form.name || t('productDetails')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
          >
            {t('close')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <div className="mx-auto w-full max-w-52 sm:max-w-none">
              <ImageUpload
                value={form.image_url ?? ''}
                onChange={(url) => setForm((prev) => ({ ...prev, image_url: url }))}
              />
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">{t('name')}</span>
                <input
                  className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-400">{t('sku')}</span>
                  <input
                    className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base"
                    value={form.sku ?? ''}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-400">{t('category')}</span>
                  <input
                    className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base"
                    value={form.category ?? ''}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-400">{t('cost')}</span>
                  <input
                    type="number"
                    className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base"
                    value={form.cost_price ?? 0}
                    onChange={(e) => setForm({ ...form, cost_price: Number(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-400">{t('price')}</span>
                  <input
                    type="number"
                    className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base"
                    value={form.sale_price ?? 0}
                    onChange={(e) => setForm({ ...form, sale_price: Number(e.target.value) })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-400">{t('stock')}</span>
                  <input
                    type="number"
                    className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-base"
                    value={form.qty ?? 0}
                    onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                  />
                </label>
              </div>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-lg bg-red-950/50 p-3 text-sm text-red-300">{error}</div> : null}
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-zinc-800 bg-zinc-950 p-4 sm:flex sm:items-center sm:justify-between sm:px-5">
          <button
            type="button"
            onClick={del}
            disabled={busy}
            className="h-12 rounded-lg bg-red-600 px-4 text-white hover:bg-red-500 disabled:opacity-60 sm:h-10"
          >
            {t('delete')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="h-12 rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500 disabled:opacity-60 sm:h-10"
          >
            {busy ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
