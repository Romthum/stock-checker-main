import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { query } from './db';
import { findDevUserById, isDevFileStoreEnabled } from './devStore';

export type Role = 'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'AUDITOR' | 'STAFF';

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
};

export const SESSION_COOKIE = 'pos_session';
export const DEV_FALLBACK_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEV_AUTH_SECRET = 'local-development-auth-secret-change-before-production';
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 7);

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if ((!secret || secret.length < 32) && process.env.NODE_ENV !== 'production') {
    return new TextEncoder().encode(DEV_AUTH_SECRET);
  }
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export function isDevAuthFallbackEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH_FALLBACK !== 'false';
}

export function getDevFallbackUser(): AuthUser {
  return {
    id: DEV_FALLBACK_USER_ID,
    email: process.env.ADMIN_EMAIL ?? 'owner@example.com',
    display_name: process.env.ADMIN_DISPLAY_NAME ?? 'Development Owner',
    role: 'OWNER',
  };
}

export function getDevFallbackPassword() {
  return process.env.ADMIN_PASSWORD ?? 'ChangeMe-Owner-Password-123!';
}

async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload.sub;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const userId = await verifySessionToken(token);
    if (!userId) return null;
    if (isDevAuthFallbackEnabled() && userId === DEV_FALLBACK_USER_ID) {
      return getDevFallbackUser();
    }
    if (isDevFileStoreEnabled()) {
      const devUser = await findDevUserById(userId);
      if (devUser) return devUser;
    }
    const result = await query<AuthUser>(
      `
      select id, email, display_name, role
      from users
      where id = $1 and is_active = true
      limit 1
      `,
      [userId]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function requireUser(allowedRoles?: Role[]) {
  const user = await getCurrentUser();
  if (!user) {
    const error = new Error('Authentication required');
    (error as Error & { status?: number }).status = 401;
    throw error;
  }
  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    const error = new Error('Insufficient permissions');
    (error as Error & { status?: number }).status = 403;
    throw error;
  }
  return user;
}

export function canManageCatalog(role: Role) {
  return role === 'OWNER' || role === 'MANAGER' || role === 'INVENTORY_STAFF';
}

export function canViewReports(role: Role) {
  return role === 'OWNER' || role === 'MANAGER' || role === 'AUDITOR';
}
