// Reviewer regression (verify mwr7bvwf). Copy to tests/ and add to test:server.
import { saveBudget } from "@/app/_actions/budgets";
import { recordTransfer } from "@/app/_actions/transfers";
import { admitDraftSeed } from "@/lib/draft-idempotency";
import { prepareDraft } from "@/lib/draft-preparation";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const source = "80000000-0000-4000-8000-000000000002";
const destination = "80000000-0000-4000-8000-000000000003";
const id = "80000000-0000-4000-8000-000000000004";
const warning =
  "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.";
const hour = 3600000;
const first = Date.parse("2026-05-01T18:00:00Z");
let backend: number;
let jar: Map<string, string>;
const writes: string[] = [];
let command: "transfer" | "budget";
const stored = new Map<string, number>();
let commits: number;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: jar.get(name) }),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ accessToken: "offline" }),
}));

beforeEach(async () => {
  jar = new Map();
  writes.length = 0;
  stored.clear();
  commits = 0;
  backend = first;
  vi.spyOn(Date, "now").mockImplementation(() => backend + 3 * hour);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: workspaceId, name: "Casa" }],
          pageInfo: { hasNextPage: false },
        },
        { headers: { date: new Date(backend).toUTCString() } },
      );
    expect(path).toBe(command === "budget" ? "/v1/budgets" : "/v1/transfers");
    expect(new Headers(init?.headers).get("x-workspace-id")).toBe(workspaceId);
    const requestId = new Headers(init?.headers).get("idempotency-key");
    if (!requestId) throw Error("No request ID");
    writes.push(requestId);
    const storedAt = stored.get(requestId);
    if (storedAt === undefined || backend - storedAt >= 24 * hour) {
      stored.set(requestId, backend);
      commits++;
    }
    return Response.json({ id }, { status: 201 });
  });
  expect(await admitDraftSeed(workspaceId)).toBe(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form() {
  const data = new FormData();
  if (command === "budget") {
    data.set("name", "Mayo en casa");
    data.set("method", "cash_flow");
    data.set("periodStart", "2026-05-01");
    data.set("periodEnd", "2026-05-31");
    return data;
  }
  data.set("sourceAccountId", source);
  data.set("destinationAccountId", destination);
  data.set("date", "2026-05-01");
  data.set("amount", "5");
  return data;
}
const send = (input: FormData) =>
  command === "budget"
    ? saveBudget({ workspaceId }, null, input)
    : recordTransfer(
        { workspaceId, currencies: { [source]: "COP", [destination]: "COP" } },
        null,
        input,
      );
const reserve = (input: FormData) => prepareDraft(() => send(input));

async function prepare(input: FormData) {
  const result = await reserve(input);
  expect(result.prepared).toEqual(expect.any(String));
  input.set("draftPrepared", result.prepared!);
}

async function commitWithoutReply(input: FormData) {
  const before = new Map(jar);
  expect(await send(input)).toHaveProperty("receipt", expect.any(String));
  jar = before; // Browser lost all write response headers, including Set-Cookie.
}

describe.each(["transfer", "budget"] as const)("%s", (kind) => {
  beforeEach(() => {
    command = kind;
  });

  it("reuses the original request at 22h59m and sends nothing at 23h in the two-stage path", async () => {
    const initial = form();
    await prepare(initial);
    await commitWithoutReply(initial);
    backend += 23 * hour - 60000;
    const recent = form();
    await prepare(recent);
    await commitWithoutReply(recent);
    expect(writes).toEqual([writes[0], writes[0]]);
    backend += 60000;
    expect(await reserve(form())).toEqual({
      state: { error: warning, confirmation: expect.any(String) },
    });
    expect(writes).toHaveLength(2);
    expect(commits).toBe(1);
  });

  it.each([23, 24])(
    "does not let a lost explicitly confirmed request reuse its old permit at %ih",
    async (elapsed) => {
      const initial = form();
      await prepare(initial);
      await commitWithoutReply(initial);
      backend += 23 * hour;
      const explicit = form();
      const choice = await reserve(explicit);
      const state = choice.state as { error: string; confirmation: string };
      expect(state.error).toBe(warning);
      explicit.set("confirmDraft", state.confirmation);
      await prepare(explicit);
      await commitWithoutReply(explicit);
      expect(writes).toHaveLength(2);
      expect(writes[1]).not.toBe(writes[0]);
      backend += elapsed * hour;
      const retry = await send(explicit);
      expect({ writes, commits }).toEqual({
        writes: [writes[0], writes[1]],
        commits: 2,
      });
      expect(retry).toEqual({
        error: warning,
        confirmation: expect.any(String),
      });
    },
  );
});
