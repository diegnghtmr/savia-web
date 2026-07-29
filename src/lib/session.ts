import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { loadServerConfig } from "./server-config";

export const SESSION_KINDS = { present: "present", absent: "absent" } as const;

/**
 * The only session shape the rest of the server boundary may observe. There is
 * no sign-in flow yet, so `absent` is the ordinary state and must be handled
 * as a value rather than as an exception.
 */
export type Session =
  | {
      readonly kind: typeof SESSION_KINDS.present;
      readonly accessToken: string;
    }
  | { readonly kind: typeof SESSION_KINDS.absent };

export interface SessionCookie {
  readonly name: string;
  readonly value: string;
}

/** The subset of the Next.js cookie store this module needs. */
export interface SessionCookieStore {
  getAll(): SessionCookie[];
  set(name: string, value: string, options: CookieOptions): void;
}

/**
 * The Supabase cookie contract, narrowed to what this module implements. The
 * second `setAll` parameter carries the library's cache-control headers; this
 * boundary has no response object to set them on, so it is accepted and
 * ignored rather than dropped from the signature.
 */
export interface SessionCookieMethods {
  getAll(): SessionCookie[];
  setAll(
    cookiesToSet: { name: string; value: string; options: CookieOptions }[],
    headers?: Record<string, string>,
  ): void;
}

/** The subset of a Supabase client this module needs. */
export interface SessionReader {
  readonly auth: {
    getSession(): Promise<{
      data: { session: { access_token?: string | null } | null };
      error: unknown;
    }>;
  };
}

/**
 * Adapts a Next.js cookie store to the Supabase cookie contract and pins every
 * written cookie to `httpOnly`.
 *
 * `@supabase/ssr` defaults `httpOnly` to `false`, which would put the session
 * credential inside reach of browser JavaScript. ADR-0018 forbids that, so the
 * flag is overridden after the library's options are spread rather than merely
 * configured alongside them.
 */
export function httpOnlyCookieMethods(
  store: SessionCookieStore,
): SessionCookieMethods {
  return {
    getAll: (): SessionCookie[] => store.getAll(),
    setAll: (
      cookiesToSet: {
        name: string;
        value: string;
        options: CookieOptions;
      }[],
    ): void => {
      for (const { name, value, options } of cookiesToSet) {
        try {
          store.set(name, value, { ...options, httpOnly: true });
        } catch {
          // Server Components render with a read-only cookie store. A refresh
          // that cannot be persisted here is retried on the next request, so
          // dropping the write is preferable to failing the render.
        }
      }
    },
  };
}

/**
 * Resolves the current access token, or reports its absence.
 *
 * The token is read from the cookie session rather than verified here: the
 * backend is the verifying authority (it checks issuer, audience, and
 * signature against the JWKS), and this boundary makes no authorisation
 * decision of its own. Every failure — no session, a Supabase error, or a
 * rejected read — collapses to `absent` so callers have one path to handle.
 */
export async function readSession(reader: SessionReader): Promise<Session> {
  try {
    const { data, error } = await reader.auth.getSession();
    const accessToken = data.session?.access_token?.trim();
    if (error || !accessToken) return { kind: SESSION_KINDS.absent };
    return { kind: SESSION_KINDS.present, accessToken };
  } catch {
    return { kind: SESSION_KINDS.absent };
  }
}

/** Builds a request-scoped Supabase client bound to the Next.js cookie store. */
export async function sessionClient(): Promise<SessionReader> {
  const config = loadServerConfig();
  const store = await cookies();
  return createServerClient(config.supabaseUrl.href, config.supabaseAnonKey, {
    cookies: httpOnlyCookieMethods(store),
  });
}

/** The composed read used by Server Components and Server Actions. */
export async function currentSession(): Promise<Session> {
  try {
    return await readSession(await sessionClient());
  } catch {
    // A missing or invalid configuration must not surface as a crash to a
    // caller that only asked whether somebody is signed in.
    return { kind: SESSION_KINDS.absent };
  }
}
