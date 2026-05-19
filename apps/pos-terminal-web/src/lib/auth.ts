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
  const maybeUsername = await postAuth('sign-in/username', {
    username: input.identifier,
    password: input.password,
  });

  if (maybeUsername.ok) return maybeUsername;

  return postAuth('sign-in/email', {
    email: input.identifier,
    password: input.password,
  });
}
