'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useRole } from '@/lib/useRole';

type AuditLog = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

function textFrom(value: unknown) {
  if (value == null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function AuditPage() {
  const { language, t } = useI18n();
  const { user, canViewReports, loading: authLoading } = useRole();
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionFilter, setActionFilter] = useState('ALL');

  const labels = useMemo(() => {
    const th = language === 'th';
    return {
      title: th ? 'บันทึกการใช้งาน' : 'Audit log',
      subtitle: th ? 'ดูว่าใครเพิ่ม แก้ไข ลบ หรือปรับสต็อก' : 'See who created, edited, deleted, or adjusted stock.',
      action: th ? 'การทำงาน' : 'Action',
      actor: th ? 'ผู้ทำ' : 'Actor',
      target: th ? 'รายการ' : 'Target',
      detail: th ? 'รายละเอียด' : 'Detail',
      noData: th ? 'ยังไม่มีบันทึกการใช้งาน' : 'No audit logs yet',
      denied: th ? 'เฉพาะเจ้าของร้าน ผู้จัดการ และผู้ตรวจสอบเท่านั้น' : 'Only owners, managers, and auditors can view this page.',
      all: th ? 'ทั้งหมด' : 'All',
      latest: th ? 'ล่าสุด 200 รายการ' : 'Latest 200 records',
    };
  }, [language]);

  function actionLabel(action: string) {
    const th = language === 'th';
    const map: Record<string, string> = th
      ? {
          PRODUCT_CREATE: 'เพิ่มสินค้า',
          PRODUCT_UPDATE: 'แก้ไขสินค้า',
          PRODUCT_DELETE: 'ลบสินค้า',
          PRODUCT_IMPORT: 'นำเข้าสินค้า',
          STOCK_ADJUST: 'ปรับสต็อก',
          USER_CREATE: 'เพิ่มผู้ใช้',
          USER_UPSERT: 'เพิ่ม/แก้ผู้ใช้',
          USER_UPDATE: 'แก้ไขผู้ใช้',
          USER_DEACTIVATE: 'ปิดผู้ใช้',
        }
      : {
          PRODUCT_CREATE: 'Create product',
          PRODUCT_UPDATE: 'Update product',
          PRODUCT_DELETE: 'Delete product',
          PRODUCT_IMPORT: 'Import products',
          STOCK_ADJUST: 'Adjust stock',
          USER_CREATE: 'Create user',
          USER_UPSERT: 'Create/update user',
          USER_UPDATE: 'Update user',
          USER_DEACTIVATE: 'Deactivate user',
        };
    return map[action] ?? action;
  }

  function detail(log: AuditLog) {
    const metadata = log.metadata ?? {};
    const name = textFrom(metadata.name);
    const sku = textFrom(metadata.sku);
    const rows = textFrom(metadata.rows);
    const delta = textFrom(metadata.delta);
    const reason = textFrom(metadata.reason);
    const nextQty = textFrom(metadata.next_qty);

    if (log.action === 'PRODUCT_IMPORT') return `rows: ${rows}`;
    if (log.action === 'STOCK_ADJUST') return `${name} / ${sku} / ${delta} / ${reason} / qty ${nextQty}`;
    if (log.action.startsWith('USER')) return `${textFrom(metadata.email)} / ${textFrom(metadata.role)}`;
    return `${name} / ${sku}`;
  }

  async function load() {
    if (!user || !canViewReports) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/audit-logs?limit=200', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load audit logs');
      setRows(json.logs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, canViewReports]);

  const actions = useMemo(() => ['ALL', ...Array.from(new Set(rows.map((row) => row.action)))], [rows]);
  const filteredRows = actionFilter === 'ALL' ? rows : rows.filter((row) => row.action === actionFilter);

  if (authLoading) return <div className="py-12 text-center text-zinc-500">{t('loading')}</div>;

  if (!user || !canViewReports) {
    return (
      <div className="space-y-4">
        <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          {t('backToHome')}
        </Link>
        <div className="card p-5">{user ? labels.denied : t('loginRequired')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
          {t('backToHome')}
        </Link>
        <button onClick={load} className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-white">
          {t('refresh')}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="mt-1 text-sm text-zinc-500">{labels.subtitle}</p>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-500">{labels.latest}</span>
          {actions.map((action) => (
            <button
              key={action}
              onClick={() => setActionFilter(action)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                actionFilter === action
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
              }`}
            >
              {action === 'ALL' ? labels.all : actionLabel(action)}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left">{t('time')}</th>
              <th className="px-3 py-2 text-left">{labels.actor}</th>
              <th className="px-3 py-2 text-left">{labels.action}</th>
              <th className="px-3 py-2 text-left">{labels.target}</th>
              <th className="px-3 py-2 text-left">{labels.detail}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  {t('loading')}
                </td>
              </tr>
            ) : filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-zinc-500">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.actor_name ?? '-'}</td>
                  <td className="px-3 py-2 font-medium">{actionLabel(row.action)}</td>
                  <td className="px-3 py-2 text-zinc-500">{row.entity_type}</td>
                  <td className="px-3 py-2">{detail(row)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                  {labels.noData}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
