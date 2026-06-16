'use client';

import Link from 'next/link';
import Image from 'next/image';
import { FormEvent, useEffect, useState } from 'react';
import { useRole, type CurrentUser } from '@/lib/useRole';
import { useI18n } from '@/lib/i18n';

type Stats = {
  products: number;
  lowStock: number;
  movementsToday: number;
};

type MenuTileProps = {
  title: string;
  subtitle: string;
  image: string;
  href?: string;
  onClick?: () => void;
  tone?: 'default' | 'danger';
};

const BRAND_NAME = 'Peak World Toy';
const LOGO_SRC = '/logo.png';

function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 dark:ring-zinc-800 ${
        compact ? 'h-16 w-16 p-1' : 'mx-auto h-32 w-32 p-2'
      }`}
    >
      <Image src={LOGO_SRC} alt={BRAND_NAME} fill priority sizes={compact ? '64px' : '128px'} className="object-contain" />
    </div>
  );
}

function MenuTile({ title, subtitle, image, href, onClick, tone = 'default' }: MenuTileProps) {
  const content = (
    <>
      <div className="relative mx-auto mt-3 aspect-square w-[58%] max-w-28">
        <Image src={image} alt="" fill priority={false} className="object-contain" />
      </div>
      <div className="flex min-h-20 flex-1 flex-col items-center justify-center px-2 pb-3 text-center">
        <div
          className={`text-lg font-semibold leading-tight sm:text-xl ${
            tone === 'danger' ? 'text-red-700 dark:text-red-300' : 'text-zinc-950 dark:text-zinc-50'
          }`}
        >
          {title}
        </div>
        <div className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400 sm:text-sm">
          {subtitle}
        </div>
      </div>
    </>
  );
  const className =
    'card card-hover flex aspect-square min-h-36 flex-col overflow-hidden p-2 transition active:scale-[0.99]';

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`${className} w-full`}>
      {content}
    </button>
  );
}

export default function Home() {
  const { user, role, canManage, canViewReports, loading, refresh } = useRole();
  const { language, t } = useI18n();
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
    return <div className="py-16 text-center text-zinc-500">{t('loading')}</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto mt-10 max-w-md space-y-5">
        <div className="space-y-3 text-center">
          <BrandLogo />
          <h1 className="text-2xl font-semibold">{BRAND_NAME}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('signInSubtitle')}</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">{t('emailOrUsername')}</span>
            <input
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">{t('password')}</span>
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
            {busy ? t('signingIn') : t('signIn')}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLogo compact />
          <div>
            <h1 className="text-3xl font-semibold">{BRAND_NAME}</h1>
            <p className="text-sm text-zinc-500">
              {user.display_name} ({role})
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/products" className="card card-hover p-4">
          <div className="text-sm text-zinc-500">{t('productsAll')}</div>
          <div className="mt-1 text-3xl font-semibold">{stats?.products ?? '-'}</div>
        </Link>
        <Link href="/products?filter=low" className="card card-hover p-4">
          <div className="text-sm text-zinc-500">{t('qtyLow')}</div>
          <div className="mt-1 text-3xl font-semibold text-amber-600">{stats?.lowStock ?? '-'}</div>
        </Link>
        <Link href="/movements" className="card card-hover p-4">
          <div className="text-sm text-zinc-500">{t('today')}</div>
          <div className="mt-1 text-3xl font-semibold">{stats?.movementsToday ?? '-'}</div>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MenuTile
          href="/products"
          title={t('products')}
          subtitle={t('productsSubtitle')}
          image="/menu/products.svg"
        />
        {canManage ? (
          <MenuTile
            href="/products/new"
            title={t('addProduct')}
            subtitle={t('addProductSubtitle')}
            image="/menu/add-product.svg"
          />
        ) : null}
        <MenuTile
          href="/movements"
          title={t('viewHistory')}
          subtitle={t('viewHistorySubtitle')}
          image="/menu/movements.svg"
        />
        {canViewReports ? (
          <MenuTile
            href="/audit"
            title={language === 'th' ? 'บันทึกใช้งาน' : 'Audit'}
            subtitle={language === 'th' ? 'ดูว่าใครทำอะไร' : 'Who did what'}
            image="/menu/audit.svg"
          />
        ) : null}
        {canManage ? (
          <MenuTile
            href="/admin/import-export"
            title={t('csvImportExport')}
            subtitle={t('importSubtitle')}
            image="/menu/import-export.svg"
          />
        ) : null}
        {role === 'OWNER' || role === 'MANAGER' ? (
          <MenuTile
            href="/admin/users"
            title={t('users')}
            subtitle={t('usersSubtitle')}
            image="/menu/users.svg"
          />
        ) : null}
        <MenuTile
          href="/settings"
          title={t('settings')}
          subtitle={t('settingsSubtitle')}
          image="/menu/settings.svg"
        />
        <MenuTile
          title={t('logout')}
          subtitle={t('logoutSubtitle')}
          image="/menu/logout.svg"
          onClick={logout}
          tone="danger"
        />
      </div>
    </div>
  );
}
