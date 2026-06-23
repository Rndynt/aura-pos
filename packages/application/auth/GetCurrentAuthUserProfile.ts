export type AuthSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type AuthUserProfile = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  tenantId: string | null;
  role: string | null;
};

export type GetCurrentAuthUserProfileResult =
  | { success: true; profile: AuthUserProfile }
  | { success: false; reason: 'unauthenticated' };

export type AuthUserProfileReaderPort = {
  findById(userId: string): Promise<{
    username: string | null;
    tenantId: string | null;
    role: string | null;
  } | null>;
};

export class GetCurrentAuthUserProfile {
  constructor(private readonly reader: AuthUserProfileReaderPort) {}

  async execute(sessionUser: AuthSessionUser | null | undefined): Promise<GetCurrentAuthUserProfileResult> {
    if (!sessionUser?.id) {
      return { success: false, reason: 'unauthenticated' };
    }

    const persistedProfile = await this.reader.findById(sessionUser.id);

    return {
      success: true,
      profile: {
        id: sessionUser.id,
        name: sessionUser.name ?? null,
        email: sessionUser.email ?? null,
        username: persistedProfile?.username ?? null,
        tenantId: persistedProfile?.tenantId ?? null,
        role: persistedProfile?.role ?? null,
      },
    };
  }
}
