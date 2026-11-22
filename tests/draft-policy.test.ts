import { saveTransactionAction } from "@/app/_actions/transactions";
import { recordTransfer } from "@/app/_actions/transfers";
import { saveBudget } from "@/app/_actions/budgets";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const source = "80000000-0000-4000-8000-000000000002";
const destination = "80000000-0000-4000-8000-000000000003";
const id = "80000000-0000-4000-8000-000000000004";
const warning =
  "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.";
const hour = 60 * 60 * 1000;
const ttl = 23 * hour;
const initialTime = Date.parse("2026-05-01T18:00:00Z");
let backendDate: string | undefined;
const jar = new Map<string, string>();
const writes: Request[] = [];
const fetchImpl = vi.fn<typeof fetch>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ value: jar.get(name) }),
    set: (name: string, value: string) => jar.set(name, value),
  }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: async () => ({ accessToken: "offline" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw Error(`redirect:${path}`);
  },
}));

beforeEach(() => {
  jar.clear();
  writes.length = 0;
  backendDate = new Date(initialTime).toUTCString();
  jar.set("savia-draft-seed", id);
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
  fetchImpl.mockImplementation(async (url, init) => {
    const req = new Request(url, init);
    const path = new URL(req.url).pathname;
    if (path === "/v1/me") return Response.json({ id });
    if (path === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: workspaceId, name: "Casa" }],
          pageInfo: { hasNextPage: false },
        },
        { headers: backendDate === undefined ? {} : { date: backendDate } },
      );
    writes.push(req);
    if (writes.length === 1) throw Error("Response lost after commit");
    return Response.json({ id }, { status: req.method === "POST" ? 201 : 200 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

it.each(["transfer", "exchange", "budget"])(
  "blocks an expired %s write until draft-specific confirmation, then sends a fresh key",
  async (kind) => {
    const isBudget = kind === "budget";
    const input = isBudget
      ? form({
          name: "Mayo",
          method: "cash_flow",
          periodStart: "2026-05-01",
          periodEnd: "2026-05-31",
        })
      : form({
          sourceAccountId: source,
          destinationAccountId: destination,
          amount: "5",
          date: "2026-05-01",
          ...(kind === "exchange" && {
            destinationAmount: "1",
            executedRate: "0.2",
          }),
        });
    const send = () =>
      isBudget
        ? saveBudget({ workspaceId }, null, input)
        : recordTransfer(
            {
              workspaceId,
              currencies: {
                [source]: "COP",
                [destination]: kind === "transfer" ? "COP" : "USD",
              },
            },
            null,
            input,
          );
    expect(await send()).toHaveProperty("error");
    expect(writes).toHaveLength(1);
    const original = writes[0].headers.get("idempotency-key");
    backendDate = new Date(initialTime + ttl).toUTCString();
    const result = await send();
    expect(result).toEqual({
      error: warning,
      confirmation: expect.any(String),
    });
    expect(writes).toHaveLength(1);
    if (!result || !("confirmation" in result))
      throw Error("Expected confirmation");
    input.set("confirmDraft", String(result.confirmation));
    expect(await send()).toHaveProperty("receipt");
    expect(writes).toHaveLength(2);
    expect(writes[1].headers.get("idempotency-key")).not.toBe(original);
  },
);

const transfer = () =>
  form({
    sourceAccountId: source,
    destinationAccountId: destination,
    amount: "5",
    date: "2026-05-01",
  });
const sendTransfer = (input: FormData) =>
  recordTransfer(
    { workspaceId, currencies: { [source]: "COP", [destination]: "COP" } },
    null,
    input,
  );

it("replays against the backend clock even when the web clock has advanced three hours further", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(initialTime);
  const input = transfer();
  expect(await sendTransfer(input)).toHaveProperty("error");
  backendDate = new Date(initialTime + 21 * hour).toUTCString();
  clock.mockReturnValue(initialTime + 24 * hour);
  expect(await sendTransfer(input)).toEqual({ receipt: id });
  expect(writes).toHaveLength(2);
  expect(writes[1].headers.get("idempotency-key")).toBe(
    writes[0].headers.get("idempotency-key"),
  );
});

it.each([undefined, "Fri, 32 May 2026 12:00:00 GMT"])(
  "requires explicit confirmation when the retry membership Date is %j",
  async (badDate) => {
    const input = transfer();
    expect(await sendTransfer(input)).toHaveProperty("error");
    backendDate = badDate;
    const result = await sendTransfer(input);
    expect(result).toEqual({
      error: warning,
      confirmation: expect.any(String),
    });
    expect(writes).toHaveLength(1);
    input.set("confirmDraft", String(result.confirmation));
    expect(await sendTransfer(input)).toEqual({ receipt: id });
    expect(writes).toHaveLength(2);
    expect(writes[1].headers.get("idempotency-key")).not.toBe(
      writes[0].headers.get("idempotency-key"),
    );
  },
);

it("never infers a missing first membership Date from a later valid membership check", async () => {
  const input = transfer();
  backendDate = undefined;
  const first = await sendTransfer(input);
  expect(first).toEqual({ error: warning, confirmation: expect.any(String) });
  expect(writes).toHaveLength(0);
  input.set("confirmDraft", String(first.confirmation));
  expect(await sendTransfer(input)).toHaveProperty("error");
  expect(writes).toHaveLength(1);
  input.delete("confirmDraft");
  backendDate = new Date(initialTime + hour).toUTCString();
  expect(await sendTransfer(input)).toEqual({
    error: warning,
    confirmation: expect.any(String),
  });
  expect(writes).toHaveLength(1);
});

it("applies the same transaction fields to a newer If-Match with a different key", async () => {
  const bound = {
    workspaceId,
    mode: "edit" as const,
    id,
    nonce: id,
    occurredAt: "2026-05-01T00:00:00Z",
  };
  const input = form({ date: "2026-05-01", description: "Compra" });
  await expect(
    saveTransactionAction({ ...bound, etag: '"1"' }, null, input),
  ).resolves.toBe("No pudimos guardar la transacción. Vuelve a intentarlo.");
  await expect(
    saveTransactionAction({ ...bound, etag: '"2"' }, null, input),
  ).rejects.toThrow(`redirect:/transactions/${id}`);
  expect(writes.map((req) => req.headers.get("if-match"))).toEqual([
    '"1"',
    '"2"',
  ]);
  expect(writes[1].headers.get("idempotency-key")).not.toBe(
    writes[0].headers.get("idempotency-key"),
  );
  expect(await writes[1].json()).toEqual(await writes[0].json());
});
