import { render, screen } from "@testing-library/react";
import List from "@/app/(workspace)/budgets/page";
import Detail from "@/app/(workspace)/budgets/[budgetId]/page";
import { type SearchParams } from "@/lib/view-filters";

const workspace = "80000000-0000-4000-8000-000000000001";
const id = "abcdef00-0000-4000-8000-000000000002";
const categoryId = "80000000-0000-4000-8000-000000000003";
const next = Buffer.from(
  JSON.stringify([
    workspace,
    "2026-01-01T00:00:00.000000Z",
    id,
    '["2026-01-01",null]',
  ]),
).toString("base64url");
const amount = (amountMinor: string) => ({ amountMinor, currency: "COP" });
const budget = {
  id,
  name: "Enero",
  method: "cash_flow",
  periodStart: "2026-01-01",
  periodEnd: "2026-01-31",
  currency: "COP",
  version: 1,
  allocations: [
    {
      categoryId,
      planned: amount("900719925474099301"),
      actual: amount("450359962737049650"),
      available: amount("450359962737049651"),
      rolloverPolicy: "surplus",
    },
  ],
};
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: id }) }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ accessToken: "fixture" }),
}));
const fetchImpl = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchImpl.mockReset();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (input) => {
    const path = new URL(String(input)).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json({
        items: [{ id: workspace, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      });
    if (path === "/v1/budgets")
      return Response.json({
        items: [budget],
        pageInfo: { hasNextPage: true, nextCursor: next },
      });
    if (path === `/v1/budgets/${id}`)
      return Response.json(budget, { headers: { etag: '"1"' } });
    if (path === "/v1/categories")
      return Response.json({
        items: [{ id: categoryId, name: "Alimentación" }],
        pageInfo: { hasNextPage: false },
      });
    throw new Error(`Unexpected fetch ${path}`);
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const list = (input: SearchParams) =>
  List({ searchParams: Promise.resolve(input) });
const detail = (budgetId: string) =>
  Detail({ params: Promise.resolve({ budgetId }) });

it.each([
  { from: ["2026-01-01", "2026-01-01"] },
  { to: "2026-02-30" },
  { from: "2026-02-01", to: "2026-01-01" },
  { limit: "201" },
  { limit: "0" },
  { limit: ["1", "2"] },
  { cursor: "junk" },
  { cursor: [next, next] },
  { cursor: next },
])(
  "rejects malformed or mismatched filters %j before scoped reads",
  async (input) => {
    render(await list(input));
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      "https://backend.test/v1/me",
    ]);
  },
);

it("paginates within the verified workspace and preserves the period and limit", async () => {
  render(await list({ from: "2026-01-01", limit: "1" }));
  expect(screen.getByRole("link", { name: "Enero" })).toHaveAttribute(
    "href",
    `/budgets/${id}`,
  );
  expect(screen.getByText(/2026-01-01.*2026-01-31/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    `/budgets?from=2026-01-01&limit=1&cursor=${next}`,
  );
  const [url, init] = fetchImpl.mock.calls[2];
  expect(url).toBe("https://backend.test/v1/budgets?from=2026-01-01&limit=1");
  expect(new Headers(init?.headers).get("x-workspace-id")).toBe(workspace);
});

it("rejects a malformed detail ID before membership or budget requests", async () => {
  await expect(detail("invalid")).rejects.toThrow("not found");
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it("normalizes detail IDs and displays category, exact planned/actual money and usage", async () => {
  render(await detail(id.toUpperCase()));
  expect(fetchImpl.mock.calls[2][0]).toBe(
    `https://backend.test/v1/budgets/${id}`,
  );
  expect(screen.getByText("Alimentación")).toBeVisible();
  for (const value of [
    "9.007.199.254.740.993,01",
    "4.503.599.627.370.496,50",
    "4.503.599.627.370.496,51",
    "50,00 %",
    "Arrastrar sobrante",
  ])
    expect(screen.getByText(value, { exact: false })).toBeVisible();
});
