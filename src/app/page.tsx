'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRole, type CurrentUser } from '@/lib/useRole';

type Stats = {
  products: number;
  lowStock: number;
  movementsToday: number;
};

export default function Home() {
  const { user, role, canManage, loading, refresh } = useRole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadStats(currentUser: CurrentUser | null) {
    if (!currentUser) return;
    const res = await fetch('/api/dashboard/stats', { cache: 'no-store' });
    if (!res.ok) return;
    setStats(await res.json());
  }

  useEffect(() => {
    loadStats(user);
    const timer = setInterval(() => loadStats(user), 60_000);
    return () => clearInterval(timer);
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Login failed');
      setPassword('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setStats(null);
    await refresh();
  }

  if (loading) {
    return <div className="py-16 text-center text-zinc-500">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto mt-10 max-w-md space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Local POS</h1>
          <p className="mt-1 text-sm text-zinc-500">Sign in to manage sales and inventory.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Email or username</span>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Password</span>
            <input
              type="password"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error ? <div className="text-sm text-red-600 dark:text-red-400">{error}</div> : null}
          <button
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-60"
          >
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Local POS</h1>
          <p className="text-sm text-zinc-500">
            {user.display_name} ({role})
          </p>
        </div>
        <button
          onClick={logout}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Sign out
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/products" className="card card-hover p-4">
          <div className="text-sm text-zinc-500">Products</div>
          <div className="mt-1 text-3xl font-semibold">{stats?.products ?? '-'}</div>
        </Link>
        <Link href="/products?filter=low" className="card card-hover p-4">
          <div className="text-sm text-zinc-500">Low stock</div>
          <div className="mt-1 text-3xl font-semibold text-amber-600">{stats?.lowStock ?? '-'}</div>
        </Link>
        <Link href="/movements" className="card card-hover p-4">
          <div className="text-sm text-zinc-500">Movements today</div>
          <div className="mt-1 text-3xl font-semibold">{stats?.movementsToday ?? '-'}</div>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/products" className="card card-hover p-5">
          <div className="font-medium">Products and stock</div>
          <div className="mt-1 text-sm text-zinc-500">Search, scan barcode, sell, restock.</div>
        </Link>
        {canManage ? (
          <Link href="/products/new" className="card card-hover p-5">
            <div className="font-medium">Add product</div>
            <div className="mt-1 text-sm text-zinc-500">Create catalog items and initial stock.</div>
          </Link>
        ) : null}
        <Link href="/movements" className="card card-hover p-5">
          <div className="font-medium">Stock movements</div>
          <div className="mt-1 text-sm text-zinc-500">Review sales, restocks, and adjustments.</div>
        </Link>
        {canManage ? (
          <Link href="/admin/import-export" className="card card-hover p-5">
            <div className="font-medium">Import / Export</div>
            <div className="mt-1 text-sm text-zinc-500">Bulk manage product data with CSV.</div>
          </Link>
        ) : null}
        {role === 'OWNER' || role === 'MANAGER' ? (
          <Link href="/admin/users" className="card card-hover p-5">
            <div className="font-medium">Users</div>
            <div className="mt-1 text-sm text-zinc-500">Manage staff accounts and roles.</div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
