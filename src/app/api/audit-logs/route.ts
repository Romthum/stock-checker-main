import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth';
import { query } from '@/server/db';
import { isDevFileStoreEnabled, listDevAuditLogs } from '@/server/devStore';
import { jsonError, parseLimit } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AuditLogRow = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export async function GET(req: Request) {
  try {
    await requireUser(['OWNER', 'MANAGER', 'AUDITOR']);
    const url = new URL(req.url);
    const limit = parseLimit(url.searchParams.get('limit'), 200, 1000);

    if (isDevFileStoreEnabled()) {
      return NextResponse.json({ logs: await listDevAuditLogs(limit) });
    }

    const result = await query<AuditLogRow>(
      `
      select
        al.id::text,
        al.actor_user_id::text,
        coalesce(u.display_name, u.email) as actor_name,
        al.action,
        al.entity_type,
        al.entity_id,
        al.metadata,
        al.created_at
      from audit_logs al
      left join users u on u.id = al.actor_user_id
      order by al.created_at desc
      limit $1
      `,
      [limit]
    );

    return NextResponse.json({ logs: result.rows });
  } catch (error) {
    return jsonError(error, 'Failed to load audit logs');
  }
}
