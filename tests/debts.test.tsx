import { render, screen } from "@testing-library/react";
import Detail from "@/app/(workspace)/debts/[debtId]/page";
import List from "@/app/(workspace)/debts/page";
import { requireSession } from "@/lib/session";

const workspace = "80000000-0000-4000-8000-000000000001";
const other = "80000000-0000-4000-8000-000000000002";
const id = "abcdef00-0000-4000-8000-000000000003";
const cursor = (owner: string) =>
  Buffer.from(
    JSON.stringify([owner, "2026-01-01T00:00:00.000000Z", other]),
  ).toString("base64url");
const cash = (amountMinor: string) => ({ amountMinor, currency: "COP" });
const debt = {
  id,
  name: "Estudios",
  currency: "COP",
  status: "defaulted",
  annualRate: "0.125000000000000001",
  principal: cash("900719925474099301"),
  outstandingBalance: cash("900719925474099299"),
  minimumPayment: cash("123456"),
};
const fetchImpl = vi.fn<typeof fetch>();
let projection: () => Response;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: other }) }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "fixture" })),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Error("not found");
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  projection = () => new Response(null, { status: 404 });
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/me") return Response.json({ id });
    if (url.pathname === "/v1/workspaces")
      return Response.json({
        items: [{ id: workspace, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      });
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(workspace);
    if (url.pathname === `/v1/debts/${id}/projection`) return projection();
    expect(url.pathname).toBe("/v1/debts");
    return url.searchParams.has("cursor")
      ? Response.json({ items: [debt], pageInfo: { hasNextPage: false } })
      : Response.json({
          items: [
            { ...debt, id: other, name: "Préstamo", minimumPayment: undefined },
          ],
          pageInfo: { hasNextPage: true, nextCursor: cursor(workspace) },
        });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  { limit: "201" },
  { limit: ["1", "2"] },
  { cursor: "junk" },
  { extra: "1" },
])(
  "rejects invalid list filters %j without opening a session",
  async (search) => {
    render(await List({ searchParams: Promise.resolve(search) }));
    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
    expect(requireSession).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);

it("rejects another workspace's cursor without querying debts", async () => {
  render(
    await List({ searchParams: Promise.resolve({ cursor: cursor(other) }) }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("preserves pagination and shows only reported list terms", async () => {
  render(await List({ searchParams: Promise.resolve({ limit: "1" }) }));
  expect(screen.getByRole("link", { name: "Préstamo" })).toHaveAttribute(
    "href",
    `/debts/${other}`,
  );
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    `/debts?limit=1&cursor=${cursor(workspace)}`,
  );
  for (const term of [
    "9.007.199.254.740.992,99",
    "12,5000000000000001 %",
    "En mora",
    "No informado",
  ])
    expect(screen.getByText(term, { exact: false })).toBeVisible();
});

it("rejects invalid IDs and finds a normalized debt ID only through verified list pages", async () => {
  await expect(
    Detail({ params: Promise.resolve({ debtId: "bad" }) }),
  ).rejects.toThrow("not found");
  expect(requireSession).not.toHaveBeenCalled();
  render(
    await Detail({ params: Promise.resolve({ debtId: id.toUpperCase() }) }),
  );
  expect(screen.getByRole("heading", { name: "Estudios" })).toBeVisible();
  for (const term of [
    "9.007.199.254.740.992,99",
    "9.007.199.254.740.993,01",
    "12,5000000000000001 %",
    "1.234,56",
    "En mora",
  ])
    expect(screen.getByText(term, { exact: false })).toBeVisible();
  expect(fetchImpl.mock.calls.slice(2, 4).map(([request]) => request)).toEqual([
    "http://127.0.0.1:4010/v1/debts?limit=200",
    `http://127.0.0.1:4010/v1/debts?limit=200&cursor=${cursor(workspace)}`,
  ]);
});

const params = Promise.resolve({ debtId: id });
it.each([404, 501, 503])(
  "keeps detail visible when projection returns %s",
  async (status) => {
    projection = () => new Response(null, { status });
    render(await Detail({ params }));
    expect(screen.getByRole("heading", { name: "Estudios" })).toBeVisible();
    expect(
      screen.getByText(
        status === 503
          ? "No pudimos cargar la proyección."
          : "Proyección no disponible",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(fetchImpl.mock.calls[4][0]).toBe(
      `http://127.0.0.1:4010/v1/debts/${id}/projection`,
    );
  },
);

it.each([id, other])(
  "only renders the server projection for the verified debt (%s)",
  async (debtId) => {
    projection = () =>
      Response.json({
        debtId,
        strategy: "minimum_payment",
        asOf: "2026-11-21",
        estimatedPayoffDate: "2027-01-01",
        startingBalance: cash("900719925474099300"),
        totalInterest: cash("205"),
        totalCost: cash("900719925474099505"),
        schedule: [
          {
            dueDate: "2027-01-01",
            paymentAmount: cash("900719925474099505"),
            principalAmount: cash("900719925474099300"),
            interestAmount: cash("205"),
            remainingBalance: cash("0"),
          },
        ],
      });
    render(await Detail({ params }));
    if (debtId === id) {
      expect(
        screen.getByRole("heading", { name: "Proyección con pago mínimo" }),
      ).toBeVisible();
      expect(
        screen.getByRole("cell", { name: /9\.007\.199\.254\.740\.995,05/ }),
      ).toBeVisible();
      expect(screen.getByRole("cell", { name: /COP\s2,05/ })).toBeVisible();
      expect(screen.getByRole("cell", { name: /COP\s0,00/ })).toBeVisible();
    } else {
      expect(
        screen.getByText("No pudimos cargar la proyección."),
      ).toBeVisible();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    }
  },
);
