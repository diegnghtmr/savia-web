import { render, screen } from "@testing-library/react";
import AccountsPage from "@/app/(workspace)/accounts/page";
import { createAccountAction } from "@/app/_actions/accounts";
import { requireSession } from "@/lib/session";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "not-a-member" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const id = "80000000-0000-4000-8000-000000000001";
const account = { id, name: "Mi cuenta", status: "active" };
const submission = { nonce: id, workspaceId: id };
const fetchImpl = vi.fn<typeof fetch>();
const page = (items: unknown[], nextCursor?: string) =>
  Response.json({ items, pageInfo: { hasNextPage: !!nextCursor, nextCursor } });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
  vi.mocked(requireSession).mockResolvedValue({
    kind: "present",
    accessToken: "test-token",
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("stops before account requests when the profile check fails", async () => {
  fetchImpl.mockResolvedValueOnce(new Response(null, { status: 503 }));
  render(await AccountsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("No pudimos consultar tu perfil.")).toBeVisible();
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "https://backend.test/savia/v1/me",
  ]);
});

it("queries filtered accounts and balances in the verified workspace", async () => {
  fetchImpl
    .mockResolvedValueOnce(Response.json({ id }))
    .mockResolvedValueOnce(page([{ id, name: "Casa" }]))
    .mockResolvedValueOnce(page([account], "next/2"))
    .mockResolvedValueOnce(
      Response.json({
        accountId: id,
        nativeBalance: { amountMinor: "-900719925474099301", currency: "COP" },
        asOf: "2026-01-01T00:00:00Z",
      }),
    );
  const searchParams = Promise.resolve({ status: "active", cursor: "next/1" });
  render(await AccountsPage({ searchParams }));
  expect(screen.getByText("Mi cuenta")).toBeVisible();
  expect(screen.getByText(/−COP\s9\.007\.199\.254\.740\.993,01/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    "/accounts?status=active&cursor=next%2F2",
  );
  const calls = fetchImpl.mock.calls.slice(2);
  expect(calls.map(([url]) => url)).toEqual([
    "https://backend.test/savia/v1/accounts?limit=20&status=active&cursor=next%2F1",
    `https://backend.test/savia/v1/accounts/${id}/balance`,
  ]);
  for (const [, init] of calls)
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(id);
});

function draft(name = " Ahorros ") {
  const form = new FormData();
  form.set("name", name);
  form.set("type", "savings");
  form.set("currency", "cop");
  form.set("workspaceId", "forged");
  return form;
}

it("rejects ambiguous or missing fields before reading the session", async () => {
  const duplicate = draft();
  duplicate.append("currency", "USD");
  const missing = draft();
  missing.delete("type");
  for (const form of [duplicate, missing]) {
    await expect(createAccountAction(submission, null, form)).resolves.toBe(
      "Revisa el nombre, el tipo y la moneda.",
    );
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("does not submit a draft after the active workspace changes", async () => {
  fetchImpl.mockResolvedValueOnce(page([{ id, name: "Casa" }]));
  const stale = { ...submission, workspaceId: "changed" };
  await expect(createAccountAction(stale, null, draft())).resolves.toBe(
    "El espacio activo cambió. Vuelve a Cuentas.",
  );
  expect(fetchImpl).toHaveBeenCalledOnce();
  expect(fetchImpl.mock.calls[0][1]?.method).toBe("GET");
});

it("uses a verified workspace and a stable UUID on retries", async () => {
  fetchImpl.mockImplementation(async (_url, init) =>
    init?.method === "POST"
      ? new Response(null, { status: 503 })
      : page([{ id, name: "Casa" }]),
  );
  const error = "No pudimos crear la cuenta. Vuelve a intentarlo.";
  for (const name of [" Ahorros ", "Ahorros", "Otra cuenta"]) {
    await expect(
      createAccountAction(submission, null, draft(name)),
    ).resolves.toBe(error);
  }
  const posts = fetchImpl.mock.calls.filter(
    ([, init]) => init?.method === "POST",
  );
  expect(posts).toHaveLength(3);
  expect(posts[0][0]).toBe("https://backend.test/savia/v1/accounts");
  const headers = new Headers(posts[0][1]?.headers);
  expect(headers.get("x-workspace-id")).toBe(id);
  expect(headers.get("idempotency-key")).toMatch(
    /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/,
  );
  expect(posts[0][1]?.body).toBe(
    '{"name":"Ahorros","type":"savings","currency":"COP"}',
  );
  expect(posts[1]).toEqual(posts[0]);
  expect(new Headers(posts[2][1]?.headers).get("idempotency-key")).not.toBe(
    headers.get("idempotency-key"),
  );
});
