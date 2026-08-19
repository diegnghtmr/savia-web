import "server-only";

import {
  AUTH_RESULT_KINDS,
  type AuthCredentials,
  type AuthResult,
} from "./auth-result";
import { writableSessionClient } from "./session";

// Supabase Auth error codes confirmed against @supabase/supabase-js@2.110.9
// (@supabase/auth-js@2.110.9 / lib/error-codes.d.ts):
// - "invalid_credentials"
// - "user_already_exists"
// - "weak_password"
// - "over_request_rate_limit"

/** The subset of a Supabase client the auth gateway needs. */
export interface AuthClient {
  readonly auth: {
    signUp(credentials: { email: string; password: string }): Promise<{
      data: { user: unknown; session: unknown } | null;
      error: unknown;
    }>;
    signInWithPassword(credentials: {
      email: string;
      password: string;
    }): Promise<{
      data: { user: unknown; session: unknown } | null;
      error: unknown;
    }>;
    signOut(): Promise<{ error: unknown }>;
  };
}

/** The collaborators the gateway binds to their real implementations. */
export interface AuthPorts {
  readonly getClient: () => Promise<AuthClient>;
}

export const productionAuthPorts: AuthPorts = {
  getClient: writableSessionClient,
};

/**
 * Maps a Supabase Auth error into a client-safe AuthResult.
 * Error codes confirmed against @supabase/supabase-js@2.110.9.
 */
export function mapAuthError(error: unknown): AuthResult {
  if (typeof error !== "object" || error === null) {
    return { kind: AUTH_RESULT_KINDS.failed };
  }

  const { code } = error as Record<string, unknown>;

  if (code === "invalid_credentials") {
    return { kind: AUTH_RESULT_KINDS.invalidCredentials };
  }

  if (code === "user_already_exists") {
    return { kind: AUTH_RESULT_KINDS.userAlreadyExists };
  }

  if (code === "weak_password") {
    return { kind: AUTH_RESULT_KINDS.weakPassword };
  }

  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit"
  ) {
    return { kind: AUTH_RESULT_KINDS.unavailable };
  }

  return { kind: AUTH_RESULT_KINDS.failed };
}

/**
 * Signs in with email and password, using write-strict cookie persistence.
 */
export async function signIn(
  credentials: AuthCredentials,
  ports: AuthPorts = productionAuthPorts,
): Promise<AuthResult> {
  try {
    const client = await ports.getClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return mapAuthError(error);
    }

    if (data?.session) {
      return { kind: AUTH_RESULT_KINDS.signedIn };
    }

    return { kind: AUTH_RESULT_KINDS.failed };
  } catch (error) {
    console.error(
      "Sign-in failed at the session or auth client boundary.",
      error instanceof Error ? error.message : String(error),
    );
    return { kind: AUTH_RESULT_KINDS.unavailable };
  }
}

/**
 * Registers a user with email and password.
 * When email confirmation is required, Supabase returns a null session.
 */
export async function signUp(
  credentials: AuthCredentials,
  ports: AuthPorts = productionAuthPorts,
): Promise<AuthResult> {
  try {
    const client = await ports.getClient();
    const { data, error } = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return mapAuthError(error);
    }

    if (data?.session) {
      return { kind: AUTH_RESULT_KINDS.signedIn };
    }

    // Email confirmation is enabled by project decision: null session means
    // the user was registered and confirmation is required before sign-in.
    return { kind: AUTH_RESULT_KINDS.confirmationRequired };
  } catch (error) {
    console.error(
      "Sign-up failed at the session or auth client boundary.",
      error instanceof Error ? error.message : String(error),
    );
    return { kind: AUTH_RESULT_KINDS.unavailable };
  }
}

/**
 * Signs out the current session.
 */
export async function signOut(
  ports: AuthPorts = productionAuthPorts,
): Promise<AuthResult> {
  try {
    const client = await ports.getClient();
    const { error } = await client.auth.signOut();
    if (error) {
      return { kind: AUTH_RESULT_KINDS.failed };
    }
    return { kind: AUTH_RESULT_KINDS.signedOut };
  } catch (error) {
    console.error(
      "Sign-out failed at the session or auth client boundary.",
      error instanceof Error ? error.message : String(error),
    );
    return { kind: AUTH_RESULT_KINDS.unavailable };
  }
}
