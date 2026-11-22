import { render, screen } from "@testing-library/react";
import List from "@/app/(workspace)/funds/page";
import Detail from "@/app/(workspace)/funds/[fundId]/page";
import { requireSession } from "@/lib/session";

const workspace = "80000000-0000-4000-8000-000000000001";
const other = "80000000-0000-4000-8000-000000000002";
const id = "abcdef00-0000-4000-8000-000000000003";
const cursor = (owner: string) =>
  Buffer.from(
    JSON.stringify([owner, "2026-01-01T00:00:00.000000Z", other]),
  ).toString("base64url");
const fund = {
  id,
  name: "Emergencias",
  currency: "COP",
  status: "active",
  targetDate: "2027-01-01",
  targetAmount: { currency: "COP", amountMinor: "900719925474099301" },
  currentAmount: { currency: "COP", amountMinor: "450359962737049650" },
};
const fetchImpl = vi.fn<typeof fetch>();
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
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/me") return Response.json({ id });
    if (url.pathname === "/v1/workspaces")
      return Response.json({
        items: [{ id: workspace, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      });
    expect(url.pathname).toBe("/v1/funds");
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(workspace);
    return url.searchParams.has("cursor")
      ? Response.json({ items: [fund], pageInfo: { hasNextPage: false } })
      : Response.json({
          items: [{ ...fund, id: other, name: "Estudios" }],
          pageInfo: { hasNextPage: true, nextCursor: cursor(workspace) },
        });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  { cursor: "junk" },
  { cursor: [cursor(workspace), cursor(workspace)] },
  { limit: "201" },
  { limit: ["1", "2"] },
  { status: "unknown" },
])("rejects malformed list inputs %j before session access", async (input) => {
  render(await List({ searchParams: Promise.resolve(input) }));
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("rejects foreign cursors after verification and preserves a valid limit in pagination", async () => {
  const result = render(
    await List({
      searchParams: Promise.resolve({ cursor: cursor(other), limit: "1" }),
    }),
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Revisa los filtros.");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  result.unmount();
  render(await List({ searchParams: Promise.resolve({ limit: "1" }) }));
  expect(screen.getByRole("link", { name: "Estudios" })).toHaveAttribute(
    "href",
    `/funds/${other}`,
  );
  expect(screen.getByRole("link", { name: "Siguiente" })).toHaveAttribute(
    "href",
    `/funds?limit=1&cursor=${cursor(workspace)}`,
  );
});

it("rejects malformed detail IDs before session and resolves normalized IDs across verified list pages", async () => {
  await expect(
    Detail({ params: Promise.resolve({ fundId: "bad" }) }),
  ).rejects.toThrow("not found");
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  render(
    await Detail({ params: Promise.resolve({ fundId: id.toUpperCase() }) }),
  );
  expect(screen.getByRole("heading", { name: "Emergencias" })).toBeVisible();
  for (const value of [
    "9.007.199.254.740.993,01",
    "4.503.599.627.370.496,50",
    "4.503.599.627.370.496,51",
    "50,00 %",
  ])
    expect(screen.getByText(value, { exact: false })).toBeVisible();
  expect(fetchImpl.mock.calls[3][0]).toBe(
    `https://backend.test/v1/funds?limit=200&cursor=${cursor(workspace)}`,
  );
});
