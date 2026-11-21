import { afterEach, expect, it, vi } from "vitest";
import { createWorkspaceAction } from "@/app/_actions/workspace";

const cookieName = "sb-auth-auth-token";
const nonce = "80000000-0000-4000-8000-000000000001";
const jar = new Map<string, string>();
const set = vi.fn((name: string, value: string) => {
  jar.set(name, value);
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set,
  }),
}));

function session(expiresAt: number) {
  return {
    access_token: "synthetic-token",
    refresh_token: "synthetic-refresh",
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "80000000-0000-4000-8000-000000000002" },
  };
}

function seed(expiresAt: number) {
  jar.clear();
  set.mockClear();
  jar.set(
    cookieName,
    `base64-${Buffer.from(JSON.stringify(session(expiresAt))).toString("base64url")}`,
  );
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-only");
}

function draft() {
  const form = new FormData();
  form.set("name", "Casa");
  form.set("baseCurrency", "COP");
  return form;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("rejects a malformed recovery draft without refreshing its expiring session", async () => {
  const now = Math.floor(Date.now() / 1000);
  seed(now - 60);
  const before = [...jar];
  const form = draft();
  form.append("name", "Second name");
  const request = vi.fn<typeof fetch>(async (input) => {
    expect(String(input)).toBe(
      "https://auth.test/auth/v1/token?grant_type=refresh_token",
    );
    return Response.json(session(now + 3600));
  });
  vi.stubGlobal("fetch", request);

  const result = await createWorkspaceAction(nonce, null, form);
  expect({
    result,
    requests: request.mock.calls.map(([url]) => String(url)),
    writes: set.mock.calls.length,
    jar: [...jar],
  }).toEqual({
    result: "Revisa el nombre y la moneda base del espacio.",
    requests: [],
    writes: 0,
    jar: before,
  });
});
