'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import BarcodeScanner from '@/components/BarcodeScanner';
import EditProductModal from '@/components/EditProductModal';
import { useRole } from '@/lib/useRole';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  sale_price: number;
  cost_price?: number;
  qty: number;
  updated_at: string;
  image_url: string | null;
  category: string | null;
};

const PAGE_SIZE = 40;

export default function ProductsPage() {
  const { canManage } = useRole();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState('All');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [editItem, setEditItem] = useState<Product | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadCategories() {
    const res = await fetch('/api/products/categories', { cache: 'no-store' });
    if (!res.ok) return;
    const json = await res.json();
    setCategories(json.categories ?? []);
  }

  async function loadProducts(reset = true) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (debouncedQ) params.set('q', debouncedQ);
      if (activeCat !== 'All') {
        params.set('category', activeCat === 'Uncategorized' ? '__uncategorized' : activeCat);
      }
      if (!reset && nextCursor) params.set('cursor', nextCursor);

      const res = await fetch(`/api/products?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load products');
      setItems((prev) => (reset ? json.items : [...prev, ...json.items]));
      setNextCursor(json.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    loadProducts(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, activeCat]);

  async function adjust(id: string, delta: number, reason: 'RESTOCK' | 'SALE' | 'ADJUST') {
    setUpdatingId(id);
    setError('');
    try {
      const res = await fetch('/api/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: id, delta, reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Stock update failed');
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, qty: json.qty } : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock update failed');
    } finally {
      setUpdatingId(null);
    }
  }

  const tabs = useMemo(() => ['All', ...categories, 'Uncategorized'], [categories]);

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-30 -mx-3 border-b border-zinc-200 bg-zinc-50/95 px-3 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            Home
          </Link>
          {canManage ? (
            <Link href="/products/new" className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white">
              Add product
            </Link>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder="Search name or barcode"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white dark:bg-zinc-700"
            onClick={() => setShowScanner(true)}
          >
            Scan
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${
              activeCat === cat
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="aspect-square bg-zinc-100 dark:bg-zinc-800">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name}
                  width={480}
                  height={480}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-400">No image</div>
              )}
            </div>
            <div className="space-y-3 p-3">
              <div>
                <div className="line-clamp-2 font-medium">{item.name}</div>
                <div className="mt-1 text-xs text-zinc-500">{item.sku || '-'}</div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Price</span>
                <span className="font-semibold">{item.sale_price.toLocaleString()} THB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Stock</span>
                <span className={item.qty <= 5 ? 'font-semibold text-amber-600' : 'font-semibold'}>
                  {item.qty}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={updatingId === item.id}
                  className="rounded-lg bg-zinc-200 px-3 py-2 text-sm hover:bg-zinc-300 disabled:opacity-60 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                  onClick={() => adjust(item.id, 1, 'RESTOCK')}
                >
                  +1
                </button>
                <button
                  disabled={updatingId === item.id}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-500 disabled:opacity-60"
                  onClick={() => adjust(item.id, -1, 'SALE')}
                >
                  Sell -1
                </button>
              </div>
              {canManage ? (
                <button
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  onClick={() => setEditItem(item)}
                >
                  Edit
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {!loading && !items.length ? (
        <div className="py-12 text-center text-zinc-500">No products found</div>
      ) : null}

      {nextCursor ? (
        <button
          disabled={loading}
          onClick={() => loadProducts(false)}
          className="w-full rounded-lg bg-zinc-200 px-4 py-2 hover:bg-zinc-300 disabled:opacity-60 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        >
          {loading ? 'Loading...' : 'Load more'}
        </button>
      ) : null}

      {showScanner ? (
        <BarcodeScanner
          onDetected={(code) => {
            setShowScanner(false);
            setQ(code);
          }}
          onClose={() => setShowScanner(false)}
        />
      ) : null}

      {editItem ? (
        <EditProductModal
          open={!!editItem}
          product={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            loadProducts(true);
            loadCategories();
          }}
        />
      ) : null}
    </div>
  );
}
