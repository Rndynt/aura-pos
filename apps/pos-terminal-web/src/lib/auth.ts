import { setActiveTenantId } from './tenant';

export type AuthResult = {
  ok: boolean;
  message?: string;
};

async function postAuth(path: string, payload: Record<string, unknown>): Promise<AuthResult> {
  const res = await fetch(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    return {
      ok: false,
      message: body?.message || body?.error || 'Auth request failed',
    };
  }

  return { ok: true };
}

/**
 * Setelah login berhasil, fetch tenantId dari session dan set sebagai active tenant.
 */
async function applyTenantFromSession(): Promise<void> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return;
    const body = await res.json();
    const tenantId: string | null = body?.data?.tenantId ?? null;
    if (tenantId) {
      setActiveTenantId(tenantId);
    }
  } catch {
    // non-fatal — user stays on demo-tenant fallback
  }
}

export async function registerWithEmailAndUsername(input: {
  name: string;
  email: string;
  username: string;
  password: string;
}): Promise<AuthResult> {
  return postAuth('sign-up/email', input);
}

export async function loginWithEmailOrUsername(input: {
  identifier: string;
  password: string;
}): Promise<AuthResult> {
  // Coba username dulu
  const byUsername = await postAuth('sign-in/username', {
    username: input.identifier,
    password: input.password,
  });

  if (byUsername.ok) {
    await applyTenantFromSession();
    return byUsername;
  }

  // Fallback ke email
  const byEmail = await postAuth('sign-in/email', {
    email: input.identifier,
    password: input.password,
  });

  if (byEmail.ok) {
    await applyTenantFromSession();
  }

  return byEmail;
}
