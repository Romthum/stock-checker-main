'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Movement = {
  id: string;
  change: number;
  reason: string;
  created_at: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
  };
};

type RangeKey = 'today' | '7d' | '30d' | 'custom';

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default function MovementsPage() {
  const [rows, setRows] = useState<Movement[]>([]);
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (rangeKey === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (rangeKey === '7d') {
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (rangeKey === '30d') {
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else {
      if (from) start.setTime(new Date(`${from}T00:00:00`).getTime());
      if (to) end.setTime(new Date(`${to}T23:59:59`).getTime());
    }
    return { start, end };
  }, [rangeKey, from, to]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        from: range.start.toISOString(),
        to: range.end.toISOString(),
        limit: '1000',
      });
      const res = await fetch(`/api/movements?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load movements');
      setRows(json.movements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load movements');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start.toISOString(), range.end.toISOString()]);

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc.net += row.change;
        if (row.reason === 'SALE') acc.sale += Math.abs(row.change);
        if (row.reason === 'RESTOCK') acc.restock += row.change;
        if (row.reason === 'ADJUST') acc.adjust += row.change;
        return acc;
      },
      { total: 0, sale: 0, restock: 0, adjust: 0, net: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          Home
        </Link>
        <h1 className="text-lg font-semibold">Stock movements</h1>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2">
          {(['today', '7d', '30d'] as RangeKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setRangeKey(key)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                rangeKey === key ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 dark:border-zinc-700'
              }`}
            >
              {key === 'today' ? 'Today' : key}
            </button>
          ))}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setRangeKey('custom');
            }}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setRangeKey('custom');
            }}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button onClick={load} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white">
            Refresh
          </button>
        </div>
        <div className="text-xs text-zinc-500">
          {toDateInput(range.start)} to {toDateInput(range.end)}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <div className="card p-3">
          <div className="text-xs text-zinc-500">Rows</div>
          <div className="text-2xl font-semibold">{stats.total}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-zinc-500">Sold</div>
          <div className="text-2xl font-semibold text-red-600">{stats.sale}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-zinc-500">Restocked</div>
          <div className="text-2xl font-semibold text-emerald-600">{stats.restock}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-zinc-500">Adjusted</div>
          <div className="text-2xl font-semibold">{stats.adjust}</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-zinc-500">Net</div>
          <div className="text-2xl font-semibold">{stats.net}</div>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-right">Change</th>
              <th className="px-3 py-2 text-left">Reason</th>
              <th className="px-3 py-2 text-left">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  Loading...
                </td>
              </tr>
            ) : rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{row.product.name}</td>
                  <td className="px-3 py-2 text-zinc-500">{row.product.sku || '-'}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${row.change < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {row.change > 0 ? `+${row.change}` : row.change}
                  </td>
                  <td className="px-3 py-2">{row.reason}</td>
                  <td className="px-3 py-2 text-zinc-500">{new Date(row.created_at).toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  No movements found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
