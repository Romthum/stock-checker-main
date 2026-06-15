'use client';

import { useEffect, useState } from 'react';

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'AUDITOR' | 'STAFF' | null;

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  role: Exclude<Role, null>;
};

export function useRole() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const json = await res.json();
      setUser(json.user ?? null);
    } finally {
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
