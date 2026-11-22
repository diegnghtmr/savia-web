// Reviewer regression for W3 (verify task mwr1xxq2). Add to tests/ and to the test:server list.
import { render, screen } from "@testing-library/react";
import TransactionPage from "@/app/(workspace)/transactions/[transactionId]/page";
import TransactionsPage from "@/app/(workspace)/transactions/page";

const workspace = "80000000-0000-4000-8000-000000000001";
const other = "80000000-0000-4000-8000-000000000002";
const id = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
const row = {
  id,
  type: "refund",
  status: "reconciled",
  accountId: id,
  amount: { currency: "KWD", amountMinor: "-1234567" },
  occurredAt: "2026-11-01T15:00:00Z",
  createdAt: "2026-11-01T15:00:01Z",
  updatedAt: "2026-11-01T15:00:01Z",
  version: 1,
  description: "Reembolso aceptado",
};
const requests: [string, string | null][] = [];
const listed = (items: unknown[], cursor?: string) =>
  Response.json({
    items,
    pageInfo: { hasNextPage: !!cursor, nextCursor: cursor },
  });

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: workspace }) }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ accessToken: "offline-verifier-token" }),
}));

beforeEach(() => {
  requests.length = 0;
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
  vi.stubGlobal("fetch", async (target: string, init: RequestInit) => {
    const url = new URL(target);
    const endpoint = url.pathname.replace("/v1/", "");
    requests.push([
      endpoint + url.search,
      new Headers(init.headers).get("x-workspace-id"),
    ]);
    if (endpoint === "me") return Response.json({ id });
    if (endpoint === "workspaces" && !url.searchParams.has("cursor"))
      return listed([{ id: other, name: "Oficina" }], "second");
    if (endpoint === "workspaces")
      return listed([{ id: workspace, name: "Casa" }]);
    if (endpoint === "transactions") return listed([row]);
    if (endpoint.toLowerCase() === `transactions/${id}`)
      return Response.json(row);
    return listed([
      { id, name: endpoint === "accounts" ? "Caja" : "Catálogo" },
    ]);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([
  { from: "2026-02-29" },
  { from: "2026-11-20", to: "2026-11-19" },
  { cursor: "" },
  { categoryId: [id, id] },
  { query: "x".repeat(201) },
  { limit: "0" },
  { limit: ["1", "2"] },
])("does not load an unfiltered ledger for %j", async (input) => {
  render(await TransactionsPage({ searchParams: Promise.resolve(input) }));
  expect(requests).toEqual([["me", null]]);
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
});

it("uses the selected membership even when it is returned on page two", async () => {
  render(
    await TransactionsPage({
      searchParams: Promise.resolve({
        status: "reconciled",
        workspaceId: other,
      }),
    }),
  );
  expect(requests).toEqual([
    ["me", null],
    ["workspaces", null],
    ["workspaces?cursor=second", null],
    ["transactions?limit=20&status=reconciled", workspace],
    ["accounts?limit=200", workspace],
    ["categories?limit=200", workspace],
    ["payees?limit=200", workspace],
    ["tags?limit=200", workspace],
  ]);
  expect(
    screen.getByRole("link", { name: "Reembolso aceptado" }),
  ).toBeVisible();
  expect(screen.getByText(/−KWD\s+1\.234,567/)).toBeVisible();
});

it("opens a valid uppercase UUID when the backend returns its canonical lowercase form", async () => {
  render(
    await TransactionPage({
      params: Promise.resolve({ transactionId: id.toUpperCase() }),
    }),
  );
  expect(
    screen.getByRole("heading", { name: "Reembolso aceptado" }),
  ).toBeVisible();
});
