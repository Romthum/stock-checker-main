'use client';

import { useEffect, useState } from 'react';

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'AUDITOR' | 'STAFF' | null;

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  role: Exclude<Role, null>;
};

const AUTH_CHECK_TIMEOUT_MS = 8000;

export function useRole() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
      if (!res.ok) {
        setUser(null);
        return;
      }
      const json = await res.json();
      setUser(json.user ?? null);
    } catch {
      setUser(null);
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const role = user?.role ?? null;
  const canManage = role === 'OWNER' || role === 'MANAGER' || role === 'INVENTORY_STAFF';
  const canAdminUsers = role === 'OWNER';
  const canViewReports = role === 'OWNER' || role === 'MANAGER' || role === 'AUDITOR';

  return { user, role, canManage, canAdminUsers, canViewReports, loading, refresh };
}
