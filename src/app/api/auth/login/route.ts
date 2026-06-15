import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSessionToken,
  DEV_FALLBACK_USER_ID,
  getDevFallbackPassword,
  getDevFallbackUser,
  isDevAuthFallbackEnabled,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from '@/server/auth';
import { query } from '@/server/db';
import { jsonError } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

type LoginRow = {
  id: string;
  email: string;
  display_name: string;
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'AUDITOR' | 'STAFF';
  password_hash: string;
};

async function fallbackLogin(login: string, password: string) {
  if (!isDevAuthFallbackEnabled()) return null;
  const fallbackUser = getDevFallbackUser();
  const allowedLogin = [fallbackUser.email, 'owner'].map((item) => item.toLowerCase());
  if (!allowedLogin.includes(login)) return null;
  if (password !== getDevFallbackPassword()) return null;
  return fallbackUser;
}

export async function POST(req: Request) {
  try {
    const body = LoginSchema.parse(await req.json());
    const login = body.login.trim().toLowerCase();
    let user:
      | {
          id: string;
          email: string;
          display_name: string;
          role: LoginRow['role'];
        }
      | null = null;

    try {
      const result = await query<LoginRow>(
        `
        select id, email, display_name, role, password_hash
        from users
        where is_active = true
          and (lower(email) = $1 or lower(coalesce(username, '')) = $1)
        limit 1
        `,
        [login]
      );

      const dbUser = result.rows[0];
      if (dbUser && (await verifyPassword(body.password, dbUser.password_hash))) {
        user = dbUser;
      }
    } catch (error) {
      const devUser = await fallbackLogin(login, body.password);
      if (!devUser) throw error;
      user = { ...devUser, id: DEV_FALLBACK_USER_ID };
    }

    if (!user) {
      return NextResponse.json({ error: 'Invalid login or password' }, { status: 401 });
    }

    const token = await createSessionToken(user.id);
    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (error) {
    return jsonError(error, 'Login failed');
  }
}
