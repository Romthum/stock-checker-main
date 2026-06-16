'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRole } from '@/lib/useRole';
import { useI18n } from '@/lib/i18n';

type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'AUDITOR' | 'STAFF';

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
};

const roles: Role[] = ['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'AUDITOR', 'STAFF'];

type ApiErrorResponse = {
  error?: string;
  details?: Array<{
    path?: Array<string | number>;
    message?: string;
  }>;
};

function getApiError(json: ApiErrorResponse, fallback: string) {
  if (json.details?.length) {
    return json.details
      .map((detail) => {
        const field = detail.path?.join('.') || 'field';
        return `${field}: ${detail.message ?? 'Invalid value'}`;
      })
      .join(', ');
  }
  return json.error || fallback;
}

export default function UsersPage() {
  const { role, loading } = useRole();
  const { t } = useI18n();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [newRole, setNewRole] = useState<Role>('STAFF');
  const [tempPassword, setTempPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const canView = role === 'OWNER' || role === 'MANAGER';
  const canEdit = role === 'OWNER';

  async function load() {
    setMessage('');
    const res = await fetch('/api/admin/users', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      setMessage(getApiError(json, 'โหลดผู้ใช้ไม่สำเร็จ'));
      return;
    }
    setUsers(json.users ?? []);
  }

  useEffect(() => {
    if (canView) load();
  }, [canView]);

  async function createUser() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setMessage('กรุณากรอกอีเมลให้ถูกต้อง');
      return;
    }
    const newPassword = password.trim();
    if (newPassword.length < 8) {
      setMessage(t('passwordHelp'));
      return;
    }
    setBusy(true);
    setMessage('');
    setTempPassword('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password: newPassword,
          display_name: displayName.trim() || normalizedEmail,
          role: newRole,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(getApiError(json, 'Create failed'));
      setEmail('');
      setPassword('');
      setDisplayName('');
      setMessage(t('savedUser'));
      setTempPassword(json.tempPassword ?? '');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(payload: Partial<UserRow> & { id: string; reset_password?: boolean }) {
    setBusy(true);
    setMessage('');
    setTempPassword('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(getApiError(json, 'Update failed'));
      if (json.tempPassword) setTempPassword(json.tempPassword);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    if (!confirm(t('deactivateConfirm'))) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(getApiError(json, 'Deactivate failed'));
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Deactivate failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="py-12 text-center text-zinc-500">{t('loading')}</div>;
  if (!canView) {
    return (
      <div className="space-y-4">
        <Link href="/" className="rounded-lg border px-3 py-2 text-sm">
          {t('backToHome')}
        </Link>
        <div className="card p-5">{t('youCannotViewUsers')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          {t('backToHome')}
        </Link>
        <h1 className="text-lg font-semibold">{t('users')}</h1>
      </div>

      {canEdit ? (
        <div className="card space-y-3 p-4">
          <div className="font-medium">{t('createAccount')}</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto_auto]">
            <input
              type="email"
              placeholder={t('email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="password"
              placeholder={t('passwordHelp')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              placeholder={t('displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as Role)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            >
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button
              onClick={createUser}
              disabled={busy || !email || password.trim().length < 8}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {t('save')}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{message}</div> : null}
      {tempPassword ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {t('tempPassword')}: <b>{tempPassword}</b>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left">{t('user')}</th>
              <th className="px-3 py-2 text-left">{t('role')}</th>
              <th className="px-3 py-2 text-left">{t('status')}</th>
              <th className="px-3 py-2 text-right">{t('actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-3 py-2">
                  <div className="font-medium">{user.display_name}</div>
                  <div className="text-xs text-zinc-500">{user.email}</div>
                </td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <select
                      value={user.role}
                      onChange={(e) => updateUser({ id: user.id, role: e.target.value as Role })}
                      className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      {roles.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  ) : (
                    user.role
                  )}
                </td>
                <td className="px-3 py-2">{user.is_active ? t('active') : t('inactive')}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => updateUser({ id: user.id, reset_password: true })}
                        className="rounded-lg bg-zinc-200 px-3 py-1.5 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                      >
                        {t('reset')}
                      </button>
                      {user.is_active ? (
                        <button
                          onClick={() => deactivate(user.id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-white hover:bg-red-500"
                        >
                          {t('deactivate')}
                        </button>
                      ) : (
                        <button
                          onClick={() => updateUser({ id: user.id, is_active: true })}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-500"
                        >
                          {t('activate')}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-500">{t('readOnly')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
