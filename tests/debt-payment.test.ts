import { payDebt } from "@/app/_actions/debt-payment";
import { POST as reserve } from "@/app/draft-preflight/route";
import { admitDraftSeed } from "@/lib/draft-idempotency";
import { requireSession } from "@/lib/session";

const workspaceId = "80000000-0000-4000-8000-000000000001";
const account = "abcdef00-0000-4000-8000-000000000002";
const other = "abcdef00-0000-4000-8000-000000000003";
const id = "abcdef00-0000-4000-8000-000000000004";
const binding = {
  workspaceId,
  id: id.toUpperCase(),
  currency: "COP",
  accounts: { [account]: "COP", [other]: "USD" },
};
const hour = 3600000;
let jar: Map<string, string>, active: string, backend: number;
const payments = new Map<string, unknown>();
const writes: string[] = [];
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
  writes.length = 0;
  payments.clear();
  jar = new Map([["savia-workspace", workspaceId]]);
  active = workspaceId;
  backend = Date.parse("2026-03-01T12:00:00Z");
  vi.spyOn(Date, "now").mockImplementation(() => backend + 3 * hour);
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
        { headers: { date: new Date(backend).toUTCString() } },
      );
    expect(path).toBe(`/v1/debts/${id}/payments`);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers),
      key = headers.get("idempotency-key")!;
    expect(headers.get("x-workspace-id")).toBe(workspaceId);
    expect(key).toMatch(/^[\da-f-]{36}$/);
    writes.push(key);
    const body: unknown = JSON.parse(String(init.body));
    if (payments.has(key)) expect(payments.get(key)).toEqual(body);
    else payments.set(key, body);
    return Response.json({ id }, { status: 201 });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function form(overrides: Record<string, string> = {}) {
  const input = new FormData();
  for (const [name, value] of Object.entries({
    accountId: account.toUpperCase(),
    totalAmount: "9007199254740993,01",
    principalAmount: "9007199254740990,99",
    interestAmount: "2,01",
    feeAmount: "0,01",
    date: "2026-01-12",
    ...overrides,
  }))
    input.set(name, value);
  return input;
}
function preflight(input: FormData) {
  input.set(
    "draftContext",
    JSON.stringify({ kind: "debt-payment", bound: binding }),
  );
  return reserve(input);
}

it("rejects ambiguous amounts, invalid splits, dates and incompatible accounts before session", async () => {
  const duplicate = form();
  duplicate.append("feeAmount", "0,01");
  const file = form();
  file.set("totalAmount", new File(["1"], "amount.txt"));
  const original = new Map(jar);
  const invalid: Record<string, string>[] = [
    { totalAmount: "0" },
    { totalAmount: "-1" },
    { totalAmount: "1,001" },
    { totalAmount: "92233720368547758,08" },
    { date: "2026-02-30" },
    { accountId: other },
    { interestAmount: "-1" },
    { feeAmount: "0,02" },
    {
      totalAmount: "1",
      principalAmount: "",
      interestAmount: "1,01",
      feeAmount: "",
    },
  ];
  for (const data of [duplicate, file, ...invalid.map(form)])
    expect(await payDebt(binding, null, data)).toEqual({
      error: "Revisa los datos del pago.",
    });
  expect(requireSession).not.toHaveBeenCalled();
  expect(jar).toEqual(original);
  expect(writes).toHaveLength(0);
  expect(payments.size).toBe(0);
});

it("does not cross workspaces and retries an exact payment against the backend clock", async () => {
  const input = form();
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const initial = new Map(jar);
  active = other;
  expect(await preflight(input)).toEqual({
    state: { error: "El espacio activo cambió. Vuelve a Deudas." },
  });
  expect(jar).toEqual(initial);
  expect(writes).toHaveLength(0);
  active = workspaceId;
  await losePaymentReply(input);
  const exact = (amountMinor: string) => ({ currency: "COP", amountMinor });
  expect(payments.get(writes[0])).toEqual({
    accountId: account,
    totalAmount: exact("900719925474099301"),
    principalAmount: exact("900719925474099099"),
    interestAmount: exact("201"),
    feeAmount: exact("1"),
    occurredAt: "2026-01-12T00:00:00Z",
  });
  backend += 22 * hour;
  await losePaymentReply(input);
  expect(writes).toEqual([writes[0], writes[0]]);
  expect(payments.size).toBe(1);
  backend += hour;
  expect(await preflight(input)).toEqual({
    state: {
      error:
        "Puede que este movimiento ya se haya registrado. Revisa la lista antes de volver a intentarlo.",
      confirmation: expect.any(String),
    },
  });
  expect(writes).toHaveLength(2);
  expect(payments.size).toBe(1);
});

it.each([
  {
    title: "blank split and explicit full principal",
    first: ["", "", ""],
    retry: ["3,00", "0", "0"],
    expected: {},
  },
  {
    title: "omitted fee and explicit zero fee",
    first: ["2,00", "1,00", ""],
    retry: ["2,00", "1,00", "0"],
    expected: { principalAmount: "200", interestAmount: "100" },
  },
  {
    title: "inferred principal and explicit remainder",
    first: ["", "0,90", "0,10"],
    retry: ["2,00", "0,90", "0,10"],
    expected: {
      principalAmount: "200",
      interestAmount: "90",
      feeAmount: "10",
    },
  },
])("replays $title", async ({ first, retry, expected }) => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const make = ([principalAmount, interestAmount, feeAmount]: string[]) =>
    form({ totalAmount: "3", principalAmount, interestAmount, feeAmount });
  await losePaymentReply(make(first));
  await losePaymentReply(make(retry));
  expect(writes).toEqual([writes[0], writes[0]]);
  expect(payments.size).toBe(1);
  expect(payments.get(writes[0])).toEqual({
    accountId: account,
    totalAmount: { currency: "COP", amountMinor: "300" },
    occurredAt: "2026-01-12T00:00:00Z",
    ...Object.fromEntries(
      Object.entries(expected).map(([part, amountMinor]) => [
        part,
        { currency: "COP", amountMinor },
      ]),
    ),
  });
});

async function losePaymentReply(input: FormData) {
  const { prepared } = await preflight(input);
  expect(prepared).toEqual(expect.any(String));
  input.set("draftPrepared", prepared!);
  const reserved = new Map(jar);
  expect(await payDebt(binding, null, input)).toEqual({ receipt: id });
  jar = reserved;
}

it("keeps genuinely different splits separate even when the total is unchanged", async () => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  await losePaymentReply(
    form({
      totalAmount: "3",
      principalAmount: "2",
      interestAmount: "1",
      feeAmount: "",
    }),
  );
  await losePaymentReply(
    form({
      totalAmount: "3",
      principalAmount: "2",
      interestAmount: "",
      feeAmount: "1",
    }),
  );
  expect(writes).toHaveLength(2);
  expect(writes[1]).not.toBe(writes[0]);
  expect(payments.size).toBe(2);
});

it("omits all split fields when the total should go entirely to principal", async () => {
  expect(await admitDraftSeed(workspaceId)).toBe(true);
  const input = form({
    totalAmount: "1,01",
    principalAmount: "",
    interestAmount: "",
    feeAmount: "",
  });
  const { prepared } = await preflight(input);
  expect(prepared).toEqual(expect.any(String));
  input.set("draftPrepared", prepared!);
  expect(await payDebt(binding, null, input)).toEqual({ receipt: id });
  expect(writes).toHaveLength(1);
  expect(payments.get(writes[0])).toEqual({
    accountId: account,
    totalAmount: { currency: "COP", amountMinor: "101" },
    occurredAt: "2026-01-12T00:00:00Z",
  });
});
