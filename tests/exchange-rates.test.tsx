import { render, screen } from "@testing-library/react";
import Page from "@/app/(workspace)/exchange-rates/page";
import { recordRate } from "@/app/_actions/exchange-rates";
import { requireSession } from "@/lib/session";

const id = "80000000-0000-4000-8000-000000000001";
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: id }), set: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "offline" })),
}));
const fetchImpl = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stub() {
  fetchImpl.mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json({
        items: [{ id, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      });
    return init?.method === "POST"
      ? Response.json({ id }, { status: 201 })
      : Response.json([
          {
            id,
            baseCurrency: "USD",
            quoteCurrency: "COP",
            rate: "4111.005000000000000001",
            effectiveAt: "2026-11-20T12:00:00Z",
            source: "frankfurter",
            manual: false,
            ageHours: 95.5,
            isStale: true,
          },
        ]);
  });
}

it("rejects ambiguous or unsupported rate filters after only the profile check", async () => {
  stub();
  render(
    await Page({
      searchParams: Promise.resolve({
        from: ["2026-11-01", "2026-11-20"],
        limit: "4",
      }),
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    "https://backend.test/v1/me",
  ]);
});

it("shows B15 rate, provider, date, age and stale state from the filtered API", async () => {
  stub();
  render(
    await Page({
      searchParams: Promise.resolve({
        baseCurrency: "usd",
        quoteCurrency: "COP",
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    }),
  );
  for (const phrase of [
    "4111.005000000000000001",
    "frankfurter",
    "2026-11-20T12:00:00Z",
    "95,5 h",
    "Desactualizada",
  ])
    expect(screen.getByText(phrase, { exact: false })).toBeVisible();
  const [url, init] = fetchImpl.mock.calls[2];
  expect(url).toBe(
    "https://backend.test/v1/exchange-rates?baseCurrency=USD&quoteCurrency=COP&from=2026-11-01&to=2026-11-30",
  );
  expect(new Headers(init?.headers).get("x-workspace-id")).toBe(id);
});

function draft(rate = "004111,00500", date = "2026-11-20T12:30") {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    baseCurrency: "usd",
    quoteCurrency: "cop",
    rate,
    effectiveAt: date,
    notes: "  Manual  ",
  }))
    form.set(key, value);
  return form;
}

it("validates single rates before session and submits exact normalized manual rates", async () => {
  stub();
  const duplicate = draft();
  duplicate.append("rate", "5");
  for (const input of [duplicate, draft("0"), draft("1", "2026-02-30T12:30")])
    expect(await recordRate(id, null, input)).toEqual({
      error: "Revisa los datos de la tasa.",
    });
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(await recordRate(id, null, draft())).toEqual({ receipt: id });
  const [url, init] = fetchImpl.mock.calls[2];
  expect(url).toBe("https://backend.test/v1/exchange-rates");
  expect(init?.method).toBe("POST");
  const headers = new Headers(init?.headers);
  expect(headers.get("x-workspace-id")).toBe(id);
  expect(headers.get("idempotency-key")).toMatch(/^[a-f0-9-]{36}$/);
  expect(JSON.parse(String(init?.body))).toEqual({
    baseCurrency: "USD",
    quoteCurrency: "COP",
    rate: "4111.005",
    effectiveAt: "2026-11-20T12:30:00Z",
    notes: "Manual",
  });
});
