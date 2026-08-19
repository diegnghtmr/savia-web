import { createServerClient } from "@supabase/ssr";
import type { MockInstance } from "vitest";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  currentSession,
  httpOnlyCookieMethods,
  readSession,
  requireSession,
  sessionClient,
  writableSessionClient,
  type SessionCookieStore,
  type SessionReader,
} from "../src/lib/session";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

const CONFIG = {
  BACKEND_BASE_URL: "http://127.0.0.1:3000",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
} as const;

function withConfig(overrides: Record<string, string | undefined> = {}): void {
  for (const [name, value] of Object.entries({ ...CONFIG, ...overrides }))
    if (value === undefined) vi.stubEnv(name, "");
    else vi.stubEnv(name, value);
}

function readerReturning(value: unknown): SessionReader {
  return {
    auth: { getSession: () => Promise.resolve(value) },
  } as SessionReader;
}

describe("the server-side session", () => {
  it("reports an absent session when Supabase holds none", async () => {
    const session = await readSession(
      readerReturning({ data: { session: null }, error: null }),
    );
    expect(session).toEqual({ kind: "absent" });
  });

  it("reports an absent session when Supabase reports an error", async () => {
    const session = await readSession(
      readerReturning({
        data: { session: { access_token: "leaked" } },
        error: { message: "refresh_token_not_found" },
      }),
    );
    expect(session).toEqual({ kind: "absent" });
  });

  it("reports an absent session when the access token is blank", async () => {
    const session = await readSession(
      readerReturning({
        data: { session: { access_token: "  " } },
        error: null,
      }),
    );
    expect(session).toEqual({ kind: "absent" });
  });

  it("never throws when reading the session fails outright", async () => {
    const session = await readSession({
      auth: { getSession: () => Promise.reject(new Error("cookie jar gone")) },
    } as SessionReader);
    expect(session).toEqual({ kind: "absent" });
  });

  it("carries the access token when a session exists", async () => {
    const session = await readSession(
      readerReturning({
        data: { session: { access_token: "header.payload.signature" } },
        error: null,
      }),
    );
    expect(session).toEqual({
      kind: "present",
      accessToken: "header.payload.signature",
    });
  });
});

describe("the session cookie writer", () => {
  function storeSpy(): SessionCookieStore & {
    written: { name: string; value: string; options: object }[];
  } {
    const written: { name: string; value: string; options: object }[] = [];
    return {
      written,
      getAll: () => [{ name: "sb-project-auth-token", value: "chunk" }],
      set: (name, value, options) => {
        written.push({ name, value, options });
      },
    };
  }

  it("exposes the request cookies to Supabase", () => {
    expect(httpOnlyCookieMethods(storeSpy()).getAll()).toEqual([
      { name: "sb-project-auth-token", value: "chunk" },
    ]);
  });

  it("forces every session cookie HTTP-only even when Supabase asks otherwise", () => {
    const store = storeSpy();
    httpOnlyCookieMethods(store).setAll(
      [
        {
          name: "sb-project-auth-token.0",
          value: "first",
          options: { httpOnly: false, path: "/", sameSite: "lax" },
        },
        {
          name: "sb-project-auth-token.1",
          value: "second",
          options: { httpOnly: false, path: "/" },
        },
      ],
      {},
    );
    expect(store.written).toEqual([
      {
        name: "sb-project-auth-token.0",
        value: "first",
        options: { httpOnly: true, path: "/", sameSite: "lax" },
      },
      {
        name: "sb-project-auth-token.1",
        value: "second",
        options: { httpOnly: true, path: "/" },
      },
    ]);
  });

  it("tolerates a read-only cookie store by default instead of failing the render", () => {
    const store: SessionCookieStore = {
      getAll: () => [],
      set: () => {
        throw new Error("Cookies can only be modified in a Server Action");
      },
    };
    expect(() =>
      httpOnlyCookieMethods(store).setAll(
        [{ name: "sb-project-auth-token", value: "value", options: {} }],
        {},
      ),
    ).not.toThrow();
  });

  it("propagates cookie-write failures when write tolerance is disabled", () => {
    const store: SessionCookieStore = {
      getAll: () => [],
      set: () => {
        throw new Error("Cookies can only be modified in a Server Action");
      },
    };
    expect(() =>
      httpOnlyCookieMethods(store, { tolerateWriteFailure: false }).setAll(
        [{ name: "sb-project-auth-token", value: "value", options: {} }],
        {},
      ),
    ).toThrow("Cookies can only be modified in a Server Action");
  });
});

describe("the composed session entry point", () => {
  const store: SessionCookieStore = { getAll: () => [], set: () => undefined };
  // Spied here rather than inside the one test that reads it: restoring after
  // an assertion means a failing assertion skips the restore and leaves
  // console.error stubbed for whatever runs next in the same worker.
  let logged: MockInstance<typeof console.error>;

  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(cookies).mockResolvedValue(
      store as unknown as Awaited<ReturnType<typeof cookies>>,
    );
    withConfig();
  });

  afterEach(() => {
    logged.mockRestore();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("carries the access token through the composed read", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      readerReturning({
        data: { session: { access_token: "composed-token" } },
        error: null,
      }) as unknown as ReturnType<typeof createServerClient>,
    );

    expect(await currentSession()).toEqual({
      kind: "present",
      accessToken: "composed-token",
    });
  });

  it("reports absent when nobody is signed in", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      readerReturning({
        data: { session: null },
        error: null,
      }) as unknown as ReturnType<typeof createServerClient>,
    );

    expect(await currentSession()).toEqual({ kind: "absent" });
  });

  it("binds the HTTP-only cookie adapter to the Supabase client", async () => {
    const written: { name: string; options: { httpOnly?: boolean } }[] = [];
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [{ name: "sb", value: "v" }],
      set: (name: string, _value: string, options: { httpOnly?: boolean }) => {
        written.push({ name, options });
      },
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    vi.mocked(createServerClient).mockReturnValue(
      {} as ReturnType<typeof createServerClient>,
    );

    await sessionClient();

    const [url, key, options] = vi.mocked(createServerClient).mock.calls[0]!;
    expect(url).toBe("https://project.supabase.co/");
    expect(key).toBe("anon-key");
    options.cookies.setAll!(
      [{ name: "sb", value: "v", options: { httpOnly: false } }],
      {},
    );
    expect(written).toEqual([{ name: "sb", options: { httpOnly: true } }]);
  });

  it("binds the write-strict cookie adapter to the Supabase client", async () => {
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
      set: () => {
        throw new Error("cookie store read only");
      },
    } as unknown as Awaited<ReturnType<typeof cookies>>);
    vi.mocked(createServerClient).mockReturnValue(
      {} as ReturnType<typeof createServerClient>,
    );

    await writableSessionClient();

    const [url, key, options] = vi.mocked(createServerClient).mock.calls[0]!;
    expect(url).toBe("https://project.supabase.co/");
    expect(key).toBe("anon-key");
    expect(() =>
      options.cookies.setAll!(
        [{ name: "sb", value: "v", options: { httpOnly: false } }],
        {},
      ),
    ).toThrow("cookie store read only");
  });

  it("returns the session through requireSession when present", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      readerReturning({
        data: { session: { access_token: "required-token" } },
        error: null,
      }) as unknown as ReturnType<typeof createServerClient>,
    );

    const session = await requireSession();
    expect(session).toEqual({
      kind: "present",
      accessToken: "required-token",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in through requireSession when absent", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      readerReturning({
        data: { session: null },
        error: null,
      }) as unknown as ReturnType<typeof createServerClient>,
    );

    await requireSession();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  // A deployment missing its configuration would otherwise be indistinguishable
  // from every user being signed out: the same `absent` value, and no trace.
  it("records a configuration failure instead of reporting it as signed out", async () => {
    withConfig({ SUPABASE_URL: undefined });

    expect(await currentSession()).toEqual({ kind: "absent" });

    const message = logged.mock.calls.flat(2).join(" ");
    expect(message).toContain("SUPABASE_URL");
  });

  it("stays silent on the ordinary signed-out path", async () => {
    vi.mocked(createServerClient).mockReturnValue(
      readerReturning({
        data: { session: null },
        error: null,
      }) as unknown as ReturnType<typeof createServerClient>,
    );

    await currentSession();

    expect(logged).not.toHaveBeenCalled();
  });
});
