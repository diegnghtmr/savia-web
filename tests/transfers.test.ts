import { recordTransfer } from "@/app/_actions/transfers";
import { requireSession } from "@/lib/session";

const src = "80000000-0000-4000-8000-000000000001";
const cop = "80000000-0000-4000-8000-000000000002";
const kwd = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
const bound = {
  workspaceId: src,
  currencies: { [src]: "COP", [cop]: "COP", [kwd]: "KWD" },
};
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: src }), set: vi.fn() }),
}));
vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => ({ accessToken: "offline" })),
}));
const fetchImpl = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchImpl);
  vi.stubEnv("BACKEND_BASE_URL", "https://backend.test");
  vi.stubEnv("SUPABASE_URL", "https://auth.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "offline-only");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function draft(fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    sourceAccountId: src,
    destinationAccountId: cop,
    amount: "9007199254740993.01",
    date: "2026-11-20",
    fee: "0.02",
    ...fields,
  }))
    form.set(key, value);
  return form;
}

it("rejects ambiguous drafts, same-account moves and invalid FX before I/O", async () => {
  const repeated = draft();
  repeated.append("fee", "3");
  for (const form of [
    repeated,
    draft({ destinationAccountId: src }),
    draft({ destinationAmount: "1" }),
    draft({
      destinationAccountId: kwd,
      destinationAmount: "2.0011",
      executedRate: "1",
    }),
    draft({
      destinationAccountId: kwd,
      destinationAmount: "2.001",
      executedRate: "0",
    }),
    draft({ destinationAccountId: kwd, destinationAmount: "2.001" }),
  ])
    expect(await recordTransfer(bound, null, form)).toEqual({
      error: "Revisa los datos de la transferencia.",
    });
  expect(requireSession).not.toHaveBeenCalled();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("posts exact amounts and fee to the matching endpoint and replays the normalized draft", async () => {
  const writes: { url: string; key: string | null; body: unknown }[] = [];
  fetchImpl.mockImplementation(async (url, init) => {
    if (String(url).endsWith("/me")) return Response.json({ id: src });
    if (String(url).endsWith("/workspaces"))
      return Response.json({
        items: [{ id: src, name: "Casa" }],
        pageInfo: { hasNextPage: false },
      });
    const headers = new Headers(init?.headers);
    expect(headers.get("x-workspace-id")).toBe(src);
    writes.push({
      url: String(url),
      key: headers.get("idempotency-key"),
      body: JSON.parse(String(init?.body)),
    });
    if (writes.length === 2) throw Error("lost response after commit");
    return Response.json({ id: cop }, { status: 201 });
  });
  expect(
    await recordTransfer({ ...bound, workspaceId: cop }, null, draft()),
  ).toEqual({ error: "El espacio activo cambió. Vuelve a Transferencias." });
  expect(writes).toEqual([]);
  expect(await recordTransfer(bound, null, draft())).toEqual({ receipt: cop });
  const exchange = {
    destinationAccountId: kwd.toUpperCase(),
    destinationAmount: "17.005",
    executedRate: "0.0200",
  };
  expect(await recordTransfer(bound, null, draft(exchange))).toEqual({
    error: "No se pudo registrar la transferencia. Vuelve a intentarlo.",
  });
  expect(
    await recordTransfer(
      { ...bound },
      null,
      draft({ ...exchange, executedRate: "0,02", destinationAmount: "17,005" }),
    ),
  ).toEqual({ receipt: cop });
  const fee = { amountMinor: "2", currency: "COP" };
  const sourceAmount = { amountMinor: "900719925474099301", currency: "COP" };
  expect(writes[0]).toMatchObject({
    url: "https://backend.test/v1/transfers",
    body: {
      sourceAccountId: src,
      destinationAccountId: cop,
      amount: sourceAmount,
      fee,
      occurredAt: "2026-11-20T00:00:00Z",
    },
  });
  expect(writes[1]).toMatchObject({
    url: "https://backend.test/v1/currency-exchanges",
    body: {
      sourceAccountId: src,
      destinationAccountId: kwd,
      sourceAmount,
      destinationAmount: { amountMinor: "17005", currency: "KWD" },
      executedRate: "0.02",
      fee,
    },
  });
  expect(writes[2]).toEqual(writes[1]);
  expect(writes[1].key).not.toBe(writes[0].key);
});
