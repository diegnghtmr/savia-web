import { describe, expect, it, vi } from "vitest";

import {
  mapAuthError,
  signIn,
  signOut,
  signUp,
  type AuthClient,
  type AuthPorts,
} from "../src/lib/auth-gateway";
import { AUTH_RESULT_KINDS } from "../src/lib/auth-result";

function mockPorts(client: AuthClient): AuthPorts {
  return {
    getClient: () => Promise.resolve(client),
  };
}

describe("auth gateway", () => {
  const credentials = {
    email: "user@example.com",
    password: "secret-password",
  };

  describe("signIn", () => {
    it("returns signedIn when credentials are valid and cookies persist", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn(),
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              user: { id: "user-123" },
              session: { access_token: "valid-token" },
            },
            error: null,
          }),
          signOut: vi.fn(),
        },
      };

      const result = await signIn(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.signedIn });
    });

    it("returns unavailable and NEVER signedIn when the cookie store write fails even if auth succeeds", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn(),
          signInWithPassword: vi.fn().mockImplementation(() => {
            // Simulates Supabase auth succeeding over HTTP but writableSessionClient
            // cookie adapter throwing because Next.js cookie store set() threw.
            throw new Error("Cookies can only be modified in a Server Action");
          }),
          signOut: vi.fn(),
        },
      };

      const result = await signIn(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.unavailable });
      expect(result.kind).not.toBe(AUTH_RESULT_KINDS.signedIn);
    });

    it("returns invalidCredentials when auth reports invalid_credentials code", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn(),
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: "invalid_credentials",
              message: "Invalid login credentials",
            },
          }),
          signOut: vi.fn(),
        },
      };

      const result = await signIn(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.invalidCredentials });
    });
  });

  describe("signUp", () => {
    it("returns confirmationRequired when signUp returns a null session (email confirmation ON)", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: { id: "user-123" },
              session: null,
            },
            error: null,
          }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        },
      };

      const result = await signUp(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.confirmationRequired });
    });

    it("returns signedIn when signUp returns an active session", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: {
              user: { id: "user-123" },
              session: { access_token: "active-token" },
            },
            error: null,
          }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        },
      };

      const result = await signUp(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.signedIn });
    });

    it("returns userAlreadyExists when code is user_already_exists", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: "user_already_exists",
              message: "User already registered",
            },
          }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        },
      };

      const result = await signUp(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.userAlreadyExists });
    });

    it("returns weakPassword when code is weak_password", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: {
              code: "weak_password",
              message: "Password should be at least 6 characters",
            },
          }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        },
      };

      const result = await signUp(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.weakPassword });
    });

    it("returns unavailable when client throws on signUp", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn().mockRejectedValue(new Error("network failure")),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        },
      };

      const result = await signUp(credentials, mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.unavailable });
    });
  });

  describe("signOut", () => {
    it("returns signedOut on successful sign out", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn(),
          signInWithPassword: vi.fn(),
          signOut: vi.fn().mockResolvedValue({ error: null }),
        },
      };

      const result = await signOut(mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.signedOut });
    });

    it("returns failed when sign out returns an error", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn(),
          signInWithPassword: vi.fn(),
          signOut: vi.fn().mockResolvedValue({
            error: { code: "unexpected_failure", message: "Sign out failed" },
          }),
        },
      };

      const result = await signOut(mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.failed });
    });

    it("returns unavailable when sign out throws", async () => {
      const client: AuthClient = {
        auth: {
          signUp: vi.fn(),
          signInWithPassword: vi.fn(),
          signOut: vi.fn().mockRejectedValue(new Error("store unavailable")),
        },
      };

      const result = await signOut(mockPorts(client));
      expect(result).toEqual({ kind: AUTH_RESULT_KINDS.unavailable });
    });
  });

  describe("mapAuthError", () => {
    it("maps confirmed Supabase JS 2.110.9 auth error codes", () => {
      expect(mapAuthError({ code: "invalid_credentials" })).toEqual({
        kind: AUTH_RESULT_KINDS.invalidCredentials,
      });
      expect(mapAuthError({ code: "user_already_exists" })).toEqual({
        kind: AUTH_RESULT_KINDS.userAlreadyExists,
      });
      expect(mapAuthError({ code: "weak_password" })).toEqual({
        kind: AUTH_RESULT_KINDS.weakPassword,
      });
      expect(mapAuthError({ code: "over_request_rate_limit" })).toEqual({
        kind: AUTH_RESULT_KINDS.unavailable,
      });
      expect(mapAuthError({ code: "unknown_code" })).toEqual({
        kind: AUTH_RESULT_KINDS.failed,
      });
      expect(mapAuthError(null)).toEqual({
        kind: AUTH_RESULT_KINDS.failed,
      });
    });
  });
});
