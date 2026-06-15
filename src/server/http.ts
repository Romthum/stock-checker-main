import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function jsonError(error: unknown, fallback = 'Request failed') {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Validation failed', details: error.issues },
      { status: 400 }
    );
  }

  const status =
    typeof error === 'object' && error && 'status' in error
      ? Number((error as { status?: number }).status)
      : 500;
  const message = error instanceof Error && error.message ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: Number.isFinite(status) ? status : 500 });
}

export function parseLimit(value: string | null, fallback = 40, max = 200) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}
