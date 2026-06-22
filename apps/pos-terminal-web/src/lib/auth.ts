import { clearActiveTenantCache, setActiveTenantId } from './tenant';
import { clearActiveOutletId } from './outlet';

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
    } else {
      clearActiveTenantCache();
      clearActiveOutletId();
    }
  } catch {
    clearActiveTenantCache();
    clearActiveOutletId();
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
  const looksLikeEmail = input.identifier.includes('@');

  if (looksLikeEmail) {
    // Identifier mengandung '@' → coba email dulu, fallback username
    const byEmail = await postAuth('sign-in/email', {
      email: input.identifier,
      password: input.password,
    });
    if (byEmail.ok) {
      await applyTenantFromSession();
      return byEmail;
    }

    const byUsername = await postAuth('sign-in/username', {
      username: input.identifier,
      password: input.password,
    });
    if (byUsername.ok) {
      await applyTenantFromSession();
      return byUsername;
    }

    return {
      ok: false,
      message: byEmail.message || byUsername.message || 'Email atau password salah.',
    };
  }

  // Identifier tanpa '@' → username saja, jangan fallback ke email
  // (fallback ke email akan menghasilkan error "invalid email" dari Better Auth)
  const byUsername = await postAuth('sign-in/username', {
    username: input.identifier,
    password: input.password,
  });

  if (byUsername.ok) {
    await applyTenantFromSession();
    return byUsername;
  }

  return {
    ok: false,
    message: byUsername.message || 'Username atau password salah.',
  };
}
