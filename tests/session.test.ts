import {
  httpOnlyCookieMethods,
  readSession,
  type SessionCookieStore,
  type SessionReader,
} from "../src/lib/session";

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(null) }));

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

  it("tolerates a read-only cookie store instead of failing the render", () => {
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
});
