// Reviewer regression (verify mwr9r0b2). Copy to tests/ and add to test:server.
import { fundScope } from "@/lib/funds-gateway";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const otherWorkspace = "80000000-0000-4000-8000-000000000002";
const target = "80000000-0000-4000-8000-000000000003";
const ceiling = 100;
const rowId = (page: number) =>
  `90000000-0000-4000-8000-${String(page).padStart(12, "0")}`;
const cursor = (workspace: string, page: number) =>
  Buffer.from(
    JSON.stringify([workspace, "2026-01-12T12:30:22.123456Z", rowId(page)]),
  ).toString("base64url");

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: workspaceId }) }),
}));

beforeEach(() => {
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["unique", "repeated", "foreign"] as const)(
  "bounds a detail scan with %s continuation cursors",
  async (kind) => {
    const calls: URL[] = [];
    vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
      const url = new URL(input);
      if (url.pathname === "/v1/workspaces")
        return Response.json({
          items: [
            { id: workspaceId, name: "Casa" },
            { id: otherWorkspace, name: "Oficina" },
          ],
          pageInfo: { hasNextPage: false },
        });
      expect(url.pathname).toBe("/v1/funds");
      expect(new Headers(init?.headers).get("x-workspace-id")).toBe(
        workspaceId,
      );
      expect(url.searchParams.get("limit")).toBe("200");
      calls.push(url);
      const page = calls.length;
      // Test guard to make an otherwise unbounded chain terminate.
      if (page > ceiling) return new Response(null, { status: 503 });
      return Response.json({
        items: [
          {
            id: rowId(page),
            name: `Fondo ${page}`,
            currency: "COP",
            status: "active",
            targetAmount: { amountMinor: "10000", currency: "COP" },
            currentAmount: { amountMinor: "1", currency: "COP" },
          },
        ],
        pageInfo: {
          hasNextPage: true,
          nextCursor: cursor(
            kind === "foreign" ? otherWorkspace : workspaceId,
            kind === "repeated" ? 1 : page,
          ),
        },
      });
    });
    const scope = (await fundScope("offline"))!;
    expect(await scope.detail(target)).toBeNull();
    if (kind === "foreign") expect(calls).toHaveLength(1);
    else if (kind === "repeated") expect(calls).toHaveLength(2);
    else expect(calls.length).toBeLessThanOrEqual(ceiling);
  },
);
