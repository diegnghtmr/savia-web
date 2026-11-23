import { act, render, screen } from "@testing-library/react";
import Analytics from "@/app/(workspace)/analytics/page";
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
let role: string | undefined;
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
  role = undefined;
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/me") return Response.json({ id });
    if (url.pathname === "/v1/workspaces")
      return list([{ id, name: "Casa", baseCurrency: "COP", role }]);
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(id);
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === "/v1/me/dashboard-preferences")
      return new Response(null, { status: 404 });
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
const renderPeriod = async (input: SearchParams = period) => {
  const page = await Overview({ searchParams: Promise.resolve(input) });
  await act(async () => {
    render(page);
  });
};

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
  expect(fetchImpl).toHaveBeenCalledTimes(6);
});

it("applies saved dashboard card order, visibility, custom dates, and currency", async () => {
  const fixture = fetchImpl.getMockImplementation()!;
  fetchImpl.mockImplementation(async (url, init) => {
    const path = new URL(String(url));
    if (path.pathname === "/v1/me/dashboard-preferences")
      return Response.json(
        {
          version: 7,
          presentationCurrency: "USD",
          period: { preset: "custom", ...period },
          cards: [
            { id: "expenses", visible: true },
            { id: "net_worth", visible: false },
            { id: "income", visible: true },
          ],
        },
        { headers: { etag: '"7"' } },
      );
    if (path.pathname === "/v1/analytics/summary") {
      expect(Object.fromEntries(path.searchParams)).toEqual({
        ...period,
        presentationCurrency: "USD",
      });
      const inUsd = (amountMinor: string) => ({ amountMinor, currency: "USD" });
      return Response.json({
        ...summary,
        baseCurrency: "USD",
        netWorth: inUsd("5000"),
        income: inUsd("3000"),
        expenses: inUsd("1000"),
        savingsCapacity: inUsd("2000"),
      });
    }
    return fixture(url, init);
  });
  await renderPeriod({});
  expect(screen.getAllByRole("term").map((node) => node.textContent)).toEqual([
    "Gastos del período",
    "Ingresos del período",
  ]);
  expect(screen.getByText(/USD\s30,00/)).toBeVisible();
  expect(screen.getByLabelText("Desde")).toHaveValue(period.from);
});

it.each(["quarter", "year"])(
  "renders %s cash-flow filters, typed metrics and returned FX rates",
  async (granularity) => {
    const fixture = fetchImpl.getMockImplementation()!;
    const fxRatesUsed = [
      {
        baseCurrency: "USD",
        quoteCurrency: "COP",
        rate: "3980.25",
        rateDate: period.from,
        source: "frankfurter",
        freshness: "stale",
      },
    ];
    fetchImpl.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/analytics/cash-flow") {
        expect(url.searchParams.get("granularity")).toBe(granularity);
        expect(url.searchParams.getAll("accountIds")).toEqual([id, other]);
        expect(url.searchParams.getAll("tagIds")).toEqual([other]);
        return Response.json({
          series: [{ period: period.from, value: cop("1250") }],
          categories: [],
          fxRatesUsed,
        });
      }
      if (url.pathname === "/v1/analytics/advanced") {
        const metric = url.searchParams.get("metric");
        const metadata = {
          metric,
          generatedAt: `${period.to}T00:00:00Z`,
          currency: "COP",
          assumptions: [],
          missingData: ["Cobertura parcial"],
        };
        if (metric === "net_worth_history")
          return Response.json({
            ...metadata,
            data: {
              series: [
                {
                  date: period.to,
                  assets: cop("3000"),
                  debts: cop("1000"),
                  netWorth: cop("2000"),
                  fxValuationChange: null,
                },
              ],
            },
          });
        if (metric === "spending_heatmap")
          return Response.json({
            ...metadata,
            data: {
              cells: [
                { weekday: 1, dayOfMonth: 12, amount: cop("1250"), count: 2 },
              ],
            },
          });
        return new Response(null, { status: 501 });
      }
      return fixture(input, init);
    });
    for (const metric of ["net_worth_history", "spending_heatmap"]) {
      const rendered = render(
        await Analytics({
          searchParams: Promise.resolve({
            ...period,
            granularity,
            metric,
            accountIds: [id, other],
            tagIds: other,
          }),
        }),
      );
      expect(
        screen.getByRole("table", {
          name:
            granularity === "quarter"
              ? "Flujo neto por trimestre"
              : "Flujo neto por año",
        }),
      ).toBeVisible();
      expect(
        screen.getByRole("table", { name: "Tipos de cambio utilizados" }),
      ).toBeVisible();
      expect(screen.getByText("3980.25")).toBeVisible();
      expect(screen.getByText("frankfurter")).toBeVisible();
      expect(screen.getByText("Vencida")).toBeVisible();
      expect(
        screen.getByRole("table", {
          name:
            metric === "net_worth_history"
              ? "Historial del patrimonio neto"
              : "Mapa de gastos",
        }),
      ).toBeVisible();
      expect(screen.getByText("Cobertura parcial")).toBeVisible();
      rendered.unmount();
    }
  },
);

it("rejects malformed analytics dimension IDs before session or fetch", async () => {
  render(
    await Analytics({
      searchParams: Promise.resolve({
        ...period,
        categoryIds: ["not-an-id", id],
      }),
    }),
  );
  expect(screen.getByRole("alert").textContent).toBe("Revisa los filtros.");
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
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

it("offers confirm and discard to a verified writer", async () => {
  role = "editor";
  subscriptions = () =>
    list([
      {
        id,
        payeeName: "Música",
        status: "detected",
        currentAmount: cop("12345"),
        etag: '"7"',
      },
    ]);
  await renderPeriod();
  for (const name of ["Confirmar suscripción", "Descartar suscripción"])
    expect(screen.getByRole("button", { name })).toBeVisible();
});

it("shows next active rule dates and detected subscriptions without actions for an unverified role or foreign money", async () => {
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

it.each([
  ["analytics/summary", "No pudimos cargar el resumen financiero."],
  ["recurring-rules", "No pudimos cargar las próximas recurrencias."],
  ["subscriptions", "No pudimos cargar las suscripciones detectadas."],
])("bounds stalled report %s", async (route, error) => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const pending = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const fixtures = fetchImpl.getMockImplementation()!;
  let signal: AbortSignal | null | undefined;
  fetchImpl.mockImplementation((url, init) => {
    const path = new URL(String(url)).pathname;
    if (path !== `/v1/${route}`) return fixtures(url, init);
    signal = init?.signal;
    started.resolve();
    return pending.promise;
  });
  const page = Overview({ searchParams: Promise.resolve(period) });
  try {
    await started.promise;
    const unresolved = Promise.resolve().then(() => null);
    const result = await Promise.race([page, unresolved]);
    expect(result).not.toBeNull();
    await act(async () => {
      render(result);
    });
    const picker = screen.getByRole("combobox", { name: "Espacio activo" });
    expect(picker).toHaveValue(id);
    expect(screen.queryByText(error, { exact: true })).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText(error, { exact: true })).toBeVisible();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  } finally {
    pending.resolve(new Response(null, { status: 503 }));
    await page;
    vi.useRealTimers();
  }
});

// Reviewer regression (verify mwtuuj0d). Append to tests/overview-insights.test.tsx.
it.each([
  ["this_month", "2026-08-01"],
  ["this_quarter", "2026-07-01"],
  ["this_year", "2026-01-01"],
])(
  "reviewer: applies the saved %s in UTC when workspace zone is unknown",
  async (preset, from) => {
    const fixture = fetchImpl.getMockImplementation()!;
    const to = "2026-08-19";
    const sent: Record<string, string>[] = [];
    vi.setSystemTime(new Date(`${to}T12:00:00Z`));
    try {
      fetchImpl.mockImplementation(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === "/v1/me/dashboard-preferences") {
          return Response.json(
            {
              version: 7,
              period: { preset },
              cards: [{ id: "income", visible: true }],
              presentationCurrency: "COP",
            },
            { headers: { etag: '"7"' } },
          );
        }
        if (url.pathname === "/v1/analytics/summary") {
          sent.push(Object.fromEntries(url.searchParams));
          return Response.json({
            ...summary,
            periodStart: url.searchParams.get("from"),
            periodEnd: url.searchParams.get("to"),
          });
        }
        return fixture(input, init);
      });
      await renderPeriod({});
      expect(sent).toEqual([{ from, to, presentationCurrency: "COP" }]);
      expect(screen.getByLabelText("Desde")).toHaveValue(from);
      expect(screen.getByText(/período.*UTC/i)).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  },
);

it("reviewer: keeps the existing alert for a malformed analytics period", async () => {
  render(
    await Analytics({
      searchParams: Promise.resolve({
        from: "2026-01-01",
        to: "2026-02-30",
      }),
    }),
  );
  expect(screen.getByRole("alert").textContent).toBe("Revisa el período.");
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it.each([404, 501])(
  "reviewer: marks cash flow and a typed metric unavailable on %s",
  async (status) => {
    const fixture = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const unavailable = ["/v1/analytics/cash-flow", "/v1/analytics/advanced"];
      return unavailable.includes(url.pathname)
        ? new Response(null, { status })
        : fixture(input, init);
    });
    render(
      await Analytics({
        searchParams: Promise.resolve({
          ...period,
          metric: "spending_heatmap",
          granularity: "year",
        }),
      }),
    );
    expect(
      screen.getByText("El flujo de caja no está disponible."),
    ).toBeVisible();
    expect(screen.getByText("La métrica no está disponible.")).toBeVisible();
    expect(screen.getByText("Proyección no disponible.")).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Tipos de cambio utilizados" }),
    ).toBeNull();
  },
);

it("applies the selected currency and account to balance projection", async () => {
  const fixture = fetchImpl.getMockImplementation()!;
  const sent: Record<string, string>[] = [];
  fetchImpl.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (
      url.pathname === "/v1/analytics/summary" ||
      url.pathname === "/v1/analytics/cash-flow"
    )
      return new Response(null, { status: 404 });
    if (url.pathname === "/v1/analytics/advanced") {
      sent.push(Object.fromEntries(url.searchParams));
      return Response.json({
        metric: "balance_projection",
        currency: url.searchParams.get("presentationCurrency") ?? "COP",
        generatedAt: "2026-02-28T00:00:00Z",
        assumptions: [],
        missingData: [],
        data: {
          openingBalanceMinor: "1000",
          basisMonths: 1,
          meanMonthlyIncomeMinor: "2000",
          meanMonthlyExpensesMinor: "1500",
          months: [
            {
              month: period.from,
              expectedInflowMinor: "2000",
              expectedOutflowMinor: "1500",
              projectedBalanceMinor: "1500",
            },
          ],
        },
      });
    }
    return fixture(input, init);
  });
  render(
    await Analytics({
      searchParams: Promise.resolve({
        ...period,
        presentationCurrency: "USD",
        accountIds: other,
      }),
    }),
  );
  expect(sent).toEqual([
    {
      ...period,
      metric: "balance_projection",
      presentationCurrency: "USD",
      accountIds: other,
    },
  ]);
  expect(screen.getByText(/Saldo inicial: USD\s10,00/)).toBeVisible();
  expect(
    screen.getByRole("row", { name: /2026-01-01.*USD\s15,00/ }),
  ).toBeVisible();
});

it("keeps both valuation-time observations for the same FX pair", async () => {
  const fixture = fetchImpl.getMockImplementation()!;
  fetchImpl.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/analytics/summary") {
      const rate = {
        baseCurrency: "USD",
        quoteCurrency: "COP",
        rate: "3980.2500",
        rateDate: "2026-01-01",
        source: "frankfurter",
      };
      return Response.json({
        ...summary,
        fxRatesUsed: [
          { ...rate, freshness: "fresh" },
          { ...rate, freshness: "stale" },
        ],
      });
    }
    return fixture(input, init);
  });
  await renderPeriod();
  const table = screen.getByRole("table", {
    name: "Tipos de cambio utilizados",
  });
  expect(
    Array.from(table.querySelectorAll("tbody tr"), (row) =>
      Array.from(row.children, (cell) => cell.textContent),
    ),
  ).toEqual([
    ["USD / COP", "3980.2500", "2026-01-01", "frankfurter", "Vigente"],
    ["USD / COP", "3980.2500", "2026-01-01", "frankfurter", "Vencida"],
  ]);
  expect(
    screen.queryByText("Vigencia de las conversiones: desconocida"),
  ).not.toBeInTheDocument();
});
