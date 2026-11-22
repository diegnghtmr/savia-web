import { render, screen } from "@testing-library/react";
import Overview from "@/app/(workspace)/overview/page";
import { requireSession } from "@/lib/session";
import type { SearchParams } from "@/lib/view-filters";

const id = "80000000-0000-4000-8000-000000000001";
const other = "80000000-0000-4000-8000-000000000002";
const period = { from: "2026-01-01", to: "2026-02-28" };
const cop = (amountMinor: string) => ({ currency: "COP", amountMinor });
const summary = {
  periodStart: period.from,
  periodEnd: period.to,
  baseCurrency: "COP",
  netWorth: cop("900719925474099301"),
  income: cop("240000"),
  expenses: cop("-12345"),
  savingsCapacity: cop("252345"),
  budgetUtilizationPercent: 87.25,
};
const fetchImpl = vi.fn<typeof fetch>();
let respond: () => Response;
let recurring: () => Response;
let subscriptions: () => Response;
const list = (items: unknown[], nextCursor?: string) =>
  Response.json({ items, pageInfo: { hasNextPage: !!nextCursor, nextCursor } });

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: other }) }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "fixture" })),
}));
beforeEach(() => {
  vi.clearAllMocks();
  respond = () => Response.json(summary);
  recurring = subscriptions = () => list([]);
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/me") return Response.json({ id });
    if (url.pathname === "/v1/workspaces")
      return list([{ id, name: "Casa", baseCurrency: "COP" }]);
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(id);
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === "/v1/recurring-rules") {
      expect(url.search).toBe("?limit=200");
      return recurring();
    }
    if (url.pathname === "/v1/subscriptions") {
      expect(url.search).toBe("?limit=200&status=detected");
      return subscriptions();
    }
    expect(url.pathname).toBe("/v1/analytics/summary");
    expect(Object.fromEntries(url.searchParams)).toEqual(period);
    return respond();
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const renderPeriod = async (input: SearchParams = period) =>
  render(await Overview({ searchParams: Promise.resolve(input) }));

it.each([
  { from: period.from },
  { ...period, to: "2026-02-30" },
  { ...period, to: "2025-12-31" },
  { ...period, from: [period.from] },
  { ...period, to: "" },
  { ...period, presentationCurrency: "USD" },
])("rejects invalid overview periods before session %j", async (input) => {
  await renderPeriod(input);
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa el período.");
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("renders verified base-currency money, net refunds and budget use without assuming FX freshness", async () => {
  await renderPeriod();
  for (const text of [
    /9\.007\.199\.254\.740\.993,01/,
    /−COP\s123,45/,
    "87,25 %",
    "Vigencia de las conversiones: desconocida",
  ])
    expect(screen.getByText(text)).toBeVisible();
  expect(screen.getByRole("heading", { name: "Casa" })).toBeVisible();
  expect(fetchImpl).toHaveBeenCalledTimes(5);
});

it.each([503, 200])(
  "does not display misleading figures when the summary is unavailable or mismatched (%s)",
  async (status) => {
    respond = () =>
      Response.json(
        { ...summary, netWorth: { ...summary.netWorth, currency: "USD" } },
        { status },
      );
    await renderPeriod();
    expect(screen.getByRole("heading", { name: "Casa" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar el resumen financiero.",
    );
    expect(screen.queryByText(/9\.007\.199/)).not.toBeInTheDocument();
  },
);

it("shows next active rule dates and detected subscriptions without unsupported actions or foreign money", async () => {
  recurring = () =>
    list([
      {
        id,
        name: "Internet",
        active: true,
        nextOccurrenceAt: "2099-01-01T02:00:00Z",
      },
      {
        id: other,
        name: "Inactiva",
        active: false,
        nextOccurrenceAt: "2099-01-01T02:00:00Z",
      },
      {
        id: "80000000-0000-4000-8000-000000000003",
        name: "Vencida",
        active: true,
        nextOccurrenceAt: "2000-01-01T02:00:00Z",
      },
    ]);
  subscriptions = () =>
    list(
      [
        {
          id,
          payeeName: "Música",
          status: "detected",
          currentAmount: cop("12345"),
        },
        {
          id: other,
          payeeName: "Video",
          status: "detected",
          currentAmount: { currency: "USD", amountMinor: "2255" },
        },
      ],
      "more",
    );
  await renderPeriod();
  expect(screen.getByText("Internet")).toBeVisible();
  expect(screen.getByText("2099-01-01")).toBeVisible();
  expect(screen.getByText("Música")).toBeVisible();
  expect(screen.getByText("COP 123,45")).toBeVisible();
  expect(screen.getByText("Video")).toBeVisible();
  const noConversion = screen.getByText("Importe en moneda base no disponible");
  expect(noConversion).toBeVisible();
  expect(screen.getByText("Se muestran resultados parciales.")).toBeVisible();
  expect(screen.queryByText(/Inactiva|Vencida|USD/)).not.toBeInTheDocument();
  const actions = screen.queryByRole("button", { name: /Confirmar|Descartar/ });
  expect(actions).not.toBeInTheDocument();
});

it("keeps the financial summary when a recurring list fails", async () => {
  recurring = () => new Response(null, { status: 503 });
  await renderPeriod();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "No pudimos cargar las próximas recurrencias.",
  );
  expect(screen.getByText("No hay suscripciones detectadas.")).toBeVisible();
  expect(screen.getByText("87,25 %")).toBeVisible();
});
