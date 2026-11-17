/**
 * `nuxt-auth-utils` type augmentation. The sealed cookie only ever carries a
 * server-side session id plus short-lived OAuth handshake data; everything
 * else is re-resolved from the orchestrator on each request.
 */
declare module '#auth-utils' {
  interface User {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  }

  interface UserSession {
    sessionId?: string;
  }

  interface SecureSessionData {
    oauthState?: string;
    oauthVerifier?: string;
    oauthRedirect?: string;
  }
}

export {};
