import { saveAllocations, saveBudget } from "@/app/_actions/budgets";
import { confirmDraftReceipt } from "@/lib/draft-idempotency";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const id = "abcdef00-0000-4000-8000-000000000002";
const category = "abcdef00-0000-4000-8000-000000000003";
const bound = { workspaceId, id, etag: '"1"', currency: "COP" };
const jar = new Map([["savia-draft-seed", id]]),
  writes: Request[] = [];
let version = 1,
  drop = false;
const commits = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: jar.get(name) }),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "fixture" })),
}));
const fetchImpl = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  jar.set("savia-draft-seed", id);
  writes.length = 0;
  commits.clear();
  version = 1;
  drop = false;
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (url, init) => {
    const req = new Request(url, init),
      path = new URL(req.url).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json({
        items: [{ id: workspaceId, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      });
    writes.push(req);
    const key = req.headers.get("idempotency-key")!;
    const match = req.headers.get("if-match");
    const fingerprint = `${match}:${await req.clone().text()}`;
    if (commits.has(key))
      return commits.get(key) === fingerprint
        ? Response.json({ id }, { status: req.method === "POST" ? 201 : 200 })
        : new Response(null, { status: 409 });
    if (req.method !== "POST" && match !== `"${version}"`)
      return new Response(null, { status: 412 });
    commits.set(key, fingerprint);
    if (req.method !== "POST") version++;
    if (drop) {
      drop = false;
      throw new Error("lost reply");
    }
    return Response.json({ id }, { status: req.method === "POST" ? 201 : 200 });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};
const create = (name = "  Marzo  ", periodEnd = "2026-03-31") =>
  form({ name, method: "cash_flow", periodStart: "2026-03-01", periodEnd });
const edit = () => form({ name: " Marzo familiar ", method: "hybrid" });
const allocate = (
  planned = "09007199254740993,01",
  categoryId = category.toUpperCase(),
) =>
  form({
    categoryId,
    planned,
    rolloverPolicy: "surplus",
    rolloverTargetId: "",
  });

it("stops invalid and repeated inputs before session access and leaves state unchanged", async () => {
  const duplicate = create();
  duplicate.append("name", "Otro");
  for (const data of [
    duplicate,
    create("Marzo", "2026-02-30"),
    create("Marzo", "2026-03-01"),
    create("Marzo", "2027-04-01"),
  ])
    expect(await saveBudget({ workspaceId }, null, data)).toEqual({
      error: "Revisa los datos del presupuesto.",
    });
  expect(await saveBudget({ ...bound, etag: "*" }, null, edit())).toEqual({
    error: "Revisa los datos del presupuesto.",
  });
  for (const data of [
    allocate("1.001"),
    allocate("1", "bad-id"),
    allocate("92233720368547758.08"),
    form({
      categoryId: category,
      planned: "1",
      rolloverPolicy: "to_category",
      rolloverTargetId: "",
    }),
  ])
    expect(await saveAllocations(bound, null, data)).toEqual({
      error: "Revisa las asignaciones.",
    });
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
  expect(commits.size).toBe(0);
  expect(version).toBe(1);
});

it("replays an equivalent unacknowledged create and rotates after confirmation", async () => {
  const initial = new Map(jar);
  drop = true;
  expect(await saveBudget({ workspaceId }, null, create())).toEqual({
    error: "No pudimos guardar el presupuesto.",
  });
  jar.clear();
  for (const [name, value] of initial) jar.set(name, value);
  const result = await saveBudget({ workspaceId }, null, create("Marzo"));
  expect(result).toEqual({ id, receipt: expect.any(String) });
  const key = writes[0].headers.get("idempotency-key");
  expect(key).toMatch(/^[\da-f-]{36}$/);
  expect(writes.map((req) => req.headers.get("idempotency-key"))).toEqual([
    key,
    key,
  ]);
  expect(writes[0].headers.get("x-workspace-id")).toBe(workspaceId);
  expect(await writes[0].json()).toEqual({
    name: "Marzo",
    method: "cash_flow",
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
  });
  expect(commits.size).toBe(1);
  if (!result || !("receipt" in result)) throw new Error("Missing receipt");
  await confirmDraftReceipt(result.receipt);
  await saveBudget({ workspaceId }, null, create());
  expect(writes[2].headers.get("idempotency-key")).not.toBe(key);
  expect(commits.size).toBe(2);
});

it("replays versioned PATCH and PUT with the original key and If-Match, and rejects stale or cross-workspace writes", async () => {
  for (const [save, data, method, suffix] of [
    [saveBudget, edit, "PATCH", ""],
    [saveAllocations, allocate, "PUT", "/allocations"],
  ] as const) {
    const pin = { ...bound, etag: `"${version}"` };
    const index = writes.length;
    drop = true;
    await save(pin, null, data());
    expect(await save(pin, null, data())).toEqual({
      id,
      receipt: expect.any(String),
    });
    const [first, retry] = writes.slice(index);
    expect(first.url).toBe(`https://backend.test/v1/budgets/${id}${suffix}`);
    expect(first.method).toBe(method);
    expect(first.headers.get("if-match")).toBe(pin.etag);
    expect(retry.headers.get("if-match")).toBe(pin.etag);
    expect(retry.headers.get("idempotency-key")).toBe(
      first.headers.get("idempotency-key"),
    );
    expect(await first.json()).toEqual(
      method === "PATCH"
        ? { name: "Marzo familiar", method: "hybrid" }
        : {
            allocations: [
              {
                categoryId: category,
                planned: { amountMinor: "900719925474099301", currency: "COP" },
                rolloverPolicy: "surplus",
              },
            ],
          },
    );
  }
  expect(version).toBe(3);
  expect(
    await saveBudget(
      bound,
      null,
      form({ name: "Obsoleto", method: "cash_flow" }),
    ),
  ).toEqual({
    error: "El presupuesto cambió. Vuelve al detalle antes de editarlo.",
  });
  expect(
    await saveAllocations({ ...bound, workspaceId: id }, null, allocate()),
  ).toEqual({ error: "El espacio activo cambió. Vuelve a Presupuestos." });
  expect(writes).toHaveLength(5);
  expect(commits.size).toBe(2);
  expect(version).toBe(3);
});
