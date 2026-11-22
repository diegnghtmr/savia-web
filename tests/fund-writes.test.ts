import { saveFund, type FundBinding } from "@/app/_actions/funds";
import { POST as reserve } from "@/app/draft-preflight/route";
import { admitDraftSeed } from "@/lib/draft-idempotency";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const other = "80000000-0000-4000-8000-000000000002";
const id = "abcdef00-0000-4000-8000-000000000003";
const account = "abcdef00-0000-4000-8000-000000000004";
const contribution = {
  id,
  currency: "COP",
  accounts: { [account]: "COP", [other]: "USD" },
};
const hour = 3600000;
const warning =
  "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.";
let jar: Map<string, string>, clock: number, active: string;
const writes: Request[] = [];
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
  requireSession: vi.fn(async () => ({ accessToken: "offline" })),
}));
beforeEach(() => {
  vi.clearAllMocks();
  jar = new Map([["savia-workspace", workspaceId]]);
  writes.length = 0;
  stored.clear();
  commits = 0;
  clock = Date.parse("2026-01-01T01:00:00Z");
  active = workspaceId;
  vi.spyOn(Date, "now").mockImplementation(() => clock + 3 * hour);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: active, name: "Casa" }],
          pageInfo: { hasNextPage: false },
        },
        { headers: { date: new Date(clock).toUTCString() } },
      );
    expect(["/v1/funds", `/v1/funds/${id}/contributions`]).toContain(path);
    const request = new Request(url, init);
    expect(request.method).toBe("POST");
    expect(request.headers.get("x-workspace-id")).toBe(workspaceId);
    expect(request.headers.has("if-match")).toBe(false);
    const key = request.headers.get("idempotency-key")!;
    expect(key).toMatch(/^[\da-f-]{36}$/);
    writes.push(request);
    const time = stored.get(key);
    if (time === undefined || clock - time >= 24 * hour) {
      stored.set(key, clock);
      commits++;
    }
    return Response.json({ id }, { status: 201 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(aporte: boolean, override: Record<string, string> = {}) {
  const result = new FormData();
  const base = aporte
    ? {
        accountId: account.toUpperCase(),
        amount: "09007199254740993,01",
        date: "2026-02-01",
        notes: "  Ahorro  ",
      }
    : {
        name: "  Hogar  ",
        currency: "cop",
        amount: "09007199254740993,01",
        targetDate: "2026-02-01",
        linkedAccountId: account.toUpperCase(),
      };
  for (const [key, value] of Object.entries({ ...base, ...override }))
    result.set(key, value);
  return result;
}
const prepare = (bound: FundBinding, input: FormData) => {
  input.set("draftContext", JSON.stringify({ kind: "fund", bound }));
  return reserve(input);
};

it.each([false, true])(
  "rejects invalid exact funds inputs before session (contribution=%s)",
  async (aporte) => {
    const bound = {
      workspaceId,
      contribution: aporte ? contribution : undefined,
    };
    const duplicate = form(aporte);
    duplicate.append("amount", "2");
    const invalids = [
      duplicate,
      ...["-1", "0", "1,001", "92233720368547758,08"].map((amount) =>
        form(aporte, { amount }),
      ),
      form(
        aporte,
        aporte ? { date: "2026-02-30" } : { targetDate: "2026-02-30" },
      ),
      ...(aporte
        ? [
            form(true, { accountId: other }),
            form(true, { notes: "a".repeat(501) }),
          ]
        : [
            form(false, { linkedAccountId: "wrong" }),
            form(false, { name: "" }),
            form(false, { currency: "abcd" }),
          ]),
    ];
    const initial = new Map(jar);
    for (const input of invalids)
      expect(await saveFund(bound, null, input)).toEqual({
        error: aporte
          ? "Revisa los datos del aporte."
          : "Revisa los datos del fondo.",
      });
    expect(requireSession).not.toHaveBeenCalled();
    expect(jar).toEqual(initial);
    expect(writes).toHaveLength(0);
    expect(commits).toBe(0);
  },
);

it.each([false, true])(
  "uses a verified workspace, exact money and backend-clock keys after a lost response (contribution=%s)",
  async (aporte) => {
    const bound = {
      workspaceId,
      contribution: aporte ? contribution : undefined,
    };
    const input = form(aporte);
    expect(await admitDraftSeed(workspaceId)).toBe(true);
    const beforeSwitch = new Map(jar);
    active = other;
    expect(await prepare(bound, input)).toEqual({
      state: { error: "El espacio activo cambió. Vuelve a Fondos." },
    });
    expect(jar).toEqual(beforeSwitch);
    expect(writes).toHaveLength(0);
    expect(commits).toBe(0);
    active = workspaceId;
    async function dispatchWithoutReply() {
      const result = await prepare(bound, input);
      expect(result.prepared).toEqual(expect.any(String));
      input.set("draftPrepared", result.prepared!);
      const reserved = new Map(jar);
      expect(await saveFund(bound, null, input)).toEqual({ receipt: id });
      jar = reserved;
    }
    await dispatchWithoutReply();
    expect(new URL(writes[0].url).pathname).toBe(
      aporte ? `/v1/funds/${id}/contributions` : "/v1/funds",
    );
    const money = { currency: "COP", amountMinor: "900719925474099301" };
    expect(await writes[0].json()).toEqual(
      aporte
        ? {
            accountId: account,
            amount: money,
            occurredAt: "2026-02-01T00:00:00Z",
            notes: "Ahorro",
          }
        : {
            name: "Hogar",
            currency: "COP",
            targetAmount: money,
            targetDate: "2026-02-01",
            linkedAccountId: account,
          },
    );
    clock += 22 * hour;
    await dispatchWithoutReply();
    expect(writes[1].headers.get("idempotency-key")).toBe(
      writes[0].headers.get("idempotency-key"),
    );
    expect(commits).toBe(1);
    clock += hour;
    const choice = await prepare(bound, input);
    expect(choice).toEqual({
      state: { error: warning, confirmation: expect.any(String) },
    });
    expect(writes).toHaveLength(2);
    expect(commits).toBe(1);
    input.set(
      "confirmDraft",
      (choice.state as { confirmation: string }).confirmation,
    );
    await dispatchWithoutReply();
    expect(writes[2].headers.get("idempotency-key")).not.toBe(
      writes[0].headers.get("idempotency-key"),
    );
    expect(commits).toBe(2);
  },
);
