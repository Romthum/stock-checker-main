'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/BarcodeScanner';
import ImageUpload from '@/components/ImageUpload';
import { useRole } from '@/lib/useRole';

type FormState = {
  name: string;
  sku: string;
  category: string;
  cost_price: string;
  sale_price: string;
  qty: string;
  image_url: string;
};

export default function NewProductPage() {
  const router = useRouter();
  const { canManage, loading } = useRole();
  const [form, setForm] = useState<FormState>({
    name: '',
    sku: '',
    category: '',
    cost_price: '0',
    sale_price: '0',
    qty: '0',
    image_url: '',
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    fetch('/api/products/categories', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { categories: [] }))
      .then((json) => setCategories(json.categories ?? []));
  }, []);

  function setField(key: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          category: form.category,
          cost_price: Number(form.cost_price || 0),
          sale_price: Number(form.sale_price || 0),
          qty: Number(form.qty || 0),
          image_url: form.image_url,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Create failed');
      router.push('/products');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-zinc-500">Loading...</div>;
  if (!canManage) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.push('/')} className="rounded-lg border px-3 py-2 text-sm">
          Home
        </button>
        <div className="card p-5">You do not have permission to create products.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/products')} className="rounded-lg border px-3 py-2 text-sm">
          Products
        </button>
        <h1 className="text-lg font-semibold">Add product</h1>
      </div>

      <div className="card grid gap-5 p-5 sm:grid-cols-[240px_1fr]">
        <ImageUpload value={form.image_url} onChange={(url) => setField('image_url', url)} />

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Name</span>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-500">SKU / Barcode</span>
              <input
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="self-end rounded-lg bg-zinc-800 px-4 py-2 text-white dark:bg-zinc-700"
            >
              Scan
            </button>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Category</span>
            <input
              list="categories"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
            />
            <datalist id="categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-500">Cost</span>
              <input
                type="number"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={form.cost_price}
                onChange={(e) => setField('cost_price', e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-500">Sale price</span>
              <input
                type="number"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={form.sale_price}
                onChange={(e) => setField('sale_price', e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-500">Initial stock</span>
              <input
                type="number"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
                value={form.qty}
                onChange={(e) => setField('qty', e.target.value)}
              />
            </label>
          </div>

          {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Save product'}
            </button>
          </div>
        </div>
      </div>

      {showScanner ? (
        <BarcodeScanner
          onDetected={(code) => {
            setField('sku', code);
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      ) : null}
    </div>
  );
}
