import type { MockInstance } from "vitest";

import { ServerConfig } from "../src/lib/server-config";
import { ONBOARDING_RESULT_KINDS } from "../src/lib/onboarding-result";
import type { OnboardingDraft } from "../src/lib/onboarding-result";
import { onboard, postOnboarding } from "../src/lib/onboarding-gateway";
import { submitOnboarding } from "../src/app/_actions/onboarding";
import type { Session } from "../src/lib/session";

vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(null) }));

const draft: OnboardingDraft = {
  email: "ana@savia.test",
  displayName: "Ana",
  locale: "es-CO",
  countryCode: "CO",
  timezone: "America/Bogota",
  dateFormat: "DD/MM/YYYY",
  weekStartsOn: 1,
  numberFormat: "1.234,56",
  defaultCurrency: "COP",
  workspaceName: "Personal",
  baseCurrency: "COP",
  privacyModeEnabled: false,
};

const aggregate = {
  profileId: "0b3f4f7a-1f4a-4c6f-9a1e-2a1c9d3e4f50",
  workspaceId: "1c4a5b8b-2a5b-4d70-8b2f-3b2d0e4f5061",
};

const problemHeaders = { "content-type": "application/problem+json" };
const jsonHeaders = { "content-type": "application/json" };

function respondWith(response: Response) {
  return vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(response),
  );
}

async function call(response: Response, fetchImpl = respondWith(response)) {
  const result = await postOnboarding(draft, {
    baseUrl: new URL("https://api.savia.test"),
    accessToken: "header.payload.signature",
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { result, fetchImpl };
}

describe("the onboarding request", () => {
  it("posts the draft to the backend with the bearer token", async () => {
    const fetchImpl = respondWith(
      new Response(JSON.stringify(aggregate), {
        status: 201,
        headers: jsonHeaders,
      }),
    );
    await call(new Response(null), fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.savia.test/v1/onboarding");
    expect(init.method).toBe("POST");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({
      authorization: "Bearer header.payload.signature",
      "content-type": "application/json",
      accept: "application/json, application/problem+json",
    });
    expect(JSON.parse(String(init.body))).toEqual(draft);
  });

  it("keeps the documented path when the base URL carries a prefix", async () => {
    const fetchImpl = respondWith(
      new Response(JSON.stringify(aggregate), {
        status: 201,
        headers: jsonHeaders,
      }),
    );
    await postOnboarding(draft, {
      baseUrl: new URL("https://api.savia.test/gateway"),
      accessToken: "token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "https://api.savia.test/gateway/v1/onboarding",
    );
  });
});

describe("the onboarding response mapping", () => {
  it("maps 201 onto a created result carrying the aggregate", async () => {
    const { result } = await call(
      new Response(JSON.stringify(aggregate), {
        status: 201,
        headers: jsonHeaders,
      }),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.created,
      aggregate,
    });
  });

  it("maps 200 onto a replayed result carrying the aggregate", async () => {
    const { result } = await call(
      new Response(JSON.stringify(aggregate), {
        status: 200,
        headers: jsonHeaders,
      }),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.replayed,
      aggregate,
    });
  });

  it("maps 400 onto an invalid result carrying the field violations", async () => {
    const { result } = await call(
      new Response(
        JSON.stringify({
          type: "https://savia.app/problems/validation-failed",
          title: "Request validation failed",
          status: 400,
          instance: "/v1/onboarding",
          violations: [
            { field: "email", message: "must be a valid email address" },
            { field: "locale", message: "must be a supported locale" },
          ],
        }),
        { status: 400, headers: problemHeaders },
      ),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.invalid,
      violations: [
        { field: "email", message: "must be a valid email address" },
        { field: "locale", message: "must be a supported locale" },
      ],
    });
  });

  it("keeps an invalid result usable when the violations are unreadable", async () => {
    const { result } = await call(
      new Response("not json at all", { status: 400, headers: problemHeaders }),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.invalid,
      violations: [],
    });
  });

  it("drops violation entries that are not field and message pairs", async () => {
    const { result } = await call(
      new Response(
        JSON.stringify({
          status: 400,
          violations: [
            { field: "email", message: "must be a valid email address" },
            { field: 7, message: null },
            "boom",
          ],
        }),
        { status: 400, headers: problemHeaders },
      ),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.invalid,
      violations: [
        { field: "email", message: "must be a valid email address" },
      ],
    });
  });

  it("maps 401 onto an unauthenticated result", async () => {
    const { result } = await call(
      new Response(JSON.stringify({ status: 401 }), {
        status: 401,
        headers: problemHeaders,
      }),
    );
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.unauthenticated });
  });

  it("maps 409 onto a conflict result", async () => {
    const { result } = await call(
      new Response(JSON.stringify({ status: 409 }), {
        status: 409,
        headers: problemHeaders,
      }),
    );
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.conflict });
  });

  it("maps 503 onto a retryable result carrying the stated delay", async () => {
    const { result } = await call(
      new Response(JSON.stringify({ status: 503 }), {
        status: 503,
        headers: { ...problemHeaders, "retry-after": "5" },
      }),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.retryable,
      retryAfterSeconds: 5,
    });
  });

  // A fractional or negative value is numeric enough for `Number` to accept, so
  // an HTTP-date alone does not exercise the integer and range checks: it is
  // already `NaN`. Without these two, a delay the backend never stated could be
  // handed to a caller as though it had.
  it.each(["2.5", "-1"])(
    "states no delay when 503 states %j seconds",
    async (header) => {
      const { result } = await call(
        new Response(JSON.stringify({ status: 503 }), {
          status: 503,
          headers: { ...problemHeaders, "retry-after": header },
        }),
      );
      expect(result).toEqual({
        kind: ONBOARDING_RESULT_KINDS.retryable,
        retryAfterSeconds: null,
      });
    },
  );

  it("states no delay when 503 arrives without a usable Retry-After", async () => {
    const { result } = await call(
      new Response(JSON.stringify({ status: 503 }), {
        status: 503,
        headers: {
          ...problemHeaders,
          "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT",
        },
      }),
    );
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.retryable,
      retryAfterSeconds: null,
    });
  });

  it("maps 500 onto a failed result", async () => {
    const { result } = await call(
      new Response(JSON.stringify({ status: 500 }), {
        status: 500,
        headers: problemHeaders,
      }),
    );
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.failed });
  });

  it("maps an undocumented status onto a failed result", async () => {
    const { result } = await call(new Response(null, { status: 418 }));
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.failed });
  });

  it("maps an unreadable success body onto a failed result", async () => {
    const { result } = await call(
      new Response("{", { status: 201, headers: jsonHeaders }),
    );
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.failed });
  });

  it("maps a success body missing the aggregate onto a failed result", async () => {
    const { result } = await call(
      new Response(JSON.stringify({ profileId: aggregate.profileId }), {
        status: 201,
        headers: jsonHeaders,
      }),
    );
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.failed });
  });

  it("treats a transport failure as retryable without inventing a delay", async () => {
    const result = await postOnboarding(draft, {
      baseUrl: new URL("https://api.savia.test"),
      accessToken: "token",
      fetchImpl: (() =>
        Promise.reject(new Error("ECONNREFUSED 127.0.0.1:3000"))) as never,
    });
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.retryable,
      retryAfterSeconds: null,
    });
  });

  it("never returns backend internals or the bearer token", async () => {
    const { result } = await call(
      new Response(
        JSON.stringify({
          type: "https://savia.app/problems/internal",
          title: "Internal server error",
          status: 500,
          instance: "/v1/onboarding",
          detail: "password=hunter2 at PgTransaction.commit",
        }),
        { status: 500, headers: problemHeaders },
      ),
    );
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("PgTransaction");
    expect(serialised).not.toContain("header.payload.signature");
    expect(serialised).not.toContain("savia.app/problems");
  });
});

describe("the onboarding orchestration", () => {
  const config = ServerConfig.fromEnvironment({
    BACKEND_BASE_URL: "https://api.savia.test",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
  });
  // Spied in a hook rather than inside the one test that reads it: restoring
  // after an assertion means a failing assertion skips the restore and leaves
  // console.error stubbed for whatever runs next in the same worker.
  let logged: MockInstance<typeof console.error>;

  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it("refuses to issue a request when there is no session", async () => {
    const fetchImpl = vi.fn();
    const result = await onboard(draft, {
      currentSession: () => Promise.resolve({ kind: "absent" } as Session),
      loadConfig: () => config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.unauthenticated });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the session token when a session exists", async () => {
    const fetchImpl = respondWith(
      new Response(JSON.stringify(aggregate), {
        status: 201,
        headers: jsonHeaders,
      }),
    );
    const result = await onboard(draft, {
      currentSession: () =>
        Promise.resolve({ kind: "present", accessToken: "abc" } as Session),
      loadConfig: () => config,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({
      kind: ONBOARDING_RESULT_KINDS.created,
      aggregate,
    });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer abc",
    );
  });

  function withUnusableConfig() {
    return onboard(draft, {
      currentSession: () =>
        Promise.resolve({ kind: "present", accessToken: "abc" } as Session),
      loadConfig: () => {
        throw new Error(
          "Server configuration BACKEND_BASE_URL must be a non-empty string.",
        );
      },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
  }

  it("keeps an unusable configuration out of the value the browser receives", async () => {
    const result = await withUnusableConfig();
    expect(result).toEqual({ kind: ONBOARDING_RESULT_KINDS.failed });
    expect(JSON.stringify(result)).not.toContain("BACKEND_BASE_URL");
  });

  // `failed` is also what an ordinary backend 500 produces, so without a server
  // record a misconfigured deployment is indistinguishable from a backend that
  // is merely unwell — and only one of the two is fixed by redeploying.
  it("records an unusable configuration on the server", async () => {
    await withUnusableConfig();
    expect(logged.mock.calls.flat(2).join(" ")).toContain("BACKEND_BASE_URL");
  });

  it("stays silent when the backend itself answers with a failure", async () => {
    await onboard(draft, {
      currentSession: () =>
        Promise.resolve({ kind: "present", accessToken: "abc" } as Session),
      loadConfig: () => config,
      fetchImpl: respondWith(
        new Response("{}", { status: 500, headers: jsonHeaders }),
      ) as unknown as typeof fetch,
    });
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("the onboarding Server Action", () => {
  it("answers unauthenticated instead of throwing while no sign-in flow exists", async () => {
    vi.stubEnv("BACKEND_BASE_URL", "");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "");
    await expect(submitOnboarding(draft)).resolves.toEqual({
      kind: ONBOARDING_RESULT_KINDS.unauthenticated,
    });
    vi.unstubAllEnvs();
  });
});
