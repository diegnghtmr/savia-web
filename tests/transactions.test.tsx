import { render, screen } from "@testing-library/react";
import Detail from "@/app/(workspace)/transactions/[transactionId]/page";
import List from "@/app/(workspace)/transactions/page";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "other-workspace" }) }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ accessToken: "offline-token" }),
}));

const id = "80000000-0000-4000-8000-000000000001";
const row = {
  id,
  accountId: id,
  categoryId: id,
  payeeId: id,
  tagIds: [id],
  type: "adjustment",
  status: "confirmed",
  description: "Reembolso",
  notes: "Verificado",
  occurredAt: "2026-01-03T12:00:00Z",
  amount: { amountMinor: "-900719925474099301", currency: "COP" },
};
const page = (items: unknown[], nextCursor?: string) => ({
  items,
  pageInfo: { hasNextPage: !!nextCursor, nextCursor },
});
const calls: [string, string | null][] = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test/savia");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function stub(profileStatus = 200) {
  vi.stubGlobal("fetch", async (target: string, init: RequestInit) => {
    const url = new URL(target);
    const path = url.pathname.split("/v1/")[1];
    calls.push([
      path + url.search,
      new Headers(init.headers).get("x-workspace-id"),
    ]);
    if (path === "me") return Response.json({ id }, { status: profileStatus });
    if (path === "workspaces")
      return Response.json(page([{ id, name: "Casa" }]));
    if (path === "transactions") return Response.json(page([row], "next/2"));
    if (path === `transactions/${id}`) return Response.json(row);
    if (path === "categories" && !url.searchParams.has("cursor"))
      return Response.json(page([], "catalog/2"));
    const names = {
      accounts: "Caja",
      categories: "Alimentación",
      payees: "Mercado",
      tags: "Familia",
    };
    return Response.json(
      page([{ id, name: names[path as keyof typeof names] }]),
    );
  });
}
const searchParams = Promise.resolve({});
const params = Promise.resolve({ transactionId: id });

it.each([false, true])(
  "guards ledger before requesting workspace data (detail=%s)",
  async (detail) => {
    stub(503);
    render(detail ? await Detail({ params }) : await List({ searchParams }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos consultar tu perfil.",
    );
    expect(calls).toEqual([["me", null]]);
  },
);

it("forwards only contract filters and preserves them in the next link", async () => {
  stub();
  const filters = {
    accountId: id,
    categoryId: id,
    from: "2026-01-01",
    to: "2026-01-31",
    status: "confirmed",
    query: "café & pan",
    cursor: "next/1",
  };
  render(
    await List({
      searchParams: Promise.resolve({
        ...filters,
        workspaceId: "forged",
        payeeId: id,
      }),
    }),
  );
  expect(calls.slice(0, 2)).toEqual([
    ["me", null],
    ["workspaces", null],
  ]);
  expect(calls.filter(([path]) => path.startsWith("transactions?"))).toEqual([
    [`transactions?${new URLSearchParams({ limit: "20", ...filters })}`, id],
  ]);
  expect(calls.slice(2).every(([, workspace]) => workspace === id)).toBe(true);
  expect(screen.getByLabelText("Cuenta")).toHaveDisplayValue("Caja");
  expect(screen.getByLabelText("Categoría")).toHaveDisplayValue("Alimentación");
  expect(screen.getByText(/−COP\s9\.007\.199\.254\.740\.993,01/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    `/transactions?${new URLSearchParams({ ...filters, cursor: "next/2" })}`,
  );
});

it("rejects ambiguous or invalid filters without loading the ledger", async () => {
  stub();
  render(
    await List({
      searchParams: Promise.resolve({
        status: ["pending", "confirmed"],
        from: "2026-02-30",
      }),
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
  expect(calls).toEqual([["me", null]]);
});

it("reads the requested detail and shows catalog names instead of identifiers", async () => {
  stub();
  render(await Detail({ params }));
  expect(screen.getByRole("heading", { name: "Reembolso" })).toBeVisible();
  expect(screen.getByText("Verificado")).toBeVisible();
  for (const label of ["Caja", "Alimentación", "Mercado", "Familia"])
    expect(screen.getByText(label)).toBeVisible();
  expect(calls).toContainEqual([`transactions/${id}`, id]);
  expect(calls.slice(2).every(([, workspace]) => workspace === id)).toBe(true);
});
