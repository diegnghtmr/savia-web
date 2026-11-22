// Reviewer regression (verify mwr43ulr). Copy to tests/ and add to test:server.
import { createHash } from "node:crypto";
import { render, screen } from "@testing-library/react";
import ExchangeRatesPage from "@/app/(workspace)/exchange-rates/page";
import { acknowledgeDraft } from "@/app/_actions/draft-receipt";
import { recordTransfer } from "@/app/_actions/transfers";
import { persistentDraft } from "@/lib/draft-idempotency";
import { requireSession } from "@/lib/session";

const casa = "80000000-0000-4000-8000-000000000001";
const oficina = "80000000-0000-4000-8000-000000000002";
const alice = "80000000-0000-4000-8000-000000000003";
const bob = "80000000-0000-4000-8000-000000000004";
const seed = "80000000-0000-4000-8000-000000000005";
const receipt = "80000000-0000-4000-8000-000000000006";
const kwd = "80000000-0000-4000-8000-000000000007";
const jpy = "80000000-0000-4000-8000-000000000008";
const cop = "80000000-0000-4000-8000-000000000009";
const cop2 = "80000000-0000-4000-8000-000000000010";
const bound = {
  workspaceId: casa,
  currencies: { [kwd]: "KWD", [jpy]: "JPY", [cop]: "COP", [cop2]: "COP" },
};

type CookieOptions = {
  httpOnly?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
};

const jar = new Map<string, string>();
const options = new Map<string, CookieOptions>();
let person = alice;
let active = casa;
const fetchImpl = vi.fn<typeof fetch>();
const writes: { route: string; workspace: string | null; body: unknown }[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, settings: CookieOptions) => {
      options.set(name, settings);
      if (settings.maxAge === 0) jar.delete(name);
      else jar.set(name, value);
    },
    delete: (name: string) => jar.delete(name),
  }),
}));

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({
    kind: "present",
    accessToken: "offline-probe",
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  options.clear();
  writes.length = 0;
  person = alice;
  active = casa;
  jar.set("savia-draft-seed", seed);
  vi.stubEnv("BACKEND_BASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:4010");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-test-only");
  vi.stubGlobal("fetch", fetchImpl);
  fetchImpl.mockImplementation(async (url, init) => {
    const route = new URL(String(url)).pathname;
    if (route === "/v1/me") return Response.json({ id: person });
    if (route === "/v1/workspaces")
      return Response.json(
        {
          items: [{ id: active, name: "Activo" }],
          pageInfo: { hasNextPage: false },
        },
        { headers: { date: "Fri, 20 Nov 2026 12:00:00 GMT" } },
      );
    const workspace = new Headers(init?.headers).get("x-workspace-id");
    if (route === "/v1/exchange-rates" && init?.method !== "POST") {
      expect(workspace).toBe(active);
      const row = {
        id: receipt,
        baseCurrency: "KWD",
        quoteCurrency: "JPY",
        rate: "499.123456789012345678",
        effectiveAt: "2026-11-20T12:00:00Z",
        source: "frankfurter",
      };
      return Response.json([
        row,
        { ...row, id: bob, isStale: true, ageHours: 72 },
      ]);
    }
    writes.push({ route, workspace, body: JSON.parse(String(init?.body)) });
    return Response.json({ id: receipt }, { status: 201 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function snapshot() {
  return createHash("sha256")
    .update(JSON.stringify([...jar]))
    .digest("hex");
}

it.each(["user", "workspace"] as const)(
  "does not acknowledge a pending draft in a different %s",
  async (change) => {
    const pending = (await persistentDraft(casa, alice, "transactions", {
      description: "Movimiento privado",
    }))!;
    pending.receipt(receipt);
    const before = snapshot();

    if (change === "user") person = bob;
    else active = oficina;

    await acknowledgeDraft(receipt);
    expect(snapshot()).toBe(before);
  },
);

it("keeps acknowledged draft state opaque, HttpOnly and within a bounded cookie budget", async () => {
  for (let i = 0; i < 80; i++) {
    const draft = (await persistentDraft(casa, alice, "transactions", {
      description: "Movimiento privado",
      amountMinor: `${i + 1}`,
    }))!;
    draft.receipt(receipt);
    await acknowledgeDraft(receipt);
  }

  for (const [name, value] of jar) {
    expect(`${name}=${value}`).not.toContain("Movimiento privado");
    if (name !== "savia-draft-seed")
      expect(options.get(name)).toMatchObject({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
  }
  const header = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  expect(Buffer.byteLength(header)).toBeLessThanOrEqual(4096);
});

function transfer(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    sourceAccountId: kwd,
    destinationAccountId: jpy,
    amount: "1,005",
    destinationAmount: "235",
    executedRate: "233.830845771144278606",
    fee: "0.009",
    date: "2026-11-20",
    ...fields,
  }))
    form.set(name, value);
  return form;
}

it("rejects invalid movement inputs before I/O and serializes KWD, JPY and COP exactly", async () => {
  const file = transfer();
  file.set("fee", new File(["0.001"], "fee.txt"));
  const repeated = transfer();
  repeated.append("destinationAccountId", jpy);
  const before = snapshot();

  for (const form of [
    file,
    repeated,
    transfer({ destinationAccountId: kwd.toUpperCase() }),
    transfer({ destinationAmount: "235.1" }),
    transfer({ amount: "1.0051" }),
    transfer({ date: "2026-02-29" }),
    transfer({ sourceAccountId: cop, destinationAccountId: cop2 }),
    transfer({ referenceRate: "0" }),
  ]) {
    await expect(recordTransfer(bound, null, form)).resolves.toEqual({
      error: "Revisa los datos de la transferencia.",
    });
    expect(snapshot()).toBe(before);
  }
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();

  await expect(recordTransfer(bound, null, transfer())).resolves.toEqual({
    receipt,
  });
  await expect(
    recordTransfer(
      bound,
      null,
      transfer({
        sourceAccountId: cop,
        destinationAccountId: cop2,
        amount: "50,01",
        destinationAmount: "",
        executedRate: "",
        fee: "",
      }),
    ),
  ).resolves.toEqual({ receipt });
  expect(writes).toMatchObject([
    {
      route: "/v1/currency-exchanges",
      workspace: casa,
      body: {
        sourceAmount: { currency: "KWD", amountMinor: "1005" },
        destinationAmount: { currency: "JPY", amountMinor: "235" },
        executedRate: "233.830845771144278606",
      },
    },
    {
      route: "/v1/transfers",
      workspace: casa,
      body: { amount: { currency: "COP", amountMinor: "5001" } },
    },
  ]);
  expect(writes[0].body).not.toHaveProperty("fee");
});

it("distinguishes missing freshness from stale without rounding the rate", async () => {
  render(
    await ExchangeRatesPage({
      searchParams: Promise.resolve({ baseCurrency: "kwd" }),
    }),
  );
  expect(
    screen.getAllByText("1 KWD = 499.123456789012345678 JPY"),
  ).toHaveLength(2);
  expect(screen.getByText("Antigüedad: No disponible")).toBeVisible();
  expect(
    screen.getByText("No disponible", { selector: "strong" }),
  ).toBeVisible();
  expect(
    screen.getByText("Desactualizada", { selector: "strong" }),
  ).toBeVisible();
});

it("replays a committed exchange after the backend response is lost", async () => {
  const stored = new Map<string, string>();
  const before = fetchImpl.getMockImplementation()!;
  fetchImpl.mockImplementation(async (url, init) => {
    if (init?.method !== "POST") return before(url, init);
    const headers = new Headers(init.headers);
    expect(headers.get("x-workspace-id")).toBe(casa);
    const requestId = headers.get("idempotency-key");
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    const prior = stored.get(requestId!);
    if (prior !== undefined) {
      expect(init.body).toBe(prior);
      return Response.json({ id: receipt }, { status: 201 });
    }
    stored.set(requestId!, String(init.body));
    throw Error("response lost after commit");
  });

  await expect(recordTransfer(bound, null, transfer())).resolves.toEqual({
    error: "No se pudo registrar la transferencia. Vuelve a intentarlo.",
  });
  const hash = () =>
    createHash("sha256")
      .update(JSON.stringify([...stored]))
      .digest("hex");
  const once = hash();
  await expect(
    recordTransfer(
      bound,
      null,
      transfer({ amount: "1.005", executedRate: "233,830845771144278606" }),
    ),
  ).resolves.toEqual({ receipt });
  expect(stored.size).toBe(1);
  expect(hash()).toBe(once);
});
