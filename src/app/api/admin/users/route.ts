import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { hashPassword, requireUser } from '@/server/auth';
import { query, tx } from '@/server/db';
import {
  createDevUser,
  deactivateDevUser,
  isDevFileStoreEnabled,
  listDevUsers,
  updateDevUser,
} from '@/server/devStore';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RoleSchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'AUDITOR', 'STAFF']);

const CreateUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  display_name: z.string().trim().optional().nullable(),
  role: RoleSchema.default('STAFF'),
  password: z.string().trim().min(8).optional().nullable(),
});

const UpdateUserSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().optional().nullable(),
  role: RoleSchema.optional(),
  is_active: z.boolean().optional(),
  reset_password: z.boolean().optional(),
});

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

function makeTempPassword() {
  return `Temp-${crypto.randomBytes(9).toString('base64url')}!1`;
}

async function ensureNotLastOwner(userId: string) {
  const result = await query<{ count: string }>(
    `select count(*) from users where role = 'OWNER' and is_active = true and id <> $1`,
    [userId]
  );
  if (Number(result.rows[0].count) < 1) {
    const error = new Error('Cannot remove or demote the last active owner');
    (error as Error & { status?: number }).status = 400;
    throw error;
  }
}

export async function GET() {
  try {
    const currentUser = await requireUser(['OWNER', 'MANAGER']);
    if (isDevFileStoreEnabled()) {
      return NextResponse.json({ users: await listDevUsers(currentUser) });
    }
    const result = await query<UserRow>(`
      select id, email, display_name, role, is_active, created_at
      from users
      order by created_at desc
    `);
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    return jsonError(error, 'Failed to load users');
  }
}

export async function POST(req: Request) {
  try {
    const currentUser = await requireUser(['OWNER']);
    const body = CreateUserSchema.parse(await req.json());
    if (isDevFileStoreEnabled()) {
      const result = await createDevUser({
        email: body.email,
        display_name: body.display_name,
        role: body.role,
        password: body.password,
        actorUserId: currentUser.id,
      });
      return NextResponse.json(result);
    }
    const tempPassword = body.password ?? makeTempPassword();
    const passwordHash = await hashPassword(tempPassword);
    const result = await query<UserRow>(
      `
      insert into users (email, username, password_hash, display_name, role)
      values ($1, $1, $2, $3, $4)
      on conflict (email) do update set
        password_hash = excluded.password_hash,
        display_name = excluded.display_name,
        role = excluded.role,
        is_active = true,
        updated_at = now()
      returning id, email, display_name, role, is_active, created_at
      `,
      [
        body.email.toLowerCase(),
        passwordHash,
        body.display_name || body.email.toLowerCase(),
        body.role,
      ]
    );
    await query(
      `
      insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, 'USER_UPSERT', 'user', $2, $3::jsonb)
      `,
      [
        currentUser.id,
        result.rows[0].id,
        JSON.stringify({ email: result.rows[0].email, role: result.rows[0].role }),
      ]
    );
    return NextResponse.json({
      user: result.rows[0],
      tempPassword: body.password ? undefined : tempPassword,
    });
  } catch (error) {
    return jsonError(error, 'Failed to create user');
  }
}

export async function PATCH(req: Request) {
  try {
    const currentUser = await requireUser(['OWNER']);
    const body = UpdateUserSchema.parse(await req.json());
    if (isDevFileStoreEnabled()) {
      const result = await updateDevUser({ ...body, actorUserId: currentUser.id });
      return NextResponse.json(result);
    }
    const tempPassword = body.reset_password ? makeTempPassword() : null;
    const passwordHash = tempPassword ? await hashPassword(tempPassword) : null;

    const user = await tx(async (client) => {
      const current = await client.query<{ role: string; is_active: boolean }>(
        `select role, is_active from users where id = $1 for update`,
        [body.id]
      );
      if (!current.rows[0]) {
        const error = new Error('User not found');
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
      if (
        current.rows[0].role === 'OWNER' &&
        (body.role && body.role !== 'OWNER' || body.is_active === false)
      ) {
        await ensureNotLastOwner(body.id);
      }

      const updated = await client.query<UserRow>(
        `
        update users
        set
          display_name = coalesce($2, display_name),
          role = coalesce($3, role),
          is_active = coalesce($4, is_active),
          password_hash = coalesce($5, password_hash),
          updated_at = now()
        where id = $1
        returning id, email, display_name, role, is_active, created_at
        `,
        [
          body.id,
          body.display_name ?? null,
          body.role ?? null,
          body.is_active ?? null,
          passwordHash,
        ]
      );
      await client.query(
        `
        insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        values ($1, 'USER_UPDATE', 'user', $2, $3::jsonb)
        `,
        [
          currentUser.id,
          updated.rows[0].id,
          JSON.stringify({
            email: updated.rows[0].email,
            role: updated.rows[0].role,
            is_active: updated.rows[0].is_active,
            reset_password: Boolean(body.reset_password),
          }),
        ]
      );
      return updated.rows[0];
    });

    return NextResponse.json({ user, tempPassword });
  } catch (error) {
    return jsonError(error, 'Failed to update user');
  }
}

export async function DELETE(req: Request) {
  try {
    const currentUser = await requireUser(['OWNER']);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    if (isDevFileStoreEnabled()) {
      await deactivateDevUser(id, currentUser.id);
      return NextResponse.json({ ok: true });
    }
    const current = await query<{ role: string }>(`select role from users where id = $1`, [id]);
    if (current.rows[0]?.role === 'OWNER') await ensureNotLastOwner(id);
    await query(`update users set is_active = false, updated_at = now() where id = $1`, [id]);
    await query(
      `
      insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
      values ($1, 'USER_DEACTIVATE', 'user', $2, $3::jsonb)
      `,
      [currentUser.id, id, JSON.stringify({ role: current.rows[0]?.role ?? null })]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, 'Failed to deactivate user');
  }
}
